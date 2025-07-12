import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, Link, useLocation, Form } from "@remix-run/react";
import { useState, useEffect } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { User, SourceCode, Purchase, Notification } from "~/lib/db/models";
import { requireAuth } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  await connectToDatabase();

  // Get dashboard stats
  const [sourceCodes, purchases, notifications] = await Promise.all([
    SourceCode.find({ seller: user._id }).lean(),
    Purchase.find({ buyer: user._id }).populate('sourceCode', 'title').lean(),
    Notification.find({ user: user._id, isRead: false }).limit(5).lean()
  ]);

  const stats = {
    totalSourceCodes: sourceCodes.length,
    totalSales: sourceCodes.reduce((sum, code) => sum + code.purchases, 0),
    totalRevenue: sourceCodes.reduce((sum, code) => sum + (code.purchases * code.price * 0.8), 0),
    totalPurchases: purchases.length
  };

  return json({
    user: {
      userId: user.userId,
      fullName: user.fullName,
      email: user.email,
      avatar: user.avatar,
      balance: user.balance,
      role: user.role
    },
    stats,
    notifications
  });
}

export default function Dashboard() {
  const { user, stats, notifications } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navigation = [
    { name: 'Tổng quan', href: '/dashboard', icon: '📊', current: location.pathname === '/dashboard' },
    { name: 'Mã nguồn của tôi', href: '/dashboard/my-sources', icon: '💻', current: location.pathname === '/dashboard/my-sources' },
    { name: 'Đăng bán mã nguồn', href: '/dashboard/sell', icon: '📤', current: location.pathname === '/dashboard/sell' },
    { name: 'Mã nguồn đã mua', href: '/dashboard/purchases', icon: '🛒', current: location.pathname === '/dashboard/purchases' },
    { name: 'Nạp xu', href: '/dashboard/deposit', icon: '💰', current: location.pathname === '/dashboard/deposit' },
    { name: 'Rút xu', href: '/dashboard/withdraw', icon: '💸', current: location.pathname === '/dashboard/withdraw' },
    { name: 'Lịch sử giao dịch', href: '/dashboard/transactions', icon: '📈', current: location.pathname === '/dashboard/transactions' },
    { name: 'Thông báo', href: '/dashboard/notifications', icon: '🔔', current: location.pathname === '/dashboard/notifications' },
    { name: 'Cài đặt tài khoản', href: '/dashboard/settings', icon: '⚙️', current: location.pathname === '/dashboard/settings' },
  ];

  const adminNavigation = [
    { name: 'Quản lý người dùng', href: '/admin/users', icon: '👥' },
    { name: 'Quản lý mã nguồn', href: '/admin/sources', icon: '📁' },
    { name: 'Duyệt nạp xu', href: '/admin/deposits', icon: '💰' },
    { name: 'Duyệt rút xu', href: '/admin/withdrawals', icon: '💸' },
    { name: 'Thống kê', href: '/admin/analytics', icon: '📊' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 flex z-40 md:hidden ${sidebarOpen ? '' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)}></div>
        <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              onClick={() => setSidebarOpen(false)}
            >
              <span className="sr-only">Close sidebar</span>
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <SidebarContent navigation={navigation} adminNavigation={user.role === 'admin' ? adminNavigation : []} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <SidebarContent navigation={navigation} adminNavigation={user.role === 'admin' ? adminNavigation : []} />
      </div>

      {/* Main content */}
      <div className="md:pl-64 flex flex-col flex-1">
        {/* Header */}
        <div className="sticky top-0 z-10 md:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 bg-gray-50">
          <button
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Top bar */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Link to="/" className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">S4U</span>
                  </div>
                  <span className="text-xl font-bold text-gray-900 hidden sm:block">SourceCode4U</span>
                </Link>
              </div>

              <div className="flex items-center space-x-4">
                {/* Balance */}
                <div className="hidden sm:flex items-center space-x-2 bg-gradient-to-r from-teal-50 to-blue-50 px-4 py-2 rounded-lg">
                  <span className="text-2xl">💰</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {user.balance.toLocaleString('vi-VN')} xu
                    </p>
                    <p className="text-xs text-gray-600">Số dư tài khoản</p>
                  </div>
                </div>

                {/* Notifications */}
                <Link
                  to="/dashboard/notifications"
                  className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <span className="text-xl">🔔</span>
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {notifications.length}
                    </span>
                  )}
                </Link>

                {/* User menu */}
                <div className="relative">
                  <button
                    className="flex items-center space-x-2 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                  >
                    <img
                      src={user.avatar || '/api/placeholder/32/32'}
                      alt={user.fullName}
                      className="w-8 h-8 rounded-full"
                    />
                    <span className="hidden sm:block font-medium">{user.fullName}</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900">{user.fullName}</p>
                        <p className="text-sm text-gray-600">{user.email}</p>
                        <p className="text-xs text-gray-500">ID: {user.userId}</p>
                      </div>
                      <Link
                        to="/dashboard/settings"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        ⚙️ Cài đặt tài khoản
                      </Link>
                      <Link
                        to="/"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        🏠 Về trang chủ
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        🚪 Đăng xuất
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main content area */}
        <main className="flex-1 pb-8">
          {location.pathname === '/dashboard' ? (
            <DashboardOverview user={user} stats={stats} notifications={notifications} />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ navigation, adminNavigation }: { navigation: any[], adminNavigation: any[] }) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white border-r border-gray-200">
      <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
        <div className="flex items-center flex-shrink-0 px-4">
          <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">S4U</span>
          </div>
          <span className="ml-2 text-xl font-bold text-gray-900">Dashboard</span>
        </div>
        <nav className="mt-8 flex-1 px-2 space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                item.current
                  ? 'bg-gradient-to-r from-teal-50 to-blue-50 text-teal-700 border-r-2 border-teal-500'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="mr-3 text-lg">{item.icon}</span>
              {item.name}
            </Link>
          ))}
          
          {adminNavigation.length > 0 && (
            <>
              <div className="mt-8 pt-4 border-t border-gray-200">
                <h3 className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Quản trị viên
                </h3>
              </div>
              {adminNavigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className="group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <span className="mr-3 text-lg">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
            </>
          )}
        </nav>
      </div>
    </div>
  );
}

