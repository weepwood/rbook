import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Bookmark, ChevronLeft, ChevronRight, Flag, Heart, LoaderCircle, MapPin, MessageCircle, Reply, Send, Trash2, X } from 'lucide-react'
import { addComment, deleteComment, fetchComments, reportContent, toggleFavorite, toggleLike } from '@/services/notes'
import type { CommentItem, Note } from '@/types'

type Props = {
  note: Note
  userId?: string
  onClose: () => void
  onRequireAuth: () => void
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function NoteDetailModal({ note, userId, onClose, onRequireAuth }: Props) {
  const images = useMemo(() => note.media.map((item) => item.public_url).filter(Boolean) as string[], [note.media])
  const [imageIndex, setImageIndex] = useState(0)
  const [liked, setLiked] = useState(Boolean(note.viewer_liked))
  const [favorited, setFavorited] = useState(Boolean(note.viewer_favorited))
  const [likeCount, setLikeCount] = useState(note.like_count)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  async function reloadComments() {
    setCommentsLoading(true)
    try {
      setComments(await fetchComments(note.id))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '评论加载失败。')
    } finally {
      setCommentsLoading(false)
    }
  }

  useEffect(() => {
    void reloadComments()
  }, [note.id])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') setImageIndex((index) => Math.max(0, index - 1))
      if (event.key === 'ArrowRight') setImageIndex((index) => Math.min(Math.max(images.length - 1, 0), index + 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [images.length, onClose])

  async function handleLike() {
    if (!userId) return onRequireAuth()
    const previous = liked
    setLiked(!previous)
    setLikeCount((count) => count + (previous ? -1 : 1))
    try {
      await toggleLike(note.id, userId, previous)
    } catch (error) {
      setLiked(previous)
      setLikeCount((count) => count + (previous ? 1 : -1))
      setMessage(error instanceof Error ? error.message : '点赞失败。')
    }
  }

  async function handleFavorite() {
    if (!userId) return onRequireAuth()
    const previous = favorited
    setFavorited(!previous)
    try {
      await toggleFavorite(note.id, userId, previous)
    } catch (error) {
      setFavorited(previous)
      setMessage(error instanceof Error ? error.message : '收藏失败。')
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault()
    if (!userId) return onRequireAuth()
    if (!commentText.trim()) return
    setSubmitting(true)
    setMessage('')
    try {
      await addComment({ noteId: note.id, authorId: userId, content: commentText, parentId: replyTo?.id })
      setCommentText('')
      setReplyTo(null)
      await reloadComments()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '评论发布失败。')
    } finally {
      setSubmitting(false)
    }
  }

  async function removeComment(comment: CommentItem) {
    if (!window.confirm('确认删除这条评论吗？')) return
    try {
      await deleteComment(comment.id)
      setComments((items) => items.filter((item) => item.id !== comment.id && item.parent_id !== comment.id))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '评论删除失败。')
    }
  }

  async function report(target: { noteId?: string; commentId?: string }) {
    if (!userId) return onRequireAuth()
    const reason = window.prompt('请简要说明举报原因（2—500 字）')?.trim()
    if (!reason) return
    try {
      await reportContent({ reporterId: userId, ...target, reason })
      setMessage('举报已提交，管理员会在后台处理。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '举报提交失败。')
    }
  }

  const parentAuthors = new Map(comments.map((comment) => [comment.id, comment.author.display_name]))
  const activeImage = images[imageIndex] ?? note.cover_url

  return (
    <div className="modal-backdrop note-detail-backdrop" onMouseDown={onClose}>
      <section className="note-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button note-detail-close" onClick={onClose} aria-label="关闭详情"><X size={21} /></button>

        <div className="note-detail-media">
          {activeImage ? <img src={activeImage} alt={note.title} /> : <div className="cover-placeholder" />}
          {images.length > 1 && (
            <>
              <button className="media-arrow media-arrow-left" disabled={imageIndex === 0} onClick={() => setImageIndex((index) => index - 1)}><ChevronLeft /></button>
              <button className="media-arrow media-arrow-right" disabled={imageIndex === images.length - 1} onClick={() => setImageIndex((index) => index + 1)}><ChevronRight /></button>
              <span className="media-counter">{imageIndex + 1} / {images.length}</span>
            </>
          )}
        </div>

        <div className="note-detail-content">
          <header className="detail-author-row">
            <div className="detail-author">
              {note.author.avatar_url ? <img src={note.author.avatar_url} alt="" /> : <span>{note.author.display_name.slice(0, 1)}</span>}
              <div><strong>{note.author.display_name}</strong><small>@{note.author.username}</small></div>
            </div>
            <button className="ghost-button" onClick={() => void report({ noteId: note.id })}><Flag size={15} />举报</button>
          </header>

          <article className="detail-copy">
            <h1>{note.title}</h1>
            <p>{note.content}</p>
            <div className="detail-tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
            <div className="detail-meta">
              <time>{formatDate(note.created_at)}</time>
              {note.location && <span><MapPin size={14} />{note.location}</span>}
            </div>
          </article>

          <div className="detail-actions">
            <button className={liked ? 'active' : ''} onClick={handleLike}><Heart size={20} fill={liked ? 'currentColor' : 'none'} />{likeCount}</button>
            <button onClick={() => document.getElementById('comment-input')?.focus()}><MessageCircle size={20} />{comments.length}</button>
            <button className={favorited ? 'active' : ''} onClick={handleFavorite}><Bookmark size={20} fill={favorited ? 'currentColor' : 'none'} />{favorited ? '已收藏' : '收藏'}</button>
          </div>

          <section className="comments-section">
            <div className="comments-title"><strong>评论</strong><span>{comments.length} 条</span></div>
            {commentsLoading ? (
              <div className="comments-state"><LoaderCircle className="spin" size={20} />加载评论…</div>
            ) : comments.length === 0 ? (
              <div className="comments-state">还没有评论，来留下第一条讨论。</div>
            ) : (
              <div className="comment-list">
                {comments.map((comment) => (
                  <article key={comment.id} className={comment.parent_id ? 'comment-item comment-reply' : 'comment-item'}>
                    {comment.author.avatar_url ? <img src={comment.author.avatar_url} alt="" /> : <span className="comment-avatar">{comment.author.display_name.slice(0, 1)}</span>}
                    <div className="comment-main">
                      <div className="comment-head"><strong>{comment.author.display_name}</strong><time>{formatDate(comment.created_at)}</time></div>
                      <p>{comment.parent_id && <em>回复 @{parentAuthors.get(comment.parent_id) ?? '用户'}：</em>}{comment.content}</p>
                      <div className="comment-actions">
                        <button onClick={() => setReplyTo(comment)}><Reply size={13} />回复</button>
                        <button onClick={() => void report({ commentId: comment.id })}><Flag size={13} />举报</button>
                        {comment.author_id === userId && <button onClick={() => void removeComment(comment)}><Trash2 size={13} />删除</button>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <form className="comment-composer" onSubmit={submitComment}>
            {replyTo && <div className="replying-banner">回复 @{replyTo.author.display_name}<button type="button" onClick={() => setReplyTo(null)}><X size={14} /></button></div>}
            <div className="comment-input-row">
              <textarea id="comment-input" value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={1000} placeholder={userId ? '分享你的看法…' : '登录后参与评论'} />
              <button className="primary-button" disabled={submitting || !commentText.trim()}>{submitting ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button>
            </div>
            {message && <p className="form-message">{message}</p>}
          </form>
        </div>
      </section>
    </div>
  )
}
