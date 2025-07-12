import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { Notification } from "~/lib/db/models";
import { requireAuth } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request);
  await connectToDatabase();

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const filter = url.searchParams.get("filter") || "all";
  const limit = 20;
  const skip = (page - 1) * limit;

  // Build query
  const query: any = { user: user._id };
  
  if (filter === "unread") {
    query.isRead = false;
  } else if (filter === "read") {
    query.isRead = true;
  }

  const [notifications, totalCount, unreadCount] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(query),
    Notification.countDocuments({ user: user._id, isRead: false })
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  return json({
    notifications,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    currentFilter: filter,
    unreadCount
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAuth(request);
  const formData = await request.formData();
  const action = formData.get("_action") as string;
  const notificationId = formData.get("notificationId") as string;

  try {
    await connectToDatabase();

    switch (action) {
      case "mark-read": {
        await Notification.findOneAndUpdate(
          { _id: notificationId, user: user._id },
          { isRead: true }
        );
        return json({ success: true, message: "Đã đánh dấu đã đọc" });
      }

      case "mark-unread": {
        await Notification.findOneAndUpdate(
          { _id: notificationId, user: user._id },
          { isRead: false }
        );
        return json({ success: true, message: "Đã đánh dấu chưa đọc" });
      }

      case "mark-all-read": {
        await Notification.updateMany(
          { user: user._id, isRead: false },
          { isRead: true }
        );
        return json({ success: true, message: "Đã đánh dấu tất cả đã đọc" });
      }

      case "delete": {
        await Notification.findOneAndDelete(
          { _id: notificationId, user: user._id }
        );
        return json({ success: true, message: "Đã xóa thông báo" });
      }

      case "delete-all-read": {
        await Notification.deleteMany(
          { user: user._id, isRead: true }
        );
        return json({ success: true, message: "Đã xóa tất cả thông báo đã đọc" });
      }

      default:
        return json({ error: "Hành động không hợp lệ" }, { status: 400 });
    }
  } catch (error) {
    console.error("Notification action error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function Notifications() {
  const { notifications, pagination, currentFilter, unreadCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const isSubmitting = navigation.state === "submitting";

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 1) return "Vừa xong";
    if (diffMinutes < 60) return `${diffMinutes} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return past.toLocaleDateString('vi-VN');
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'purchase':
        return '🛒';
      case 'sale':
        return '💰';
      case 'payment':
        return '💳';
      case 'system':
        return '🔔';
      default:
        return '📢';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'purchase':
        return 'from-blue-500 to-blue-600';
      case 'sale':
        return 'from-green-500 to-green-600';
      case 'payment':
        return 'from-purple-500 to-purple-600';
      case 'system':
        return 'from-orange-500 to-orange-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const toggleNotificationSelection = (notificationId: string) => {
    const newSelected = new Set(selectedNotifications);
    if (newSelected.has(notificationId)) {
      newSelected.delete(notificationId);
    } else {
      newSelected.add(notificationId);
    }
    setSelectedNotifications(newSelected);
  };

  const selectAllNotifications = () => {
    if (selectedNotifications.size === notifications.length) {
      setSelectedNotifications(new Set());
    } else {
      setSelectedNotifications(new Set(notifications.map(n => n._id)));
    }
  };

  const filters = [
    { value: "all", label: "Tất cả", count: pagination.totalCount },
    { value: "unread", label: "Chưa đọc", count: unreadCount },
    { value: "read", label: "Đã đọc", count: pagination.totalCount - unreadCount }
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          🔔 Thông báo
        </h1>
        <p className="text-gray-600">
          Theo dõi các hoạt động và cập nhật quan trọng
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng thông báo</p>
              <p className="text-2xl font-bold text-gray-900">{pagination.totalCount}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 text-2xl">📢</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Chưa đọc</p>
              <p className="text-2xl font-bold text-red-600">{unreadCount}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <span className="text-red-600 text-2xl">🔴</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Đã đọc</p>
              <p className="text-2xl font-bold text-green-600">{pagination.totalCount - unreadCount}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-600 text-2xl">✅</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-xl shadow-md mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {filters.map((filter) => (
              <a
                key={filter.value}
                href={`?filter=${filter.value}`}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  currentFilter === filter.value
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {filter.label} ({filter.count})
              </a>
            ))}
          </nav>
        </div>

        {/* Bulk Actions */}
        {notifications.length > 0 && (
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedNotifications.size === notifications.length && notifications.length > 0}
                    onChange={selectAllNotifications}
                    className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-600">
                    Chọn tất cả ({selectedNotifications.size}/{notifications.length})
                  </span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                {unreadCount > 0 && (
                  <Form method="post" className="inline">
                    <input type="hidden" name="_action" value="mark-all-read" />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      ✅ Đánh dấu tất cả đã đọc
                    </button>
                  </Form>
                )}

                <Form method="post" className="inline">
                  <input type="hidden" name="_action" value="delete-all-read" />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    🗑️ Xóa đã đọc
                  </button>
                </Form>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notifications List */}
      {notifications.length > 0 ? (
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-6">
          <div className="divide-y divide-gray-200">
            {notifications.map((notification) => (
              <div
                key={notification._id}
                className={`p-6 hover:bg-gray-50 transition-colors ${
                  !notification.isRead ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                }`}
              >
                <div className="flex items-start space-x-4">
                  <input
                    type="checkbox"
                    checked={selectedNotifications.has(notification._id)}
                    onChange={() => toggleNotificationSelection(notification._id)}
                    className="mt-1 h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                  />

                  <div className={`w-12 h-12 bg-gradient-to-r ${getNotificationColor(notification.type)} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white text-xl">{getNotificationIcon(notification.type)}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className={`text-lg font-medium ${!notification.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                          {notification.title}
                        </h3>
                        <p className={`mt-1 ${!notification.isRead ? 'text-gray-700' : 'text-gray-600'}`}>
                          {notification.message}
                        </p>
                        <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                          <span>{formatTimeAgo(notification.createdAt)}</span>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            notification.type === 'purchase' ? 'bg-blue-100 text-blue-800' :
                            notification.type === 'sale' ? 'bg-green-100 text-green-800' :
                            notification.type === 'payment' ? 'bg-purple-100 text-purple-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {notification.type === 'purchase' ? 'Mua hàng' :
                             notification.type === 'sale' ? 'Bán hàng' :
                             notification.type === 'payment' ? 'Thanh toán' :
                             'Hệ thống'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        {!notification.isRead ? (
                          <Form method="post" className="inline">
                            <input type="hidden" name="_action" value="mark-read" />
                            <input type="hidden" name="notificationId" value={notification._id} />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="text-blue-600 hover:text-blue-900 text-sm disabled:opacity-50"
                              title="Đánh dấu đã đọc"
                            >
                              ✅
                            </button>
                          </Form>
                        ) : (
                          <Form method="post" className="inline">
                            <input type="hidden" name="_action" value="mark-unread" />
                            <input type="hidden" name="notificationId" value={notification._id} />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="text-gray-600 hover:text-gray-900 text-sm disabled:opacity-50"
                              title="Đánh dấu chưa đọc"
                            >
                              📭
                            </button>
                          </Form>
                        )}

                        <Form method="post" className="inline">
                          <input type="hidden" name="_action" value="delete" />
                          <input type="hidden" name="notificationId" value={notification._id} />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="text-red-600 hover:text-red-900 text-sm disabled:opacity-50"
                            title="Xóa thông báo"
                          >
                            🗑️
                          </button>
                        </Form>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
              <div className="flex-1 flex justify-between sm:hidden">
                {pagination.hasPrev && (
                  <a
                    href={`?page=${pagination.currentPage - 1}&filter=${currentFilter}`}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Trước
                  </a>
                )}
                {pagination.hasNext && (
                  <a
                    href={`?page=${pagination.currentPage + 1}&filter=${currentFilter}`}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Sau
                  </a>
                )}
              </div>
              
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Hiển thị <span className="font-medium">{((pagination.currentPage - 1) * 20) + 1}</span> đến{' '}
                    <span className="font-medium">
                      {Math.min(pagination.currentPage * 20, pagination.totalCount)}
                    </span> trong tổng số{' '}
                    <span className="font-medium">{pagination.totalCount}</span> thông báo
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    {pagination.hasPrev && (
                      <a
                        href={`?page=${pagination.currentPage - 1}&filter=${currentFilter}`}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                      >
                        ← Trước
                      </a>
                    )}
                    
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      const page = pagination.currentPage <= 3 
                        ? i + 1 
                        : pagination.currentPage + i - 2;
                      if (page <= pagination.totalPages && page > 0) {
                        return (
                          <a
                            key={page}
                            href={`?page=${page}&filter=${currentFilter}`}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              page === pagination.currentPage
                                ? 'z-10 bg-teal-50 border-teal-500 text-teal-600'
                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </a>
                        );
                      }
                      return null;
                    })}
                    
                    {pagination.hasNext && (
                      <a
                        href={`?page=${pagination.currentPage + 1}&filter=${currentFilter}`}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                      >
                        Sau →
                      </a>
                    )}
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-gradient-to-r from-teal-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-white text-4xl">🔔</span>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {currentFilter === "all" 
              ? "Không có thông báo nào" 
              : currentFilter === "unread"
              ? "Không có thông báo chưa đọc"
              : "Không có thông báo đã đọc"
            }
          </h3>
          <p className="text-gray-600 mb-6">
            {currentFilter === "all" 
              ? "Bạn sẽ nhận được thông báo khi có hoạt động mới"
              : "Thử thay đổi bộ lọc để xem các thông báo khác"
            }
          </p>
          {currentFilter !== "all" && (
            <a
              href="?filter=all"
              className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium inline-block"
            >
              📋 Xem tất cả thông báo
            </a>
          )}
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">💡 Về thông báo:</h3>
        <ul className="space-y-2 text-blue-800">
          <li>• 🛒 <strong>Mua hàng:</strong> Thông báo khi bạn mua mã nguồn thành công</li>
          <li>• 💰 <strong>Bán hàng:</strong> Thông báo khi có người mua mã nguồn của bạn</li>
          <li>• 💳 <strong>Thanh toán:</strong> Thông báo về nạp xu, rút xu và các giao dịch</li>
          <li>• 🔔 <strong>Hệ thống:</strong> Thông báo về cập nhật và thông tin quan trọng</li>
          <li>• Thông báo sẽ được gửi qua email cho các hoạt động quan trọng</li>
          <li>• Bạn có thể xóa thông báo đã đọc để giữ danh sách gọn gàng</li>
        </ul>
      </div>
    </div>
  );
}