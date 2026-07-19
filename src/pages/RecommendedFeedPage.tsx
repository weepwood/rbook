import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock3, LoaderCircle, RefreshCw, Sparkles, UserRoundCheck } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NoteCard, type NoteDismissReason } from '@/components/NoteCard'
import { useAuth } from '@/context/AuthContext'
import { fetchFilteredRecommendationPage, recordNoteFeedback } from '@/services/feedback'
import { fetchFeed } from '@/services/notes'
import type { FeedMode } from '@/services/social'
import type { Note } from '@/types'

const PAGE_SIZE = 20
const modes: Array<{ id: FeedMode; label: string; icon: typeof Sparkles }> = [
  { id: 'for_you', label: '推荐', icon: Sparkles },
  { id: 'following', label: '关注', icon: UserRoundCheck },
  { id: 'latest', label: '最新', icon: Clock3 },
]

function deduplicate(current: Note[], incoming: Note[]) {
  const ids = new Set(current.map((note) => note.id))
  return [...current, ...incoming.filter((note) => !ids.has(note.id))]
}

export function RecommendedFeedPage({ refreshKey, onRequireAuth }: { refreshKey: number; onRequireAuth: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<FeedMode>('for_you')
  const [notes, setNotes] = useState<Note[]>([])
  const [sourceOffset, setSourceOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const sentinelRef = useRef<HTMLDivElement>(null)
  const query = searchParams.get('q') ?? ''

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const request = query
      ? fetchFeed({ query, viewerId: user?.id, limit: 40 }).then((items) => ({ notes: items, sourceCount: items.length }))
      : fetchFilteredRecommendationPage(mode, user?.id, PAGE_SIZE, 0)
    request.then((page) => {
      if (cancelled) return
      setNotes(page.notes)
      setSourceOffset(page.sourceCount)
      setHasMore(!query && page.sourceCount === PAGE_SIZE)
      const savedPosition = Number(sessionStorage.getItem(`rbook-feed-scroll:${mode}`) ?? 0)
      if (savedPosition > 0) window.requestAnimationFrame(() => window.scrollTo({ top: savedPosition }))
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '加载失败')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
      sessionStorage.setItem(`rbook-feed-scroll:${mode}`, String(window.scrollY))
    }
  }, [query, mode, refreshKey, user?.id])

  const loadMore = useCallback(async () => {
    if (query || loading || loadingMore || !hasMore) return
    setLoadingMore(true)
    setError('')
    try {
      const next = await fetchFilteredRecommendationPage(mode, user?.id, PAGE_SIZE, sourceOffset)
      setNotes((current) => deduplicate(current, next.notes))
      setSourceOffset((current) => current + next.sourceCount)
      setHasMore(next.sourceCount === PAGE_SIZE)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加载更多失败。')
    } finally {
      setLoadingMore(false)
    }
  }, [query, loading, loadingMore, hasMore, mode, user?.id, sourceOffset])

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || query) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore()
    }, { rootMargin: '600px 0px' })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [loadMore, hasMore, query])

  const title = useMemo(() => {
    if (query) return `“${query}” 的搜索结果`
    if (mode === 'following') return '来自你关注的创作者'
    if (mode === 'latest') return '刚刚发布的新鲜内容'
    return '为你挑选的内容'
  }, [query, mode])

  function chooseMode(next: FeedMode) {
    if (next === 'following' && !user) return onRequireAuth()
    sessionStorage.setItem(`rbook-feed-scroll:${mode}`, String(window.scrollY))
    setMode(next)
    if (query) setSearchParams({})
  }

  async function dismissNote(note: Note, reason: NoteDismissReason) {
    if (!user) return onRequireAuth()
    const previous = notes
    setNotes((current) => reason === 'hide_author'
      ? current.filter((item) => item.author_id !== note.author_id)
      : current.filter((item) => item.id !== note.id))
    try {
      await recordNoteFeedback(note.id, reason)
    } catch (reasonError) {
      setNotes(previous)
      setError(reasonError instanceof Error ? reasonError.message : '反馈提交失败。')
    }
  }

  const contentSource = query ? 'search' : mode === 'for_you' ? 'recommendation' : mode

  return (
    <div className="feed-page">
      <section className="feed-heading">
        <div><p>FOR YOU</p><h1>{title}</h1></div>
        <span>排序会根据真实浏览、停留、互动与负反馈逐步调整</span>
      </section>

      <div className="topic-tabs personalized-tabs" role="tablist">
        {modes.map(({ id, label, icon: Icon }) => (
          <button key={id} className={mode === id ? 'active' : ''} onClick={() => chooseMode(id)}><Icon size={15} />{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="feed-skeleton-grid" aria-label="正在加载内容">
          {Array.from({ length: 8 }, (_, index) => <span key={index} className="feed-skeleton" />)}
        </div>
      ) : error && notes.length === 0 ? (
        <div className="state-panel error"><p>{error}</p><button onClick={() => window.location.reload()}><RefreshCw size={16} />重新加载</button></div>
      ) : notes.length === 0 ? (
        <div className="state-panel"><p>{mode === 'following' ? '你关注的创作者暂时还没有发布内容。' : '暂时没有匹配的笔记。'}</p>{mode === 'following' && <button onClick={() => navigate('/explore')}>去发现创作者</button>}</div>
      ) : (
        <>
          {error && <p className="page-message error">{error}</p>}
          <section className="masonry-feed">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                userId={user?.id}
                onRequireAuth={onRequireAuth}
                onOpen={(selected) => navigate(`/note/${selected.id}`, { state: { source: contentSource } })}
                trackImpression={!query}
                onDismiss={!query && mode === 'for_you' ? dismissNote : undefined}
              />
            ))}
          </section>
          {!query && <div ref={sentinelRef} className="feed-load-sentinel">{loadingMore ? <><LoaderCircle className="spin" size={17} />正在加载更多…</> : hasMore ? '继续向下浏览' : '已经看到最新内容'}</div>}
        </>
      )}
    </div>
  )
}
