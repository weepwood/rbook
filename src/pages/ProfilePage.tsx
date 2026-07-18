import { Bookmark, FileText, Heart, Settings } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export function ProfilePage({ onLogin }: { onLogin: () => void }) {
  const { user, configured } = useAuth()

  if (!user) {
    return (
      <div className="profile-empty">
        <div className="profile-orbit"><span>R</span></div>
        <h1>登录后建立你的内容空间</h1>
        <p>发布笔记、收藏经验、关注创作者，并在多个设备间同步。</p>
        <button className="primary-button" onClick={onLogin}>{configured ? '登录 / 注册' : '查看登录演示'}</button>
      </div>
    )
  }

  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'RBook 用户'

  return (
    <div className="profile-page">
      <section className="profile-hero">
        <div className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
        <div className="profile-copy">
          <h1>{displayName}</h1>
          <p>@{user.id.slice(0, 8)}</p>
          <span>正在形成自己的生活经验库。</span>
          <div className="profile-stats">
            <strong>0 <em>关注</em></strong>
            <strong>0 <em>粉丝</em></strong>
            <strong>0 <em>获赞与收藏</em></strong>
          </div>
        </div>
        <button className="secondary-button"><Settings size={17} />编辑资料</button>
      </section>
      <section className="profile-tabs">
        <button className="active"><FileText size={18} />笔记</button>
        <button><Bookmark size={18} />收藏</button>
        <button><Heart size={18} />赞过</button>
      </section>
      <div className="profile-content-empty">
        <FileText size={32} />
        <h2>发布第一篇笔记</h2>
        <p>把一个真实经验讲清楚，就可能帮助到另一个人。</p>
      </div>
    </div>
  )
}
