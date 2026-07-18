import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, Edit3, Flag, Heart, LoaderCircle, MessageCircle, Reply, Send, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { addComment, deleteComment, reportContent } from '@/services/notes'
import { fetchCommentThreads, recordContentEvent, toggleCommentLike, updateComment, type CommentSort } from '@/services/social'
import type { CommentItem, CommentThread } from '@/types'

type Props = {
  noteId: string
  userId?: string
  onRequireAuth: () => void
  onCountChange?: (count: number) => void
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function CommentSection({ noteId, userId, onRequireAuth, onCountChange }: Props) {
  const navigate = useNavigate()
  const [threads, setThreads] = useState<CommentThread[]>([])
  const [sort, setSort] = useState<CommentSort>('hot')
  const [loading, setLoading] = useState(true)
  const [visibleRoots, setVisibleRoots] = useState(10)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null)
  const [editing, setEditing] = useState<CommentItem | null>(null)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const totalCount = useMemo(() => threads.reduce((sum, thread) => sum + 1 + thread.replies.length, 0), [threads])

  async function reload() {
    setLoading(true)
    setMessage('')
    try {
      const next = await fetchCommentThreads(noteId, userId, sort)
      setThreads(next)
      onCountChange?.(next.reduce((sum, thread) => sum + 1 + thread.replies.length, 0))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '评论加载失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [noteId, userId, sort])

  function beginReply(comment: CommentItem) {
    if (!userId) return onRequireAuth()
    setEditing(null)
    setReplyTo(comment)
    setContent('')
    document.getElementById('thread-comment-input')?.focus()
  }

  function beginEdit(comment: CommentItem) {
    setReplyTo(null)
    setEditing(comment)
    setContent(comment.content)
    document.getElementById('thread-comment-input')?.focus()
  }

  function resetComposer() {
    setReplyTo(null)
    setEditing(null)
    setContent('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!userId) return onRequireAuth()
    if (!content.trim()) return
    setSubmitting(true)
    setMessage('')
    try {
      if (editing) {
        await updateComment(editing.id, content)
      } else {
        await addComment({ noteId, authorId: userId, content, parentId: replyTo?.id })
        await recordContentEvent(noteId, 'comment')
      }
      resetComposer()
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '评论提交失败。')
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(comment: CommentItem) {
    if (!window.confirm('确认删除这条评论吗？')) return
    try {
      await deleteComment(comment.id)
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '评论删除失败。')
    }
  }

  async function toggleLike(comment: CommentItem) {
    if (!userId) return onRequireAuth()
    const active = Boolean(comment.viewer_liked)
    setThreads((items) => items.map((thread) => {
      const update = (item: CommentItem) => item.id === comment.id
        ? { ...item, viewer_liked: !active, like_count: Math.max(0, item.like_count + (active ? -1 : 1)) }
        : item
      return { ...update(thread), replies: thread.replies.map(update) } as CommentThread
    }))
    try {
      await toggleCommentLike(comment.id, userId, active)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '评论点赞失败。')
      await reload()
    }
  }

  async function report(comment: CommentItem) {
    if (!userId) return onRequireAuth()
    const reason = window.prompt('请简要说明举报原因（2—500 字）')?.trim()
    if (!reason) return
    try {
      await reportContent({ reporterId: userId, commentId: comment.id, reason })
      setMessage('举报已提交。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '举报提交失败。')
    }
  }

  function toggleReplies(threadId: string) {
    setExpandedReplies((current) => {
      const next = new Set(current)
      if (next.has(threadId)) next.delete(threadId)
      else next.add(threadId)
      return next
    })
  }

  function renderComment(comment: CommentItem, reply = false) {
    return (
      <article key={comment.id} className={reply ? 'thread-comment thread-reply' : 'thread-comment'}>
        <button className="thread-avatar" onClick={() => navigate(`/user/${comment.author.username}`)}>
          {comment.author.avatar_url ? <img src={comment.author.avatar_url} alt="" /> : comment.author.display_name.slice(0, 1)}
        </button>
        <div className="thread-comment-main">
          <div className="thread-comment-head">
            <button onClick={() => navigate(`/user/${comment.author.username}`)}>{comment.author.display_name}</button>
            <time>{formatDate(comment.created_at)}</time>
          </div>
          <p>{comment.content}</p>
          <div className="thread-comment-actions">
            <button className={comment.viewer_liked ? 'active' : ''} onClick={() => void toggleLike(comment)}>
              <Heart size={14} fill={comment.viewer_liked ? 'currentColor' : 'none'} />{comment.like_count || '赞'}
            </button>
            <button onClick={() => beginReply(comment)}><Reply size={14} />回复</button>
            <button onClick={() => void report(comment)}><Flag size={14} />举报</button>
            {comment.author_id === userId && <button onClick={() => beginEdit(comment)}><Edit3 size={14} />编辑</button>}
            {comment.author_id === userId && <button onClick={() => void remove(comment)}><Trash2 size={14} />删除</button>}
          </div>
        </div>
      </article>
    )
  }

  return (
    <section className="thread-section">
      <header className="thread-heading">
        <div><MessageCircle size={18} /><strong>评论</strong><span>{totalCount}</span></div>
        <div className="comment-sort">
          <button className={sort === 'hot' ? 'active' : ''} onClick={() => setSort('hot')}>最热</button>
          <button className={sort === 'latest' ? 'active' : ''} onClick={() => setSort('latest')}>最新</button>
        </div>
      </header>

      <form className="thread-composer" onSubmit={submit}>
        {(replyTo || editing) && (
          <div className="composer-context">
            <span>{editing ? `编辑自己的评论` : `回复 @${replyTo?.author.display_name}`}</span>
            <button type="button" onClick={resetComposer}><X size={14} /></button>
          </div>
        )}
        <div className="thread-composer-row">
          <textarea
            id="thread-comment-input"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={1000}
            placeholder={userId ? '分享你的看法和经验…' : '登录后参与评论'}
            onFocus={() => { if (!userId) onRequireAuth() }}
          />
          <button className="primary-button" disabled={submitting || !content.trim()}>
            {submitting ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
          </button>
        </div>
      </form>

      {message && <p className="thread-message">{message}</p>}
      {loading ? (
        <div className="comments-state"><LoaderCircle className="spin" size={20} />加载评论…</div>
      ) : threads.length === 0 ? (
        <div className="comments-state">还没有评论，来留下第一条讨论。</div>
      ) : (
        <div className="thread-list">
          {threads.slice(0, visibleRoots).map((thread) => {
            const expanded = expandedReplies.has(thread.id)
            const replies = expanded ? thread.replies : thread.replies.slice(0, 2)
            return (
              <div className="thread-group" key={thread.id}>
                {renderComment(thread)}
                {replies.map((reply) => renderComment(reply, true))}
                {thread.replies.length > 2 && (
                  <button className="show-replies" onClick={() => toggleReplies(thread.id)}>
                    <ChevronDown size={15} className={expanded ? 'expanded' : ''} />
                    {expanded ? '收起回复' : `展开 ${thread.replies.length - 2} 条回复`}
                  </button>
                )}
              </div>
            )
          })}
          {visibleRoots < threads.length && (
            <button className="load-more-comments" onClick={() => setVisibleRoots((value) => value + 10)}>加载更多评论</button>
          )}
        </div>
      )}
    </section>
  )
}