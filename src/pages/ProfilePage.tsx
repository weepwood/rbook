import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bookmark, Camera, FileText, Heart, LoaderCircle, MapPin, MessageCircle, Save, Settings, ShieldCheck, UserRound, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { NoteCard } from '@/components/NoteCard'
import { useAuth } from '@/context/AuthContext'
import { fetchUserCollection, updateProfile } from '@/services/notes'
import { fetchUserCommentedNotes, uploadAvatar } from '@/services/social'
import type { Note } from '@/types'

type Tab = 'notes' | 'favorites' | 'liked' | 'comments'

const tabs: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: 'notes', label: '笔记', icon: FileText },
  { id: 'favorites', label: '收藏', icon: Bookmark },
  { id: 'liked', label: '赞过', icon: Heart },
  { id: 'comments', label: '评论过', icon: MessageCircle },
]

export function ProfilePage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate()
  const { user, profile, accessLevel, configured, refreshProfile } = useAuth()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<Tab>('notes')
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ display_name: '', username: '', bio: '', location: '' })

  useEffect(() => {
    if (!profile) return
    setForm({ display_name: profile.display_name, username: profile.username, bio: profile.bio ?? '', location: profile.location ?? '' })
  }, [profile])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    setMessage('')
    const request = activeTab === 'comments'
      ? fetchUserCommentedNotes(user.id, user.id)
      : fetchUserCollection(user.id, activeTab)
    request.then((data) => {
      if (!cancelled) setNotes(data)
    }).catch((error) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : '内容加载失败。')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [user, activeTab])

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

  const userId = user.id
  const displayName = profile?.display_name || user.user_metadata?.display_name || user.email?.split('@')[0] || 'RBook 用户'

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await updateProfile(userId, {
        display_name: form.display_name.trim(),
        username: form.username.trim().toLowerCase(),
        bio: form.bio.trim(),
        location: form.location.trim() || null,
      })
      await refreshProfile()
      setEditing(false)
      setMessage('资料已保存。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '资料保存失败。')
    } finally {
      setSaving(false)
    }
  }

  async function changeAvatar(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) return setMessage('请选择图片文件。')
    if (file.size > 5 * 1024 * 1024) return setMessage('头像图片不能超过 5MB。')
    setAvatarBusy(true)
    setMessage('')
    try {
      await uploadAvatar(userId, file)
      await refreshProfile()
      setMessage('头像已更新。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '头像上传失败。')
    } finally {
      setAvatarBusy(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const emptyTitle = activeTab === 'notes' ? '发布第一篇笔记' : activeTab === 'favorites' ? '还没有收藏' : activeTab === 'liked' ? '还没有赞过的笔记' : '还没有参与评论'
  const EmptyIcon = activeTab === 'notes' ? FileText : activeTab === 'favorites' ? Bookmark : activeTab === 'liked' ? Heart : MessageCircle

  return (
    <div className="profile-page">
      <section className="profile-hero">
        <button className="profile-avatar profile-avatar-edit" onClick={() => avatarInputRef.current?.click()} disabled={avatarBusy} aria-label="更换头像">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : displayName.slice(0, 1).toUpperCase()}
          <span className="avatar-edit-mask">{avatarBusy ? <LoaderCircle className="spin" size={18} /> : <Camera size={18} />}</span>
        </button>
        <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(event) => void changeAvatar(event.target.files?.[0])} />
        <div className="profile-copy">
          <div className="profile-name-line">
            <h1>{displayName}</h1>
            {accessLevel !== 'member' && <span className="role-badge"><ShieldCheck size={14} />{accessLevel === 'administrator' ? '管理员' : '审核员'}</span>}
          </div>
          <p>@{profile?.username ?? userId.slice(0, 8)}</p>
          <span>{profile?.bio || '正在形成自己的生活经验库。'}</span>
          {profile?.location && <small className="profile-location"><MapPin size={14} />{profile.location}</small>}
          <div className="profile-stats">
            <strong>{profile?.following_count ?? 0} <em>关注</em></strong>
            <strong>{profile?.follower_count ?? 0} <em>粉丝</em></strong>
            <strong>{profile?.note_count ?? 0} <em>公开笔记</em></strong>
          </div>
        </div>
        <div className="profile-hero-actions">
          {profile?.username && <button className="secondary-button" onClick={() => navigate(`/user/${profile.username}`)}><UserRound size={17} />预览主页</button>}
          <button className="secondary-button" onClick={() => setEditing(true)}><Settings size={17} />编辑资料</button>
        </div>
      </section>

      <section className="profile-tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}><Icon size={18} />{label}</button>
        ))}
      </section>

      {message && <p className="page-message">{message}</p>}
      {loading ? (
        <div className="state-panel"><LoaderCircle className="spin" /><span>正在加载内容…</span></div>
      ) : notes.length ? (
        <section className="masonry-feed profile-feed">
          {notes.map((note) => <NoteCard key={note.id} note={note} userId={userId} onRequireAuth={onLogin} onOpen={(selected) => navigate(`/note/${selected.id}`)} />)}
        </section>
      ) : (
        <div className="profile-content-empty"><EmptyIcon size={32} /><h2>{emptyTitle}</h2><p>{activeTab === 'notes' ? '把一个真实经验讲清楚，就可能帮助到另一个人。' : '在社区产生互动后，可随时回到这里查看。'}</p></div>
      )}

      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(false)}>
          <section className="profile-edit-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="icon-button modal-close" onClick={() => setEditing(false)}><X size={19} /></button>
            <h2>编辑个人资料</h2>
            <form className="profile-edit-form" onSubmit={saveProfile}>
              <label>昵称<input value={form.display_name} minLength={2} maxLength={40} required onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label>
              <label>用户名<input value={form.username} pattern="[a-z0-9_]{3,24}" required onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
              <label>简介<textarea value={form.bio} maxLength={300} rows={4} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
              <label>所在地<input value={form.location} maxLength={80} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
              <button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{saving ? '保存中…' : '保存资料'}</button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