function DashboardOverview({ user, stats, notifications }: { user: any, stats: any, notifications: any[] }) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Chào mừng trở lại, {user.fullName}! 👋
        </h1>
        <p className="text-gray-600 mt-2">
          Quản lý mã nguồn và theo dõi doanh thu của bạn tại đây
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Số dư tài khoản</p>
              <p className="text-2xl font-bold text-gray-900">
                {user.balance.toLocaleString('vi-VN')} xu
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-green-400 to-green-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">💰</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Mã nguồn đã đăng</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalSourceCodes}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">💻</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng doanh số</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalSales}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-purple-400 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">📈</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Đã mua</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalPurchases}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-2xl">🛒</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🚀 Hành động nhanh</h3>
          <div className="grid grid-cols-2 gap-4">
            <Link
              to="/dashboard/sell"
              className="bg-gradient-to-r from-teal-500 to-blue-600 text-white p-4 rounded-lg text-center hover:from-teal-600 hover:to-blue-700 transition-all duration-200"
            >
              <div className="text-2xl mb-2">📤</div>
              <div className="font-medium">Đăng bán</div>
            </Link>
            <Link
              to="/dashboard/deposit"
              className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg text-center hover:from-green-600 hover:to-green-700 transition-all duration-200"
            >
              <div className="text-2xl mb-2">💰</div>
              <div className="font-medium">Nạp xu</div>
            </Link>
            <Link
              to="/browse"
              className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg text-center hover:from-purple-600 hover:to-purple-700 transition-all duration-200"
            >
              <div className="text-2xl mb-2">🔍</div>
              <div className="font-medium">Tìm mã nguồn</div>
            </Link>
            <Link
              to="/dashboard/withdraw"
              className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 rounded-lg text-center hover:from-orange-600 hover:to-orange-700 transition-all duration-200"
            >
              <div className="text-2xl mb-2">💸</div>
              <div className="font-medium">Rút xu</div>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">🔔 Thông báo mới</h3>
            <Link
              to="/dashboard/notifications"
              className="text-teal-600 hover:text-teal-700 text-sm font-medium"
            >
              Xem tất cả
            </Link>
          </div>
          <div className="space-y-3">
            {notifications.length > 0 ? (
              notifications.map((notification, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900 text-sm">{notification.title}</p>
                  <p className="text-gray-600 text-sm">{notification.message}</p>
                  <p className="text-gray-400 text-xs mt-1">
                    {new Date(notification.createdAt).toLocaleDateString('vi-VN')}
                  </p>
                </div>
              ))
            ) : (
              <div className="text-center py-4">
                <span className="text-4xl mb-2 block">📭</span>
                <p className="text-gray-600">Không có thông báo mới</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 Tổng quan hoạt động</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-teal-600 mb-2">
              {stats.totalRevenue.toLocaleString('vi-VN')}
            </div>
            <p className="text-gray-600">Tổng doanh thu (xu)</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {((stats.totalSales / Math.max(stats.totalSourceCodes, 1)) || 0).toFixed(1)}
            </div>
            <p className="text-gray-600">Doanh số trung bình/sản phẩm</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600 mb-2">
              {stats.totalSourceCodes > 0 ? 
                ((stats.totalSales / stats.totalSourceCodes * 100) || 0).toFixed(1) : '0'
              }%
            </div>
            <p className="text-gray-600">Tỷ lệ bán hàng</p>
          </div>
        </div>
      </div>
    </div>
  );
}