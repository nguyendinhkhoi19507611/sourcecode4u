import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Link, Form, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { Category, SourceCode } from "~/lib/db/models";
import { requireAdmin } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  await connectToDatabase();

  const categories = await Category.find({}).sort({ createdAt: -1 }).lean();
  
  // Get source count for each category
  const categoriesWithCount = await Promise.all(
    categories.map(async (category) => {
      const sourceCount = await SourceCode.countDocuments({ category: category.slug });
      return {
        ...category,
        sourceCount
      };
    })
  );

  const stats = {
    totalCategories: categories.length,
    activeCategories: categories.filter(c => c.isActive).length,
    inactiveCategories: categories.filter(c => !c.isActive).length
  };

  return json({ categories: categoriesWithCount, stats });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const action = formData.get("_action") as string;

  try {
    await connectToDatabase();

    switch (action) {
      case "create": {
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;
        const icon = formData.get("icon") as string;

        if (!name || !description || !icon) {
          return json({ error: "Vui lòng nhập đầy đủ thông tin" }, { status: 400 });
        }

        // Generate slug from name
        const slug = name.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .replace(/[^a-z0-9\s]/g, '') // Remove special chars
          .replace(/\s+/g, '-') // Replace spaces with dashes
          .trim();

        // Check if slug already exists
        const existingCategory = await Category.findOne({ slug });
        if (existingCategory) {
          return json({ error: "Danh mục này đã tồn tại" }, { status: 400 });
        }

        const category = new Category({
          name: name.trim(),
          slug,
          description: description.trim(),
          icon: icon.trim(),
          isActive: true
        });

        await category.save();

        return json({ 
          success: true, 
          message: "Tạo danh mục thành công!" 
        });
      }

      case "update": {
        const categoryId = formData.get("categoryId") as string;
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;
        const icon = formData.get("icon") as string;

        if (!name || !description || !icon) {
          return json({ error: "Vui lòng nhập đầy đủ thông tin" }, { status: 400 });
        }

        const category = await Category.findById(categoryId);
        if (!category) {
          return json({ error: "Không tìm thấy danh mục" }, { status: 404 });
        }

        // Generate new slug if name changed
        let slug = category.slug;
        if (name.trim() !== category.name) {
          slug = name.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '-')
            .trim();

          // Check if new slug already exists
          const existingCategory = await Category.findOne({ slug, _id: { $ne: categoryId } });
          if (existingCategory) {
            return json({ error: "Tên danh mục này đã tồn tại" }, { status: 400 });
          }
        }

        await Category.findByIdAndUpdate(categoryId, {
          name: name.trim(),
          slug,
          description: description.trim(),
          icon: icon.trim()
        });

        return json({ 
          success: true, 
          message: "Cập nhật danh mục thành công!" 
        });
      }

      case "toggle-status": {
        const categoryId = formData.get("categoryId") as string;
        
        const category = await Category.findById(categoryId);
        if (!category) {
          return json({ error: "Không tìm thấy danh mục" }, { status: 404 });
        }

        await Category.findByIdAndUpdate(categoryId, {
          isActive: !category.isActive
        });

        return json({ 
          success: true, 
          message: `${category.isActive ? 'Ẩn' : 'Hiện'} danh mục thành công!` 
        });
      }

      case "delete": {
        const categoryId = formData.get("categoryId") as string;
        
        const category = await Category.findById(categoryId);
        if (!category) {
          return json({ error: "Không tìm thấy danh mục" }, { status: 404 });
        }

        // Check if category has sources
        const sourceCount = await SourceCode.countDocuments({ category: category.slug });
        if (sourceCount > 0) {
          return json({ 
            error: `Không thể xóa danh mục đã có ${sourceCount} mã nguồn` 
          }, { status: 400 });
        }

        await Category.findByIdAndDelete(categoryId);

        return json({ 
          success: true, 
          message: "Xóa danh mục thành công!" 
        });
      }

      default:
        return json({ error: "Hành động không hợp lệ" }, { status: 400 });
    }
  } catch (error) {
    console.error("Category action error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function AdminCategories() {
  const { categories, stats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const isSubmitting = navigation.state === "submitting";

  const popularIcons = ["💻", "📱", "🌐", "⚛️", "🚀", "🎮", "🛒", "📊", "🎨", "🔧", "📝", "🔒", "☁️", "🤖", "💡"];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link to="/admin" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">S4U</span>
                </div>
                <span className="text-xl font-bold text-gray-900">Admin</span>
              </Link>
              <span className="text-gray-400">→</span>
              <span className="text-gray-700">Quản lý danh mục</span>
            </div>
            
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200"
            >
              ➕ Tạo danh mục mới
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng danh mục</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalCategories}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 text-2xl">📁</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Đang hoạt động</p>
                <p className="text-2xl font-bold text-green-600">{stats.activeCategories}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600 text-2xl">✅</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Bị ẩn</p>
                <p className="text-2xl font-bold text-red-600">{stats.inactiveCategories}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-red-600 text-2xl">❌</span>
              </div>
            </div>
          </div>
        </div>

        {/* Create/Edit Form Modal */}
        {(showCreateForm || editingCategory) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  {editingCategory ? '✏️ Chỉnh sửa danh mục' : '➕ Tạo danh mục mới'}
                </h3>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingCategory(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              <Form method="post" className="space-y-6">
                <input type="hidden" name="_action" value={editingCategory ? "update" : "create"} />
                {editingCategory && (
                  <input type="hidden" name="categoryId" value={editingCategory._id} />
                )}

                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Tên danh mục *
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    defaultValue={editingCategory?.name || ""}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Nhập tên danh mục"
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Mô tả *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    required
                    rows={3}
                    defaultValue={editingCategory?.description || ""}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Mô tả về danh mục này"
                  />
                </div>

                <div>
                  <label htmlFor="icon" className="block text-sm font-medium text-gray-700 mb-2">
                    Icon *
                  </label>
                  <input
                    id="icon"
                    name="icon"
                    type="text"
                    required
                    defaultValue={editingCategory?.icon || ""}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Chọn icon emoji"
                  />
                  
                  <div className="mt-3">
                    <p className="text-sm text-gray-600 mb-2">Chọn nhanh:</p>
                    <div className="grid grid-cols-10 gap-2">
                      {popularIcons.map((icon, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            const iconInput = document.getElementById('icon') as HTMLInputElement;
                            if (iconInput) iconInput.value = icon;
                          }}
                          className="w-10 h-10 flex items-center justify-center text-xl hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setEditingCategory(null);
                    }}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium disabled:opacity-50"
                    onClick={() => {
                      setShowCreateForm(false);
                      setEditingCategory(null);
                    }}
                  >
                    {isSubmitting ? "Đang xử lý..." : (editingCategory ? "💾 Cập nhật" : "➕ Tạo danh mục")}
                  </button>
                </div>
              </Form>
            </div>
          </div>
        )}

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((category) => (
            <div key={category._id} className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-r from-teal-100 to-blue-100 rounded-lg flex items-center justify-center text-2xl">
                      {category.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{category.name}</h3>
                      <p className="text-sm text-gray-500">Slug: {category.slug}</p>
                    </div>
                  </div>
                  
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    category.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {category.isActive ? '✅ Hoạt động' : '❌ Bị ẩn'}
                  </span>
                </div>

                <p className="text-gray-600 mb-4 line-clamp-2">
                  {category.description}
                </p>

                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-500">
                    <span className="font-medium">{category.sourceCount}</span> mã nguồn
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(category.createdAt).toLocaleDateString('vi-VN')}
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => setEditingCategory(category)}
                    className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    ✏️ Chỉnh sửa
                  </button>
                  
                  <Form method="post" className="flex-1">
                    <input type="hidden" name="_action" value="toggle-status" />
                    <input type="hidden" name="categoryId" value={category._id} />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={`w-full py-2 px-3 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 ${
                        category.isActive
                          ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {category.isActive ? '👁️‍🗨️ Ẩn' : '✅ Hiện'}
                    </button>
                  </Form>
                  
                  <Form method="post" className="flex-1">
                    <input type="hidden" name="_action" value="delete" />
                    <input type="hidden" name="categoryId" value={category._id} />
                    <button
                      type="submit"
                      disabled={isSubmitting || category.sourceCount > 0}
                      className="w-full bg-red-600 text-white py-2 px-3 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      title={category.sourceCount > 0 ? `Không thể xóa - có ${category.sourceCount} mã nguồn` : "Xóa danh mục"}
                      onClick={(e) => {
                        if (!confirm('Bạn có chắc chắn muốn xóa danh mục này?')) {
                          e.preventDefault();
                        }
                      }}
                    >
                      🗑️ Xóa
                    </button>
                  </Form>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {categories.length === 0 && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gradient-to-r from-teal-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-white text-4xl">📁</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Chưa có danh mục nào
            </h3>
            <p className="text-gray-600 mb-6">
              Tạo danh mục đầu tiên để phân loại mã nguồn
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium"
            >
              ➕ Tạo danh mục đầu tiên
            </button>
          </div>
        )}

        {/* Tips */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">💡 Mẹo quản lý danh mục:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ul className="space-y-2 text-blue-800">
              <li>• Tên danh mục nên ngắn gọn và dễ hiểu</li>
              <li>• Sử dụng emoji phù hợp làm icon</li>
              <li>• Mô tả chi tiết để người dùng dễ phân loại</li>
              <li>• Không nên tạo quá nhiều danh mục con</li>
            </ul>
            <ul className="space-y-2 text-blue-800">
              <li>• Slug được tạo tự động từ tên danh mục</li>
              <li>• Không thể xóa danh mục đã có mã nguồn</li>
              <li>• Có thể ẩn danh mục tạm thời thay vì xóa</li>
              <li>• Thường xuyên kiểm tra và cập nhật danh mục</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}