import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { Payment, Purchase } from "~/lib/db/models";
import { requireAuth } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  await connectToDatabase();
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const type = url.searchParams.get("type") || "all";
  const status = url.searchParams.get("status") || "all";
  const limit = 20;
  const skip = (page - 1) * limit;

  // Get payments (deposits & withdrawals)
  let paymentQuery: any = { user: user._id };
  if (type !== "all" && (type === "deposit" || type === "withdrawal")) {
    paymentQuery.type = type;
  }
  if (status !== "all") {
    paymentQuery.status = status;
  }

  // Get purchases (both as buyer and seller)
  const [payments, purchases, sales] = await Promise.all([
    type === "all" || type === "deposit" || type === "withdrawal" 
      ? Payment.find(paymentQuery)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
      : [],
    type === "all" || type === "purchase"
      ? Purchase.find({ buyer: user._id })
          .populate('sourceCode', 'title thumbnail')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
      : [],
    type === "all" || type === "sale"
      ? Purchase.find()
          .populate({
            path: 'sourceCode',
            match: { seller: user._id },
            select: 'title thumbnail'
          })
          .populate('buyer', 'fullName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
      : []
  ]);

  // Filter sales to only include user's products
  const userSales = sales.filter(sale => sale.sourceCode);

  // Combine and sort all transactions
  const allTransactions = [
    ...payments.map(p => ({
      ...p,
      transactionType: 'payment',
      displayType: p.type === 'deposit' ? 'Nạp xu' : 'Rút xu'
    })),
    ...purchases.map(p => ({
      ...p,
      transactionType: 'purchase',
      displayType: 'Mua mã nguồn',
      amount: -p.amount // Negative for expense
    })),
    ...userSales.map(s => ({
      ...s,
      transactionType: 'sale',
      displayType: 'Bán mã nguồn',
      amount: s.sellerEarnings // Positive for income
    }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Calculate summary stats
  const stats = {
    totalDeposits: payments.filter(p => p.type === 'deposit' && p.status === 'approved').reduce((sum, p) => sum + p.amount, 0),
    totalWithdrawals: payments.filter(p => p.type === 'withdrawal' && p.status === 'approved').reduce((sum, p) => sum + p.amount, 0),
    totalPurchases: purchases.reduce((sum, p) => sum + p.amount, 0),
    totalSales: userSales.reduce((sum, s) => sum + s.sellerEarnings, 0)
  };

  return json({
    transactions: allTransactions,
    stats,
    filters: { type, status },
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(allTransactions.length / limit),
      totalCount: allTransactions.length
    }
  });
}

export default function Transactions() {
  const { transactions, stats, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  const updateFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.delete('page');
    setSearchParams(newParams);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-green-600 bg-green-50 border-green-200';
      case 'pending': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'rejected': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getAmountColor = (amount: number) => {
    return amount > 0 ? 'text-green-600' : 'text-red-600';
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffDays = Math.floor((now.getTime() - past.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Hôm nay";
    if (diffDays === 1) return "Hôm qua";
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return past.toLocaleDateString('vi-VN');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          📈 Lịch sử giao dịch
        </h1>
        <p className="text-gray-600">
          Theo dõi tất cả các giao dịch của bạn trên SourceCode4U
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng nạp xu</p>
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
              <p className="text-sm font-medium text-gray-600">Tổng rút xu</p>
              <p className="text-2xl font-bold text-red-600">{stats.totalWithdrawals.toLocaleString('vi-VN')}</p>
              <p className="text-xs text-gray-500">xu</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <span className="text-red-600 text-2xl">💸</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng chi mua</p>
              <p className="text-2xl font-bold text-orange-600">{stats.totalPurchases.toLocaleString('vi-VN')}</p>
              <p className="text-xs text-gray-500">xu</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-orange-600 text-2xl">🛒</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng thu bán</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalSales.toLocaleString('vi-VN')}</p>
              <p className="text-xs text-gray-500">xu</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 text-2xl">📊</span>
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
              value={filters.type}
              onChange={(e) => updateFilter('type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="all">Tất cả</option>
              <option value="deposit">Nạp xu</option>
              <option value="withdrawal">Rút xu</option>
              <option value="purchase">Mua mã nguồn</option>
              <option value="sale">Bán mã nguồn</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trạng thái
            </label>
            <select
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="all">Tất cả</option>
              <option value="pending">Chờ xử lý</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Đã từ chối</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Từ ngày
            </label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
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

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Loại giao dịch
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Chi tiết
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số tiền
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thời gian
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((transaction, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        {transaction.transactionType === 'payment' && transaction.type === 'deposit' && (
                          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <span className="text-green-600">💰</span>
                          </div>
                        )}
                        {transaction.transactionType === 'payment' && transaction.type === 'withdrawal' && (
                          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                            <span className="text-red-600">💸</span>
                          </div>
                        )}
                        {transaction.transactionType === 'purchase' && (
                          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                            <span className="text-orange-600">🛒</span>
                          </div>
                        )}
                        {transaction.transactionType === 'sale' && (
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <span className="text-blue-600">📊</span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {transaction.displayType}
                        </div>
                        <div className="text-sm text-gray-500">
                          {transaction.transactionType === 'payment' && `Mã: ${transaction.paymentId}`}
                          {transaction.transactionType === 'purchase' && `Mã: ${transaction.purchaseId}`}
                          {transaction.transactionType === 'sale' && `Mã: ${transaction.purchaseId}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {transaction.transactionType === 'payment' && (
                        <div>
                          {transaction.type === 'withdrawal' && transaction.bankInfo && (
                            <div>
                              <div>{transaction.bankInfo.bankName}</div>
                              <div className="text-gray-500">****{transaction.bankInfo.accountNumber.slice(-4)}</div>
                            </div>
                          )}
                          {transaction.type === 'deposit' && "Chuyển khoản ngân hàng"}
                        </div>
                      )}
                      {(transaction.transactionType === 'purchase' || transaction.transactionType === 'sale') && (
                        <div>
                          <div className="font-medium">{transaction.sourceCode.title}</div>
                          {transaction.transactionType === 'sale' && (
                            <div className="text-gray-500">Khách hàng: {transaction.buyer.fullName}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-bold ${getAmountColor(transaction.amount)}`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('vi-VN')} xu
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {transaction.transactionType === 'payment' ? (
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(transaction.status)}`}>
                        {transaction.status === 'approved' ? 'Đã duyệt' : 
                         transaction.status === 'pending' ? 'Chờ duyệt' : 'Đã từ chối'}
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full border text-green-600 bg-green-50 border-green-200">
                        Hoàn thành
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>{formatTimeAgo(transaction.createdAt)}</div>
                    <div className="text-xs">
                      {new Date(transaction.createdAt).toLocaleString('vi-VN')}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {transactions.length === 0 && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gradient-to-r from-teal-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-white text-4xl">📈</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Chưa có giao dịch nào
            </h3>
            <p className="text-gray-600 mb-6">
              Bắt đầu nạp xu hoặc mua mã nguồn để xem lịch sử giao dịch
            </p>
            <div className="flex justify-center space-x-4">
              <Link
                to="/dashboard/deposit"
                className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium"
              >
                💰 Nạp xu
              </Link>
              <Link
                to="/browse"
                className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium"
              >
                🔍 Mua mã nguồn
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Export Section */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">📊 Xuất báo cáo</h3>
        <p className="text-blue-800 mb-4">
          Xuất lịch sử giao dịch để theo dõi tài chính cá nhân hoặc để báo cáo thuế
        </p>
        <div className="flex space-x-4">
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            📄 Xuất PDF
          </button>
          <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
            📊 Xuất Excel
          </button>
        </div>
      </div>
    </div>
  );
}