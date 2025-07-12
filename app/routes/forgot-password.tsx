import { json, type ActionFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { User } from "~/lib/db/models";
import { sendPasswordResetEmail } from "~/lib/email";
import { generateVerificationToken } from "~/lib/auth";
import { verifyRecaptcha } from "~/lib/recaptcha";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const recaptchaToken = formData.get("recaptcha-token") as string;

  try {
    if (!email) {
      return json({ error: "Vui lòng nhập email" }, { status: 400 });
    }

    // Verify reCAPTCHA
    const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
    if (!isRecaptchaValid) {
      return json({ error: "reCAPTCHA không hợp lệ" }, { status: 400 });
    }

    await connectToDatabase();

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Don't reveal if email exists or not for security
      return json({ 
        success: true, 
        message: "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi link đặt lại mật khẩu." 
      });
    }

    // Generate reset token
    const resetToken = generateVerificationToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await User.findByIdAndUpdate(user._id, {
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetExpires
    });

    // Send reset email
    const baseUrl = new URL(request.url).origin;
    await sendPasswordResetEmail(user.email, resetToken, baseUrl);

    return json({ 
      success: true, 
      message: "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi link đặt lại mật khẩu." 
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function ForgotPassword() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [email, setEmail] = useState("");
  const [countdown, setCountdown] = useState(0);
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    // Load reCAPTCHA script
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${process.env.RECAPTCHA_SITE_KEY}`;
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (typeof window !== 'undefined' && window.grecaptcha) {
      try {
        const token = await window.grecaptcha.execute(process.env.RECAPTCHA_SITE_KEY, {
          action: 'forgot_password'
        });
        
        // Add token to form and submit
        const form = event.currentTarget;
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'recaptcha-token';
        hiddenInput.value = token;
        form.appendChild(hiddenInput);
        
        form.submit();
      } catch (error) {
        console.error('reCAPTCHA error:', error);
      }
    }
  };

  if (actionData?.success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="bg-white py-8 px-6 shadow-xl rounded-xl text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              📧 Email đã được gửi!
            </h2>
            
            <p className="text-gray-600 mb-6">
              {actionData.message}
            </p>

            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">💡 Hướng dẫn:</h4>
                <ul className="text-sm text-blue-800 space-y-1 text-left">
                  <li>• Kiểm tra email trong hộp thư chính</li>
                  <li>• Xem cả thư mục Spam/Junk</li>
                  <li>• Link có hiệu lực trong 1 giờ</li>
                  <li>• Nếu không nhận được, thử gửi lại</li>
                </ul>
              </div>

              <Form method="post" onSubmit={handleSubmit}>
                <input type="hidden" name="email" value={email} />
                <button
                  type="submit"
                  disabled={isSubmitting || countdown > 0}
                  className="w-full bg-gray-600 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {countdown > 0 ? `Gửi lại sau ${countdown}s` : "📧 Gửi lại email"}
                </button>
              </Form>

              <div className="flex space-x-4">
                <Link
                  to="/login"
                  className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium text-center"
                >
                  ← Về đăng nhập
                </Link>
                <Link
                  to="/"
                  className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium text-center"
                >
                  🏠 Trang chủ
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            🔐 Quên mật khẩu?
          </h2>
          <p className="text-gray-600">
            Nhập email của bạn để nhận link đặt lại mật khẩu
          </p>
        </div>

        {/* Form */}
        <div className="bg-white py-8 px-6 shadow-xl rounded-xl">
          <Form method="post" onSubmit={handleSubmit} className="space-y-6">
            {actionData?.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                {actionData.error}
              </div>
            )}

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
              <p className="mt-1 text-sm text-gray-500">
                Chúng tôi sẽ gửi link đặt lại mật khẩu đến email này
              </p>
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
                "📧 Gửi link đặt lại mật khẩu"
              )}
            </button>
          </Form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Hoặc</span>
              </div>
            </div>

            <div className="mt-6 flex space-x-4">
              <Link
                to="/login"
                className="flex-1 text-center text-teal-600 hover:text-teal-500 font-medium"
              >
                ← Về đăng nhập
              </Link>
              <Link
                to="/register"
                className="flex-1 text-center text-teal-600 hover:text-teal-500 font-medium"
              >
                Đăng ký tài khoản →
              </Link>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
            <div>
              <h4 className="text-sm font-medium text-yellow-800 mb-1">
                🔐 Bảo mật
              </h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Link đặt lại chỉ có hiệu lực trong 1 giờ</li>
                <li>• Không chia sẻ link với ai khác</li>
                <li>• Kiểm tra kỹ URL trước khi nhập mật khẩu mới</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Global type for reCAPTCHA
declare global {
  interface Window {
    grecaptcha: {
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}