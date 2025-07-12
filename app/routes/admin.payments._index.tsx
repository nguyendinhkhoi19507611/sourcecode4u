import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Link, Form, useNavigation, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { Payment, User } from "~/lib/db/models";
import { requireAdmin } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  await connectToDatabase();

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const type = url.searchParams.get("type") || "all";
  const status = url.searchParams.get("status") || "all";
  const sort = url.searchParams.get("sort") || "newest";
  const limit = 20;
  const skip = (page - 1) * limit;

  // Build query
  const query: any = {};
  
  if (type !== "all") {
    query.type = type;
  }
  
  if (status !== "all") {
    query.status = status;
  }

  // Build sort options
  let sortOptions: any = {};
  switch (sort) {
    case "oldest":
      sortOptions = { createdAt: 1 };
      break;
    case "amount":
      sortOptions = { amount: -1 };
      break;
    default:
      sortOptions = { createdAt: -1 };
  }

  const [payments, totalCount] = await Promise.all([
    Payment.find(query)
      .populate('user', 'fullName email userId')
      .populate('processedBy', 'fullName')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    Payment.countDocuments(query)
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  // Get summary stats
  const stats = await Promise.all([
    Payment.countDocuments({ type: 'deposit', status: 'pending' }),
    Payment.countDocuments({ type: 'withdrawal', status: 'pending' }),
    Payment.aggregate([
      { $match: { type: 'deposit', status: 'approved' } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    Payment.aggregate([
      { $match: { type: 'withdrawal', status: 'approved' } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ])
  ]);

  return json({
    payments,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    filters: { type, status, sort },
    stats: {
      pendingDeposits: stats[0],
      pendingWithdrawals: stats[1],
      totalDeposits: stats[2][0]?.total || 0,
      totalWithdrawals: stats[3][0]?.total || 0
    }
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const formData = await request.formData();
  const action = formData.get("_action") as string;
  const paymentId = formData.get("paymentId") as string;
  const adminNote = formData.get("adminNote") as string;

  try {
    await connectToDatabase();

    const payment = await Payment.findOne({ paymentId }).populate('user');
    if (!payment) {
      return json({ error: "Không tìm thấy giao dịch" }, { status: 404 });
    }

    if (payment.status !== 'pending') {
      return json({ error: "Giao dịch đã được xử lý" }, { status: 400 });
    }

    switch (action) {
      case "approve": {
        if (payment.type === 'deposit') {
          // Add money to user account for deposits
          await User.findByIdAndUpdate(payment.user._id, {
            $inc: { balance: payment.amount }
          });
        }
        // For withdrawals, money was already deducted when the request was created
        
        await Payment.findByIdAndUpdate(payment._id, {
          status: 'approved',
          processedBy: admin._id,
          processedAt: new Date(),
          adminNote: adminNote || `Approved by ${admin.fullName}`
        });

        return json({ 
          success: true, 
          message: `Đã duyệt ${payment.type === 'deposit' ? 'nạp' : 'rút'} ${payment.amount.toLocaleString('vi-VN')} xu thành công!` 
        });
      }

      case "reject": {
        if (payment.type === 'withdrawal') {
          // Refund money for rejected withdrawals
          await User.findByIdAndUpdate(payment.user._id, {
            $inc: { balance: payment.amount }
          });
        }

        await Payment.findByIdAndUpdate(payment._id, {
          status: 'rejected',
          processedBy: admin._id,
          processedAt: new Date(),
          adminNote: adminNote || `Rejected by ${admin.fullName}`
        });

        return json({ 
          success: true, 
          message: `Đã từ chối ${payment.type === 'deposit' ? 'nạp' : 'rút'} ${payment.amount.toLocaleString('vi-VN')} xu!` 
        });
      }

      default:
        return json({ error: "Hành động không hợp lệ" }, { status: 400 });
    }
  } catch (error) {
    console.error("Payment action error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function AdminPayments() {
  const { payments, pagination, filters, stats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [adminNote, setAdminNote] = useState("");
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
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffHours < 1) return "Vừa xong";
    if (diffHours < 24) return `${diffHours}h trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return past.toLocaleDateString('vi-VN');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return '⏳ Chờ duyệt';
      case 'approved':
        return '✅ Đã duyệt';
      case 'rejected':
        return '❌ Đã từ chối';
      default:
        return status;
    }
  };

  const handleAction = (payment: any, action: 'approve' | 'reject') => {
    setSelectedPayment(payment);
    setActionType(action);
    setAdminNote("");
    setShowActionModal(true);
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
              <span className="text-gray-700">Quản lý thanh toán</span>
            </div>
            
            <div className="flex space-x-2">
              <Link
                to="/admin/payments/deposits"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                💰 Duyệt nạp xu
              </Link>
              <Link
                to="/admin/payments/withdrawals"
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                💸 Duyệt rút xu
              </Link>
            </div>
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
                <p className="text-sm font-medium text-gray-600">Chờ duyệt nạp xu</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pendingDeposits}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <span className="text-yellow-600 text-2xl">⏳</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Chờ duyệt rút xu</p>
                <p className="text-2xl font-bold text-red-600">{stats.pendingWithdrawals}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-red-600 text-2xl">⏳</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng đã nạp</p>
                <p className="text-2xl font-bold text-green-600">{stats.totalDeposits.toLocaleString('vi-VN')}</p>
                <p className="text-xs text-gray-500">xu</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600 text-2xl">💰</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng đã rút</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalWithdrawals.toLocaleString('vi-VN')}</p>
                <p className="text-xs text-gray-500">xu</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 text-2xl">💸</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Loại giao dịch
              </label>
              <select
                defaultValue={filters.type}
                onChange={(e) => updateSearchParams({ type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">Tất cả</option>
                <option value="deposit">Nạp xu</option>
                <option value="withdrawal">Rút xu</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trạng thái
              </label>
              <select
                defaultValue={filters.status}
                onChange={(e) => updateSearchParams({ status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">Tất cả</option>
                <option value="pending">Chờ duyệt</option>
                <option value="approved">Đã duyệt</option>
                <option value="rejected">Đã từ chối</option>
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
                <option value="amount">Số tiền cao nhất</option>
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

        {/* Payments Table */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mã GD
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Người dùng
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Loại/Số tiền
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thông tin NH
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thời gian
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payments.map((payment) => (
                  <tr key={payment._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{payment.paymentId}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{payment.user.fullName}</div>
                      <div className="text-sm text-gray-500">{payment.user.email}</div>
                      <div className="text-sm text-gray-500">ID: {payment.user.userId}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        payment.type === 'deposit' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {payment.type === 'deposit' ? '💰 Nạp xu' : '💸 Rút xu'}
                      </div>
                      <div className="text-sm font-medium text-gray-900 mt-1">
                        {payment.amount.toLocaleString('vi-VN')} xu
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {payment.type === 'withdrawal' && payment.bankInfo ? (
                        <div className="text-sm text-gray-900">
                          <div>{payment.bankInfo.accountName}</div>
                          <div className="text-gray-500">{payment.bankInfo.bankName}</div>
                          <div className="text-gray-500">****{payment.bankInfo.accountNumber.slice(-4)}</div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">
                          {payment.type === 'deposit' ? 'Chuyển khoản' : 'N/A'}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(payment.status)}`}>
                        {getStatusText(payment.status)}
                      </span>
                      {payment.processedBy && (
                        <div className="text-xs text-gray-500 mt-1">
                          Bởi: {payment.processedBy.fullName}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatTimeAgo(payment.createdAt)}
                      </div>
                      {payment.processedAt && (
                        <div className="text-xs text-gray-500">
                          Xử lý: {formatTimeAgo(payment.processedAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {payment.status === 'pending' ? (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleAction(payment, 'approve')}
                            className="text-green-600 hover:text-green-900"
                            title="Duyệt"
                          >
                            ✅
                          </button>
                          <button
                            onClick={() => handleAction(payment, 'reject')}
                            className="text-red-600 hover:text-red-900"
                            title="Từ chối"
                          >
                            ❌
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400">Đã xử lý</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination - Same as users page */}
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

        {/* Action Confirmation Modal */}
        {showActionModal && selectedPayment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  actionType === 'approve' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {actionType === 'approve' ? (
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {actionType === 'approve' ? 'Duyệt giao dịch' : 'Từ chối giao dịch'}
                </h3>
                <p className="text-gray-600">
                  Bạn có chắc chắn muốn {actionType === 'approve' ? 'duyệt' : 'từ chối'} giao dịch này?
                </p>
              </div>

              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mã GD:</span>
                    <span className="font-medium">{selectedPayment.paymentId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Người dùng:</span>
                    <span className="font-medium">{selectedPayment.user.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Loại:</span>
                    <span className="font-medium">
                      {selectedPayment.type === 'deposit' ? '💰 Nạp xu' : '💸 Rút xu'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Số tiền:</span>
                    <span className="font-bold text-lg">
                      {selectedPayment.amount.toLocaleString('vi-VN')} xu
                    </span>
                  </div>
                  {selectedPayment.type === 'withdrawal' && selectedPayment.bankInfo && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ngân hàng:</span>
                        <span className="font-medium">{selectedPayment.bankInfo.bankName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tài khoản:</span>
                        <span className="font-medium">{selectedPayment.bankInfo.accountName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Số TK:</span>
                        <span className="font-medium">{selectedPayment.bankInfo.accountNumber}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <Form method="post">
                <input type="hidden" name="_action" value={actionType} />
                <input type="hidden" name="paymentId" value={selectedPayment.paymentId} />
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ghi chú admin (tùy chọn)
                  </label>
                  <textarea
                    name="adminNote"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder={`Lý do ${actionType === 'approve' ? 'duyệt' : 'từ chối'}...`}
                  />
                </div>

                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={() => setShowActionModal(false)}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    onClick={() => setShowActionModal(false)}
                    className={`flex-1 py-3 px-4 rounded-lg transition-colors font-medium disabled:opacity-50 ${
                      actionType === 'approve'
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-red-600 text-white hover:bg-red-700'
                    }`}
                  >
                    {isSubmitting ? "Đang xử lý..." : actionType === 'approve' ? "✅ Duyệt" : "❌ Từ chối"}
                  </button>
                </div>
              </Form>
            </div>
          </div>
        )}

        {/* Empty State */}
        {payments.length === 0 && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gradient-to-r from-teal-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-white text-4xl">💳</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Không có giao dịch nào
            </h3>
            <p className="text-gray-600 mb-6">
              Chưa có giao dịch nào phù hợp với bộ lọc hiện tại
            </p>
            <button
              onClick={() => setSearchParams({})}
              className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium"
            >
              🔄 Xem tất cả giao dịch
            </button>
          </div>
        )}
      </div>
    </div>
  );
}