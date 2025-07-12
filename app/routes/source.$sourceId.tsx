import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Link, Form, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { SourceCode, User, Purchase, Review, Comment } from "~/lib/db/models";
import { getUserFromRequest, generatePurchaseId } from "~/lib/auth";
import { sendPurchaseNotificationEmail } from "~/lib/email";

export async function loader({ params, request }: LoaderFunctionArgs) {
  await connectToDatabase();
  
  const sourceCode = await SourceCode.findOne({ sourceId: params.sourceId })
    .populate('seller', 'fullName avatar userId email')
    .lean();

  if (!sourceCode) {
    throw new Response("Không tìm thấy mã nguồn", { status: 404 });
  }

  // Increment view count
  await SourceCode.findByIdAndUpdate(sourceCode._id, { $inc: { views: 1 } });

  // Get current user
  const currentUser = await getUserFromRequest(request);
  
  // Check if user has purchased this source
  let hasPurchased = false;
  let purchaseInfo = null;
  
  if (currentUser) {
    const purchase = await Purchase.findOne({ 
      buyer: currentUser._id, 
      sourceCode: sourceCode._id 
    }).lean();
    
    if (purchase) {
      hasPurchased = true;
      purchaseInfo = {
        purchaseId: purchase.purchaseId,
        purchaseDate: purchase.createdAt,
        accessExpiresAt: purchase.accessExpiresAt,
        canAccess: new Date() < new Date(purchase.accessExpiresAt)
      };
    }
  }

  // Get reviews and comments
  const [reviews, comments] = await Promise.all([
    Review.find({ sourceCode: sourceCode._id })
      .populate('buyer', 'fullName avatar')
      .sort({ createdAt: -1 })
      .lean(),
    Comment.find({ sourceCode: sourceCode._id, parentComment: null })
      .populate('user', 'fullName avatar')
      .populate({
        path: 'replies',
        populate: { path: 'user', select: 'fullName avatar' }
      })
      .sort({ createdAt: -1 })
      .lean()
  ]);

  // Get related sources
  const relatedSources = await SourceCode.find({
    category: sourceCode.category,
    _id: { $ne: sourceCode._id },
    isActive: true
  })
  .populate('seller', 'fullName avatar')
  .limit(4)
  .lean();

  return json({
    sourceCode: {
      ...sourceCode,
      views: sourceCode.views + 1 // Include the incremented view
    },
    currentUser: currentUser ? {
      _id: currentUser._id.toString(),
      userId: currentUser.userId,
      fullName: currentUser.fullName,
      balance: currentUser.balance,
      role: currentUser.role
    } : null,
    hasPurchased,
    purchaseInfo,
    reviews,
    comments,
    relatedSources
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const action = formData.get("_action") as string;

  try {
    await connectToDatabase();
    
    const currentUser = await getUserFromRequest(request);
    if (!currentUser) {
      return json({ error: "Vui lòng đăng nhập" }, { status: 401 });
    }

    const sourceCode = await SourceCode.findOne({ sourceId: params.sourceId })
      .populate('seller', 'email fullName');

    if (!sourceCode) {
      return json({ error: "Không tìm thấy mã nguồn" }, { status: 404 });
    }

    switch (action) {
      case "purchase": {
        // Check if user has enough balance
        if (currentUser.balance < sourceCode.price) {
          return json({ error: "Số dư không đủ để mua mã nguồn này" }, { status: 400 });
        }

        // Check if already purchased
        const existingPurchase = await Purchase.findOne({
          buyer: currentUser._id,
          sourceCode: sourceCode._id
        });

        if (existingPurchase) {
          return json({ error: "Bạn đã mua mã nguồn này rồi" }, { status: 400 });
        }

        // Generate purchase ID
        let purchaseId: string;
        let isPurchaseIdUnique = false;
        do {
          purchaseId = generatePurchaseId();
          const existingPurchaseId = await Purchase.findOne({ purchaseId });
          isPurchaseIdUnique = !existingPurchaseId;
        } while (!isPurchaseIdUnique);

        // Calculate amounts
        const sellerEarnings = Math.floor(sourceCode.price * 0.8);
        const adminCommission = sourceCode.price - sellerEarnings;

        // Create purchase
        const purchase = new Purchase({
          purchaseId,
          buyer: currentUser._id,
          sourceCode: sourceCode._id,
          amount: sourceCode.price,
          sellerEarnings,
          adminCommission,
          accessExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        });

        // Update balances and statistics
        await Promise.all([
          purchase.save(),
          User.findByIdAndUpdate(currentUser._id, { $inc: { balance: -sourceCode.price } }),
          User.findByIdAndUpdate(sourceCode.seller._id, { $inc: { balance: sellerEarnings } }),
          SourceCode.findByIdAndUpdate(sourceCode._id, { $inc: { purchases: 1 } })
        ]);

        // Send notification email to seller
        try {
          await sendPurchaseNotificationEmail(
            sourceCode.seller.email,
            currentUser.fullName,
            sourceCode.title,
            sourceCode.price
          );
        } catch (emailError) {
          console.error("Failed to send notification email:", emailError);
        }

        return json({ 
          success: true, 
          message: "Mua mã nguồn thành công!",
          purchaseId 
        });
      }

      case "review": {
        const rating = parseInt(formData.get("rating") as string);
        const comment = formData.get("comment") as string;

        // Check if user has purchased this source
        const purchase = await Purchase.findOne({
          buyer: currentUser._id,
          sourceCode: sourceCode._id
        });

        if (!purchase) {
          return json({ error: "Bạn cần mua mã nguồn này để đánh giá" }, { status: 400 });
        }

        // Check if already reviewed
        const existingReview = await Review.findOne({
          buyer: currentUser._id,
          sourceCode: sourceCode._id
        });

        if (existingReview) {
          return json({ error: "Bạn đã đánh giá mã nguồn này rồi" }, { status: 400 });
        }

        // Create review
        const review = new Review({
          buyer: currentUser._id,
          sourceCode: sourceCode._id,
          rating,
          comment: comment.trim()
        });

        await review.save();

        // Update source code rating
        const reviews = await Review.find({ sourceCode: sourceCode._id });
        const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = totalRating / reviews.length;

        await SourceCode.findByIdAndUpdate(sourceCode._id, {
          rating: avgRating,
          totalRatings: reviews.length
        });

        return json({ success: true, message: "Đánh giá thành công!" });
      }

      case "comment": {
        const content = formData.get("content") as string;
        const parentCommentId = formData.get("parentCommentId") as string;

        const comment = new Comment({
          user: currentUser._id,
          sourceCode: sourceCode._id,
          content: content.trim(),
          parentComment: parentCommentId || undefined
        });

        await comment.save();

        // If this is a reply, add to parent's replies array
        if (parentCommentId) {
          await Comment.findByIdAndUpdate(parentCommentId, {
            $push: { replies: comment._id }
          });
        }

        return json({ success: true, message: "Bình luận thành công!" });
      }

      default:
        return json({ error: "Hành động không hợp lệ" }, { status: 400 });
    }
  } catch (error) {
    console.error("Action error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function SourceDetail() {
  const { 
    sourceCode, 
    currentUser, 
    hasPurchased, 
    purchaseInfo, 
    reviews, 
    comments, 
    relatedSources 
  } = useLoaderData<typeof loader>();
  
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState("description");
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const isSubmitting = navigation.state === "submitting";

  const tabs = [
    { id: "description", name: "Mô tả", icon: "📝" },
    { id: "reviews", name: `Đánh giá (${reviews.length})`, icon: "⭐" },
    { id: "comments", name: `Bình luận (${comments.length})`, icon: "💬" },
  ];

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Hôm nay";
    if (diffDays === 1) return "Hôm qua";
    if (diffDays < 7) return `${diffDays} ngày trước`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;
    return past.toLocaleDateString('vi-VN');
  };

  const canAccess = purchaseInfo?.canAccess || false;
  const isOwner = currentUser?._id === sourceCode.seller._id;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">S4U</span>
              </div>
              <span className="text-xl font-bold text-gray-900">SourceCode4U</span>
            </Link>
            
            <nav className="flex items-center space-x-6">
              <Link to="/" className="text-gray-700 hover:text-teal-600">Trang chủ</Link>
              <Link to="/browse" className="text-gray-700 hover:text-teal-600">Duyệt mã nguồn</Link>
              {currentUser ? (
                <Link to="/dashboard" className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200">
                  Dashboard
                </Link>
              ) : (
                <Link to="/login" className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200">
                  Đăng nhập
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {actionData?.success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg">
            {actionData.message}
          </div>
        )}

        {actionData?.error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
            {actionData.error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Source Info */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden mb-6">
              <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                <img
                  src={sourceCode.thumbnail}
                  alt={sourceCode.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-4 right-4 bg-gradient-to-r from-teal-500 to-blue-600 text-white px-4 py-2 rounded-full text-lg font-bold">
                  {sourceCode.price.toLocaleString('vi-VN')} xu
                </div>
                {sourceCode.isAdminPost && (
                  <div className="absolute top-4 left-4 bg-yellow-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                    🛡️ Official
                  </div>
                )}
              </div>

              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                      {sourceCode.title}
                    </h1>
                    <div className="flex items-center space-x-4 text-sm text-gray-600 mb-4">
                      <div className="flex items-center space-x-1">
                        <span>⭐</span>
                        <span>{sourceCode.rating > 0 ? sourceCode.rating.toFixed(1) : 'Chưa có'}</span>
                        <span>({sourceCode.totalRatings} đánh giá)</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span>👁️</span>
                        <span>{sourceCode.views.toLocaleString('vi-VN')} lượt xem</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span>🛒</span>
                        <span>{sourceCode.purchases} lượt mua</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seller Info */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-6">
                  <div className="flex items-center space-x-3">
                    <img
                      src={sourceCode.seller.avatar || '/api/placeholder/48/48'}
                      alt={sourceCode.seller.fullName}
                      className="w-12 h-12 rounded-full"
                    />
                    <div>
                      <h3 className="font-semibold text-gray-900">{sourceCode.seller.fullName}</h3>
                      <p className="text-sm text-gray-600">ID: {sourceCode.seller.userId}</p>
                      {hasPurchased && canAccess && (
                        <p className="text-sm text-teal-600">📧 {sourceCode.seller.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Ngày đăng</p>
                    <p className="font-medium">{new Date(sourceCode.createdAt).toLocaleDateString('vi-VN')}</p>
                  </div>
                </div>

                {/* Tags */}
                {sourceCode.tags.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-2">🏷️ Tags:</h4>
                    <div className="flex flex-wrap gap-2">
                      {sourceCode.tags.map((tag, index) => (
                        <span key={index} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Demo Video */}
                {sourceCode.demoVideo && (
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-2">🎥 Video demo:</h4>
                    <a
                      href={sourceCode.demoVideo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-teal-600 hover:text-teal-700 font-medium"
                    >
                      <span className="mr-2">▶️</span>
                      Xem video demo
                      <span className="ml-1">↗️</span>
                    </a>
                  </div>
                )}

                {/* Source Link (only for purchased users) */}
                {hasPurchased && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h4 className="font-medium text-green-900 mb-2">🔗 Link tải mã nguồn:</h4>
                    {canAccess ? (
                      <div>
                        <a
                          href={sourceCode.sourceLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-teal-600 hover:text-teal-700 font-medium"
                        >
                          <span className="mr-2">📥</span>
                          Tải mã nguồn
                          <span className="ml-1">↗️</span>
                        </a>
                        <p className="text-sm text-green-700 mt-2">
                          ⏰ Link có hiệu lực đến: {new Date(purchaseInfo!.accessExpiresAt).toLocaleString('vi-VN')}
                        </p>
                      </div>
                    ) : (
                      <p className="text-red-600">
                        ⚠️ Link tải đã hết hạn (chỉ có hiệu lực trong 24h sau khi mua)
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="border-b border-gray-200">
                <nav className="flex space-x-8 px-6">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === tab.id
                          ? 'border-teal-500 text-teal-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <span className="mr-2">{tab.icon}</span>
                      {tab.name}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="p-6">
                {/* Description Tab */}
                {activeTab === "description" && (
                  <div className="prose max-w-none">
                    <h3 className="text-lg font-semibold mb-4">📖 Mô tả chi tiết</h3>
                    <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                      {sourceCode.description}
                    </div>
                  </div>
                )}

                {/* Reviews Tab */}
                {activeTab === "reviews" && (
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold">⭐ Đánh giá từ khách hàng</h3>
                      {hasPurchased && !reviews.some(r => r.buyer._id === currentUser?._id) && (
                        <button
                          onClick={() => setShowReviewForm(!showReviewForm)}
                          className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors"
                        >
                          ✍️ Viết đánh giá
                        </button>
                      )}
                    </div>

                    {/* Review Form */}
                    {showReviewForm && (
                      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <Form method="post">
                          <input type="hidden" name="_action" value="review" />
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Đánh giá sao:
                            </label>
                            <div className="flex space-x-2">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <label key={star} className="cursor-pointer">
                                  <input
                                    type="radio"
                                    name="rating"
                                    value={star}
                                    required
                                    className="sr-only peer"
                                  />
                                  <span className="text-2xl text-gray-300 peer-checked:text-yellow-400 hover:text-yellow-400">
                                    ⭐
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Nhận xét:
                            </label>
                            <textarea
                              name="comment"
                              required
                              rows={4}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                              placeholder="Chia sẻ trải nghiệm của bạn về mã nguồn này..."
                            />
                          </div>
                          <div className="flex space-x-3">
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
                            >
                              {isSubmitting ? "Đang gửi..." : "Gửi đánh giá"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowReviewForm(false)}
                              className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                            >
                              Hủy
                            </button>
                          </div>
                        </Form>
                      </div>
                    )}

                    {/* Reviews List */}
                    <div className="space-y-4">
                      {reviews.length > 0 ? (
                        reviews.map((review) => (
                          <div key={review._id} className="p-4 bg-gray-50 rounded-lg">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center space-x-3">
                                <img
                                  src={review.buyer.avatar || '/api/placeholder/40/40'}
                                  alt={review.buyer.fullName}
                                  className="w-10 h-10 rounded-full"
                                />
                                <div>
                                  <h4 className="font-medium">{review.buyer.fullName}</h4>
                                  <div className="flex items-center space-x-1">
                                    {Array.from({ length: 5 }, (_, i) => (
                                      <span
                                        key={i}
                                        className={`text-sm ${
                                          i < review.rating ? 'text-yellow-400' : 'text-gray-300'
                                        }`}
                                      >
                                        ⭐
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <span className="text-sm text-gray-500">
                                {formatTimeAgo(review.createdAt)}
                              </span>
                            </div>
                            <p className="text-gray-700">{review.comment}</p>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <span className="text-4xl mb-4 block">📝</span>
                          <p className="text-gray-600">Chưa có đánh giá nào</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Comments Tab */}
                {activeTab === "comments" && (
                  <div>
                    <h3 className="text-lg font-semibold mb-6">💬 Bình luận</h3>

                    {/* Comment Form */}
                    {currentUser && (
                      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <Form method="post">
                          <input type="hidden" name="_action" value="comment" />
                          <div className="mb-4">
                            <textarea
                              name="content"
                              required
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                              placeholder="Viết bình luận của bạn..."
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
                          >
                            {isSubmitting ? "Đang gửi..." : "💬 Gửi bình luận"}
                          </button>
                        </Form>
                      </div>
                    )}

                    {/* Comments List */}
                    <div className="space-y-4">
                      {comments.length > 0 ? (
                        comments.map((comment) => (
                          <div key={comment._id} className="space-y-4">
                            {/* Main Comment */}
                            <div className="p-4 bg-gray-50 rounded-lg">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center space-x-3">
                                  <img
                                    src={comment.user.avatar || '/api/placeholder/40/40'}
                                    alt={comment.user.fullName}
                                    className="w-10 h-10 rounded-full"
                                  />
                                  <div>
                                    <h4 className="font-medium">{comment.user.fullName}</h4>
                                    <span className="text-sm text-gray-500">
                                      {formatTimeAgo(comment.createdAt)}
                                    </span>
                                  </div>
                                </div>
                                {currentUser && (
                                  <button
                                    onClick={() => setReplyingTo(replyingTo === comment._id ? null : comment._id)}
                                    className="text-teal-600 hover:text-teal-700 text-sm"
                                  >
                                    💬 Trả lời
                                  </button>
                                )}
                              </div>
                              <p className="text-gray-700">{comment.content}</p>
                            </div>

                            {/* Reply Form */}
                            {replyingTo === comment._id && currentUser && (
                              <div className="ml-8 p-4 bg-blue-50 rounded-lg">
                                <Form method="post" onSubmit={() => setReplyingTo(null)}>
                                  <input type="hidden" name="_action" value="comment" />
                                  <input type="hidden" name="parentCommentId" value={comment._id} />
                                  <div className="mb-3">
                                    <textarea
                                      name="content"
                                      required
                                      rows={2}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                      placeholder={`Trả lời ${comment.user.fullName}...`}
                                    />
                                  </div>
                                  <div className="flex space-x-2">
                                    <button
                                      type="submit"
                                      disabled={isSubmitting}
                                      className="bg-teal-600 text-white px-3 py-1 rounded text-sm hover:bg-teal-700 transition-colors disabled:opacity-50"
                                    >
                                      Gửi
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setReplyingTo(null)}
                                      className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-400 transition-colors"
                                    >
                                      Hủy
                                    </button>
                                  </div>
                                </Form>
                              </div>
                            )}

                            {/* Replies */}
                            {comment.replies && comment.replies.length > 0 && (
                              <div className="ml-8 space-y-3">
                                {comment.replies.map((reply) => (
                                  <div key={reply._id} className="p-3 bg-blue-50 rounded-lg">
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex items-center space-x-2">
                                        <img
                                          src={reply.user.avatar || '/api/placeholder/32/32'}
                                          alt={reply.user.fullName}
                                          className="w-8 h-8 rounded-full"
                                        />
                                        <div>
                                          <h5 className="font-medium text-sm">{reply.user.fullName}</h5>
                                          <span className="text-xs text-gray-500">
                                            {formatTimeAgo(reply.createdAt)}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                    <p className="text-gray-700 text-sm">{reply.content}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <span className="text-4xl mb-4 block">💭</span>
                          <p className="text-gray-600">Chưa có bình luận nào</p>
                          {!currentUser && (
                            <p className="text-sm text-gray-500 mt-2">
                              <Link to="/login" className="text-teal-600 hover:text-teal-700">
                                Đăng nhập
                              </Link>{" "}
                              để bình luận
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Purchase Card */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="text-center mb-6">
                <div className="text-3xl font-bold text-teal-600 mb-2">
                  {sourceCode.price.toLocaleString('vi-VN')} xu
                </div>
                <p className="text-gray-600">
                  ≈ {sourceCode.price.toLocaleString('vi-VN')} VND
                </p>
              </div>

              {!currentUser ? (
                <Link
                  to="/login"
                  className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium text-center block"
                >
                  🔐 Đăng nhập để mua
                </Link>
              ) : isOwner ? (
                <div className="text-center">
                  <div className="bg-blue-50 text-blue-700 py-3 px-4 rounded-lg mb-4">
                    👨‍💼 Đây là sản phẩm của bạn
                  </div>
                  <Link
                    to={`/dashboard/my-sources/edit/${sourceCode.sourceId}`}
                    className="w-full bg-gray-600 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-all duration-200 font-medium text-center block"
                  >
                    ✏️ Chỉnh sửa
                  </Link>
                </div>
              ) : hasPurchased ? (
                <div className="text-center">
                  <div className="bg-green-50 text-green-700 py-3 px-4 rounded-lg mb-4">
                    ✅ Bạn đã mua sản phẩm này
                  </div>
                  {canAccess ? (
                    <a
                      href={sourceCode.sourceLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-all duration-200 font-medium text-center block"
                    >
                      📥 Tải mã nguồn
                    </a>
                  ) : (
                    <div className="bg-red-50 text-red-700 py-3 px-4 rounded-lg">
                      ⚠️ Link tải đã hết hạn
                    </div>
                  )}
                </div>
              ) : (
                <Form method="post">
                  <input type="hidden" name="_action" value="purchase" />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Đang xử lý...
                      </div>
                    ) : (
                      "🛒 Mua ngay"
                    )}
                  </button>
                </Form>
              )}

              {currentUser && !isOwner && !hasPurchased && (
                <p className="text-sm text-gray-500 mt-3 text-center">
                  💰 Số dư của bạn: {currentUser.balance.toLocaleString('vi-VN')} xu
                  {currentUser.balance < sourceCode.price && (
                    <span className="block text-red-600 mt-1">
                      ⚠️ Số dư không đủ. <Link to="/dashboard/deposit" className="underline">Nạp thêm xu</Link>
                    </span>
                  )}
                </p>
              )}

              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">💡 Hỗ trợ:</span>
                    <span className="font-medium">24/7</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">🔄 Cập nhật:</span>
                    <span className="font-medium">Miễn phí</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">⏰ Truy cập:</span>
                    <span className="font-medium">24 giờ</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Related Sources */}
            {relatedSources.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  🔗 Sản phẩm liên quan
                </h3>
                <div className="space-y-4">
                  {relatedSources.map((related) => (
                    <Link
                      key={related._id}
                      to={`/source/${related.sourceId}`}
                      className="block group"
                    >
                      <div className="flex space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                        <img
                          src={related.thumbnail}
                          alt={related.title}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 group-hover:text-teal-600 line-clamp-2">
                            {related.title}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {related.seller.fullName}
                          </p>
                          <p className="text-sm font-medium text-teal-600">
                            {related.price.toLocaleString('vi-VN')} xu
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Safety Notice */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-yellow-900 mb-3">
                🛡️ Cam kết an toàn
              </h3>
              <ul className="space-y-2 text-sm text-yellow-800">
                <li>• Mã nguồn được kiểm duyệt kỹ lưỡng</li>
                <li>• Hoàn tiền 100% nếu sản phẩm lỗi</li>
                <li>• Bảo vệ thông tin cá nhân tuyệt đối</li>
                <li>• Hỗ trợ kỹ thuật 24/7</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}