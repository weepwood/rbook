import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, Flag, Heart, LoaderCircle, MapPin, Share2, UserPlus, UserRoundCheck } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { CommentSection } from '@/components/CommentSection'
import { NoteCard } from '@/components/NoteCard'
import { ReportDialog } from '@/components/ReportDialog'
import { useAuth } from '@/context/AuthContext'
import { normalizeContentSource, recordAttributedContentEvent } from '@/services/attribution'
import { toggleFavorite, toggleLike } from '@/services/notes'
import { fetchFollowState, fetchNoteById, fetchRelatedNotes, toggleFollow } from '@/services/social'
import type { Note } from '@/types'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value))
}

export function NotePage({ onRequireAuth }: { onRequireAuth: () => void }) {
  const { noteId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [note, setNote] = useState<Note | null>(null)
  const [related, setRelated] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)
  const [liked, setLiked] = useState(false)
  const [favorited, setFavorited] = useState(false)
  const [following, setFollowing] = useState(false)
  const [busyFollow, setBusyFollow] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const openedAt = useRef(Date.now())
  const source = normalizeContentSource((location.state as { source?: unknown } | null)?.source)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setNotice('')
    setImageIndex(0)
    Promise.all([
      fetchNoteById(noteId, user?.id),
      fetchRelatedNotes(noteId, user?.id, 10),
    ]).then(async ([nextNote, nextRelated]) => {
      if (cancelled) return
      if (!nextNote) throw new Error('这篇笔记不存在或暂不可见。')
      setNote(nextNote)
      setRelated(nextRelated)
      setLiked(Boolean(nextNote.viewer_liked))
      setFavorited(Boolean(nextNote.viewer_favorited))
      setLikeCount(nextNote.like_count)
      if (user && user.id !== nextNote.author_id) setFollowing(await fetchFollowState(user.id, nextNote.author_id))
      openedAt.current = Date.now()
      void recordAttributedContentEvent(noteId, 'open', source)
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '笔记加载失败。')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
      const dwell = Date.now() - openedAt.current
      if (dwell > 1500) void recordAttributedContentEvent(noteId, 'dwell', source, dwell)
    }
  }, [noteId, user?.id, source])

  const images = useMemo(() => {
    if (!note) return []
    const values = note.media.map((item) => item.public_url).filter(Boolean) as string[]
    if (!values.length && note.cover_url) values.push(note.cover_url)
    return Array.from(new Set(values))
  }, [note])

  async function handleLike() {
    if (!user) return onRequireAuth()
    if (!note) return
    const previous = liked
    setLiked(!previous)
    setLikeCount((value) => Math.max(0, value + (previous ? -1 : 1)))
    try {
      await toggleLike(note.id, user.id, previous)
      if (!previous) await recordAttributedContentEvent(note.id, 'like', source)
    } catch (reason) {
      setLiked(previous)
      setLikeCount((value) => Math.max(0, value + (previous ? 1 : -1)))
      setError(reason instanceof Error ? reason.message : '点赞失败。')
    }
  }

  async function handleFavorite() {
    if (!user) return onRequireAuth()
    if (!note) return
    const previous = favorited
    setFavorited(!previous)
    try {
      await toggleFavorite(note.id, user.id, previous)
      if (!previous) await recordAttributedContentEvent(note.id, 'favorite', source)
    } catch (reason) {
      setFavorited(previous)
      setError(reason instanceof Error ? reason.message : '收藏失败。')
    }
  }

  async function handleFollow() {
    if (!user) return onRequireAuth()
    if (!note || user.id === note.author_id || busyFollow) return
    setBusyFollow(true)
    const previous = following
    setFollowing(!previous)
    try {
      await toggleFollow(user.id, note.author_id, previous)
      if (!previous) await recordAttributedContentEvent(note.id, 'follow_author', source)
    } catch (reason) {
      setFollowing(previous)
      setError(reason instanceof Error ? reason.message : '关注失败。')
    } finally {
      setBusyFollow(false)
    }
  }

  async function share() {
    if (!note) return
    const url = window.location.href
    const canUseNativeShare = typeof navigator.share === 'function'
    try {
      if (canUseNativeShare) await navigator.share({ title: note.title, text: note.content.slice(0, 100), url })
      else await navigator.clipboard.writeText(url)
      await recordAttributedContentEvent(note.id, 'share', source)
      setNotice(canUseNativeShare ? '分享面板已打开。' : '链接已复制。')
    } catch {
      // 用户主动取消分享时无需提示错误。
    }
  }

  function openReport() {
    if (!user) return onRequireAuth()
    setReportOpen(true)
  }

  if (loading) return <div className="state-panel note-page-state"><LoaderCircle className="spin" /><span>正在打开笔记…</span></div>
  if (error && !note) return <div className="state-panel error note-page-state"><p>{error}</p><button onClick={() => navigate(-1)}>返回</button></div>
  if (!note) return null

  const activeImage = images[imageIndex]

  return (
    <div className="note-page">
      <button className="note-page-back" onClick={() => navigate(-1)}><ArrowLeft size={18} />返回</button>
      {error && <p className="page-message error">{error}</p>}
      {notice && <p className="page-message">{notice}</p>}

      <section className="note-page-shell">
        <div className="note-page-gallery">
          <div className="note-page-image-stage">
            {activeImage ? <img src={activeImage} alt={note.title} /> : <div className="cover-placeholder" />}
            {images.length > 1 && (
              <>
                <button className="gallery-arrow gallery-left" disabled={imageIndex === 0} onClick={() => setImageIndex((value) => value - 1)}><ChevronLeft /></button>
                <button className="gallery-arrow gallery-right" disabled={imageIndex === images.length - 1} onClick={() => setImageIndex((value) => value + 1)}><ChevronRight /></button>
                <span className="gallery-counter">{imageIndex + 1} / {images.length}</span>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="gallery-thumbnails">
              {images.map((image, index) => (
                <button key={image} className={imageIndex === index ? 'active' : ''} onClick={() => setImageIndex(index)}><img src={image} alt="" /></button>
              ))}
            </div>
          )}
        </div>

        <div className="note-page-body">
          <header className="note-author-header">
            <button className="note-author-profile" onClick={() => navigate(`/user/${note.author.username}`)}>
              {note.author.avatar_url ? <img src={note.author.avatar_url} alt="" /> : <span>{note.author.display_name.slice(0, 1)}</span>}
              <div><strong>{note.author.display_name}</strong><small>@{note.author.username}</small></div>
            </button>
            {user?.id !== note.author_id && (
              <button className={following ? 'follow-button following' : 'follow-button'} disabled={busyFollow} onClick={() => void handleFollow()}>
                {following ? <UserRoundCheck size={16} /> : <UserPlus size={16} />}{following ? '已关注' : '关注'}
              </button>
            )}
          </header>

          <article className="note-page-copy">
            <h1>{note.title}</h1>
            <p>{note.content}</p>
            <div className="detail-tags">{note.tags.map((tag) => <button key={tag} onClick={() => navigate(`/search?q=${encodeURIComponent(tag)}&type=note`)}>#{tag}</button>)}</div>
            <div className="detail-meta">
              <time>{formatDate(note.created_at)}</time>
              {note.location && <span><MapPin size={14} />{note.location}</span>}
              <span>{note.view_count ?? 0} 次浏览</span>
            </div>
          </article>

          <div className="note-page-actions">
            <button className={liked ? 'active' : ''} onClick={() => void handleLike()}><Heart size={21} fill={liked ? 'currentColor' : 'none'} />{likeCount}</button>
            <button className={favorited ? 'active' : ''} onClick={() => void handleFavorite()}><Bookmark size={21} fill={favorited ? 'currentColor' : 'none'} />{favorited ? '已收藏' : '收藏'}</button>
            <button onClick={() => void share()}><Share2 size={21} />分享</button>
            <button onClick={openReport}><Flag size={19} />举报</button>
          </div>

          <CommentSection noteId={note.id} userId={user?.id} onRequireAuth={onRequireAuth} onCountChange={(count) => setNote((value) => value ? { ...value, comment_count: count } : value)} />
        </div>
      </section>

      {related.length > 0 && (
        <section className="related-section">
          <header><div><p>MORE FOR YOU</p><h2>你可能还喜欢</h2></div><span>基于话题、作者与互动热度推荐</span></header>
          <div className="related-grid">
            {related.map((item) => (
              <NoteCard key={item.id} note={item} userId={user?.id} onRequireAuth={onRequireAuth} onOpen={(selected) => navigate(`/note/${selected.id}`, { state: { source: 'related' } })} />
            ))}
          </div>
        </section>
      )}

      {user && (
        <ReportDialog
          open={reportOpen}
          reporterId={user.id}
          noteId={note.id}
          snapshot={{ title: note.title, content: note.content.slice(0, 1000), author_id: note.author_id, author_username: note.author.username }}
          onClose={() => setReportOpen(false)}
          onSubmitted={() => setNotice('举报已提交，审核结果会通过通知中心反馈。')}
        />
      )}
    </div>
  )
}
