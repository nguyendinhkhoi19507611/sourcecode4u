import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { Payment } from "~/lib/db/models";
import { requireAuth, generatePaymentId } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  await connectToDatabase();
  
  // Get recent deposit history
  const recentDeposits = await Payment.find({ 
    user: user._id, 
    type: 'deposit' 
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
    recentDeposits 
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAuth(request);
  const formData = await request.formData();
  
  const amount = parseInt(formData.get("amount") as string);
  const note = formData.get("note") as string;

  try {
    if (!amount || amount < 10000) {
      return json({ error: "Số tiền nạp tối thiểu là 10,000 xu" }, { status: 400 });
    }

    if (amount > 10000000) {
      return json({ error: "Số tiền nạp tối đa là 10,000,000 xu" }, { status: 400 });
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

    // Create deposit request
    const payment = new Payment({
      paymentId,
      user: user._id,
      type: 'deposit',
      amount,
      status: 'pending',
      note: note?.trim() || `Nạp xu - ${user.userId}`
    });

    await payment.save();

    return json({ 
      success: true, 
      paymentId,
      amount,
      message: "Yêu cầu nạp xu đã được tạo thành công!" 
    });

  } catch (error) {
    console.error("Deposit error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function Deposit() {
  const { user, recentDeposits } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [amount, setAmount] = useState("");
  const [showQR, setShowQR] = useState(false);
  const isSubmitting = navigation.state === "submitting";

  // Bank information (from images provided)
  const bankInfo = {
    accountName: "NGUYEN DINH KHOI",
    accountNumber: "10787011779", 
    bankName: "VietinBank CN KCN PHU TAI - PGD PHU CAT"
  };

  const quickAmounts = [50000, 100000, 200000, 500000, 1000000, 2000000];

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
        return 'Đã duyệt';
      case 'rejected':
        return 'Đã từ chối';
      default:
        return status;
    }
  };

  if (actionData?.success) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-md p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Yêu cầu nạp xu thành công!
            </h2>
            <p className="text-gray-600">
              Mã giao dịch: <strong>{actionData.paymentId}</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* QR Code */}
            <div className="bg-gradient-to-br from-teal-50 to-blue-50 p-6 rounded-xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
                🏦 Thông tin chuyển khoản
              </h3>
              
              <div className="bg-white p-4 rounded-lg mb-4">
                <img 
                  src="/api/placeholder/300/300" 
                  alt="QR Code VietinBank"
                  className="w-full max-w-xs mx-auto"
                />
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Ngân hàng:</span>
                  <span className="font-medium">{bankInfo.bankName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tên tài khoản:</span>
                  <span className="font-medium">{bankInfo.accountName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Số tài khoản:</span>
                  <span className="font-medium">{bankInfo.accountNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Số tiền:</span>
                  <span className="font-bold text-teal-600">
                    {actionData.amount.toLocaleString('vi-VN')} VND
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Nội dung CK:</span>
                  <span className="font-medium text-red-600">{user.userId}</span>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                📋 Hướng dẫn chuyển khoản
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center text-sm font-bold">1</div>
                  <div>
                    <p className="font-medium">Quét mã QR hoặc chuyển khoản thủ công</p>
                    <p className="text-gray-600 text-sm">Sử dụng app ngân hàng để quét mã QR bên trái</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center text-sm font-bold">2</div>
                  <div>
                    <p className="font-medium">Nhập đúng nội dung chuyển khoản</p>
                    <p className="text-gray-600 text-sm">
                      <strong className="text-red-600">{user.userId}</strong> (Mã tài khoản của bạn)
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center text-sm font-bold">3</div>
                  <div>
                    <p className="font-medium">Xác nhận chuyển khoản</p>
                    <p className="text-gray-600 text-sm">Sau khi chuyển thành công, xu sẽ được cộng trong 5-15 phút</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01"></path>
                  </svg>
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800 mb-1">
                      ⚠️ Lưu ý quan trọng
                    </h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li>• Nhập đúng nội dung CK: <strong>{user.userId}</strong></li>
                      <li>• Chuyển đúng số tiền: <strong>{actionData.amount.toLocaleString('vi-VN')} VND</strong></li>
                      <li>• Xu sẽ được cộng tự động sau 5-15 phút</li>
                      <li>• Liên hệ support nếu sau 30 phút chưa nhận được xu</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex space-x-4">
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium"
                >
                  Nạp thêm xu
                </button>
                <button
                  onClick={() => window.location.href = '/dashboard'}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium"
                >
                  Về Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          💰 Nạp xu vào tài khoản
        </h1>
        <p className="text-gray-600">
          Nạp xu để mua mã nguồn yêu thích. Tỷ lệ: 1 VND = 1 xu
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Deposit Form */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Số tiền muốn nạp</h3>
            
            <Form method="post" className="space-y-6">
              {actionData?.error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                  {actionData.error}
                </div>
              )}

              {/* Quick amounts */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Chọn nhanh số tiền:
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {quickAmounts.map((quickAmount) => (
                    <button
                      key={quickAmount}
                      type="button"
                      onClick={() => setAmount(quickAmount.toString())}
                      className={`p-3 border rounded-lg text-center transition-all duration-200 ${
                        amount === quickAmount.toString()
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-300 hover:border-teal-300 hover:bg-teal-50'
                      }`}
                    >
                      <div className="font-medium">{quickAmount.toLocaleString('vi-VN')}</div>
                      <div className="text-xs text-gray-500">xu</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom amount */}
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
                  Hoặc nhập số tiền tùy chỉnh:
                </label>
                <div className="relative">
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    required
                    min="10000"
                    max="10000000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent pr-12"
                    placeholder="Nhập số xu muốn nạp"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-gray-500 text-sm">xu</span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Tối thiểu: 10,000 xu • Tối đa: 10,000,000 xu
                </p>
              </div>

              {/* Note */}
              <div>
                <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-2">
                  Ghi chú (tùy chọn):
                </label>
                <input
                  id="note"
                  name="note"
                  type="text"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Ghi chú cho giao dịch này..."
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting || !amount || parseInt(amount) < 10000}
                className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Đang tạo yêu cầu...
                  </div>
                ) : (
                  "💰 Tạo yêu cầu nạp xu"
                )}
              </button>
            </Form>
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
          {/* Current Balance */}
          <div className="bg-gradient-to-br from-teal-50 to-blue-50 p-6 rounded-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">💳 Số dư hiện tại</h3>
            <div className="text-center">
              <div className="text-3xl font-bold text-teal-600 mb-2">
                {user.balance.toLocaleString('vi-VN')}
              </div>
              <div className="text-gray-600">xu</div>
            </div>
          </div>

          {/* Exchange Rate */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">💱 Tỷ giá quy đổi</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">1 VND</span>
                <span className="font-medium">= 1 xu</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">10,000 VND</span>
                <span className="font-medium">= 10,000 xu</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">100,000 VND</span>
                <span className="font-medium">= 100,000 xu</span>
              </div>
            </div>
          </div>

          {/* Bank Info */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🏦 Thông tin ngân hàng</h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-600">Ngân hàng:</span>
                <div className="font-medium">{bankInfo.bankName}</div>
              </div>
              <div>
                <span className="text-gray-600">Chủ tài khoản:</span>
                <div className="font-medium">{bankInfo.accountName}</div>
              </div>
              <div>
                <span className="text-gray-600">Số tài khoản:</span>
                <div className="font-medium">{bankInfo.accountNumber}</div>
              </div>
            </div>
          </div>

          {/* Support */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">🆘 Cần hỗ trợ?</h3>
            <p className="text-blue-800 text-sm mb-4">
              Liên hệ với chúng tôi nếu bạn gặp vấn đề khi nạp xu
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center text-blue-700">
                <span className="mr-2">📧</span>
                <span>sourcecode4u.contact@gmail.com</span>
              </div>
              <div className="flex items-center text-blue-700">
                <span className="mr-2">⏰</span>
                <span>Hỗ trợ 24/7</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Deposits */}
      {recentDeposits.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">📈 Lịch sử nạp xu gần đây</h2>
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
                      Trạng thái
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thời gian
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ghi chú
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentDeposits.map((deposit) => (
                    <tr key={deposit._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {deposit.paymentId}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {deposit.amount.toLocaleString('vi-VN')} xu
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(deposit.status)}`}>
                          {getStatusText(deposit.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(deposit.createdAt).toLocaleDateString('vi-VN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {deposit.note || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-12 bg-gray-50 rounded-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">❓ Câu hỏi thường gặp</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Mất bao lâu để xu được cộng vào tài khoản?</h3>
            <p className="text-gray-600 text-sm">
              Thông thường xu sẽ được cộng tự động trong vòng 5-15 phút sau khi chuyển khoản thành công.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Tôi chuyển sai nội dung thì sao?</h3>
            <p className="text-gray-600 text-sm">
              Nếu chuyển sai nội dung, xu sẽ không được cộng tự động. Vui lòng liên hệ support để được hỗ trợ.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Có mất phí giao dịch không?</h3>
            <p className="text-gray-600 text-sm">
              SourceCode4U không tính phí nạp xu. Phí chuyển khoản (nếu có) do ngân hàng của bạn quy định.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Có thể hoàn tiền không?</h3>
            <p className="text-gray-600 text-sm">
              Xu đã nạp vào tài khoản không thể hoàn tiền. Vui lòng cân nhắc kỹ trước khi nạp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}