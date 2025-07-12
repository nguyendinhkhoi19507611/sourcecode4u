import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { SourceCode, Category } from "~/lib/db/models";
import { requireAuth, generateSourceId } from "~/lib/auth";
import { uploadToCloudinary } from "~/lib/cloudinary";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  await connectToDatabase();
  
  const categories = await Category.find({ isActive: true }).lean();
  
  return json({ categories });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAuth(request);
  const formData = await request.formData();
  
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const price = parseInt(formData.get("price") as string);
  const category = formData.get("category") as string;
  const tags = (formData.get("tags") as string).split(',').map(tag => tag.trim()).filter(Boolean);
  const sourceLink = formData.get("sourceLink") as string;
  const demoVideo = formData.get("demoVideo") as string;
  const thumbnailFile = formData.get("thumbnail") as File;

  try {
    // Validate input
    if (!title || !description || !price || !category || !sourceLink || !thumbnailFile) {
      return json({ error: "Vui lòng nhập đầy đủ thông tin bắt buộc" }, { status: 400 });
    }

    if (price < 1000) {
      return json({ error: "Giá tối thiểu là 1,000 xu" }, { status: 400 });
    }

    if (thumbnailFile.size > 5 * 1024 * 1024) {
      return json({ error: "Ảnh đại diện không được vượt quá 5MB" }, { status: 400 });
    }

    await connectToDatabase();

    // Generate unique source ID
    let sourceId: string;
    let isSourceIdUnique = false;
    do {
      sourceId = generateSourceId();
      const existingSource = await SourceCode.findOne({ sourceId });
      isSourceIdUnique = !existingSource;
    } while (!isSourceIdUnique);

    // Upload thumbnail to Cloudinary
    const bytes = await thumbnailFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64String = `data:${thumbnailFile.type};base64,${buffer.toString('base64')}`;
    const thumbnailUrl = await uploadToCloudinary(base64String, 'sourcecode4u/thumbnails');

    // Create source code
    const sourceCode = new SourceCode({
      sourceId,
      title: title.trim(),
      description: description.trim(),
      price,
      seller: user._id,
      category,
      tags,
      thumbnail: thumbnailUrl,
      demoVideo: demoVideo.trim() || undefined,
      sourceLink: sourceLink.trim(),
      views: 0,
      purchases: 0,
      rating: 0,
      totalRatings: 0,
      isActive: true,
      isAdminPost: user.role === 'admin'
    });

    await sourceCode.save();

    return json({ 
      success: true, 
      message: "Đăng tải mã nguồn thành công!",
      sourceId 
    });

  } catch (error) {
    console.error("Upload source error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function SellSource() {
  const { categories } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    category: "",
    tags: "",
    sourceLink: "",
    demoVideo: ""
  });
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>("");
  const isSubmitting = navigation.state === "submitting";

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("Ảnh không được vượt quá 5MB");
        return;
      }
      
      setThumbnail(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setThumbnailPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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
            🎉 Đăng tải thành công!
          </h2>
          <p className="text-gray-600 mb-6">
            Mã nguồn của bạn đã được đăng tải và sẵn sàng để bán. Mã sản phẩm: <strong>{actionData.sourceId}</strong>
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium"
            >
              Đăng sản phẩm khác
            </button>
            <a
              href={`/source/${actionData.sourceId}`}
              className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium text-center"
            >
              Xem sản phẩm
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          📤 Đăng bán mã nguồn
        </h1>
        <p className="text-gray-600">
          Chia sẻ mã nguồn của bạn với cộng đồng và kiếm tiền từ nó
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md p-8">
        <Form method="post" encType="multipart/form-data" className="space-y-8">
          {actionData?.error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {actionData.error}
            </div>
          )}

          {/* Basic Information */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
              📝 Thông tin cơ bản
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="lg:col-span-2">
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                  Tiêu đề mã nguồn *
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  required
                  value={formData.title}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Nhập tiêu đề hấp dẫn cho mã nguồn của bạn"
                />
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                  Danh mục *
                </label>
                <select
                  id="category"
                  name="category"
                  required
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">Chọn danh mục</option>
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat.slug}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-2">
                  Giá bán (xu) *
                </label>
                <input
                  id="price"
                  name="price"
                  type="number"
                  required
                  min="1000"
                  value={formData.price}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Tối thiểu 1,000 xu"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Bạn sẽ nhận được 80% sau khi bán thành công
                </p>
              </div>

              <div className="lg:col-span-2">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                  Mô tả chi tiết *
                </label>
                <textarea
                  id="description"
                  name="description"
                  required
                  rows={6}
                  value={formData.description}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Mô tả chi tiết về mã nguồn: công nghệ sử dụng, tính năng, hướng dẫn cài đặt..."
                />
              </div>

              <div className="lg:col-span-2">
                <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-2">
                  Tags (từ khóa)
                </label>
                <input
                  id="tags"
                  name="tags"
                  type="text"
                  value={formData.tags}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="React, NodeJS, MongoDB... (phân cách bằng dấu phẩy)"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Nhập các từ khóa liên quan để người mua dễ tìm thấy
                </p>
              </div>
            </div>
          </div>

          {/* Media */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
              🖼️ Hình ảnh và Video
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <label htmlFor="thumbnail" className="block text-sm font-medium text-gray-700 mb-2">
                  Ảnh đại diện *
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-teal-400 transition-colors">
                  <div className="space-y-1 text-center">
                    {thumbnailPreview ? (
                      <div className="mb-4">
                        <img
                          src={thumbnailPreview}
                          alt="Preview"
                          className="mx-auto h-32 w-auto rounded-lg object-cover"
                        />
                      </div>
                    ) : (
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        stroke="currentColor"
                        fill="none"
                        viewBox="0 0 48 48"
                      >
                        <path
                          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    <div className="flex text-sm text-gray-600">
                      <label
                        htmlFor="thumbnail"
                        className="relative cursor-pointer bg-white rounded-md font-medium text-teal-600 hover:text-teal-500"
                      >
                        <span>Tải lên ảnh</span>
                        <input
                          id="thumbnail"
                          name="thumbnail"
                          type="file"
                          accept="image/*"
                          required
                          onChange={handleThumbnailChange}
                          className="sr-only"
                        />
                      </label>
                      <p className="pl-1">hoặc kéo thả</p>
                    </div>
                    <p className="text-xs text-gray-500">PNG, JPG, GIF tối đa 5MB</p>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="demoVideo" className="block text-sm font-medium text-gray-700 mb-2">
                  Link video demo (tùy chọn)
                </label>
                <input
                  id="demoVideo"
                  name="demoVideo"
                  type="url"
                  value={formData.demoVideo}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="https://youtube.com/watch?v=..."
                />
                <p className="mt-1 text-sm text-gray-500">
                  Link YouTube hoặc Google Drive để khách hàng xem demo
                </p>
              </div>
            </div>
          </div>

          {/* Source Link */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
              🔗 Link mã nguồn
            </h3>

            <div>
              <label htmlFor="sourceLink" className="block text-sm font-medium text-gray-700 mb-2">
                Link tải mã nguồn *
              </label>
              <input
                id="sourceLink"
                name="sourceLink"
                type="url"
                required
                value={formData.sourceLink}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="https://drive.google.com/... hoặc https://github.com/..."
              />
              <div className="mt-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                  </svg>
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800 mb-1">
                      ⚠️ Lưu ý quan trọng
                    </h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li>• Link này chỉ hiển thị cho người mua trong 24h sau khi mua</li>
                      <li>• Đảm bảo link luôn hoạt động và có thể truy cập</li>
                      <li>• Nên sử dụng Google Drive hoặc GitHub với quyền truy cập công khai</li>
                      <li>• Không chia sẻ link này ở nơi khác</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
              👁️ Xem trước
            </h3>

            <div className="bg-gray-50 p-6 rounded-lg">
              <div className="bg-white rounded-xl shadow-md overflow-hidden max-w-sm">
                <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                  {thumbnailPreview ? (
                    <img
                      src={thumbnailPreview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-16 h-16 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
                        <span className="text-white text-2xl">💻</span>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-3 right-3 bg-gradient-to-r from-teal-500 to-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                    {formData.price ? parseInt(formData.price).toLocaleString('vi-VN') : '0'} xu
                  </div>
                </div>

                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                    {formData.title || "Tiêu đề mã nguồn"}
                  </h3>
                  
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                    {formData.description || "Mô tả mã nguồn sẽ hiển thị ở đây..."}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                    <div className="flex items-center space-x-1">
                      <span>⭐</span>
                      <span>Chưa có</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span>👁️</span>
                      <span>0</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span>🛒</span>
                      <span>0</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-gray-300 rounded-full"></div>
                      <span className="text-sm text-gray-600">Bạn</span>
                    </div>
                    <span className="text-teal-600 font-medium text-sm">
                      Xem chi tiết →
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 px-6 rounded-lg hover:from-teal-600 hover:to-blue-700 focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                  Đang đăng tải...
                </div>
              ) : (
                "📤 Đăng bán mã nguồn"
              )}
            </button>
            
            <button
              type="button"
              onClick={() => window.history.back()}
              className="flex-1 sm:flex-none bg-gray-100 text-gray-700 py-3 px-6 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium"
            >
              Hủy bỏ
            </button>
          </div>
        </Form>
      </div>

      {/* Tips */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h4 className="font-semibold text-blue-900 mb-3">💡 Mẹo để bán được nhiều hơn:</h4>
        <ul className="space-y-2 text-blue-800">
          <li>• Viết tiêu đề hấp dẫn và mô tả chi tiết</li>
          <li>• Chọn ảnh đại diện đẹp, chất lượng cao</li>
          <li>• Đặt giá hợp lý so với thị trường</li>
          <li>• Thêm video demo để tăng độ tin cậy</li>
          <li>• Sử dụng tags phù hợp để dễ tìm kiếm</li>
          <li>• Đảm bảo mã nguồn hoạt động tốt và có tài liệu</li>
        </ul>
      </div>
    </div>
  );
}