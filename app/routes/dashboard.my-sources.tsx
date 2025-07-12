import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Link, Form, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { SourceCode, Purchase, User } from "~/lib/db/models";
import { requireAuth } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  await connectToDatabase();
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 12;
  const skip = (page - 1) * limit;

  // Get user's source codes
  const [sourceCodes, totalCount] = await Promise.all([
    SourceCode.find({ seller: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SourceCode.countDocuments({ seller: user._id })
  ]);

  // Get sales data for each source
  const sourceCodesWithSales = await Promise.all(
    sourceCodes.map(async (source) => {
      const purchases = await Purchase.find({ sourceCode: source._id })
        .populate('buyer', 'fullName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
      
      const totalEarnings = purchases.reduce((sum, purchase) => sum + purchase.sellerEarnings, 0);
      
      return {
        ...source,
        recentPurchases: purchases,
        totalEarnings
      };
    })
  );

  const totalPages = Math.ceil(totalCount / limit);

  // Calculate overall stats
  const stats = {
    totalSources: totalCount,
    totalViews: sourceCodes.reduce((sum, code) => sum + code.views, 0),
    totalSales: sourceCodes.reduce((sum, code) => sum + code.purchases, 0),
    totalEarnings: sourceCodesWithSales.reduce((sum, code) => sum + code.totalEarnings, 0)
  };

  return json({
    sourceCodes: sourceCodesWithSales,
    stats,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAuth(request);
  const formData = await request.formData();
  const action = formData.get("_action") as string;
  const sourceId = formData.get("sourceId") as string;

  try {
    await connectToDatabase();

    switch (action) {
      case "toggle-status": {
        const sourceCode = await SourceCode.findOne({ 
          sourceId, 
          seller: user._id 
        });

        if (!sourceCode) {
          return json({ error: "Không tìm thấy mã nguồn" }, { status: 404 });
        }

        await SourceCode.findByIdAndUpdate(sourceCode._id, {
          isActive: !sourceCode.isActive
        });

        return json({ 
          success: true, 
          message: `${sourceCode.isActive ? 'Ẩn' : 'Hiển thị'} mã nguồn thành công!` 
        });
      }

      case "delete": {
        const sourceCode = await SourceCode.findOne({ 
          sourceId, 
          seller: user._id 
        });

        if (!sourceCode) {
          return json({ error: "Không tìm thấy mã nguồn" }, { status: 404 });
        }

        // Check if there are any purchases
        const purchaseCount = await Purchase.countDocuments({ 
          sourceCode: sourceCode._id 
        });

        if (purchaseCount > 0) {
          return json({ 
            error: "Không thể xóa mã nguồn đã có người mua" 
          }, { status: 400 });
        }

        await SourceCode.findByIdAndDelete(sourceCode._id);

        return json({ 
          success: true, 
          message: "Xóa mã nguồn thành công!" 
        });
      }

      default:
        return json({ error: "Hành động không hợp lệ" }, { status: 400 });
    }
  } catch (error) {
    console.error("Action error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function MySources() {
  const { sourceCodes, stats, pagination } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const isSubmitting = navigation.state === "submitting";

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

  const handleDeleteClick = (sourceId: string) => {
    setSelectedSource(sourceId);
    setShowDeleteModal(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              💻 Mã nguồn của tôi
            </h1>
            <p className="text-gray-600">
              Quản lý và theo dõi hiệu suất của các mã nguồn bạn đã đăng bán
            </p>
          </div>
          <Link
            to="/dashboard/sell"
            className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium"
          >
            📤 Đăng bán mã nguồn mới
          </Link>
        </div>
      </div>

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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng mã nguồn</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalSources}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">💻</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng lượt xem</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalViews.toLocaleString('vi-VN')}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-purple-400 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">👁️</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng bán được</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalSales}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">🛒</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng thu nhập</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalEarnings.toLocaleString('vi-VN')}</p>
              <p className="text-xs text-gray-500">xu</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-green-400 to-green-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">💰</span>
            </div>
          </div>
        </div>
      </div>

      {/* Source Codes List */}
      {sourceCodes.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {sourceCodes.map((source) => (
              <div key={source._id} className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                  <img
                    src={source.thumbnail}
                    alt={source.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 right-3 bg-gradient-to-r from-teal-500 to-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                    {source.price.toLocaleString('vi-VN')} xu
                  </div>
                  <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-sm font-medium ${
                    source.isActive 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-500 text-white'
                  }`}>
                    {source.isActive ? '🟢 Đang bán' : '🔴 Đã ẩn'}
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                    {source.title}
                  </h3>
                  
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                    <div className="flex items-center space-x-1">
                      <span>⭐</span>
                      <span>{source.rating > 0 ? source.rating.toFixed(1) : 'Chưa có'}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span>👁️</span>
                      <span>{source.views}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span>🛒</span>
                      <span>{source.purchases}</span>
                    </div>
                  </div>

                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm">
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-600">Thu nhập:</span>
                        <span className="font-medium text-green-600">
                          {source.totalEarnings.toLocaleString('vi-VN')} xu
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ngày đăng:</span>
                        <span className="font-medium">
                          {formatTimeAgo(source.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Purchases */}
                  {source.recentPurchases.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        🛒 Người mua gần đây:
                      </h4>
                      <div className="space-y-1">
                        {source.recentPurchases.slice(0, 3).map((purchase) => (
                          <div key={purchase._id} className="flex justify-between items-center text-xs">
                            <span className="text-gray-600">{purchase.buyer.fullName}</span>
                            <span className="text-gray-500">
                              {formatTimeAgo(purchase.createdAt)}
                            </span>
                          </div>
                        ))}
                        {source.recentPurchases.length > 3 && (
                          <div className="text-xs text-gray-500">
                            +{source.recentPurchases.length - 3} người khác
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-2">
                    <div className="flex space-x-2">
                      <Link
                        to={`/source/${source.sourceId}`}
                        className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg hover:bg-blue-700 transition-colors text-center text-sm"
                      >
                        👁️ Xem
                      </Link>
                      <Link
                        to={`/dashboard/my-sources/edit/${source.sourceId}`}
                        className="flex-1 bg-gray-600 text-white py-2 px-3 rounded-lg hover:bg-gray-700 transition-colors text-center text-sm"
                      >
                        ✏️ Sửa
                      </Link>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Form method="post" className="flex-1">
                        <input type="hidden" name="_action" value="toggle-status" />
                        <input type="hidden" name="sourceId" value={source.sourceId} />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className={`w-full py-2 px-3 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 ${
                            source.isActive
                              ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        >
                          {source.isActive ? '👁️‍🗨️ Ẩn' : '👁️ Hiện'}
                        </button>
                      </Form>
                      
                      <button
                        onClick={() => handleDeleteClick(source.sourceId)}
                        disabled={source.purchases > 0}
                        className="flex-1 bg-red-600 text-white py-2 px-3 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        title={source.purchases > 0 ? "Không thể xóa mã nguồn đã có người mua" : "Xóa mã nguồn"}
                      >
                        🗑️ Xóa
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center items-center space-x-2">
              {pagination.hasPrev && (
                <Link
                  to={`?page=${pagination.currentPage - 1}`}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  ← Trước
                </Link>
              )}
              
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter(page => 
                  page === 1 || 
                  page === pagination.totalPages || 
                  Math.abs(page - pagination.currentPage) <= 2
                )
                .map((page, index, array) => (
                  <div key={page} className="flex items-center">
                    {index > 0 && array[index - 1] !== page - 1 && (
                      <span className="px-2 text-gray-500">...</span>
                    )}
                    <Link
                      to={`?page=${page}`}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        page === pagination.currentPage
                          ? 'bg-gradient-to-r from-teal-500 to-blue-600 text-white'
                          : 'bg-white border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </Link>
                  </div>
                ))}
              
              {pagination.hasNext && (
                <Link
                  to={`?page=${pagination.currentPage + 1}`}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Sau →
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-gradient-to-r from-teal-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-white text-4xl">💻</span>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Chưa có mã nguồn nào
          </h3>
          <p className="text-gray-600 mb-6">
            Bắt đầu bán mã nguồn đầu tiên của bạn để kiếm tiền ngay hôm nay!
          </p>
          <Link
            to="/dashboard/sell"
            className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium inline-block"
          >
            📤 Đăng bán mã nguồn đầu tiên
          </Link>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Xác nhận xóa mã nguồn
              </h3>
              <p className="text-gray-600">
                Bạn có chắc chắn muốn xóa mã nguồn này? Hành động này không thể hoàn tác.
              </p>
            </div>
            
            <div className="flex space-x-4">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Hủy bỏ
              </button>
              <Form method="post" className="flex-1">
                <input type="hidden" name="_action" value="delete" />
                <input type="hidden" name="sourceId" value={selectedSource || ""} />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  onClick={() => setShowDeleteModal(false)}
                  className="w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
                >
                  {isSubmitting ? "Đang xóa..." : "Xóa mã nguồn"}
                </button>
              </Form>
            </div>
          </div>
        </div>
      )}

      {/* Performance Tips */}
      <div className="mt-12 bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">💡 Tips để tăng doanh số:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ul className="space-y-2 text-blue-800">
            <li>• Cập nhật thumbnail chất lượng cao</li>
            <li>• Viết mô tả chi tiết và hấp dẫn</li>
            <li>• Thêm video demo trực quan</li>
            <li>• Đặt giá cạnh tranh</li>
          </ul>
          <ul className="space-y-2 text-blue-800">
            <li>• Sử dụng tags phù hợp</li>
            <li>• Cập nhật mã nguồn thường xuyên</li>
            <li>• Hỗ trợ khách hàng nhiệt tình</li>
            <li>• Thu thập feedback để cải thiện</li>
          </ul>
        </div>
      </div>
    </div>
  );
}