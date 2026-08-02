import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { EyeOff, Heart, Lock, MoreHorizontal, Sparkles, UserX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Note } from '@/types'
import { toggleLike } from '@/services/notes'
import { prefetchNoteById, recordContentEvent } from '@/services/social'
import { optimizedImageSrcSet, optimizedImageUrl } from '@/utils/imageDelivery'

export type NoteDismissReason = 'not_interested' | 'hide_author'

type Props = {
  note: Note
  userId?: string
  onRequireAuth: () => void
  onOpen: (note: Note) => void
  trackImpression?: boolean
  onDismiss?: (note: Note, reason: NoteDismissReason) => void
  priority?: boolean
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

function mediaRatio(note: Note) {
  const media = note.media[0]
  const width = Number(media?.width ?? 0)
  const height = Number(media?.height ?? 0)
  if (!width || !height) return .75
  return width / height
}

export function NoteCard({ note, userId, onRequireAuth, onOpen, trackImpression = false, onDismiss, priority = false }: Props) {
  const navigate = useNavigate()
  const cardRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const prefetchTimerRef = useRef<number | null>(null)
  const isPrivate = note.visibility === 'private'
  const [liked, setLiked] = useState(Boolean(note.viewer_liked))
  const [likeCount, setLikeCount] = useState(note.like_count)
  const [menuOpen, setMenuOpen] = useState(false)
  const [coverRatio, setCoverRatio] = useState(() => mediaRatio(note))

  useEffect(() => {
    setLiked(Boolean(note.viewer_liked))
    setLikeCount(note.like_count)
  }, [note.viewer_liked, note.like_count])

  useEffect(() => {
    setCoverRatio(mediaRatio(note))
  }, [note.id, note.media])

  useEffect(() => {
    if (!menuOpen) return
    const closeMenu = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('pointerdown', closeMenu)
    return () => window.removeEventListener('pointerdown', closeMenu)
  }, [menuOpen])

  useEffect(() => () => {
    if (prefetchTimerRef.current !== null) window.clearTimeout(prefetchTimerRef.current)
  }, [])

  useEffect(() => {
    if (isPrivate || !trackImpression || !cardRef.current) return
    const key = `rbook-impression:${note.id}`
    if (sessionStorage.getItem(key)) return
    let timer: number | null = null
    const observer = new IntersectionObserver((entries) => {
      const visible = entries[0]?.intersectionRatio >= 0.5
      if (visible && timer === null) {
        timer = window.setTimeout(() => {
          sessionStorage.setItem(key, '1')
          void recordContentEvent(note.id, 'impression')
          observer.disconnect()
          timer = null
        }, 800)
      } else if (!visible && timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
    }, { threshold: [0, 0.5, 1] })
    observer.observe(cardRef.current)
    return () => {
      observer.disconnect()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [isPrivate, note.id, trackImpression])

  function schedulePrefetch() {
    if (isPrivate || prefetchTimerRef.current !== null) return
    prefetchTimerRef.current = window.setTimeout(() => {
      prefetchTimerRef.current = null
      prefetchNoteById(note.id, userId)
    }, 140)
  }

  function cancelPrefetch() {
    if (prefetchTimerRef.current === null) return
    window.clearTimeout(prefetchTimerRef.current)
    prefetchTimerRef.current = null
  }

  async function handleLike() {
    if (isPrivate) return
    if (!userId) return onRequireAuth()
    const previous = liked
    setLiked(!previous)
    setLikeCount((count) => Math.max(0, count + (previous ? -1 : 1)))
    try {
      await toggleLike(note.id, userId, previous)
      if (!previous) await recordContentEvent(note.id, 'like')
    } catch {
      setLiked(previous)
      setLikeCount((count) => Math.max(0, count + (previous ? 1 : -1)))
    }
  }

  function dismiss(reason: NoteDismissReason) {
    if (!userId) return onRequireAuth()
    setMenuOpen(false)
    onDismiss?.(note, reason)
  }

  const cover = note.cover_url ?? note.media[0]?.public_url
  const coverUrl = optimizedImageUrl(cover, priority ? 640 : 480, 72)
  const coverSrcSet = optimizedImageSrcSet(cover, [320, 480, 640], 72)
  const avatarUrl = optimizedImageUrl(note.author.avatar_url, 64, 72)
  const currentNote = { ...note, viewer_liked: liked, like_count: likeCount }
  const coverStyle = { '--card-ratio': String(coverRatio) } as CSSProperties

  return (
    <article
      ref={cardRef}
      className={isPrivate ? 'note-card private-note-card' : 'note-card'}
      onPointerEnter={schedulePrefetch}
      onPointerLeave={cancelPrefetch}
      onFocusCapture={schedulePrefetch}
    >
      <button className="cover-button" style={coverStyle} aria-label={`查看：${note.title}`} onClick={() => onOpen(currentNote)}>
        {coverUrl ? (
          <img
            src={coverUrl}
            srcSet={coverSrcSet}
            sizes="(max-width: 900px) calc(50vw - 14px), 240px"
            alt={note.title}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget
              if (naturalWidth > 0 && naturalHeight > 0) setCoverRatio(naturalWidth / naturalHeight)
            }}
          />
        ) : <div className="cover-placeholder" />}
        <span className="cover-gradient" />
        {isPrivate && <span className="private-cover-badge"><Lock size={12} />仅自己可见</span>}
        {!isPrivate && note.recommendation_reason && <span className="recommendation-reason"><Sparkles size={12} />{note.recommendation_reason}</span>}
      </button>
      <div className="note-body">
        <div className="note-title-row">
          <button className="note-title-button" onClick={() => onOpen(currentNote)}><h3>{note.title}</h3></button>
          {!isPrivate && onDismiss && (
            <div ref={menuRef} className="note-card-menu-wrap">
              <button className="note-card-menu-trigger" onClick={() => setMenuOpen((open) => !open)} aria-label="内容选项" aria-expanded={menuOpen}><MoreHorizontal size={17} /></button>
              {menuOpen && (
                <div className="note-card-menu">
                  <button onClick={() => dismiss('not_interested')}><EyeOff size={15} />不感兴趣</button>
                  <button onClick={() => dismiss('hide_author')}><UserX size={15} />减少该作者内容</button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="tag-line">
          {note.tags.slice(0, 2).map((tag) => isPrivate
            ? <span key={tag}>#{tag}</span>
            : <button key={tag} onClick={() => navigate(`/topic/${encodeURIComponent(tag)}`)}>#{tag}</button>)}
        </div>
        <footer className="note-footer">
          <button className="author-chip" onClick={() => navigate(`/user/${note.author.username}`)} aria-label={`查看 ${note.author.display_name} 的主页`}>
            {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" decoding="async" /> : <span>{note.author.display_name.slice(0, 1)}</span>}
            <em>{note.author.display_name}</em>
          </button>
          {isPrivate ? (
            <span className="private-card-note"><Lock size={13} />私密</span>
          ) : (
            <div className="card-actions">
              <button className={liked ? 'active' : ''} onClick={() => void handleLike()} aria-label={liked ? '取消点赞' : '点赞'}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /><span>{formatCount(likeCount)}</span></button>
            </div>
          )}
        </footer>
      </div>
    </article>
  )
}
