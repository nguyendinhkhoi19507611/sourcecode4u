import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { Payment } from "~/lib/db/models";
import { requireAuth, generatePaymentId } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  await connectToDatabase();
  
  // Get recent withdrawal history
  const recentWithdrawals = await Payment.find({ 
    user: user._id, 
    type: 'withdrawal' 
  })
  .sort({ createdAt: -1 })
  .limit(10)
  .lean();

  return json({ 
    user: {
      userId: user.userId,
      fullName: user.fullName,
      balance: user.balance
    },
    recentWithdrawals 
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAuth(request);
  const formData = await request.formData();
  
  const amount = parseInt(formData.get("amount") as string);
  const accountName = formData.get("accountName") as string;
  const accountNumber = formData.get("accountNumber") as string;
  const bankName = formData.get("bankName") as string;
  const note = formData.get("note") as string;

  try {
    if (!amount || amount < 50000) {
      return json({ error: "Số tiền rút tối thiểu là 50,000 xu" }, { status: 400 });
    }

    if (!accountName || !accountNumber || !bankName) {
      return json({ error: "Vui lòng nhập đầy đủ thông tin ngân hàng" }, { status: 400 });
    }

    if (user.balance < amount) {
      return json({ error: "Số dư không đủ để thực hiện giao dịch" }, { status: 400 });
    }

    await connectToDatabase();

    // Generate unique payment ID
    let paymentId: string;
    let isPaymentIdUnique = false;
    do {
      paymentId = generatePaymentId();
      const existingPayment = await Payment.findOne({ paymentId });
      isPaymentIdUnique = !existingPayment;
    } while (!isPaymentIdUnique);

    // Create withdrawal request
    const payment = new Payment({
      paymentId,
      user: user._id,
      type: 'withdrawal',
      amount,
      status: 'pending',
      bankInfo: {
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
        bankName: bankName.trim()
      },
      note: note?.trim() || `Rút xu - ${user.userId}`
    });

    await payment.save();

    return json({ 
      success: true, 
      paymentId,
      amount,
      message: "Yêu cầu rút xu đã được tạo thành công!" 
    });

  } catch (error) {
    console.error("Withdrawal error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function Withdraw() {
  const { user, recentWithdrawals } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [formData, setFormData] = useState({
    amount: "",
    accountName: "",
    accountNumber: "",
    bankName: "",
    note: ""
  });
  const isSubmitting = navigation.state === "submitting";

  const quickAmounts = [50000, 100000, 200000, 500000, 1000000];
  const popularBanks = [
    "Vietcombank", "Techcombank", "BIDV", "VietinBank", 
    "Agribank", "MBBank", "TPBank", "VPBank", "ACB", "Sacombank"
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'approved':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'rejected':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Đang chờ duyệt';
      case 'approved':
        return 'Đã chuyển tiền';
      case 'rejected':
        return 'Đã từ chối';
      default:
        return status;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (actionData?.success) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-md p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            ✅ Yêu cầu rút xu thành công!
          </h2>
          <p className="text-gray-600 mb-2">
            Mã giao dịch: <strong>{actionData.paymentId}</strong>
          </p>
          <p className="text-gray-600 mb-6">
            Số tiền: <strong>{actionData.amount.toLocaleString('vi-VN')} xu</strong>
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">📋 Quy trình xử lý:</h3>
            <div className="text-left text-blue-800 space-y-1">
              <p>1. ⏰ Xem xét yêu cầu: 1-2 giờ làm việc</p>
              <p>2. ✅ Phê duyệt và chuyển tiền: 2-4 giờ làm việc</p>
              <p>3. 💰 Tiền về tài khoản: 5-30 phút (tùy ngân hàng)</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium"
            >
              Tạo yêu cầu khác
            </button>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium"
            >
              Về Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          💸 Rút xu về tài khoản
        </h1>
        <p className="text-gray-600">
          Rút xu từ tài khoản SourceCode4U về tài khoản ngân hàng của bạn
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Withdrawal Form */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">💰 Thông tin rút xu</h3>
            
            <Form method="post" className="space-y-6">
              {actionData?.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                  {actionData.error}
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Số tiền muốn rút:
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  {quickAmounts.map((quickAmount) => (
                    <button
                      key={quickAmount}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, amount: quickAmount.toString() }))}
                      className={`p-3 border rounded-lg text-center transition-all duration-200 ${
                        formData.amount === quickAmount.toString()
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-300 hover:border-teal-300 hover:bg-teal-50'
                      }`}
                    >
                      <div className="font-medium">{quickAmount.toLocaleString('vi-VN')}</div>
                      <div className="text-xs text-gray-500">xu</div>
                    </button>
                  ))}
                </div>
                
                <div className="relative">
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    required
                    min="50000"
                    max={user.balance}
                    value={formData.amount}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent pr-12"
                    placeholder="Hoặc nhập số xu tùy chỉnh"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-gray-500 text-sm">xu</span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Tối thiểu: 50,000 xu • Tối đa: {user.balance.toLocaleString('vi-VN')} xu
                </p>
              </div>

              {/* Bank Information */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">🏦 Thông tin ngân hàng nhận tiền</h4>
                
                <div>
                  <label htmlFor="accountName" className="block text-sm font-medium text-gray-700 mb-2">
                    Tên chủ tài khoản *
                  </label>
                  <input
                    id="accountName"
                    name="accountName"
                    type="text"
                    required
                    value={formData.accountName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="NGUYEN VAN A"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Nhập chính xác như trên thẻ ngân hàng (viết hoa, không dấu)
                  </p>
                </div>

                <div>
                  <label htmlFor="accountNumber" className="block text-sm font-medium text-gray-700 mb-2">
                    Số tài khoản *
                  </label>
                  <input
                    id="accountNumber"
                    name="accountNumber"
                    type="text"
                    required
                    value={formData.accountNumber}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="0123456789"
                  />
                </div>

                <div>
                  <label htmlFor="bankName" className="block text-sm font-medium text-gray-700 mb-2">
                    Tên ngân hàng *
                  </label>
                  <select
                    id="bankName"
                    name="bankName"
                    required
                    value={formData.bankName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">Chọn ngân hàng</option>
                    {popularBanks.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                    <option value="other">Ngân hàng khác</option>
                  </select>
                </div>

                {formData.bankName === "other" && (
                  <div>
                    <input
                      type="text"
                      name="bankName"
                      placeholder="Nhập tên ngân hàng"
                      value={formData.bankName === "other" ? "" : formData.bankName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Note */}
              <div>
                <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-2">
                  Ghi chú (tùy chọn):
                </label>
                <textarea
                  id="note"
                  name="note"
                  rows={3}
                  value={formData.note}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Ghi chú cho giao dịch này..."
                />
              </div>

              {/* Summary */}
              {formData.amount && parseInt(formData.amount) >= 50000 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">📊 Tóm tắt giao dịch:</h4>
                  <div className="space-y-1 text-blue-800 text-sm">
                    <div className="flex justify-between">
                      <span>Số xu rút:</span>
                      <span className="font-medium">{parseInt(formData.amount).toLocaleString('vi-VN')} xu</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Quy đổi thành tiền:</span>
                      <span className="font-medium">{parseInt(formData.amount).toLocaleString('vi-VN')} VND</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Phí rút (0%):</span>
                      <span className="font-medium">0 VND</span>
                    </div>
                    <div className="flex justify-between border-t border-blue-300 pt-1 font-semibold">
                      <span>Số tiền nhận được:</span>
                      <span className="text-green-600">{parseInt(formData.amount).toLocaleString('vi-VN')} VND</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting || !formData.amount || parseInt(formData.amount) < 50000 || parseInt(formData.amount) > user.balance}
                className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Đang tạo yêu cầu...
                  </div>
                ) : (
                  "💸 Tạo yêu cầu rút xu"
                )}
              </button>
            </Form>
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
          {/* Current Balance */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">💳 Số dư hiện tại</h3>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {user.balance.toLocaleString('vi-VN')}
              </div>
              <div className="text-gray-600">xu</div>
            </div>
          </div>

          {/* Withdrawal Info */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">ℹ️ Thông tin rút xu</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Tối thiểu:</span>
                <span className="font-medium">50,000 xu</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tối đa/lần:</span>
                <span className="font-medium">Toàn bộ số dư</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Phí rút:</span>
                <span className="font-medium text-green-600">Miễn phí</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Thời gian xử lý:</span>
                <span className="font-medium">2-6 giờ</span>
              </div>
            </div>
          </div>

          {/* Process Steps */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Quy trình rút xu</h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">1</div>
                <div>
                  <p className="font-medium text-sm">Tạo yêu cầu</p>
                  <p className="text-gray-600 text-xs">Điền thông tin và gửi yêu cầu</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-sm font-bold">2</div>
                <div>
                  <p className="font-medium text-sm">Xem xét</p>
                  <p className="text-gray-600 text-xs">Admin kiểm tra và phê duyệt</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-bold">3</div>
                <div>
                  <p className="font-medium text-sm">Chuyển tiền</p>
                  <p className="text-gray-600 text-xs">Tiền được chuyển về tài khoản</p>
                </div>
              </div>
            </div>
          </div>

          {/* Support */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-red-900 mb-4">⚠️ Lưu ý quan trọng</h3>
            <ul className="space-y-2 text-sm text-red-800">
              <li>• Kiểm tra kỹ thông tin ngân hàng trước khi gửi</li>
              <li>• Tên chủ tài khoản phải chính xác</li>
              <li>• Không thể hủy sau khi đã gửi yêu cầu</li>
              <li>• Liên hệ support nếu có vấn đề</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Recent Withdrawals */}
      {recentWithdrawals.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">📊 Lịch sử rút xu gần đây</h2>
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mã giao dịch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Số tiền
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentWithdrawals.map((withdrawal) => (
                    <tr key={withdrawal._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {withdrawal.paymentId}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {withdrawal.amount.toLocaleString('vi-VN')} xu
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          <div>{withdrawal.bankInfo?.accountName}</div>
                          <div className="text-gray-500">{withdrawal.bankInfo?.bankName}</div>
                          <div className="text-gray-500">****{withdrawal.bankInfo?.accountNumber.slice(-4)}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(withdrawal.status)}`}>
                          {getStatusText(withdrawal.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(withdrawal.createdAt).toLocaleDateString('vi-VN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}