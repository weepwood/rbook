import { useState } from 'react'
import { Bookmark, Heart, MessageCircle, Sparkles } from 'lucide-react'
import type { Note } from '@/types'
import { toggleFavorite, toggleLike } from '@/services/notes'
import { recordContentEvent } from '@/services/social'

type Props = {
  note: Note
  userId?: string
  onRequireAuth: () => void
  onOpen: (note: Note) => void
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

export function NoteCard({ note, userId, onRequireAuth, onOpen }: Props) {
  const [liked, setLiked] = useState(Boolean(note.viewer_liked))
  const [favorited, setFavorited] = useState(Boolean(note.viewer_favorited))
  const [likeCount, setLikeCount] = useState(note.like_count)

  async function handleLike() {
    if (!userId) return onRequireAuth()
    const previous = liked
    setLiked(!previous)
    setLikeCount((count) => count + (previous ? -1 : 1))
    try {
      await toggleLike(note.id, userId, previous)
      if (!previous) await recordContentEvent(note.id, 'like')
    } catch {
      setLiked(previous)
      setLikeCount((count) => count + (previous ? 1 : -1))
    }
  }

  async function handleFavorite() {
    if (!userId) return onRequireAuth()
    const previous = favorited
    setFavorited(!previous)
    try {
      await toggleFavorite(note.id, userId, previous)
      if (!previous) await recordContentEvent(note.id, 'favorite')
    } catch {
      setFavorited(previous)
    }
  }

  const cover = note.cover_url ?? note.media[0]?.public_url
  const currentNote = { ...note, viewer_liked: liked, viewer_favorited: favorited, like_count: likeCount }

  return (
    <article className="note-card">
      <button className="cover-button" aria-label={`查看：${note.title}`} onClick={() => onOpen(currentNote)}>
        {cover ? <img src={cover} alt={note.title} loading="lazy" /> : <div className="cover-placeholder" />}
        <span className="cover-gradient" />
        {note.recommendation_reason && <span className="recommendation-reason"><Sparkles size={12} />{note.recommendation_reason}</span>}
      </button>
      <div className="note-body">
        <button className="note-title-button" onClick={() => onOpen(currentNote)}><h3>{note.title}</h3></button>
        <div className="tag-line">{note.tags.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}</div>
        <footer className="note-footer">
          <button className="author-chip" onClick={() => onOpen(currentNote)}>
            {note.author.avatar_url ? <img src={note.author.avatar_url} alt="" /> : <span>{note.author.display_name.slice(0, 1)}</span>}
            <em>{note.author.display_name}</em>
          </button>
          <div className="card-actions">
            <button className={liked ? 'active' : ''} onClick={handleLike} aria-label="点赞"><Heart size={17} fill={liked ? 'currentColor' : 'none'} /><span>{formatCount(likeCount)}</span></button>
            <button aria-label="评论" onClick={() => onOpen(currentNote)}><MessageCircle size={17} /><span>{formatCount(note.comment_count)}</span></button>
            <button className={favorited ? 'active' : ''} onClick={handleFavorite} aria-label="收藏"><Bookmark size={17} fill={favorited ? 'currentColor' : 'none'} /></button>
          </div>
        </footer>
      </div>
    </article>
  )
}