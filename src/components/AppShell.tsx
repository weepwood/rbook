import { useEffect, useState, type ReactNode } from 'react'
import { Bell, Compass, Home, LogOut, Menu, Plus, Search, ShieldCheck, UserRound, X } from 'lucide-react'
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useAccessTracking } from '@/hooks/useAccessTracking'
import { AuthModal } from '@/components/AuthModal'
import { ComposerModal } from '@/components/ComposerModal'
import { NotificationPanel } from '@/components/NotificationPanel'
import { fetchUnreadNotificationCount, subscribeToNotifications } from '@/services/notifications'

type Props = {
  children: ReactNode
  onRefresh: () => void
  authRequestKey: number
}

export function AppShell({ children, onRefresh, authRequestKey }: Props) {
  const { user, profile, signOut, configured, isAdmin, accountState } = useAuth()
  const userId = user?.id
  const [authOpen, setAuthOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationRefreshKey, setNotificationRefreshKey] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  useAccessTracking()

  useEffect(() => {
    setSearch(searchParams.get('q') ?? '')
  }, [searchParams])

  useEffect(() => {
    if (authRequestKey > 0) setAuthOpen(true)
  }, [authRequestKey])

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0)
      return
    }

    const refreshUnread = () => {
      void fetchUnreadNotificationCount(userId).then(setUnreadCount).catch(() => undefined)
    }
    const handleRealtimeChange = () => {
      refreshUnread()
      setNotificationRefreshKey((value) => value + 1)
    }

    refreshUnread()
    return subscribeToNotifications(userId, handleRealtimeChange)
  }, [userId])

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    const query = search.trim()
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  function openComposer() {
    if (!user) {
      setAuthOpen(true)
      return
    }
    setComposerOpen(true)
  }

  function openNotifications() {
    if (!user) {
      setAuthOpen(true)
      return
    }
    setNotificationOpen((open) => !open)
  }

  const navItems = [
    { to: '/', label: '首页', icon: Home },
    { to: '/explore', label: '发现', icon: Compass },
    { to: '/me', label: '我的', icon: UserRound },
    ...(isAdmin ? [{ to: '/admin', label: '管理后台', icon: ShieldCheck }] : []),
  ]

  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.email || 'R'

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
          <button className={`icon-button notification-trigger ${notificationOpen ? 'active' : ''}`} aria-label={`通知${unreadCount ? `，${unreadCount} 条未读` : ''}`} onClick={openNotifications}>
            <Bell size={20} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          <button className="publish-button" onClick={openComposer}><Plus size={18} />发布</button>
          {user ? (
            <button className="avatar-button" onClick={() => navigate('/me')} aria-label="个人主页">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : displayName.slice(0, 1).toUpperCase()}
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
        {accountState === 'disabled' && <div className="account-disabled-note"><strong>账号已停用</strong><span>当前账号不能发布、评论或互动，请联系管理员。</span></div>}
        <div className="sidebar-note">
          <strong>{configured ? 'Supabase 已连接' : '演示模式'}</strong>
          <span>{configured ? '认证、社区互动、日志与图片存储已启用' : '配置环境变量后切换真实数据'}</span>
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
        <NotificationPanel
          open={notificationOpen}
          userId={user.id}
          refreshKey={notificationRefreshKey}
          onClose={() => setNotificationOpen(false)}
          onUnreadChange={setUnreadCount}
        />
      )}
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
