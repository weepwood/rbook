import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, ChevronLeft, ChevronRight, Flag, Heart, LoaderCircle, Lock, MapPin, Share2, UserPlus, UserRoundCheck, X } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { CommentSection } from '@/components/CommentSection'
import { ReportDialog } from '@/components/ReportDialog'
import { useAuth } from '@/context/AuthContext'
import { normalizeContentSource, recordAttributedContentEvent } from '@/services/attribution'
import { toggleFavorite, toggleLike } from '@/services/notes'
import { fetchFollowState, fetchNoteById, toggleFollow } from '@/services/social'
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
  const trackPublicNote = useRef(false)
  const source = normalizeContentSource((location.state as { source?: unknown } | null)?.source)

  const closeDetail = useCallback(() => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/', { replace: true })
  }, [navigate])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setNotice('')
    setImageIndex(0)
    trackPublicNote.current = false

    fetchNoteById(noteId, user?.id).then(async (nextNote) => {
      if (!nextNote) throw new Error('这篇笔记不存在、已被隐藏，或你没有访问权限。')
      if (cancelled) return

      setNote(nextNote)
      setLiked(Boolean(nextNote.viewer_liked))
      setFavorited(Boolean(nextNote.viewer_favorited))
      setLikeCount(nextNote.like_count)
      trackPublicNote.current = nextNote.visibility === 'public'

      if (nextNote.visibility === 'public') {
        if (user && user.id !== nextNote.author_id) {
          const nextFollowing = await fetchFollowState(user.id, nextNote.author_id)
          if (!cancelled) setFollowing(nextFollowing)
        }
        openedAt.current = Date.now()
        void recordAttributedContentEvent(noteId, 'open', source)
      } else {
        setFollowing(false)
      }
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '笔记加载失败。')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
      const dwell = Date.now() - openedAt.current
      if (trackPublicNote.current && dwell > 1500) void recordAttributedContentEvent(noteId, 'dwell', source, dwell)
    }
  }, [noteId, user?.id, source])

  const images = useMemo(() => {
    if (!note) return []
    const values = note.media.map((item) => item.public_url).filter(Boolean) as string[]
    if (!values.length && note.cover_url) values.push(note.cover_url)
    return Array.from(new Set(values))
  }, [note])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDetail()
      } else if (event.key === 'ArrowLeft' && imageIndex > 0) {
        setImageIndex((value) => value - 1)
      } else if (event.key === 'ArrowRight' && imageIndex < images.length - 1) {
        setImageIndex((value) => value + 1)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [closeDetail, imageIndex, images.length])

  async function handleLike() {
    if (!user) return onRequireAuth()
    if (!note || note.visibility === 'private') return
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
    if (!note || note.visibility === 'private') return
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
    if (!note || note.visibility === 'private' || user.id === note.author_id || busyFollow) return
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
    if (!note || note.visibility === 'private') return
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
    if (note?.visibility === 'private') return
    setReportOpen(true)
  }

  if (loading) {
    return <div className="state-panel note-page-state-overlay"><LoaderCircle className="spin" /><span>正在打开笔记…</span></div>
  }

  if (error && !note) {
    return <div className="state-panel error note-page-state-overlay"><p>{error}</p><button onClick={closeDetail}>返回首页</button></div>
  }

  if (!note) return null

  const activeImage = images[imageIndex]
  const isPrivate = note.visibility === 'private'

  return (
    <div className={isPrivate ? 'note-page private-note-page' : 'note-page'} onMouseDown={closeDetail}>
      <button className="note-page-back" onClick={closeDetail} aria-label="关闭笔记详情"><X size={20} /><span>关闭</span></button>
      {error && <p className="page-message error note-page-toast">{error}</p>}
      {notice && <p className="page-message note-page-toast">{notice}</p>}

      <section className="note-page-shell" onMouseDown={(event) => event.stopPropagation()}>
        <div className="note-page-gallery">
          <div className="note-page-image-stage">
            {activeImage ? <img src={activeImage} alt={note.title} decoding="async" /> : <div className="cover-placeholder" />}
            {isPrivate && <span className="private-gallery-badge"><Lock size={14} />私密图片</span>}
            {images.length > 1 && (
              <>
                <button className="gallery-arrow gallery-left" disabled={imageIndex === 0} onClick={() => setImageIndex((value) => value - 1)} aria-label="上一张"><ChevronLeft /></button>
                <button className="gallery-arrow gallery-right" disabled={imageIndex === images.length - 1} onClick={() => setImageIndex((value) => value + 1)} aria-label="下一张"><ChevronRight /></button>
                <span className="gallery-counter">{imageIndex + 1} / {images.length}</span>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="gallery-thumbnails">
              {images.map((image, index) => (
                <button key={image} className={imageIndex === index ? 'active' : ''} onClick={() => setImageIndex(index)} aria-label={`查看第 ${index + 1} 张图片`}><img src={image} alt="" loading="lazy" decoding="async" /></button>
              ))}
            </div>
          )}
        </div>

        <div className="note-page-body">
          <div className="note-page-scroll">
            <header className="note-author-header">
              <button className="note-author-profile" onClick={() => navigate(`/user/${note.author.username}`)}>
                {note.author.avatar_url ? <img src={note.author.avatar_url} alt="" decoding="async" /> : <span>{note.author.display_name.slice(0, 1)}</span>}
                <div><strong>{note.author.display_name}</strong><small>@{note.author.username}</small></div>
              </button>
              {!isPrivate && user?.id !== note.author_id && (
                <button className={following ? 'follow-button following' : 'follow-button'} disabled={busyFollow} onClick={() => void handleFollow()}>
                  {following ? <UserRoundCheck size={16} /> : <UserPlus size={16} />}{following ? '已关注' : '关注'}
                </button>
              )}
            </header>

            <article className="note-page-copy">
              {isPrivate && <span className="private-title-badge"><Lock size={14} />仅自己可见</span>}
              <h1>{note.title}</h1>
              <p>{note.content}</p>
              <div className="detail-tags">
                {note.tags.map((tag) => (
                  <button key={tag} disabled={isPrivate} onClick={() => navigate(`/topic/${encodeURIComponent(tag)}`)}>#{tag}</button>
                ))}
              </div>
              <div className="detail-meta">
                <time>{formatDate(note.created_at)}</time>
                {note.location && <span><MapPin size={14} />{note.location}</span>}
                {!isPrivate && <span>{note.view_count ?? 0} 次浏览</span>}
              </div>
            </article>

            {isPrivate ? (
              <div className="private-note-notice">
                <Lock size={20} />
                <div><strong>这是一篇私密笔记</strong><span>只有当前账号可以读取正文和图片，不会进入推荐、搜索、公开主页或社交互动。</span></div>
              </div>
            ) : (
              <CommentSection noteId={note.id} userId={user?.id} onRequireAuth={onRequireAuth} onCountChange={(count) => setNote((value) => value ? { ...value, comment_count: count } : value)} />
            )}
          </div>

          {!isPrivate && (
            <div className="note-page-actions">
              <button className={liked ? 'active' : ''} onClick={() => void handleLike()}><Heart size={20} fill={liked ? 'currentColor' : 'none'} />{likeCount}</button>
              <button className={favorited ? 'active' : ''} onClick={() => void handleFavorite()}><Bookmark size={20} fill={favorited ? 'currentColor' : 'none'} />{favorited ? '已收藏' : '收藏'}</button>
              <button onClick={() => void share()}><Share2 size={20} />分享</button>
              <button onClick={openReport}><Flag size={18} />举报</button>
            </div>
          )}
        </div>
      </section>

      {user && !isPrivate && (
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
