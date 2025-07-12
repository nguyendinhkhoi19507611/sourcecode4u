import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Form, Link, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { User } from "~/lib/db/models";
import { hashPassword } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return json({ 
      success: false, 
      message: "Token đặt lại mật khẩu không hợp lệ" 
    });
  }

  try {
    await connectToDatabase();
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });
    
    if (!user) {
      return json({ 
        success: false, 
        message: "Token đặt lại mật khẩu không tồn tại hoặc đã hết hạn" 
      });
    }

    return json({ 
      success: true, 
      token,
      userEmail: user.email
    });

  } catch (error) {
    console.error("Reset password token validation error:", error);
    return json({ 
      success: false, 
      message: "Đã có lỗi xảy ra khi kiểm tra token" 
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  try {
    if (!token || !password || !confirmPassword) {
      return json({ error: "Vui lòng nhập đầy đủ thông tin" }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return json({ error: "Mật khẩu xác nhận không khớp" }, { status: 400 });
    }

    if (password.length < 6) {
      return json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, { status: 400 });
    }

    await connectToDatabase();

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return json({ error: "Token không hợp lệ hoặc đã hết hạn" }, { status: 400 });
    }

    // Hash new password
    const hashedPassword = await hashPassword(password);

    // Update user password and clear reset token
    await User.findByIdAndUpdate(user._id, {
      password: hashedPassword,
      resetPasswordToken: undefined,
      resetPasswordExpires: undefined
    });

    return json({ 
      success: true, 
      message: "Đặt lại mật khẩu thành công! Bạn có thể đăng nhập với mật khẩu mới." 
    });

  } catch (error) {
    console.error("Reset password error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function ResetPassword() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: ""
  });
  const [passwordStrength, setPasswordStrength] = useState(0);
  const isSubmitting = navigation.state === "submitting";

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

  // Success state
  if (actionData?.success) {
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
              ✅ Đặt lại mật khẩu thành công!
            </h2>
            
            <p className="text-gray-600 mb-6">
              {actionData.message}
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

  // Invalid token state
  if (!loaderData?.success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="bg-white py-8 px-6 shadow-xl rounded-xl text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
              </svg>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              ❌ Link không hợp lệ
            </h2>
            
            <p className="text-gray-600 mb-6">
              {loaderData?.message}
            </p>

            <div className="space-y-3">
              <Link
                to="/forgot-password"
                className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium block text-center"
              >
                📧 Yêu cầu link mới
              </Link>
              
              <Link
                to="/login"
                className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium block text-center"
              >
                ← Về trang đăng nhập
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Reset password form
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
            🔑 Đặt lại mật khẩu
          </h2>
          <p className="text-gray-600">
            Nhập mật khẩu mới cho tài khoản: <strong>{loaderData.userEmail}</strong>
          </p>
        </div>

        {/* Form */}
        <div className="bg-white py-8 px-6 shadow-xl rounded-xl">
          <Form method="post" className="space-y-6">
            <input type="hidden" name="token" value={loaderData.token} />
            
            {actionData?.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                {actionData.error}
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Mật khẩu mới *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handlePasswordChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200"
                placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
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
                Xác nhận mật khẩu mới *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200"
                placeholder="Nhập lại mật khẩu mới"
              />
              
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  Mật khẩu xác nhận không khớp
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || formData.password !== formData.confirmPassword || formData.password.length < 6}
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
                  Đang cập nhật...
                </div>
              ) : (
                "🔑 Đặt lại mật khẩu"
              )}
            </button>
          </Form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-teal-600 hover:text-teal-500 font-medium"
            >
              ← Quay lại đăng nhập
            </Link>
          </div>
        </div>

        {/* Password Requirements */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">🔐 Yêu cầu mật khẩu:</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li className={formData.password.length >= 6 ? 'text-green-600' : ''}>
              • Ít nhất 6 ký tự {formData.password.length >= 6 && '✓'}
            </li>
            <li className={/[A-Z]/.test(formData.password) ? 'text-green-600' : ''}>
              • Có chữ hoa {/[A-Z]/.test(formData.password) && '✓'}
            </li>
            <li className={/[0-9]/.test(formData.password) ? 'text-green-600' : ''}>
              • Có số {/[0-9]/.test(formData.password) && '✓'}
            </li>
            <li className={/[^A-Za-z0-9]/.test(formData.password) ? 'text-green-600' : ''}>
              • Có ký tự đặc biệt {/[^A-Za-z0-9]/.test(formData.password) && '✓'}
            </li>
          </ul>
        </div>

        {/* Security Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
            <div>
              <h4 className="text-sm font-medium text-yellow-800 mb-1">
                💡 Lưu ý bảo mật
              </h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Sử dụng mật khẩu mạnh và duy nhất</li>
                <li>• Không chia sẻ mật khẩu với ai</li>
                <li>• Đăng xuất sau khi sử dụng xong</li>
                <li>• Cập nhật mật khẩu định kỳ</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}