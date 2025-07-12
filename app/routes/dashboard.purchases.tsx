import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { Purchase, SourceCode, User } from "~/lib/db/models";
import { requireAuth } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  await connectToDatabase();
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const filter = url.searchParams.get("filter") || "all";
  const limit = 12;
  const skip = (page - 1) * limit;

  // Build query based on filter
  const query: any = { buyer: user._id };
  
  // Get purchases with populated source and seller info
  const [purchases, totalCount] = await Promise.all([
    Purchase.find(query)
      .populate({
        path: 'sourceCode',
        populate: {
          path: 'seller',
          select: 'fullName avatar email userId'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Purchase.countDocuments(query)
  ]);

  // Filter by access status if needed
  let filteredPurchases = purchases;
  if (filter === "active") {
    filteredPurchases = purchases.filter(p => new Date() < new Date(p.accessExpiresAt));
  } else if (filter === "expired") {
    filteredPurchases = purchases.filter(p => new Date() >= new Date(p.accessExpiresAt));
  }

  const totalPages = Math.ceil(totalCount / limit);

  // Calculate stats
  const stats = {
    totalPurchases: totalCount,
    totalSpent: purchases.reduce((sum, purchase) => sum + purchase.amount, 0),
    activePurchases: purchases.filter(p => new Date() < new Date(p.accessExpiresAt)).length,
    expiredPurchases: purchases.filter(p => new Date() >= new Date(p.accessExpiresAt)).length
  };

  return json({
    purchases: filteredPurchases,
    stats,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount: filteredPurchases.length,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    currentFilter: filter
  });
}

export default function MyPurchases() {
  const { purchases, stats, pagination, currentFilter } = useLoaderData<typeof loader>();
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

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

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    
    if (diffMs <= 0) return "Đã hết hạn";
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 0) {
      return `Còn ${diffHours}h ${diffMinutes}m`;
    } else {
      return `Còn ${diffMinutes}m`;
    }
  };

  const canAccess = (expiresAt: string) => {
    return new Date() < new Date(expiresAt);
  };

  const showDetail = (purchase: any) => {
    setSelectedPurchase(purchase);
    setShowDetailModal(true);
  };

  const filters = [
    { value: "all", label: "Tất cả", count: stats.totalPurchases },
    { value: "active", label: "Đang hoạt động", count: stats.activePurchases },
    { value: "expired", label: "Đã hết hạn", count: stats.expiredPurchases }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          🛒 Mã nguồn đã mua
        </h1>
        <p className="text-gray-600">
          Quản lý và truy cập các mã nguồn bạn đã mua trên SourceCode4U
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng đã mua</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalPurchases}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">🛒</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng chi tiêu</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalSpent.toLocaleString('vi-VN')}</p>
              <p className="text-xs text-gray-500">xu</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-green-400 to-green-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">💰</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Đang truy cập được</p>
              <p className="text-2xl font-bold text-gray-900">{stats.activePurchases}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-teal-400 to-teal-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">🔓</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Đã hết hạn</p>
              <p className="text-2xl font-bold text-gray-900">{stats.expiredPurchases}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-gray-400 to-gray-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">🔒</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-xl shadow-md mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {filters.map((filter) => (
              <Link
                key={filter.value}
                to={`?filter=${filter.value}`}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  currentFilter === filter.value
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {filter.label} ({filter.count})
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Purchases List */}
      {purchases.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {purchases.map((purchase) => (
              <div key={purchase._id} className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                  <img
                    src={purchase.sourceCode.thumbnail}
                    alt={purchase.sourceCode.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 right-3 bg-gradient-to-r from-teal-500 to-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                    {purchase.amount.toLocaleString('vi-VN')} xu
                  </div>
                  <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-sm font-medium ${
                    canAccess(purchase.accessExpiresAt)
                      ? 'bg-green-500 text-white'
                      : 'bg-red-500 text-white'
                  }`}>
                    {canAccess(purchase.accessExpiresAt) ? '🔓 Có thể truy cập' : '🔒 Đã hết hạn'}
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                    {purchase.sourceCode.title}
                  </h3>
                  
                  <div className="flex items-center space-x-2 mb-3">
                    <img
                      src={purchase.sourceCode.seller.avatar || '/api/placeholder/24/24'}
                      alt={purchase.sourceCode.seller.fullName}
                      className="w-6 h-6 rounded-full"
                    />
                    <span className="text-sm text-gray-600">{purchase.sourceCode.seller.fullName}</span>
                  </div>

                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Mã giao dịch:</span>
                      <span className="font-medium">{purchase.purchaseId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ngày mua:</span>
                      <span className="font-medium">{formatTimeAgo(purchase.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Truy cập:</span>
                      <span className={`font-medium ${canAccess(purchase.accessExpiresAt) ? 'text-green-600' : 'text-red-600'}`}>
                        {formatTimeRemaining(purchase.accessExpiresAt)}
                      </span>
                    </div>
                  </div>

                  {/* Contact info for active purchases */}
                  {canAccess(purchase.accessExpiresAt) && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                      <h4 className="text-sm font-medium text-blue-900 mb-1">📞 Liên hệ người bán:</h4>
                      <p className="text-sm text-blue-800">
                        📧 {purchase.sourceCode.seller.email}
                      </p>
                      <p className="text-sm text-blue-800">
                        🆔 {purchase.sourceCode.seller.userId}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-2">
                    <div className="flex space-x-2">
                      <Link
                        to={`/source/${purchase.sourceCode.sourceId}`}
                        className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg hover:bg-blue-700 transition-colors text-center text-sm"
                      >
                        👁️ Xem chi tiết
                      </Link>
                      <button
                        onClick={() => showDetail(purchase)}
                        className="flex-1 bg-gray-600 text-white py-2 px-3 rounded-lg hover:bg-gray-700 transition-colors text-sm"
                      >
                        📋 Chi tiết GD
                      </button>
                    </div>
                    
                    {canAccess(purchase.accessExpiresAt) ? (
                      <a
                        href={purchase.sourceCode.sourceLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-2 px-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 text-center text-sm font-medium block"
                      >
                        📥 Tải mã nguồn
                      </a>
                    ) : (
                      <div className="w-full bg-gray-400 text-white py-2 px-3 rounded-lg text-center text-sm font-medium cursor-not-allowed">
                        🔒 Đã hết hạn truy cập
                      </div>
                    )}
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
                  to={`?page=${pagination.currentPage - 1}&filter=${currentFilter}`}
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
                      to={`?page=${page}&filter=${currentFilter}`}
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
                  to={`?page=${pagination.currentPage + 1}&filter=${currentFilter}`}
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
            <span className="text-white text-4xl">🛒</span>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {currentFilter === "all" 
              ? "Chưa mua mã nguồn nào" 
              : currentFilter === "active"
              ? "Không có mã nguồn đang hoạt động"
              : "Không có mã nguồn đã hết hạn"
            }
          </h3>
          <p className="text-gray-600 mb-6">
            {currentFilter === "all" 
              ? "Khám phá và mua các mã nguồn chất lượng cao trên SourceCode4U"
              : "Thử thay đổi bộ lọc để xem các mã nguồn khác"
            }
          </p>
          {currentFilter === "all" && (
            <Link
              to="/browse"
              className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium inline-block"
            >
              🔍 Khám phá mã nguồn
            </Link>
          )}
        </div>
      )}

      {/* Purchase Detail Modal */}
      {showDetailModal && selectedPurchase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">
                📋 Chi tiết giao dịch
              </h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Transaction Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">💳 Thông tin giao dịch</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Mã giao dịch:</span>
                    <div className="font-medium">{selectedPurchase.purchaseId}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Số tiền:</span>
                    <div className="font-medium text-green-600">{selectedPurchase.amount.toLocaleString('vi-VN')} xu</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Ngày mua:</span>
                    <div className="font-medium">{new Date(selectedPurchase.createdAt).toLocaleString('vi-VN')}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Hết hạn truy cập:</span>
                    <div className={`font-medium ${canAccess(selectedPurchase.accessExpiresAt) ? 'text-green-600' : 'text-red-600'}`}>
                      {new Date(selectedPurchase.accessExpiresAt).toLocaleString('vi-VN')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Info */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">📦 Thông tin sản phẩm</h4>
                <div className="flex space-x-4">
                  <img
                    src={selectedPurchase.sourceCode.thumbnail}
                    alt={selectedPurchase.sourceCode.title}
                    className="w-20 h-20 object-cover rounded-lg"
                  />
                  <div className="flex-1">
                    <h5 className="font-medium text-gray-900 mb-1">{selectedPurchase.sourceCode.title}</h5>
                    <p className="text-sm text-gray-600 mb-2">Mã sản phẩm: {selectedPurchase.sourceCode.sourceId}</p>
                    <Link
                      to={`/source/${selectedPurchase.sourceCode.sourceId}`}
                      className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                    >
                      👁️ Xem chi tiết sản phẩm →
                    </Link>
                  </div>
                </div>
              </div>

              {/* Seller Info */}
              <div className="bg-green-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">👨‍💼 Thông tin người bán</h4>
                <div className="flex items-center space-x-3">
                  <img
                    src={selectedPurchase.sourceCode.seller.avatar || '/api/placeholder/48/48'}
                    alt={selectedPurchase.sourceCode.seller.fullName}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <h5 className="font-medium text-gray-900">{selectedPurchase.sourceCode.seller.fullName}</h5>
                    <p className="text-sm text-gray-600">ID: {selectedPurchase.sourceCode.seller.userId}</p>
                    {canAccess(selectedPurchase.accessExpiresAt) && (
                      <p className="text-sm text-green-700">📧 {selectedPurchase.sourceCode.seller.email}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Access Status */}
              <div className={`rounded-lg p-4 ${canAccess(selectedPurchase.accessExpiresAt) ? 'bg-green-50' : 'bg-red-50'}`}>
                <h4 className="font-semibold text-gray-900 mb-3">
                  {canAccess(selectedPurchase.accessExpiresAt) ? '🔓 Trạng thái truy cập' : '🔒 Trạng thái truy cập'}
                </h4>
                {canAccess(selectedPurchase.accessExpiresAt) ? (
                  <div>
                    <p className="text-green-700 mb-2">✅ Bạn có thể truy cập mã nguồn này</p>
                    <p className="text-sm text-green-600 mb-3">
                      ⏰ Thời gian còn lại: {formatTimeRemaining(selectedPurchase.accessExpiresAt)}
                    </p>
                    <a
                      href={selectedPurchase.sourceCode.sourceLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      📥 Tải mã nguồn
                      <span className="ml-1">↗️</span>
                    </a>
                  </div>
                ) : (
                  <div>
                    <p className="text-red-700 mb-2">❌ Quyền truy cập đã hết hạn</p>
                    <p className="text-sm text-red-600">
                      Link tải chỉ có hiệu lực trong 24 giờ sau khi mua. Vui lòng liên hệ support nếu cần hỗ trợ.
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex space-x-4 pt-4 border-t border-gray-200">
                <Link
                  to={`/source/${selectedPurchase.sourceCode.sourceId}`}
                  className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors text-center font-medium"
                >
                  👁️ Xem sản phẩm
                </Link>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="mt-12 bg-yellow-50 border border-yellow-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-yellow-900 mb-4">💡 Lưu ý quan trọng:</h3>
        <ul className="space-y-2 text-yellow-800">
          <li>• Link tải mã nguồn chỉ có hiệu lực trong 24 giờ sau khi mua</li>
          <li>• Thông tin liên hệ người bán chỉ hiển thị khi bạn có quyền truy cập</li>
          <li>• Hãy tải và backup mã nguồn ngay sau khi mua</li>
          <li>• Liên hệ người bán nếu gặp vấn đề với mã nguồn</li>
          <li>• Đánh giá sản phẩm để giúp cộng đồng</li>
        </ul>
      </div>
    </div>
  );
}