import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Form, Link, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { User } from "~/lib/db/models";
import { sendVerificationEmail } from "~/lib/email";
import { generateVerificationToken } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return json({ success: false, message: "Token xác thực không hợp lệ" });
  }

  try {
    await connectToDatabase();
    
    const user = await User.findOne({ verificationToken: token });
    
    if (!user) {
      return json({ success: false, message: "Token xác thực không tồn tại hoặc đã hết hạn" });
    }

    if (user.isVerified) {
      return json({ success: false, message: "Tài khoản đã được xác thực trước đó", alreadyVerified: true });
    }

    // Verify the user
    await User.findByIdAndUpdate(user._id, {
      isVerified: true,
      verificationToken: undefined
    });

    return json({ 
      success: true, 
      message: "Xác thực email thành công! Bạn có thể đăng nhập ngay bây giờ.",
      userEmail: user.email
    });

  } catch (error) {
    console.error("Email verification error:", error);
    return json({ success: false, message: "Đã có lỗi xảy ra khi xác thực email" });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string;

  try {
    if (!email) {
      return json({ error: "Vui lòng nhập email" }, { status: 400 });
    }

    await connectToDatabase();

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return json({ error: "Không tìm thấy tài khoản với email này" }, { status: 404 });
    }

    if (user.isVerified) {
      return json({ error: "Tài khoản này đã được xác thực" }, { status: 400 });
    }

    // Generate new verification token
    const verificationToken = generateVerificationToken();
    await User.findByIdAndUpdate(user._id, { verificationToken });

    // Send verification email
    const baseUrl = new URL(request.url).origin;
    await sendVerificationEmail(user.email, verificationToken, baseUrl);

    return json({ 
      success: true, 
      message: "Email xác thực mới đã được gửi! Vui lòng kiểm tra hộp thư của bạn." 
    });

  } catch (error) {
    console.error("Resend verification error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function VerifyEmail() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [email, setEmail] = useState("");
  const [countdown, setCountdown] = useState(0);
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.success && countdown === 0) {
      setCountdown(60); // 60 seconds cooldown
    }
  }, [actionData?.success]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Success state
  if (loaderData?.success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="bg-white py-8 px-6 shadow-xl rounded-xl text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              ✅ Xác thực thành công!
            </h2>
            
            <p className="text-gray-600 mb-6">
              {loaderData.message}
            </p>

            <div className="space-y-3">
              <Link
                to="/login"
                className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium block text-center"
              >
                🔐 Đăng nhập ngay
              </Link>
              
              <Link
                to="/"
                className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium block text-center"
              >
                🏠 Về trang chủ
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error or resend state
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <Link to="/" className="inline-flex items-center space-x-2 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">S4U</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">SourceCode4U</span>
          </Link>
          
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            {loaderData?.alreadyVerified ? (
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            ) : (
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
              </svg>
            )}
          </div>
          
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            {loaderData?.alreadyVerified ? "Đã xác thực" : "Xác thực thất bại"}
          </h2>
          
          <p className="text-gray-600">
            {loaderData?.message}
          </p>
        </div>

        {/* Resend Form */}
        {!loaderData?.alreadyVerified && (
          <div className="bg-white py-8 px-6 shadow-xl rounded-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
              📧 Gửi lại email xác thực
            </h3>
            
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

            <Form method="post" className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email đã đăng ký
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200"
                  placeholder="Nhập email của bạn"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || countdown > 0}
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
                    Đang gửi...
                  </div>
                ) : countdown > 0 ? (
                  `Gửi lại sau ${countdown}s`
                ) : (
                  "📧 Gửi lại email xác thực"
                )}
              </button>
            </Form>

            <div className="mt-6 text-center">
              <p className="text-gray-600 text-sm mb-4">
                Hoặc thử các hướng dẫn sau:
              </p>
              
              <div className="space-y-2 text-left bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">💡 Mẹo:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Kiểm tra thư mục Spam/Junk</li>
                  <li>• Đảm bảo email chính xác</li>
                  <li>• Thử với email khác nếu cần</li>
                  <li>• Liên hệ support nếu vẫn gặp vấn đề</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Alternative Actions */}
        <div className="text-center space-y-4">
          {loaderData?.alreadyVerified ? (
            <div className="space-y-3">
              <Link
                to="/login"
                className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium block text-center"
              >
                🔐 Đăng nhập ngay
              </Link>
              
              <Link
                to="/"
                className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium block text-center"
              >
                🏠 Về trang chủ
              </Link>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/login"
                className="flex-1 text-teal-600 hover:text-teal-500 font-medium"
              >
                ← Về trang đăng nhập
              </Link>
              
              <Link
                to="/register"
                className="flex-1 text-teal-600 hover:text-teal-500 font-medium"
              >
                Đăng ký tài khoản mới →
              </Link>
            </div>
          )}
        </div>

        {/* Support Contact */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <h4 className="font-medium text-gray-900 mb-3 text-center">🆘 Cần hỗ trợ?</h4>
          <div className="text-center text-sm text-gray-600 space-y-2">
            <p>Liên hệ với chúng tôi qua:</p>
            <div className="flex justify-center items-center space-x-4">
              <div className="flex items-center">
                <span className="mr-1">📧</span>
                <span>sourcecode4u.contact@gmail.com</span>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Chúng tôi sẽ phản hồi trong vòng 24 giờ
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}