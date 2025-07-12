import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { connectToDatabase } from "~/lib/db/connection";
import { User, SourceCode, Purchase, Payment } from "~/lib/db/models";
import { requireAdmin } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  await connectToDatabase();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // Get overall stats
  const [
    totalUsers,
    totalSources,
    totalPurchases,
    pendingDeposits,
    pendingWithdrawals,
    monthlyRevenue,
    lastMonthRevenue,
    recentUsers,
    recentSources,
    recentPurchases,
    topSellers,
    categoryStats
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    SourceCode.countDocuments({ isActive: true }),
    Purchase.countDocuments(),
    Payment.countDocuments({ type: 'deposit', status: 'pending' }),
    Payment.countDocuments({ type: 'withdrawal', status: 'pending' }),
    Purchase.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: "$adminCommission" } } }
    ]),
    Purchase.aggregate([
      { $match: { 
        createdAt: { 
          $gte: startOfLastMonth, 
          $lte: endOfLastMonth 
        } 
      } },
      { $group: { _id: null, total: { $sum: "$adminCommission" } } }
    ]),
    User.find({ role: 'user' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('fullName email createdAt isVerified')
      .lean(),
    SourceCode.find({ isActive: true })
      .populate('seller', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Purchase.find()
      .populate('buyer', 'fullName')
      .populate('sourceCode', 'title')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    SourceCode.aggregate([
      { $match: { isActive: true } },
      { $lookup: { from: 'users', localField: 'seller', foreignField: '_id', as: 'seller' } },
      { $unwind: '$seller' },
      { $group: {
        _id: '$seller._id',
        sellerName: { $first: '$seller.fullName' },
        totalSales: { $sum: '$purchases' },
        totalRevenue: { $sum: { $multiply: ['$purchases', '$price'] } }
      }},
      { $sort: { totalRevenue: -1 } },
      { $limit: 5 }
    ]),
    SourceCode.aggregate([
      { $match: { isActive: true } },
      { $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalSales: { $sum: '$purchases' }
      }},
      { $sort: { count: -1 } }
    ])
  ]);

  const currentMonthRevenue = monthlyRevenue[0]?.total || 0;
  const previousMonthRevenue = lastMonthRevenue[0]?.total || 0;
  const revenueGrowth = previousMonthRevenue > 0 
    ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue * 100)
    : 0;

  // Get daily purchase stats for the last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date;
  }).reverse();

  const dailyStats = await Promise.all(
    last7Days.map(async (date) => {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const [purchases, revenue] = await Promise.all([
        Purchase.countDocuments({
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        }),
        Purchase.aggregate([
          { $match: { createdAt: { $gte: startOfDay, $lte: endOfDay } } },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ])
      ]);

      return {
        date: date.toLocaleDateString('vi-VN', { month: '2-digit', day: '2-digit' }),
        purchases,
        revenue: revenue[0]?.total || 0
      };
    })
  );

  return json({
    stats: {
      totalUsers,
      totalSources,
      totalPurchases,
      pendingDeposits,
      pendingWithdrawals,
      currentMonthRevenue,
      revenueGrowth
    },
    recentUsers,
    recentSources,
    recentPurchases,
    topSellers,
    categoryStats,
    dailyStats
  });
}

