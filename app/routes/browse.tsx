import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, Form, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { SourceCode, Category, User } from "~/lib/db/models";
import { getUserFromRequest } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  await connectToDatabase();
  
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const category = url.searchParams.get("category") || "";
  const minPrice = parseInt(url.searchParams.get("minPrice") || "0");
  const maxPrice = parseInt(url.searchParams.get("maxPrice") || "0");
  const sort = url.searchParams.get("sort") || "newest";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 12;
  const skip = (page - 1) * limit;

  // Get current user
  const currentUser = await getUserFromRequest(request);

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

  if (minPrice > 0 || maxPrice > 0) {
    query.price = {};
    if (minPrice > 0) query.price.$gte = minPrice;
    if (maxPrice > 0) query.price.$lte = maxPrice;
  }

  // Build sort options
  let sortOptions: any = {};
  switch (sort) {
    case "popular":
      sortOptions = { purchases: -1, views: -1 };
      break;
    case "rating":
      sortOptions = { rating: -1, totalRatings: -1 };
      break;
    case "price-low":
      sortOptions = { price: 1 };
      break;
    case "price-high":
      sortOptions = { price: -1 };
      break;
    case "views":
      sortOptions = { views: -1 };
      break;
    default:
      sortOptions = { createdAt: -1 };
  }

  const [sourceCodes, totalCount, categories, priceRange] = await Promise.all([
    SourceCode.find(query)
      .populate("seller", "fullName avatar userId")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    SourceCode.countDocuments(query),
    Category.find({ isActive: true }).lean(),
    SourceCode.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          minPrice: { $min: "$price" },
          maxPrice: { $max: "$price" }
        }
      }
    ])
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  // Get popular tags
  const popularTags = await SourceCode.aggregate([
    { $match: { isActive: true } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);

  // Get featured sources (top rated)
  const featuredSources = await SourceCode.find({ isActive: true, rating: { $gte: 4 } })
    .populate("seller", "fullName avatar")
    .sort({ rating: -1, totalRatings: -1 })
    .limit(6)
    .lean();

  return json({
    sourceCodes,
    categories,
    featuredSources,
    popularTags,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    filters: { search, category, minPrice, maxPrice, sort },
    priceRange: priceRange[0] || { minPrice: 0, maxPrice: 1000000 },
    currentUser: currentUser ? {
      _id: currentUser._id.toString(),
      userId: currentUser.userId,
      fullName: currentUser.fullName,
      balance: currentUser.balance
    } : null
  });
}

export default function Browse() {
  const { 
    sourceCodes, 
    categories, 
    featuredSources,
    popularTags,
    pagination, 
    filters, 
    priceRange,
    currentUser 
  } = useLoaderData<typeof loader>();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState({
    search: filters.search,
    category: filters.category,
    minPrice: filters.minPrice.toString(),
    maxPrice: filters.maxPrice.toString(),
    sort: filters.sort
  });

  const updateFilters = () => {
    const newParams = new URLSearchParams();
    if (localFilters.search) newParams.set("search", localFilters.search);
    if (localFilters.category) newParams.set("category", localFilters.category);
    if (localFilters.minPrice && parseInt(localFilters.minPrice) > 0) {
      newParams.set("minPrice", localFilters.minPrice);
    }
    if (localFilters.maxPrice && parseInt(localFilters.maxPrice) > 0) {
      newParams.set("maxPrice", localFilters.maxPrice);
    }
    if (localFilters.sort !== "newest") newParams.set("sort", localFilters.sort);
    
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setLocalFilters({
      search: "",
      category: "",
      minPrice: "",
      maxPrice: "",
      sort: "newest"
    });
    setSearchParams({});
  };

  const sortOptions = [
    { value: "newest", label: "Mới nhất" },
    { value: "popular", label: "Phổ biến" },
    { value: "rating", label: "Đánh giá cao" },
    { value: "views", label: "Nhiều lượt xem" },
    { value: "price-low", label: "Giá thấp đến cao" },
    { value: "price-high", label: "Giá cao đến thấp" }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
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
              <Link to="/browse" className="text-teal-600 font-medium">
                Duyệt mã nguồn
              </Link>
              <Link to="/about" className="text-gray-700 hover:text-teal-600 font-medium">
                Giới thiệu
              </Link>
            </nav>

            <div className="flex items-center space-x-4">
              {currentUser ? (
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-600">
                    💰 {currentUser.balance.toLocaleString('vi-VN')} xu
                  </span>
                  <Link
                    to="/dashboard"
                    className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200"
                  >
                    Dashboard
                  </Link>
                </div>
              ) : (
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
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔍 Duyệt mã nguồn
          </h1>
          <p className="text-gray-600">
            Khám phá {pagination.totalCount.toLocaleString('vi-VN')} mã nguồn chất lượng cao
          </p>
        </div>

        {/* Featured Sources */}
        {featuredSources.length > 0 && !filters.search && !filters.category && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              ⭐ Mã nguồn nổi bật
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredSources.map((source) => (
                <div
                  key={source._id}
                  className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group"
                >
                  <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                    <img
                      src={source.thumbnail}
                      alt={source.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-3 right-3 bg-gradient-to-r from-teal-500 to-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                      {source.price.toLocaleString('vi-VN')} xu
                    </div>
                    <div className="absolute top-3 left-3 bg-yellow-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                      ⭐ {source.rating.toFixed(1)}
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-teal-600 transition-colors">
                      {source.title}
                    </h3>
                    
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                      <div className="flex items-center space-x-1">
                        <span>👁️</span>
                        <span>{source.views}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span>🛒</span>
                        <span>{source.purchases}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span>⭐</span>
                        <span>{source.totalRatings}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <img
                          src={source.seller.avatar || '/api/placeholder/24/24'}
                          alt={source.seller.fullName}
                          className="w-6 h-6 rounded-full"
                        />
                        <span className="text-sm text-gray-600 truncate">
                          {source.seller.fullName}
                        </span>
                      </div>
                      <Link
                        to={`/source/${source.sourceId}`}
                        className="text-teal-600 hover:text-teal-700 font-medium text-sm"
                      >
                        Chi tiết →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
            {/* Search */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tìm kiếm
              </label>
              <input
                type="text"
                value={localFilters.search}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, search: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Tên mã nguồn, mô tả, tags..."
              />
            </div>

            {/* Sort */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sắp xếp
              </label>
              <select
                value={localFilters.sort}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, sort: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex space-x-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
              >
                🔧 Bộ lọc
              </button>
              <button
                onClick={updateFilters}
                className="flex-1 bg-gradient-to-r from-teal-500 to-blue-600 text-white py-2 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200"
              >
                🔍 Tìm
              </button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Category Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Danh mục
                  </label>
                  <select
                    value={localFilters.category}
                    onChange={(e) => setLocalFilters(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">Tất cả danh mục</option>
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat.slug}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Price Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Giá từ (xu)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={localFilters.minPrice}
                    onChange={(e) => setLocalFilters(prev => ({ ...prev, minPrice: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder={`Tối thiểu: ${priceRange.minPrice.toLocaleString('vi-VN')}`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Giá đến (xu)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={localFilters.maxPrice}
                    onChange={(e) => setLocalFilters(prev => ({ ...prev, maxPrice: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder={`Tối đa: ${priceRange.maxPrice.toLocaleString('vi-VN')}`}
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end space-x-2">
                <button
                  onClick={clearFilters}
                  className="bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Xóa bộ lọc
                </button>
                <button
                  onClick={updateFilters}
                  className="bg-gradient-to-r from-teal-500 to-blue-600 text-white py-2 px-4 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Popular Tags */}
        {popularTags.length > 0 && !filters.search && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🏷️ Tags phổ biến:</h3>
            <div className="flex flex-wrap gap-2">
              {popularTags.slice(0, 15).map((tag) => (
                <button
                  key={tag._id}
                  onClick={() => {
                    setLocalFilters(prev => ({ ...prev, search: tag._id }));
                    const newParams = new URLSearchParams(searchParams);
                    newParams.set("search", tag._id);
                    setSearchParams(newParams);
                  }}
                  className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm hover:bg-blue-200 transition-colors"
                >
                  {tag._id} ({tag.count})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {filters.search || filters.category ? 'Kết quả tìm kiếm' : 'Tất cả mã nguồn'} 
            ({pagination.totalCount.toLocaleString('vi-VN')})
          </h2>
          
          {(filters.search || filters.category || filters.minPrice || filters.maxPrice) && (
            <button
              onClick={clearFilters}
              className="text-teal-600 hover:text-teal-700 text-sm font-medium"
            >
              ❌ Xóa bộ lọc
            </button>
          )}
        </div>

        {/* Source Codes Grid */}
        {sourceCodes.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
              {sourceCodes.map((source) => (
                <div
                  key={source._id}
                  className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group"
                >
                  <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                    <img
                      src={source.thumbnail}
                      alt={source.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-3 right-3 bg-gradient-to-r from-teal-500 to-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                      {source.price.toLocaleString('vi-VN')} xu
                    </div>
                    {source.isAdminPost && (
                      <div className="absolute top-3 left-3 bg-yellow-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                        🛡️ Official
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-teal-600 transition-colors">
                      {source.title}
                    </h3>
                    
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                      {source.description}
                    </p>
                    
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                      <div className="flex items-center space-x-1">
                        <span>⭐</span>
                        <span>{source.rating > 0 ? source.rating.toFixed(1) : 'Chưa có'}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span>👁️</span>
                        <span>{source.views}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span>🛒</span>
                        <span>{source.purchases}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <img
                          src={source.seller.avatar || '/api/placeholder/24/24'}
                          alt={source.seller.fullName}
                          className="w-6 h-6 rounded-full"
                        />
                        <span className="text-sm text-gray-600 truncate">
                          {source.seller.fullName}
                        </span>
                      </div>
                      <Link
                        to={`/source/${source.sourceId}`}
                        className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-3 py-1 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 text-sm font-medium"
                      >
                        Chi tiết
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
            <button
              onClick={clearFilters}
              className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium"
            >
              🔄 Xem tất cả mã nguồn
            </button>
          </div>
        )}
      </div>
    </div>
  );
}