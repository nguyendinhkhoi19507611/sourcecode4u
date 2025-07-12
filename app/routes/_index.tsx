import { json, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { useLoaderData, Link, Form } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { SourceCode, Category } from "~/lib/db/models";

export const meta: MetaFunction = () => {
  return [
    { title: "SourceCode4U - Nền tảng chia sẻ mã nguồn" },
    { name: "description", content: "Mua bán mã nguồn chất lượng cao. Nền tảng tin cậy cho developers." },
    { name: "keywords", content: "source code, mã nguồn, lập trình, website, app" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  await connectToDatabase();
  
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const category = url.searchParams.get("category") || "";
  const sort = url.searchParams.get("sort") || "newest";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 12;
  const skip = (page - 1) * limit;

  // Build search query
  const query: any = { isActive: true };
  
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { tags: { $in: [new RegExp(search, "i")] } }
    ];
  }
  
  if (category) {
    query.category = category;
  }

  // Build sort options
  let sortOptions: any = {};
  switch (sort) {
    case "popular":
      sortOptions = { purchases: -1, views: -1 };
      break;
    case "rating":
      sortOptions = { rating: -1 };
      break;
    case "price-low":
      sortOptions = { price: 1 };
      break;
    case "price-high":
      sortOptions = { price: -1 };
      break;
    default:
      sortOptions = { createdAt: -1 };
  }

  const [sourceCodes, totalCount, categories, featuredCodes] = await Promise.all([
    SourceCode.find(query)
      .populate("seller", "fullName avatar")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    SourceCode.countDocuments(query),
    Category.find({ isActive: true }).lean(),
    SourceCode.find({ isActive: true })
      .populate("seller", "fullName avatar")
      .sort({ purchases: -1, rating: -1 })
      .limit(8)
      .lean()
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  return json({
    sourceCodes,
    categories,
    featuredCodes,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    filters: { search, category, sort }
  });
}

export default function Index() {
  const { sourceCodes, categories, featuredCodes, pagination, filters } = useLoaderData<typeof loader>();
  const [searchValue, setSearchValue] = useState(filters.search);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">S4U</span>
              </div>
              <span className="text-xl font-bold text-gray-900">SourceCode4U</span>
            </Link>
            
            <nav className="hidden md:flex space-x-8">
              <Link to="/" className="text-gray-700 hover:text-teal-600 font-medium">
                Trang chủ
              </Link>
              <Link to="/browse" className="text-gray-700 hover:text-teal-600 font-medium">
                Duyệt mã nguồn
              </Link>
              <Link to="/sell" className="text-gray-700 hover:text-teal-600 font-medium">
                Bán mã nguồn
              </Link>
              <Link to="/about" className="text-gray-700 hover:text-teal-600 font-medium">
                Giới thiệu
              </Link>
            </nav>

            <div className="flex items-center space-x-4">
              <Link
                to="/login"
                className="text-gray-700 hover:text-teal-600 font-medium"
              >
                Đăng nhập
              </Link>
              <Link
                to="/register"
                className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium"
              >
                Đăng ký
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Nền tảng{" "}
            <span className="bg-gradient-to-r from-teal-500 to-blue-600 bg-clip-text text-transparent">
              mã nguồn
            </span>{" "}
            hàng đầu
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Mua bán mã nguồn chất lượng cao. Kết nối developers và khách hàng trên toàn quốc.
          </p>
          
          {/* Search Bar */}
          <Form method="get" className="max-w-2xl mx-auto mb-8">
            <div className="flex rounded-lg shadow-lg overflow-hidden bg-white">
              <input
                type="text"
                name="search"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Tìm kiếm mã nguồn..."
                className="flex-1 px-6 py-4 text-gray-900 placeholder-gray-500 focus:outline-none"
              />
              <select
                name="category"
                defaultValue={filters.category}
                className="px-4 py-4 bg-gray-50 border-l text-gray-700 focus:outline-none"
              >
                <option value="">Tất cả danh mục</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-8 py-4 bg-gradient-to-r from-teal-500 to-blue-600 text-white font-medium hover:from-teal-600 hover:to-blue-700 transition-all duration-200"
              >
                Tìm kiếm
              </button>
            </div>
          </Form>

          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {categories.slice(0, 6).map((category) => (
              <Link
                key={category._id}
                to={`/?category=${category.slug}`}
                className="bg-white px-6 py-3 rounded-full shadow-md hover:shadow-lg transition-all duration-200 text-gray-700 hover:text-teal-600 border hover:border-teal-200"
              >
                <span className="mr-2">{category.icon}</span>
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Mã nguồn nổi bật
            </h2>
            <p className="text-gray-600">
              Những sản phẩm được yêu thích nhất trên nền tảng
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredCodes.map((code) => (
              <div
                key={code._id}
                className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group"
              >
                <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                  {code.thumbnail ? (
                    <img
                      src={code.thumbnail}
                      alt={code.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-16 h-16 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
                        <span className="text-white text-2xl">💻</span>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-3 right-3 bg-gradient-to-r from-teal-500 to-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                    {code.price.toLocaleString('vi-VN')} xu
                  </div>
                </div>

                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-teal-600 transition-colors">
                    {code.title}
                  </h3>
                  
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                    <div className="flex items-center space-x-1">
                      <span>⭐</span>
                      <span>{code.rating > 0 ? code.rating.toFixed(1) : 'Chưa có'}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span>👁️</span>
                      <span>{code.views}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span>🛒</span>
                      <span>{code.purchases}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <img
                        src={code.seller.avatar || '/api/placeholder/32/32'}
                        alt={code.seller.fullName}
                        className="w-6 h-6 rounded-full"
                      />
                      <span className="text-sm text-gray-600 truncate">
                        {code.seller.fullName}
                      </span>
                    </div>
                    <Link
                      to={`/source/${code.sourceId}`}
                      className="text-teal-600 hover:text-teal-700 font-medium text-sm"
                    >
                      Xem chi tiết →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">
              Tất cả mã nguồn ({pagination.totalCount})
            </h2>
            
            <Form method="get" className="flex items-center space-x-4">
              <input type="hidden" name="search" value={filters.search} />
              <input type="hidden" name="category" value={filters.category} />
              <select
                name="sort"
                defaultValue={filters.sort}
                onChange={(e) => e.target.form?.submit()}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="newest">Mới nhất</option>
                <option value="popular">Phổ biến</option>
                <option value="rating">Đánh giá cao</option>
                <option value="price-low">Giá thấp đến cao</option>
                <option value="price-high">Giá cao đến thấp</option>
              </select>
            </Form>
          </div>

          {sourceCodes.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {sourceCodes.map((code) => (
                  <div
                    key={code._id}
                    className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group"
                  >
                    <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                      {code.thumbnail ? (
                        <img
                          src={code.thumbnail}
                          alt={code.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-16 h-16 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
                            <span className="text-white text-2xl">💻</span>
                          </div>
                        </div>
                      )}
                      <div className="absolute top-3 right-3 bg-gradient-to-r from-teal-500 to-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                        {code.price.toLocaleString('vi-VN')} xu
                      </div>
                    </div>

                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-teal-600 transition-colors">
                        {code.title}
                      </h3>
                      
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                        {code.description}
                      </p>
                      
                      <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                        <div className="flex items-center space-x-1">
                          <span>⭐</span>
                          <span>{code.rating > 0 ? code.rating.toFixed(1) : 'Chưa có'}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span>👁️</span>
                          <span>{code.views}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span>🛒</span>
                          <span>{code.purchases}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <img
                            src={code.seller.avatar || '/api/placeholder/32/32'}
                            alt={code.seller.fullName}
                            className="w-6 h-6 rounded-full"
                          />
                          <span className="text-sm text-gray-600 truncate">
                            {code.seller.fullName}
                          </span>
                        </div>
                        <Link
                          to={`/source/${code.sourceId}`}
                          className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 text-sm font-medium"
                        >
                          Xem chi tiết
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex justify-center items-center space-x-2">
                  {pagination.hasPrev && (
                    <Link
                      to={`?${new URLSearchParams({
                        ...filters,
                        page: (pagination.currentPage - 1).toString()
                      })}`}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      ← Trước
                    </Link>
                  )}
                  
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter(page => 
                      page === 1 || 
                      page === pagination.totalPages || 
                      Math.abs(page - pagination.currentPage) <= 2
                    )
                    .map((page, index, array) => (
                      <div key={page} className="flex items-center">
                        {index > 0 && array[index - 1] !== page - 1 && (
                          <span className="px-2 text-gray-500">...</span>
                        )}
                        <Link
                          to={`?${new URLSearchParams({
                            ...filters,
                            page: page.toString()
                          })}`}
                          className={`px-4 py-2 rounded-lg transition-colors ${
                            page === pagination.currentPage
                              ? 'bg-gradient-to-r from-teal-500 to-blue-600 text-white'
                              : 'bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </Link>
                      </div>
                    ))}
                  
                  {pagination.hasNext && (
                    <Link
                      to={`?${new URLSearchParams({
                        ...filters,
                        page: (pagination.currentPage + 1).toString()
                      })}`}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Sau →
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <div className="w-24 h-24 bg-gradient-to-r from-teal-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-white text-4xl">🔍</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Không tìm thấy mã nguồn nào
              </h3>
              <p className="text-gray-600 mb-6">
                Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc
              </p>
              <Link
                to="/"
                className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium"
              >
                Xem tất cả mã nguồn
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">S4U</span>
                </div>
                <span className="text-xl font-bold">SourceCode4U</span>
              </div>
              <p className="text-gray-400 mb-4 max-w-md">
                Nền tảng mua bán mã nguồn hàng đầu Việt Nam. Kết nối developers và khách hàng một cách an toàn và hiệu quả.
              </p>
              <div className="flex space-x-4">
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  Facebook
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  YouTube
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  GitHub
                </a>
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Liên kết</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link to="/browse" className="hover:text-white transition-colors">Duyệt mã nguồn</Link></li>
                <li><Link to="/sell" className="hover:text-white transition-colors">Bán mã nguồn</Link></li>
                <li><Link to="/pricing" className="hover:text-white transition-colors">Bảng giá</Link></li>
                <li><Link to="/help" className="hover:text-white transition-colors">Trợ giúp</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Liên hệ</h3>
              <ul className="space-y-2 text-gray-400">
                <li>Email: sourcecode4u.contact@gmail.com</li>
                <li>Hỗ trợ: 24/7</li>
                <li><Link to="/terms" className="hover:text-white transition-colors">Điều khoản</Link></li>
                <li><Link to="/privacy" className="hover:text-white transition-colors">Bảo mật</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2025 SourceCode4U. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}