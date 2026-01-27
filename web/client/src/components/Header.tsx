import { Database, Layers, Shield, Sparkles, Github, ExternalLink } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-gray-200/50">
      {/* 顶部装饰条 */}
      <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600" />
      
      <div className="max-w-7xl mx-auto px-6">
        {/* 主导航 */}
        <div className="h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-300" />
              <div className="relative w-10 h-10 bg-gradient-to-br from-[#1e3a5f] to-[#2d5a87] rounded-xl flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">AI 模板解析器</h1>
              <p className="text-xs text-gray-500">模板自动化 · v3.0</p>
            </div>
          </div>

          {/* 导航链接 */}
          <nav className="hidden md:flex items-center gap-1">
            <NavItem icon={Database} label="变量检测" active />
            <NavItem icon={Layers} label="结构分析" />
            <NavItem icon={Shield} label="完整性检查" />
          </nav>

          {/* 右侧操作 */}
          <div className="flex items-center gap-3">
            <a 
              href="#" 
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
            >
              <Github className="w-4 h-4" />
              <span>GitHub</span>
            </a>
            <button className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#1e3a5f] to-[#2d5a87] text-white text-sm font-medium rounded-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300">
              <ExternalLink className="w-4 h-4" />
              文档
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function NavItem({ icon: Icon, label, active }: { icon: typeof Database; label: string; active?: boolean }) {
  return (
    <a
      href="#"
      className={`
        flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200
        ${active 
          ? 'text-[#1e3a5f] bg-blue-50' 
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }
      `}
    >
      <Icon className="w-4 h-4" />
      {label}
    </a>
  );
}
