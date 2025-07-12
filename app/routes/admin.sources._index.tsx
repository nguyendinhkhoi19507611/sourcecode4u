import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Link, Form, useNavigation, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import { connectToDatabase } from "~/lib/db/connection";
import { SourceCode, User, Purchase } from "~/lib/db/models";
import { requireAdmin } from "~/lib/auth";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  await connectToDatabase();

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const search = url.searchParams.get("search") || "";
  const category = url.searchParams.get("category") || "";
  const status = url.searchParams.get("status") || "all";
  const sort = url.searchParams.get("sort") || "newest";
  const limit = 20;
  const skip = (page - 1) * limit;

  // Build query
  const query: any = {};
  
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { sourceId: { $regex: search, $options: "i" } }
    ];
  }
  
  if (category) {
    query.category = category;
  }

  if (status === "active") {
    query.isActive = true;
  } else if (status === "inactive") {
    query.isActive = false;
  }

  // Build sort options
  let sortOptions: any = {};
  switch (sort) {
    case "oldest":
      sortOptions = { createdAt: 1 };
      break;
    case "price-high":
      sortOptions = { price: -1 };
      break;
    case "price-low":
      sortOptions = { price: 1 };
      break;
    case "popular":
      sortOptions = { purchases: -1, views: -1 };
      break;
    case "rating":
      sortOptions = { rating: -1 };
      break;
    default:
      sortOptions = { createdAt: -1 };
  }

  const [sourceCodes, totalCount] = await Promise.all([
    SourceCode.find(query)
      .populate('seller', 'fullName email userId')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    SourceCode.countDocuments(query)
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  // Get summary stats
  const stats = await Promise.all([
    SourceCode.countDocuments({ isActive: true }),
    SourceCode.countDocuments({ isActive: false }),
    SourceCode.aggregate([
      { $group: { _id: null, totalViews: { $sum: "$views" }, totalSales: { $sum: "$purchases" } } }
    ]),
    SourceCode.find({}).distinct('category')
  ]);

  return json({
    sourceCodes,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    filters: { search, category, status, sort },
    stats: {
      activeSources: stats[0],
      inactiveSources: stats[1],
      totalViews: stats[2][0]?.totalViews || 0,
      totalSales: stats[2][0]?.totalSales || 0,
      categories: stats[3]
    }
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const formData = await request.formData();
  const action = formData.get("_action") as string;
  const sourceId = formData.get("sourceId") as string;
  const reason = formData.get("reason") as string;

  try {
    await connectToDatabase();

    switch (action) {
      case "toggle-status": {
        const sourceCode = await SourceCode.findOne({ sourceId });
        if (!sourceCode) {
          return json({ error: "Không tìm thấy mã nguồn" }, { status: 404 });
        }

        await SourceCode.findByIdAndUpdate(sourceCode._id, {
          isActive: !sourceCode.isActive
        });

        return json({ 
          success: true, 
          message: `${sourceCode.isActive ? 'Ẩn' : 'Hiển thị'} mã nguồn thành công!` 
        });
      }

      case "delete": {
        const sourceCode = await SourceCode.findOne({ sourceId });
        if (!sourceCode) {
          return json({ error: "Không tìm thấy mã nguồn" }, { status: 404 });
        }

        // Check if there are any purchases
        const purchaseCount = await Purchase.countDocuments({ 
          sourceCode: sourceCode._id 
        });

        if (purchaseCount > 0) {
          return json({ 
            error: "Không thể xóa mã nguồn đã có người mua" 
          }, { status: 400 });
        }

        await SourceCode.findByIdAndDelete(sourceCode._id);

        return json({ 
          success: true, 
          message: "Xóa mã nguồn thành công!" 
        });
      }

      case "bulk-action": {
        const sourceIds = formData.getAll("sourceIds") as string[];
        const bulkAction = formData.get("bulkAction") as string;

        if (sourceIds.length === 0) {
          return json({ error: "Vui lòng chọn ít nhất một mã nguồn" }, { status: 400 });
        }

        const sourceCodes = await SourceCode.find({ sourceId: { $in: sourceIds } });

        switch (bulkAction) {
          case "activate":
            await SourceCode.updateMany(
              { sourceId: { $in: sourceIds } },
              { isActive: true }
            );
            return json({ 
              success: true, 
              message: `Kích hoạt ${sourceIds.length} mã nguồn thành công!` 
            });

          case "deactivate":
            await SourceCode.updateMany(
              { sourceId: { $in: sourceIds } },
              { isActive: false }
            );
            return json({ 
              success: true, 
              message: `Ẩn ${sourceIds.length} mã nguồn thành công!` 
            });

          case "delete":
            // Check if any have purchases
            const sourceObjectIds = sourceCodes.map(s => s._id);
            const purchaseCount = await Purchase.countDocuments({ 
              sourceCode: { $in: sourceObjectIds } 
            });

            if (purchaseCount > 0) {
              return json({ 
                error: "Không thể xóa mã nguồn đã có người mua" 
              }, { status: 400 });
            }

            await SourceCode.deleteMany({ sourceId: { $in: sourceIds } });
            return json({ 
              success: true, 
              message: `Xóa ${sourceIds.length} mã nguồn thành công!` 
            });

          default:
            return json({ error: "Hành động không hợp lệ" }, { status: 400 });
        }
      }

      default:
        return json({ error: "Hành động không hợp lệ" }, { status: 400 });
    }
  } catch (error) {
    console.error("Admin source action error:", error);
    return json({ error: "Đã có lỗi xảy ra, vui lòng thử lại" }, { status: 500 });
  }
}

export default function AdminSources() {
  const { sourceCodes, pagination, filters, stats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const isSubmitting = navigation.state === "submitting";

  const updateSearchParams = (updates: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    newParams.delete('page');
    setSearchParams(newParams);
  };

  const toggleSourceSelection = (sourceId: string) => {
    const newSelected = new Set(selectedSources);
    if (newSelected.has(sourceId)) {
      newSelected.delete(sourceId);
    } else {
      newSelected.add(sourceId);
    }
    setSelectedSources(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  const selectAllSources = () => {
    if (selectedSources.size === sourceCodes.length) {
      setSelectedSources(new Set());
      setShowBulkActions(false);
    } else {
      setSelectedSources(new Set(sourceCodes.map(s => s.sourceId)));
      setShowBulkActions(true);
    }
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffDays = Math.floor((now.getTime() - past.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Hôm nay";
    if (diffDays === 1) return "Hôm qua";
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return past.toLocaleDateString('vi-VN');
  };

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
              <span className="text-gray-700">Quản lý mã nguồn</span>
            </div>
            
            <div className="flex space-x-2">
              <Link
                to="/dashboard/sell"
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                📤 Đăng mã nguồn
              </Link>
            </div>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Mã nguồn hoạt động</p>
                <p className="text-2xl font-bold text-green-600">{stats.activeSources}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600 text-2xl">✅</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Mã nguồn bị ẩn</p>
                <p className="text-2xl font-bold text-red-600">{stats.inactiveSources}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-red-600 text-2xl">❌</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng lượt xem</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalViews.toLocaleString('vi-VN')}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 text-2xl">👁️</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng lượt bán</p>
                <p className="text-2xl font-bold text-purple-600">{stats.totalSales.toLocaleString('vi-VN')}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-purple-600 text-2xl">🛒</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tìm kiếm
              </label>
              <input
                type="text"
                defaultValue={filters.search}
                onChange={(e) => updateSearchParams({ search: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="Tên, mô tả, mã..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Danh mục
              </label>
              <select
                defaultValue={filters.category}
                onChange={(e) => updateSearchParams({ category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="">Tất cả</option>
                {stats.categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trạng thái
              </label>
              <select
                defaultValue={filters.status}
                onChange={(e) => updateSearchParams({ status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">Tất cả</option>
                <option value="active">Hoạt động</option>
                <option value="inactive">Bị ẩn</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sắp xếp
              </label>
              <select
                defaultValue={filters.sort}
                onChange={(e) => updateSearchParams({ sort: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="popular">Phổ biến</option>
                <option value="rating">Đánh giá cao</option>
                <option value="price-high">Giá cao</option>
                <option value="price-low">Giá thấp</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => setSearchParams({})}
                className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
              >
                🔄 Reset
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {showBulkActions && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <Form method="post" className="flex items-center justify-between">
              <input type="hidden" name="_action" value="bulk-action" />
              {Array.from(selectedSources).map(sourceId => (
                <input key={sourceId} type="hidden" name="sourceIds" value={sourceId} />
              ))}
              
              <div className="flex items-center space-x-4">
                <span className="text-blue-800 font-medium">
                  Đã chọn {selectedSources.size} mã nguồn
                </span>
                <select
                  name="bulkAction"
                  className="px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="activate">Kích hoạt</option>
                  <option value="deactivate">Ẩn</option>
                  <option value="delete">Xóa</option>
                </select>
              </div>
              
              <div className="flex space-x-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Thực hiện
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSources(new Set());
                    setShowBulkActions(false);
                  }}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Hủy
                </button>
              </div>
            </Form>
          </div>
        )}

        {/* Sources Table */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedSources.size === sourceCodes.length && sourceCodes.length > 0}
                      onChange={selectAllSources}
                      className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mã nguồn
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Người bán
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Giá/Thống kê
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ngày đăng
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sourceCodes.map((source) => (
                  <tr key={source._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedSources.has(source.sourceId)}
                        onChange={() => toggleSourceSelection(source.sourceId)}
                        className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                      />
                    </td>
                    
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <img
                          src={source.thumbnail}
                          alt={source.title}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-medium text-gray-900 line-clamp-2">
                            {source.title}
                          </h3>
                          <p className="text-sm text-gray-500">ID: {source.sourceId}</p>
                          <p className="text-xs text-gray-400">{source.category}</p>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{source.seller.fullName}</div>
                      <div className="text-sm text-gray-500">{source.seller.email}</div>
                      <div className="text-sm text-gray-500">ID: {source.seller.userId}</div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {source.price.toLocaleString('vi-VN')} xu
                      </div>
                      <div className="text-sm text-gray-500">
                        👁️ {source.views} • 🛒 {source.purchases}
                      </div>
                      <div className="text-sm text-gray-500">
                        ⭐ {source.rating > 0 ? source.rating.toFixed(1) : 'N/A'} ({source.totalRatings})
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        source.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {source.isActive ? '✅ Hoạt động' : '❌ Bị ẩn'}
                      </span>
                      {source.isAdminPost && (
                        <div className="mt-1">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            🛡️ Official
                          </span>
                        </div>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatTimeAgo(source.createdAt)}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <Link
                          to={`/source/${source.sourceId}`}
                          className="text-blue-600 hover:text-blue-900"
                          title="Xem chi tiết"
                        >
                          👁️
                        </Link>
                        
                        <Form method="post" className="inline">
                          <input type="hidden" name="_action" value="toggle-status" />
                          <input type="hidden" name="sourceId" value={source.sourceId} />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`${source.isActive 
                              ? 'text-yellow-600 hover:text-yellow-900' 
                              : 'text-green-600 hover:text-green-900'
                            } disabled:opacity-50`}
                            title={source.isActive ? "Ẩn" : "Hiện"}
                          >
                            {source.isActive ? '👁️‍🗨️' : '✅'}
                          </button>
                        </Form>
                        
                        <Form method="post" className="inline">
                          <input type="hidden" name="_action" value="delete" />
                          <input type="hidden" name="sourceId" value={source.sourceId} />
                          <button
                            type="submit"
                            disabled={isSubmitting || source.purchases > 0}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={source.purchases > 0 ? "Không thể xóa - đã có người mua" : "Xóa"}
                            onClick={(e) => {
                              if (!confirm('Bạn có chắc chắn muốn xóa mã nguồn này?')) {
                                e.preventDefault();
                              }
                            }}
                          >
                            🗑️
                          </button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
              <div className="flex-1 flex justify-between sm:hidden">
                {pagination.hasPrev && (
                  <Link
                    to={`?${new URLSearchParams({
                      ...filters,
                      page: (pagination.currentPage - 1).toString()
                    })}`}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Trước
                  </Link>
                )}
                {pagination.hasNext && (
                  <Link
                    to={`?${new URLSearchParams({
                      ...filters,
                      page: (pagination.currentPage + 1).toString()
                    })}`}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Sau
                  </Link>
                )}
              </div>
              
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Hiển thị <span className="font-medium">{((pagination.currentPage - 1) * 20) + 1}</span> đến{' '}
                    <span className="font-medium">
                      {Math.min(pagination.currentPage * 20, pagination.totalCount)}
                    </span> trong tổng số{' '}
                    <span className="font-medium">{pagination.totalCount}</span> kết quả
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    {pagination.hasPrev && (
                      <Link
                        to={`?${new URLSearchParams({
                          ...filters,
                          page: (pagination.currentPage - 1).toString()
                        })}`}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                      >
                        ← Trước
                      </Link>
                    )}
                    
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      const page = pagination.currentPage <= 3 
                        ? i + 1 
                        : pagination.currentPage + i - 2;
                      if (page <= pagination.totalPages && page > 0) {
                        return (
                          <Link
                            key={page}
                            to={`?${new URLSearchParams({
                              ...filters,
                              page: page.toString()
                            })}`}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              page === pagination.currentPage
                                ? 'z-10 bg-teal-50 border-teal-500 text-teal-600'
                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </Link>
                        );
                      }
                      return null;
                    })}
                    
                    {pagination.hasNext && (
                      <Link
                        to={`?${new URLSearchParams({
                          ...filters,
                          page: (pagination.currentPage + 1).toString()
                        })}`}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                      >
                        Sau →
                      </Link>
                    )}
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Empty State */}
        {sourceCodes.length === 0 && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gradient-to-r from-teal-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-white text-4xl">💻</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Không tìm thấy mã nguồn nào
            </h3>
            <p className="text-gray-600 mb-6">
              Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm
            </p>
            <button
              onClick={() => setSearchParams({})}
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