export default function AdminDashboard() {
  const {
    stats,
    recentUsers,
    recentSources,
    recentPurchases,
    topSellers,
    categoryStats,
    dailyStats
  } = useLoaderData<typeof loader>();

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffHours < 1) return "Vừa xong";
    if (diffHours < 24) return `${diffHours}h trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return past.toLocaleDateString('vi-VN');
  };

  const getGrowthColor = (growth: number) => {
    if (growth > 0) return "text-green-600";
    if (growth < 0) return "text-red-600";
    return "text-gray-600";
  };

  const getGrowthIcon = (growth: number) => {
    if (growth > 0) return "📈";
    if (growth < 0) return "📉";
    return "➖";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link to="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">S4U</span>
                </div>
                <span className="text-xl font-bold text-gray-900">Admin Panel</span>
              </Link>
            </div>
            
            <nav className="flex items-center space-x-6">
              <Link to="/admin/users" className="text-gray-700 hover:text-teal-600">Người dùng</Link>
              <Link to="/admin/sources" className="text-gray-700 hover:text-teal-600">Mã nguồn</Link>
              <Link to="/admin/payments" className="text-gray-700 hover:text-teal-600">Thanh toán</Link>
              <Link to="/admin/analytics" className="text-gray-700 hover:text-teal-600">Thống kê</Link>
              <Link to="/dashboard" className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200">
                User Panel
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🛡️ Bảng điều khiển Admin
          </h1>
          <p className="text-gray-600">
            Quản lý toàn bộ hệ thống SourceCode4U
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng người dùng</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalUsers.toLocaleString('vi-VN')}</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-2xl">👥</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng mã nguồn</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalSources.toLocaleString('vi-VN')}</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-purple-400 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-2xl">💻</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng giao dịch</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalPurchases.toLocaleString('vi-VN')}</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-green-400 to-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-2xl">🛒</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Doanh thu tháng</p>
                <p className="text-2xl font-bold text-gray-900">{stats.currentMonthRevenue.toLocaleString('vi-VN')}</p>
                <p className="text-xs text-gray-500 flex items-center">
                  <span className="mr-1">{getGrowthIcon(stats.revenueGrowth)}</span>
                  <span className={getGrowthColor(stats.revenueGrowth)}>
                    {stats.revenueGrowth > 0 ? '+' : ''}{stats.revenueGrowth.toFixed(1)}% so với tháng trước
                  </span>
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-2xl">💰</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">⚠️ Cần xử lý</h3>
            <div className="space-y-4">
              <Link
                to="/admin/deposits"
                className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                  stats.pendingDeposits > 0 
                    ? 'bg-yellow-50 hover:bg-yellow-100 border border-yellow-200' 
                    : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    stats.pendingDeposits > 0 ? 'bg-yellow-500' : 'bg-gray-400'
                  }`}>
                    <span className="text-white">💰</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Yêu cầu nạp xu</p>
                    <p className="text-sm text-gray-600">Chờ duyệt</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {stats.pendingDeposits > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {stats.pendingDeposits}
                    </span>
                  )}
                  <span className="text-gray-400">→</span>
                </div>
              </Link>

              <Link
                to="/admin/withdrawals"
                className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                  stats.pendingWithdrawals > 0 
                    ? 'bg-red-50 hover:bg-red-100 border border-red-200' 
                    : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    stats.pendingWithdrawals > 0 ? 'bg-red-500' : 'bg-gray-400'
                  }`}>
                    <span className="text-white">💸</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Yêu cầu rút xu</p>
                    <p className="text-sm text-gray-600">Chờ duyệt</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {stats.pendingWithdrawals > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {stats.pendingWithdrawals}
                    </span>
                  )}
                  <span className="text-gray-400">→</span>
                </div>
              </Link>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🚀 Hành động nhanh</h3>
            <div className="grid grid-cols-2 gap-4">
              <Link
                to="/admin/users/create"
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg text-center hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
              >
                <div className="text-2xl mb-2">👤</div>
                <div className="font-medium text-sm">Tạo người dùng</div>
              </Link>
              <Link
                to="/dashboard/sell"
                className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg text-center hover:from-green-600 hover:to-green-700 transition-all duration-200"
              >
                <div className="text-2xl mb-2">📤</div>
                <div className="font-medium text-sm">Đăng mã nguồn</div>
              </Link>
              <Link
                to="/admin/categories"
                className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg text-center hover:from-purple-600 hover:to-purple-700 transition-all duration-200"
              >
                <div className="text-2xl mb-2">📁</div>
                <div className="font-medium text-sm">Quản lý danh mục</div>
              </Link>
              <Link
                to="/admin/analytics"
                className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 rounded-lg text-center hover:from-orange-600 hover:to-orange-700 transition-all duration-200"
              >
                <div className="text-2xl mb-2">📊</div>
                <div className="font-medium text-sm">Xem thống kê</div>
              </Link>
            </div>
          </div>
        </div>

        {/* Charts and Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Daily Stats Chart */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📈 Giao dịch 7 ngày gần đây</h3>
            <div className="space-y-3">
              {dailyStats.map((stat, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{stat.date}</span>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-gray-500">🛒</span>
                      <span className="text-sm font-medium">{stat.purchases}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-gray-500">💰</span>
                      <span className="text-sm font-medium">{stat.revenue.toLocaleString('vi-VN')} xu</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Categories */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Danh mục phổ biến</h3>
            <div className="space-y-3">
              {categoryStats.slice(0, 5).map((category) => (
                <div key={category._id} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{category._id}</span>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-gray-500">📦</span>
                      <span className="text-sm text-gray-600">{category.count}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-gray-500">🛒</span>
                      <span className="text-sm text-gray-600">{category.totalSales}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Recent Users */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">👥 Người dùng mới</h3>
              <Link to="/admin/users" className="text-teal-600 hover:text-teal-700 text-sm font-medium">
                Xem tất cả →
              </Link>
            </div>
            <div className="space-y-3">
              {recentUsers.map((user) => (
                <div key={user._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{user.fullName}</p>
                    <p className="text-xs text-gray-600">{user.email}</p>
                    <p className="text-xs text-gray-500">{formatTimeAgo(user.createdAt)}</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${user.isVerified ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Sources */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">💻 Mã nguồn mới</h3>
              <Link to="/admin/sources" className="text-teal-600 hover:text-teal-700 text-sm font-medium">
                Xem tất cả →
              </Link>
            </div>
            <div className="space-y-3">
              {recentSources.map((source) => (
                <div key={source._id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900 text-sm line-clamp-1">{source.title}</p>
                  <p className="text-xs text-gray-600">{source.seller.fullName}</p>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-gray-500">{formatTimeAgo(source.createdAt)}</p>
                    <p className="text-xs font-medium text-teal-600">{source.price.toLocaleString('vi-VN')} xu</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Purchases */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">🛒 Giao dịch mới</h3>
              <Link to="/admin/purchases" className="text-teal-600 hover:text-teal-700 text-sm font-medium">
                Xem tất cả →
              </Link>
            </div>
            <div className="space-y-3">
              {recentPurchases.map((purchase) => (
                <div key={purchase._id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900 text-sm">{purchase.buyer.fullName}</p>
                  <p className="text-xs text-gray-600 line-clamp-1">{purchase.sourceCode.title}</p>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-gray-500">{formatTimeAgo(purchase.createdAt)}</p>
                    <p className="text-xs font-medium text-green-600">{purchase.amount.toLocaleString('vi-VN')} xu</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Sellers */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">🏆 Top Sellers</h3>
            <Link to="/admin/analytics" className="text-teal-600 hover:text-teal-700 text-sm font-medium">
              Xem chi tiết →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Hạng</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Người bán</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Số lượng bán</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {topSellers.map((seller, index) => (
                  <tr key={seller._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <span className="text-2xl mr-2">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{seller.sellerName}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-gray-900">{seller.totalSales.toLocaleString('vi-VN')}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-green-600">{seller.totalRevenue.toLocaleString('vi-VN')} xu</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-gradient-to-r from-teal-500 to-blue-600 rounded-xl p-6 text-white">
          <h3 className="text-lg font-semibold mb-4">🔧 Trạng thái hệ thống</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl mb-2">🟢</div>
              <div className="text-sm opacity-90">Database</div>
              <div className="text-xs opacity-75">Hoạt động tốt</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">🟢</div>
              <div className="text-sm opacity-90">Email Service</div>
              <div className="text-xs opacity-75">Hoạt động tốt</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">🟢</div>
              <div className="text-sm opacity-90">File Storage</div>
              <div className="text-xs opacity-75">Hoạt động tốt</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">🟢</div>
              <div className="text-sm opacity-90">Payment</div>
              <div className="text-xs opacity-75">Hoạt động tốt</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}