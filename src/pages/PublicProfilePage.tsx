import { useEffect, useState } from 'react'
import { ArrowLeft, LoaderCircle, MapPin, UserPlus, UserRoundCheck, Users, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { NoteCard } from '@/components/NoteCard'
import { useAuth } from '@/context/AuthContext'
import { fetchConnections, fetchFollowState, fetchProfileByUsername, fetchProfileNotes, recordContentEvent, toggleFollow } from '@/services/social'
import type { Note, Profile, UserConnection } from '@/types'

type ConnectionKind = 'followers' | 'following'

export function PublicProfilePage({ onRequireAuth }: { onRequireAuth: () => void }) {
  const { username = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [connectionKind, setConnectionKind] = useState<ConnectionKind | null>(null)
  const [connections, setConnections] = useState<UserConnection[]>([])
  const [connectionsLoading, setConnectionsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchProfileByUsername(username).then(async (nextProfile) => {
      if (!nextProfile) throw new Error('用户不存在。')
      const [nextNotes, nextFollowing] = await Promise.all([
        fetchProfileNotes(nextProfile.id, user?.id),
        user ? fetchFollowState(user.id, nextProfile.id) : Promise.resolve(false),
      ])
      if (cancelled) return
      setProfile(nextProfile)
      setNotes(nextNotes)
      setFollowing(nextFollowing)
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '用户主页加载失败。')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [username, user?.id])

  async function handleFollow() {
    if (!user) return onRequireAuth()
    if (!profile || user.id === profile.id) return
    const previous = following
    setFollowing(!previous)
    setProfile((value) => value ? { ...value, follower_count: Math.max(0, value.follower_count + (previous ? -1 : 1)) } : value)
    try {
      await toggleFollow(user.id, profile.id, previous)
      if (!previous && notes[0]) await recordContentEvent(notes[0].id, 'follow_author')
    } catch (reason) {
      setFollowing(previous)
      setProfile((value) => value ? { ...value, follower_count: Math.max(0, value.follower_count + (previous ? 1 : -1)) } : value)
      setError(reason instanceof Error ? reason.message : '关注失败。')
    }
  }

  async function openConnections(kind: ConnectionKind) {
    if (!profile) return
    setConnectionKind(kind)
    setConnectionsLoading(true)
    try {
      setConnections(await fetchConnections(profile.id, kind))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '关系列表加载失败。')
    } finally {
      setConnectionsLoading(false)
    }
  }

  if (loading) return <div className="state-panel public-profile-state"><LoaderCircle className="spin" /><span>正在打开用户主页…</span></div>
  if (!profile) return <div className="state-panel error public-profile-state"><p>{error || '用户不存在。'}</p><button onClick={() => navigate(-1)}>返回</button></div>

  const isSelf = user?.id === profile.id

  return (
    <div className="public-profile-page">
      <button className="note-page-back" onClick={() => navigate(-1)}><ArrowLeft size={18} />返回</button>
      {error && <p className="page-message">{error}</p>}

      <section className="creator-hero">
        <div className="creator-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : profile.display_name.slice(0, 1)}</div>
        <div className="creator-copy">
          <h1>{profile.display_name}</h1>
          <p>@{profile.username}</p>
          <span>{profile.bio || '这个用户还没有填写个人简介。'}</span>
          {profile.location && <small><MapPin size={14} />{profile.location}</small>}
          <div className="creator-stats">
            <button onClick={() => void openConnections('following')}><strong>{profile.following_count}</strong><span>关注</span></button>
            <button onClick={() => void openConnections('followers')}><strong>{profile.follower_count}</strong><span>粉丝</span></button>
            <div><strong>{profile.note_count}</strong><span>笔记</span></div>
          </div>
        </div>
        {isSelf ? (
          <button className="secondary-button" onClick={() => navigate('/me')}>管理个人主页</button>
        ) : (
          <button className={following ? 'follow-button following creator-follow' : 'follow-button creator-follow'} onClick={() => void handleFollow()}>
            {following ? <UserRoundCheck size={17} /> : <UserPlus size={17} />}{following ? '已关注' : '关注'}
          </button>
        )}
      </section>

      <section className="creator-content-heading">
        <div><p>CREATOR NOTES</p><h2>公开笔记</h2></div>
        <span>{notes.length} 篇内容</span>
      </section>

      {notes.length ? (
        <section className="masonry-feed creator-feed">
          {notes.map((note) => <NoteCard key={note.id} note={note} userId={user?.id} onRequireAuth={onRequireAuth} onOpen={(selected) => navigate(`/note/${selected.id}`)} />)}
        </section>
      ) : (
        <div className="profile-content-empty"><Users size={32} /><h2>还没有公开笔记</h2><p>发布内容后会展示在这里。</p></div>
      )}

      {connectionKind && (
        <div className="modal-backdrop" onMouseDown={() => setConnectionKind(null)}>
          <section className="connection-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><Users size={18} /><strong>{connectionKind === 'followers' ? '粉丝' : '关注'}</strong></div><button className="icon-button" onClick={() => setConnectionKind(null)}><X size={18} /></button></header>
            {connectionsLoading ? (
              <div className="comments-state"><LoaderCircle className="spin" size={19} />加载中…</div>
            ) : connections.length ? (
              <div className="connection-list">
                {connections.map((item) => (
                  <button key={item.id} onClick={() => { setConnectionKind(null); navigate(`/user/${item.username}`) }}>
                    <span>{item.avatar_url ? <img src={item.avatar_url} alt="" /> : item.display_name.slice(0, 1)}</span>
                    <div><strong>{item.display_name}</strong><small>@{item.username}</small><p>{item.bio || '暂无简介'}</p></div>
                  </button>
                ))}
              </div>
            ) : <div className="comments-state">这里暂时没有用户。</div>}
          </section>
        </div>
      )}
    </div>
  )
}