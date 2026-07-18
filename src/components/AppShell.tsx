import { useEffect, useState, type ReactNode } from 'react'
import { Bell, Compass, Home, LogOut, Menu, Plus, Search, UserRound, X } from 'lucide-react'
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { AuthModal } from '@/components/AuthModal'
import { ComposerModal } from '@/components/ComposerModal'

type Props = {
  children: ReactNode
  onRefresh: () => void
  authRequestKey: number
}

export function AppShell({ children, onRefresh, authRequestKey }: Props) {
  const { user, signOut, configured } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    if (authRequestKey > 0) setAuthOpen(true)
  }, [authRequestKey])

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    navigate(search.trim() ? `/?q=${encodeURIComponent(search.trim())}` : '/')
  }

  function openComposer() {
    if (!user) {
      setAuthOpen(true)
      return
    }
    setComposerOpen(true)
  }

  const navItems = [
    { to: '/', label: '首页', icon: Home },
    { to: '/explore', label: '发现', icon: Compass },
    { to: '/me', label: '我的', icon: UserRound },
  ]

  return (
    <div className="app">
      <header className="topbar">
        <button className="mobile-menu-button icon-button" onClick={() => setMobileMenuOpen(true)} aria-label="打开菜单">
          <Menu size={21} />
        </button>
        <NavLink className="brand" to="/">
          <span className="brand-mark">R</span>
          <strong>RBook</strong>
        </NavLink>
        <form className="search-box" onSubmit={submitSearch}>
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索笔记、用户和话题" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="清空"><X size={16} /></button>}
        </form>
        <div className="top-actions">
          <button className="icon-button" aria-label="通知"><Bell size={20} /></button>
          <button className="publish-button" onClick={openComposer}><Plus size={18} />发布</button>
          {user ? (
            <button className="avatar-button" onClick={() => navigate('/me')} aria-label="个人主页">
              {(user.user_metadata?.display_name || user.email || 'R').slice(0, 1).toUpperCase()}
            </button>
          ) : (
            <button className="login-button" onClick={() => setAuthOpen(true)}>登录</button>
          )}
        </div>
      </header>

      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <button className="mobile-close icon-button" onClick={() => setMobileMenuOpen(false)} aria-label="关闭菜单"><X size={20} /></button>
        <nav>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileMenuOpen(false)}>
              <Icon size={21} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <strong>{configured ? 'Supabase 已连接' : '演示模式'}</strong>
          <span>{configured ? '认证、数据与图片存储已启用' : '配置环境变量后切换真实数据'}</span>
        </div>
        {user && (
          <button className="signout-button" onClick={signOut}><LogOut size={18} />退出登录</button>
        )}
        <footer>
          <span>关于 RBook</span>
          <span>隐私</span>
          <span>社区规范</span>
          <small>© 2026 RBook</small>
        </footer>
      </aside>

      <main className="main-content">{children}</main>

      <nav className="mobile-tabbar">
        {navItems.slice(0, 2).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}><Icon size={21} /><span>{label}</span></NavLink>
        ))}
        <button className="mobile-publish" onClick={openComposer}><Plus size={24} /></button>
        <NavLink to="/me"><UserRound size={21} /><span>我的</span></NavLink>
      </nav>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      {user && (
        <ComposerModal
          open={composerOpen}
          userId={user.id}
          onClose={() => setComposerOpen(false)}
          onPublished={onRefresh}
        />
      )}
    </div>
  )
}
