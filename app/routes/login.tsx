import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { User } from "~/lib/db/models";
import { comparePassword, generateToken } from "~/lib/auth";
import { verifyRecaptcha } from "~/lib/recaptcha";

export async function loader({ request }: LoaderFunctionArgs) {
  // Check if user is already logged in
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return redirect('/dashboard');
  }
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const recaptchaToken = formData.get("recaptcha-token") as string;

  try {
    // Validate input
    if (!email || !password) {
      return json({ error: "Vui lòng nhập đầy đủ thông tin" }, { status: 400 });
    }

    // Verify reCAPTCHA
    const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
    if (!isRecaptchaValid) {
      return json({ error: "reCAPTCHA không hợp lệ" }, { status: 400 });
    }

    await connectToDatabase();

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return json({ error: "Email hoặc mật khẩu không chính xác" }, { status: 400 });
    }

    // Check password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return json({ error: "Email hoặc mật khẩu không chính xác" }, { status: 400 });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return json({ error: "Vui lòng xác thực email trước khi đăng nhập" }, { status: 400 });
    }

    // Generate JWT token
    const token = generateToken(user.userId);

    return json({ 
      success: true, 
      token,
      user: {
        userId: user.userId,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        role: user.role,
        balance: user.balance
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [recaptchaToken, setRecaptchaToken] = useState("");
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
    if (actionData?.success && actionData.token) {
      // Store token in localStorage
      localStorage.setItem('token', actionData.token);
      localStorage.setItem('user', JSON.stringify(actionData.user));
      
      // Redirect to dashboard
      window.location.href = '/dashboard';
    }
  }, [actionData]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (typeof window !== 'undefined' && window.grecaptcha) {
      try {
        const token = await window.grecaptcha.execute(process.env.RECAPTCHA_SITE_KEY, {
          action: 'login'
        });
        setRecaptchaToken(token);
        
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
            Đăng nhập tài khoản
          </h2>
          <p className="text-gray-600">
            Chào mừng bạn quay trở lại! Vui lòng đăng nhập để tiếp tục.
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white py-8 px-6 shadow-xl rounded-xl">
          <Form method="post" onSubmit={handleSubmit} className="space-y-6">
            {actionData?.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                {actionData.error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200"
                placeholder="Nhập email của bạn"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Mật khẩu
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200"
                placeholder="Nhập mật khẩu"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 text-sm text-gray-700">
                  Ghi nhớ đăng nhập
                </label>
              </div>

              <Link
                to="/forgot-password"
                className="text-sm text-teal-600 hover:text-teal-500 font-medium"
              >
                Quên mật khẩu?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
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
                  Đang đăng nhập...
                </div>
              ) : (
                "Đăng nhập"
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

            <div className="mt-6 text-center">
              <p className="text-gray-600">
                Chưa có tài khoản?{" "}
                <Link
                  to="/register"
                  className="text-teal-600 hover:text-teal-500 font-medium"
                >
                  Đăng ký ngay
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="text-center">
          <p className="text-sm text-gray-500">
            Bằng việc đăng nhập, bạn đồng ý với{" "}
            <Link to="/terms" className="text-teal-600 hover:text-teal-500">
              Điều khoản sử dụng
            </Link>{" "}
            và{" "}
            <Link to="/privacy" className="text-teal-600 hover:text-teal-500">
              Chính sách bảo mật
            </Link>{" "}
            của chúng tôi.
          </p>
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