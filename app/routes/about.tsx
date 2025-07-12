import { Link } from "@remix-run/react";

export default function About() {
  const stats = [
    { number: "10,000+", label: "Mã nguồn chất lượng" },
    { number: "5,000+", label: "Developers tin tưởng" },
    { number: "50,000+", label: "Giao dịch thành công" },
    { number: "99.9%", label: "Độ tin cậy" }
  ];

  const features = [
    {
      icon: "🛡️",
      title: "An toàn tuyệt đối",
      description: "Mã nguồn được kiểm duyệt kỹ lưỡng, bảo vệ thông tin cá nhân 100%"
    },
    {
      icon: "⚡",
      title: "Giao dịch nhanh chóng",
      description: "Thanh toán và truy cập mã nguồn chỉ trong vài phút"
    },
    {
      icon: "💰",
      title: "Chi phí hợp lý",
      description: "Phí dịch vụ thấp, người bán nhận 80% giá trị giao dịch"
    },
    {
      icon: "🎯",
      title: "Chất lượng cao",
      description: "Mã nguồn được đánh giá và review bởi cộng đồng"
    },
    {
      icon: "🌍",
      title: "Cộng đồng lớn",
      description: "Kết nối với hàng nghìn developers tài năng"
    },
    {
      icon: "🔧",
      title: "Hỗ trợ 24/7",
      description: "Đội ngũ hỗ trợ kỹ thuật luôn sẵn sàng giúp đỡ"
    }
  ];

  const team = [
    {
      name: "Nguyễn Văn A",
      role: "Founder & CEO",
      avatar: "/api/placeholder/120/120",
      description: "10+ năm kinh nghiệm trong phát triển phần mềm"
    },
    {
      name: "Trần Thị B",
      role: "CTO",
      avatar: "/api/placeholder/120/120",
      description: "Chuyên gia về kiến trúc hệ thống và bảo mật"
    },
    {
      name: "Lê Văn C",
      role: "Head of Product",
      avatar: "/api/placeholder/120/120",
      description: "Chuyên gia UX/UI và quản lý sản phẩm"
    }
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
              <Link to="/browse" className="text-gray-700 hover:text-teal-600 font-medium">
                Duyệt mã nguồn
              </Link>
              <Link to="/about" className="text-teal-600 font-medium">
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
      <section className="bg-gradient-to-br from-teal-50 to-blue-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Về chúng tôi
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            SourceCode4U là nền tảng hàng đầu Việt Nam kết nối developers và khách hàng, 
            tạo ra một cộng đồng chia sẻ và mua bán mã nguồn chất lượng cao.
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                🎯 Sứ mệnh của chúng tôi
              </h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Chúng tôi tin rằng mỗi developer đều có những ý tưởng và kỹ năng độc đáo. 
                SourceCode4U được tạo ra để giúp họ kiếm tiền từ tài năng của mình, 
                đồng thời cung cấp cho khách hàng những giải pháp mã nguồn chất lượng cao.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Chúng tôi cam kết xây dựng một môi trường an toàn, minh bạch và công bằng 
                cho tất cả thành viên trong cộng đồng.
              </p>
            </div>
            <div className="relative">
              <img
                src="/api/placeholder/600/400"
                alt="Mission"
                className="rounded-xl shadow-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gradient-to-r from-teal-500 to-blue-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              📊 Con số ấn tượng
            </h2>
            <p className="text-blue-100">
              Những thành tựu mà chúng tôi đã đạt được
            </p>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl font-bold text-white mb-2">
                  {stat.number}
                </div>
                <div className="text-blue-100">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              ✨ Tại sao chọn SourceCode4U?
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Chúng tôi cung cấp những tính năng và dịch vụ tốt nhất 
              để đảm bảo trải nghiệm hoàn hảo cho mọi người dùng
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-gray-50 p-6 rounded-xl hover:bg-gray-100 transition-colors">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              👥 Đội ngũ của chúng tôi
            </h2>
            <p className="text-gray-600">
              Những con người tài năng đằng sau thành công của SourceCode4U
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {team.map((member, index) => (
              <div key={index} className="bg-white p-6 rounded-xl shadow-md text-center hover:shadow-lg transition-shadow">
                <img
                  src={member.avatar}
                  alt={member.name}
                  className="w-24 h-24 rounded-full mx-auto mb-4"
                />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {member.name}
                </h3>
                <p className="text-teal-600 font-medium mb-3">
                  {member.role}
                </p>
                <p className="text-gray-600 text-sm">
                  {member.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              💎 Giá trị cốt lõi
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                  <span className="text-teal-600 text-xl">🎯</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Chất lượng hàng đầu</h3>
                  <p className="text-gray-600">
                    Chúng tôi luôn đặt chất lượng lên hàng đầu trong mọi sản phẩm và dịch vụ.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 text-xl">🤝</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Minh bạch & Công bằng</h3>
                  <p className="text-gray-600">
                    Mọi giao dịch đều minh bạch, công bằng cho cả người mua và người bán.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-green-600 text-xl">🚀</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Đổi mới liên tục</h3>
                  <p className="text-gray-600">
                    Chúng tôi không ngừng cải tiến để mang đến trải nghiệm tốt nhất.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="text-purple-600 text-xl">❤️</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Tận tâm với khách hàng</h3>
                  <p className="text-gray-600">
                    Sự hài lòng của khách hàng là động lực để chúng tôi phát triển.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-20 bg-gradient-to-br from-teal-50 to-blue-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            📞 Liên hệ với chúng tôi
          </h2>
          <p className="text-gray-600 mb-8">
            Bạn có câu hỏi hoặc cần hỗ trợ? Chúng tôi luôn sẵn sàng lắng nghe!
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-md">
              <span className="text-3xl mb-4 block">📧</span>
              <h3 className="font-semibold text-gray-900 mb-2">Email</h3>
              <p className="text-gray-600">sourcecode4u.contact@gmail.com</p>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-md">
              <span className="text-3xl mb-4 block">⏰</span>
              <h3 className="font-semibold text-gray-900 mb-2">Thời gian hỗ trợ</h3>
              <p className="text-gray-600">24/7 - Mọi lúc, mọi nơi</p>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-md">
              <span className="text-3xl mb-4 block">💬</span>
              <h3 className="font-semibold text-gray-900 mb-2">Phản hồi</h3>
              <p className="text-gray-600">Trong vòng 24 giờ</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-8 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 font-medium"
            >
              🚀 Tham gia ngay
            </Link>
            <Link
              to="/browse"
              className="bg-white text-gray-700 px-8 py-3 rounded-lg hover:bg-gray-50 transition-all duration-200 font-medium border border-gray-300"
            >
              🔍 Khám phá mã nguồn
            </Link>
          </div>
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
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Liên kết</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link to="/browse" className="hover:text-white transition-colors">Duyệt mã nguồn</Link></li>
                <li><Link to="/register" className="hover:text-white transition-colors">Đăng ký bán hàng</Link></li>
                <li><Link to="/about" className="hover:text-white transition-colors">Giới thiệu</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Liên hệ</h3>
              <ul className="space-y-2 text-gray-400">
                <li>Email: sourcecode4u.contact@gmail.com</li>
                <li>Hỗ trợ: 24/7</li>
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