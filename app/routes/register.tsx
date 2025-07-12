import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { User } from "~/lib/db/models";
import { hashPassword, generateUserId, generateVerificationToken } from "~/lib/auth";
import { sendVerificationEmail } from "~/lib/email";
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
  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const recaptchaToken = formData.get("recaptcha-token") as string;
  const acceptTerms = formData.get("acceptTerms") as string;

  try {
    // Validate input
    if (!fullName || !email || !password || !confirmPassword) {
      return json({ error: "Vui lòng nhập đầy đủ thông tin" }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return json({ error: "Mật khẩu xác nhận không khớp" }, { status: 400 });
    }

    if (password.length < 6) {
      return json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, { status: 400 });
    }

    if (!acceptTerms) {
      return json({ error: "Vui lòng đồng ý với điều khoản sử dụng" }, { status: 400 });
    }

    // Verify reCAPTCHA
    const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
    if (!isRecaptchaValid) {
      return json({ error: "reCAPTCHA không hợp lệ" }, { status: 400 });
    }

    await connectToDatabase();

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return json({ error: "Email đã được sử dụng" }, { status: 400 });
    }

    // Generate unique user ID
    let userId: string;
    let isUserIdUnique = false;
    do {
      userId = generateUserId();
      const existingUserId = await User.findOne({ userId });
      isUserIdUnique = !existingUserId;
    } while (!isUserIdUnique);

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate verification token
    const verificationToken = generateVerificationToken();

    // Create user
    const user = new User({
      userId,
      email: email.toLowerCase(),
      password: hashedPassword,
      fullName: fullName.trim(),
      verificationToken,
      isVerified: false,
      role: 'user',
      balance: 0
    });

    await user.save();

    // Send verification email
    const baseUrl = new URL(request.url).origin;
    await sendVerificationEmail(user.email, verificationToken, baseUrl);

    return json({ 
      success: true, 
      message: "Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản."
    });

  } catch (error) {
    console.error("Registration error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function Register() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
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

  const calculatePasswordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 6) strength += 1;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    return strength;
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value;
    setFormData(prev => ({ ...prev, password }));
    setPasswordStrength(calculatePasswordStrength(password));
  };

  const getStrengthText = (strength: number) => {
    switch (strength) {
      case 0:
      case 1:
        return "Yếu";
      case 2:
      case 3:
        return "Trung bình";
      case 4:
      case 5:
        return "Mạnh";
      default:
        return "";
    }
  };

  const getStrengthColor = (strength: number) => {
    switch (strength) {
      case 0:
      case 1:
        return "bg-red-500";
      case 2:
      case 3:
        return "bg-yellow-500";
      case 4:
      case 5:
        return "bg-green-500";
      default:
        return "bg-gray-300";
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (typeof window !== 'undefined' && window.grecaptcha) {
      try {
        const token = await window.grecaptcha.execute(process.env.RECAPTCHA_SITE_KEY, {
          action: 'register'
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

  if (actionData?.success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="bg-white py-8 px-6 shadow-xl rounded-xl text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Đăng ký thành công!
            </h2>
            <p className="text-gray-600 mb-6">
              {actionData.message}
            </p>
            <div className="space-y-3">
              <Link
                to="/login"
                className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium block text-center"
              >
                Đăng nhập ngay
              </Link>
              <Link
                to="/"
                className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium block text-center"
              >
                Về trang chủ
              </Link>
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
            Tạo tài khoản mới
          </h2>
          <p className="text-gray-600">
            Tham gia cộng đồng developers lớn nhất Việt Nam
          </p>
        </div>

        {/* Register Form */}
        <div className="bg-white py-8 px-6 shadow-xl rounded-xl">
          <Form method="post" onSubmit={handleSubmit} className="space-y-6">
            {actionData?.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                {actionData.error}
              </div>
            )}

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                Họ và tên *
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200"
                placeholder="Nhập họ và tên của bạn"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200"
                placeholder="Nhập email của bạn"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Mật khẩu *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handlePasswordChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200"
                placeholder="Nhập mật khẩu (ít nhất 6 ký tự)"
              />
              
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">Độ mạnh mật khẩu:</span>
                    <span className={`font-medium ${
                      passwordStrength <= 1 ? 'text-red-600' : 
                      passwordStrength <= 3 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {getStrengthText(passwordStrength)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${getStrengthColor(passwordStrength)}`}
                      style={{ width: `${(passwordStrength / 5) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Xác nhận mật khẩu *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200"
                placeholder="Nhập lại mật khẩu"
              />
              
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  Mật khẩu xác nhận không khớp
                </p>
              )}
            </div>

            <div className="flex items-start">
              <input
                id="acceptTerms"
                name="acceptTerms"
                type="checkbox"
                required
                className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded mt-1"
              />
              <label htmlFor="acceptTerms" className="ml-3 text-sm text-gray-700">
                Tôi đồng ý với{" "}
                <Link to="/terms" className="text-teal-600 hover:text-teal-500 font-medium">
                  Điều khoản sử dụng
                </Link>{" "}
                và{" "}
                <Link to="/privacy" className="text-teal-600 hover:text-teal-500 font-medium">
                  Chính sách bảo mật
                </Link>{" "}
                của SourceCode4U
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || formData.password !== formData.confirmPassword}
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
                  Đang tạo tài khoản...
                </div>
              ) : (
                "Tạo tài khoản"
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
                Đã có tài khoản?{" "}
                <Link
                  to="/login"
                  className="text-teal-600 hover:text-teal-500 font-medium"
                >
                  Đăng nhập ngay
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
            <div>
              <h4 className="text-sm font-medium text-blue-800 mb-1">
                Bảo mật thông tin
              </h4>
              <p className="text-sm text-blue-700">
                Thông tin của bạn được mã hóa và bảo vệ tuyệt đối. Chúng tôi cam kết không chia sẻ dữ liệu với bên thứ ba.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}