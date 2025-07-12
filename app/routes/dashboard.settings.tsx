import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { User } from "~/lib/db/models";
import { requireAuth, hashPassword, comparePassword } from "~/lib/auth";
import { uploadToCloudinary } from "~/lib/cloudinary";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  
  return json({
    user: {
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      avatar: user.avatar,
      phone: user.phone || '',
      createdAt: user.createdAt
    }
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAuth(request);
  const formData = await request.formData();
  const action = formData.get("_action") as string;

  try {
    await connectToDatabase();

    switch (action) {
      case "update-profile": {
        const fullName = formData.get("fullName") as string;
        const phone = formData.get("phone") as string;
        const avatarFile = formData.get("avatar") as File;

        let updateData: any = {
          fullName: fullName.trim(),
          phone: phone.trim()
        };

        // Handle avatar upload
        if (avatarFile && avatarFile.size > 0) {
          if (avatarFile.size > 5 * 1024 * 1024) {
            return json({ error: "Ảnh đại diện không được vượt quá 5MB" }, { status: 400 });
          }

          const bytes = await avatarFile.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const base64String = `data:${avatarFile.type};base64,${buffer.toString('base64')}`;
          const avatarUrl = await uploadToCloudinary(base64String, 'sourcecode4u/avatars');
          updateData.avatar = avatarUrl;
        }

        await User.findByIdAndUpdate(user._id, updateData);

        return json({ 
          success: true, 
          message: "Cập nhật thông tin thành công!",
          type: "profile"
        });
      }

      case "change-password": {
        const currentPassword = formData.get("currentPassword") as string;
        const newPassword = formData.get("newPassword") as string;
        const confirmPassword = formData.get("confirmPassword") as string;

        if (!currentPassword || !newPassword || !confirmPassword) {
          return json({ error: "Vui lòng nhập đầy đủ thông tin" }, { status: 400 });
        }

        if (newPassword !== confirmPassword) {
          return json({ error: "Mật khẩu mới không khớp" }, { status: 400 });
        }

        if (newPassword.length < 6) {
          return json({ error: "Mật khẩu mới phải có ít nhất 6 ký tự" }, { status: 400 });
        }

        // Verify current password
        const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
          return json({ error: "Mật khẩu hiện tại không chính xác" }, { status: 400 });
        }

        // Hash new password
        const hashedNewPassword = await hashPassword(newPassword);
        await User.findByIdAndUpdate(user._id, { password: hashedNewPassword });

        return json({ 
          success: true, 
          message: "Đổi mật khẩu thành công!",
          type: "password"
        });
      }

      case "update-notifications": {
        const emailNotifications = formData.get("emailNotifications") === "on";
        const smsNotifications = formData.get("smsNotifications") === "on";
        const pushNotifications = formData.get("pushNotifications") === "on";

        // Update notification preferences (you might want to add these fields to User model)
        await User.findByIdAndUpdate(user._id, {
          notificationSettings: {
            email: emailNotifications,
            sms: smsNotifications,
            push: pushNotifications
          }
        });

        return json({ 
          success: true, 
          message: "Cập nhật cài đặt thông báo thành công!",
          type: "notifications"
        });
      }

      default:
        return json({ error: "Hành động không hợp lệ" }, { status: 400 });
    }
  } catch (error) {
    console.error("Settings update error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function Settings() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState("profile");
  const [avatarPreview, setAvatarPreview] = useState<string>(user.avatar || "");
  const isSubmitting = navigation.state === "submitting";

  const tabs = [
    { id: "profile", name: "Thông tin cá nhân", icon: "👤" },
    { id: "password", name: "Mật khẩu", icon: "🔐" },
    { id: "notifications", name: "Thông báo", icon: "🔔" },
    { id: "privacy", name: "Quyền riêng tư", icon: "🛡️" }
  ];

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("Ảnh không được vượt quá 5MB");
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          ⚙️ Cài đặt tài khoản
        </h1>
        <p className="text-gray-600">
          Quản lý thông tin cá nhân và cài đặt bảo mật của bạn
        </p>
      </div>

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

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-6">👤 Thông tin cá nhân</h3>
              
              <Form method="post" encType="multipart/form-data" className="space-y-6">
                <input type="hidden" name="_action" value="update-profile" />
                
                {/* Avatar */}
                <div className="flex items-center space-x-6">
                  <div className="shrink-0">
                    <img
                      src={avatarPreview || '/api/placeholder/120/120'}
                      alt="Avatar"
                      className="w-24 h-24 rounded-full object-cover border-4 border-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ảnh đại diện
                    </label>
                    <input
                      type="file"
                      name="avatar"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      PNG, JPG, GIF tối đa 5MB
                    </p>
                  </div>
                </div>

                {/* Full Name */}
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                    Họ và tên *
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    defaultValue={user.fullName}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>

                {/* Email (readonly) */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Email không thể thay đổi
                  </p>
                </div>

                {/* User ID (readonly) */}
                <div>
                  <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-2">
                    Mã tài khoản
                  </label>
                  <input
                    id="userId"
                    type="text"
                    value={user.userId}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Số điện thoại
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    defaultValue={user.phone}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Nhập số điện thoại"
                  />
                </div>

                {/* Join Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ngày tham gia
                  </label>
                  <div className="text-gray-600">
                    {new Date(user.createdAt).toLocaleDateString('vi-VN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium disabled:opacity-50"
                >
                  {isSubmitting ? "Đang cập nhật..." : "💾 Lưu thay đổi"}
                </button>
              </Form>
            </div>
          )}

          {/* Password Tab */}
          {activeTab === "password" && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-6">🔐 Đổi mật khẩu</h3>
              
              <Form method="post" className="space-y-6">
                <input type="hidden" name="_action" value="change-password" />
                
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-2">
                    Mật khẩu hiện tại *
                  </label>
                  <input
                    id="currentPassword"
                    name="currentPassword"
                    type="password"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Nhập mật khẩu hiện tại"
                  />
                </div>

                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                    Mật khẩu mới *
                  </label>
                  <input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
                  />
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Nhập lại mật khẩu mới"
                  />
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-800 mb-2">💡 Mẹo tạo mật khẩu mạnh:</h4>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>• Ít nhất 8 ký tự</li>
                    <li>• Có chữ hoa và chữ thường</li>
                    <li>• Có số và ký tự đặc biệt</li>
                    <li>• Không sử dụng thông tin cá nhân</li>
                  </ul>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium disabled:opacity-50"
                >
                  {isSubmitting ? "Đang cập nhật..." : "🔐 Đổi mật khẩu"}
                </button>
              </Form>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-6">🔔 Cài đặt thông báo</h3>
              
              <Form method="post" className="space-y-6">
                <input type="hidden" name="_action" value="update-notifications" />
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-blue-600">📧</span>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">Thông báo qua Email</h4>
                        <p className="text-sm text-gray-600">Nhận thông báo về giao dịch, tin nhắn</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="emailNotifications"
                        defaultChecked
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <span className="text-green-600">📱</span>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">Thông báo SMS</h4>
                        <p className="text-sm text-gray-600">Nhận SMS về giao dịch quan trọng</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="smsNotifications"
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <span className="text-purple-600">🔔</span>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">Thông báo đẩy</h4>
                        <p className="text-sm text-gray-600">Nhận thông báo trên trình duyệt</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="pushNotifications"
                        defaultChecked
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium disabled:opacity-50"
                >
                  {isSubmitting ? "Đang cập nhật..." : "💾 Lưu cài đặt"}
                </button>
              </Form>
            </div>
          )}

          {/* Privacy Tab */}
          {activeTab === "privacy" && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-6">🛡️ Quyền riêng tư & Bảo mật</h3>
              
              <div className="space-y-6">
                {/* Account Security */}
                <div className="border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">🔐 Bảo mật tài khoản</h4>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-medium text-gray-900">Xác thực email</h5>
                        <p className="text-sm text-gray-600">Tài khoản của bạn đã được xác thực</p>
                      </div>
                      <span className="inline-flex px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        ✅ Đã xác thực
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-medium text-gray-900">Đăng nhập 2 lớp</h5>
                        <p className="text-sm text-gray-600">Tăng cường bảo mật với xác thực 2 bước</p>
                      </div>
                      <button className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                        Sắp có
                      </button>
                    </div>
                  </div>
                </div>

                {/* Data Privacy */}
                <div className="border border-gray-200 rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">📊 Quyền riêng tư dữ liệu</h4>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-medium text-gray-900">Hiển thị thông tin liên hệ</h5>
                        <p className="text-sm text-gray-600">Cho phép người mua xem email sau khi mua hàng</p>
                      </div>
                      <span className="inline-flex px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        Đã bật
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-medium text-gray-900">Thu thập dữ liệu phân tích</h5>
                        <p className="text-sm text-gray-600">Giúp cải thiện trải nghiệm người dùng</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="border border-red-200 rounded-lg p-6 bg-red-50">
                  <h4 className="text-lg font-medium text-red-900 mb-4">⚠️ Vùng nguy hiểm</h4>
                  
                  <div className="space-y-4">
                    <button className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
                      🗑️ Xóa tài khoản
                    </button>
                    <p className="text-sm text-red-600">
                      Xóa tài khoản sẽ không thể hoàn tác. Tất cả dữ liệu của bạn sẽ bị xóa vĩnh viễn.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}