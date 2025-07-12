import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Link, Form, useNavigation, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { User, SourceCode, Purchase } from "~/lib/db/models";
import { requireAdmin } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  await connectToDatabase();

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const search = url.searchParams.get("search") || "";
  const filter = url.searchParams.get("filter") || "all";
  const sort = url.searchParams.get("sort") || "newest";
  const limit = 20;
  const skip = (page - 1) * limit;

  // Build query
  const query: any = { role: 'user' };
  
  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { userId: { $regex: search, $options: "i" } }
    ];
  }

  if (filter === "verified") {
    query.isVerified = true;
  } else if (filter === "unverified") {
    query.isVerified = false;
  }

  // Build sort options
  let sortOptions: any = {};
  switch (sort) {
    case "oldest":
      sortOptions = { createdAt: 1 };
      break;
    case "name":
      sortOptions = { fullName: 1 };
      break;
    case "balance":
      sortOptions = { balance: -1 };
      break;
    default:
      sortOptions = { createdAt: -1 };
  }

  const [users, totalCount] = await Promise.all([
    User.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query)
  ]);

  // Get additional stats for each user
  const usersWithStats = await Promise.all(
    users.map(async (user) => {
      const [sourcesCount, purchasesCount, totalEarnings] = await Promise.all([
        SourceCode.countDocuments({ seller: user._id }),
        Purchase.countDocuments({ buyer: user._id }),
        Purchase.aggregate([
          { $match: { buyer: user._id } },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ])
      ]);

      return {
        ...user,
        sourcesCount,
        purchasesCount,
        totalSpent: totalEarnings[0]?.total || 0
      };
    })
  );

  const totalPages = Math.ceil(totalCount / limit);

  // Get summary stats
  const stats = await Promise.all([
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ role: 'user', isVerified: true }),
    User.countDocuments({ role: 'user', isVerified: false }),
    User.aggregate([
      { $match: { role: 'user' } },
      { $group: { _id: null, totalBalance: { $sum: "$balance" } } }
    ])
  ]);

  return json({
    users: usersWithStats,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    filters: { search, filter, sort },
    stats: {
      totalUsers: stats[0],
      verifiedUsers: stats[1],
      unverifiedUsers: stats[2],
      totalBalance: stats[3][0]?.totalBalance || 0
    }
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const action = formData.get("_action") as string;
  const userId = formData.get("userId") as string;

  try {
    await connectToDatabase();

    switch (action) {
      case "verify": {
        await User.findOneAndUpdate(
          { userId }, 
          { isVerified: true, verificationToken: undefined }
        );
        return json({ success: true, message: "Đã xác thực người dùng thành công!" });
      }

      case "unverify": {
        await User.findOneAndUpdate(
          { userId }, 
          { isVerified: false }
        );
        return json({ success: true, message: "Đã bỏ xác thực người dùng!" });
      }

      case "adjust-balance": {
        const amount = parseInt(formData.get("amount") as string);
        const note = formData.get("note") as string;
        
        if (isNaN(amount)) {
          return json({ error: "Số tiền không hợp lệ" }, { status: 400 });
        }

        await User.findOneAndUpdate(
          { userId }, 
          { $inc: { balance: amount } }
        );

        return json({ 
          success: true, 
          message: `Đã ${amount > 0 ? 'cộng' : 'trừ'} ${Math.abs(amount).toLocaleString('vi-VN')} xu${note ? ` (${note})` : ''}` 
        });
      }

      case "delete": {
        const user = await User.findOne({ userId });
        if (!user) {
          return json({ error: "Không tìm thấy người dùng" }, { status: 404 });
        }

        // Check if user has any source codes or purchases
        const [sourcesCount, purchasesCount] = await Promise.all([
          SourceCode.countDocuments({ seller: user._id }),
          Purchase.countDocuments({ buyer: user._id })
        ]);

        if (sourcesCount > 0 || purchasesCount > 0) {
          return json({ 
            error: "Không thể xóa người dùng đã có hoạt động trên hệ thống" 
          }, { status: 400 });
        }

        await User.findByIdAndDelete(user._id);
        return json({ success: true, message: "Đã xóa người dùng thành công!" });
      }

      default:
        return json({ error: "Hành động không hợp lệ" }, { status: 400 });
    }
  } catch (error) {
    console.error("Admin action error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function AdminUsers() {
  const { users, pagination, filters, stats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceNote, setBalanceNote] = useState("");
  const isSubmitting = navigation.state === "submitting";

  const updateSearchParams = (updates: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    newParams.delete('page'); // Reset to first page
    setSearchParams(newParams);
  };

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

  const handleBalanceAdjust = (user: any) => {
    setSelectedUser(user);
    setBalanceAmount("");
    setBalanceNote("");
    setShowBalanceModal(true);
  };

  const handleDeleteUser = (user: any) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link to="/admin" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">S4U</span>
                </div>
                <span className="text-xl font-bold text-gray-900">Admin</span>
              </Link>
              <span className="text-gray-400">→</span>
              <span className="text-gray-700">Quản lý người dùng</span>
            </div>
            
            <Link
              to="/admin/users/create"
              className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200"
            >
              ➕ Tạo người dùng
            </Link>
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng người dùng</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalUsers.toLocaleString('vi-VN')}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 text-2xl">👥</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Đã xác thực</p>
                <p className="text-2xl font-bold text-gray-900">{stats.verifiedUsers.toLocaleString('vi-VN')}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600 text-2xl">✅</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Chưa xác thực</p>
                <p className="text-2xl font-bold text-gray-900">{stats.unverifiedUsers.toLocaleString('vi-VN')}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <span className="text-yellow-600 text-2xl">⏳</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng số dư</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalBalance.toLocaleString('vi-VN')}</p>
                <p className="text-xs text-gray-500">xu</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600 text-2xl">💰</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tìm kiếm
              </label>
              <input
                type="text"
                defaultValue={filters.search}
                onChange={(e) => updateSearchParams({ search: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Tên, email, ID..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trạng thái
              </label>
              <select
                defaultValue={filters.filter}
                onChange={(e) => updateSearchParams({ filter: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">Tất cả</option>
                <option value="verified">Đã xác thực</option>
                <option value="unverified">Chưa xác thực</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sắp xếp
              </label>
              <select
                defaultValue={filters.sort}
                onChange={(e) => updateSearchParams({ sort: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="name">Tên A-Z</option>
                <option value="balance">Số dư cao nhất</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => setSearchParams({})}
                className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
              >
                🔄 Reset
              </button>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Người dùng
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thông tin
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hoạt động
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Số dư
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <img
                          src={user.avatar || '/api/placeholder/40/40'}
                          alt={user.fullName}
                          className="w-10 h-10 rounded-full"
                        />
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{user.fullName}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">ID: {user.userId}</div>
                      <div className="text-sm text-gray-500">
                        Tham gia: {formatTimeAgo(user.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        📦 {user.sourcesCount} mã nguồn
                      </div>
                      <div className="text-sm text-gray-500">
                        🛒 {user.purchasesCount} giao dịch mua
                      </div>
                      <div className="text-sm text-gray-500">
                        💸 {user.totalSpent.toLocaleString('vi-VN')} xu đã chi
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.balance.toLocaleString('vi-VN')} xu
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.isVerified
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {user.isVerified ? '✅ Đã xác thực' : '⏳ Chưa xác thực'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {!user.isVerified ? (
                          <Form method="post" className="inline">
                            <input type="hidden" name="_action" value="verify" />
                            <input type="hidden" name="userId" value={user.userId} />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="text-green-600 hover:text-green-900 disabled:opacity-50"
                              title="Xác thực người dùng"
                            >
                              ✅
                            </button>
                          </Form>
                        ) : (
                          <Form method="post" className="inline">
                            <input type="hidden" name="_action" value="unverify" />
                            <input type="hidden" name="userId" value={user.userId} />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="text-yellow-600 hover:text-yellow-900 disabled:opacity-50"
                              title="Bỏ xác thực"
                            >
                              ❌
                            </button>
                          </Form>
                        )}
                        
                        <button
                          onClick={() => handleBalanceAdjust(user)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Điều chỉnh số dư"
                        >
                          💰
                        </button>
                        
                        <Link
                          to={`/admin/users/${user.userId}`}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Xem chi tiết"
                        >
                          👁️
                        </Link>
                        
                        {user.sourcesCount === 0 && user.purchasesCount === 0 && (
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className="text-red-600 hover:text-red-900"
                            title="Xóa người dùng"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
              <div className="flex-1 flex justify-between sm:hidden">
                {pagination.hasPrev && (
                  <Link
                    to={`?${new URLSearchParams({
                      ...filters,
                      page: (pagination.currentPage - 1).toString()
                    })}`}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Trước
                  </Link>
                )}
                {pagination.hasNext && (
                  <Link
                    to={`?${new URLSearchParams({
                      ...filters,
                      page: (pagination.currentPage + 1).toString()
                    })}`}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Sau
                  </Link>
                )}
              </div>
              
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Hiển thị <span className="font-medium">{((pagination.currentPage - 1) * 20) + 1}</span> đến{' '}
                    <span className="font-medium">
                      {Math.min(pagination.currentPage * 20, pagination.totalCount)}
                    </span> trong tổng số{' '}
                    <span className="font-medium">{pagination.totalCount}</span> kết quả
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    {pagination.hasPrev && (
                      <Link
                        to={`?${new URLSearchParams({
                          ...filters,
                          page: (pagination.currentPage - 1).toString()
                        })}`}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                      >
                        ← Trước
                      </Link>
                    )}
                    
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      const page = pagination.currentPage <= 3 
                        ? i + 1 
                        : pagination.currentPage + i - 2;
                      if (page <= pagination.totalPages && page > 0) {
                        return (
                          <Link
                            key={page}
                            to={`?${new URLSearchParams({
                              ...filters,
                              page: page.toString()
                            })}`}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              page === pagination.currentPage
                                ? 'z-10 bg-teal-50 border-teal-500 text-teal-600'
                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </Link>
                        );
                      }
                      return null;
                    })}
                    
                    {pagination.hasNext && (
                      <Link
                        to={`?${new URLSearchParams({
                          ...filters,
                          page: (pagination.currentPage + 1).toString()
                        })}`}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                      >
                        Sau →
                      </Link>
                    )}
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Balance Adjustment Modal */}
        {showBalanceModal && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                💰 Điều chỉnh số dư cho {selectedUser.fullName}
              </h3>
              
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Số dư hiện tại: <strong>{selectedUser.balance.toLocaleString('vi-VN')} xu</strong>
                </p>
              </div>

              <Form method="post">
                <input type="hidden" name="_action" value="adjust-balance" />
                <input type="hidden" name="userId" value={selectedUser.userId} />
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Số tiền (xu) *
                  </label>
                  <input
                    type="number"
                    name="amount"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Nhập số dương để cộng, số âm để trừ"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Ví dụ: 10000 (cộng 10,000 xu), -5000 (trừ 5,000 xu)
                  </p>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ghi chú
                  </label>
                  <input
                    type="text"
                    name="note"
                    value={balanceNote}
                    onChange={(e) => setBalanceNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Lý do điều chỉnh..."
                  />
                </div>

                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={() => setShowBalanceModal(false)}
                    className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={!balanceAmount || isSubmitting}
                    onClick={() => setShowBalanceModal(false)}
                    className="flex-1 bg-gradient-to-r from-teal-500 to-blue-600 text-white py-2 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 disabled:opacity-50"
                  >
                    {isSubmitting ? "Đang xử lý..." : "Điều chỉnh"}
                  </button>
                </div>
              </Form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Xác nhận xóa người dùng
                </h3>
                <p className="text-gray-600">
                  Bạn có chắc chắn muốn xóa người dùng <strong>{selectedUser.fullName}</strong>?
                  <br />
                  Hành động này không thể hoàn tác.
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
                  <input type="hidden" name="userId" value={selectedUser.userId} />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    onClick={() => setShowDeleteModal(false)}
                    className="w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
                  >
                    {isSubmitting ? "Đang xóa..." : "Xóa người dùng"}
                  </button>
                </Form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}