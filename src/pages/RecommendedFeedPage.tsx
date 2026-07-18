import { useEffect, useMemo, useState } from 'react'
import { Clock3, LoaderCircle, RefreshCw, Sparkles, UserRoundCheck } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NoteCard } from '@/components/NoteCard'
import { useAuth } from '@/context/AuthContext'
import { fetchFeed } from '@/services/notes'
import { fetchRecommendedFeed, recordContentEvent, type FeedMode } from '@/services/social'
import type { Note } from '@/types'

const modes: Array<{ id: FeedMode; label: string; icon: typeof Sparkles }> = [
  { id: 'for_you', label: '推荐', icon: Sparkles },
  { id: 'following', label: '关注', icon: UserRoundCheck },
  { id: 'latest', label: '最新', icon: Clock3 },
]

export function RecommendedFeedPage({ refreshKey, onRequireAuth }: { refreshKey: number; onRequireAuth: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<FeedMode>('for_you')
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const query = searchParams.get('q') ?? ''

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const request = query
      ? fetchFeed({ query, viewerId: user?.id })
      : fetchRecommendedFeed(mode, user?.id)
    request.then((data) => {
      if (cancelled) return
      setNotes(data)
      if (!query) void Promise.all(data.slice(0, 12).map((note) => recordContentEvent(note.id, 'impression')))
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '加载失败')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [query, mode, refreshKey, user?.id])

  const title = useMemo(() => {
    if (query) return `“${query}” 的搜索结果`
    if (mode === 'following') return '来自你关注的创作者'
    if (mode === 'latest') return '刚刚发布的新鲜内容'
    return '为你挑选的内容'
  }, [query, mode])

  function chooseMode(next: FeedMode) {
    if (next === 'following' && !user) return onRequireAuth()
    setMode(next)
    if (query) setSearchParams({})
  }

  return (
    <div className="feed-page">
      <section className="feed-heading">
        <div><p>FOR YOU</p><h1>{title}</h1></div>
        <span>排序会根据浏览、停留、点赞、收藏与评论逐步调整</span>
      </section>

      <div className="topic-tabs personalized-tabs" role="tablist">
        {modes.map(({ id, label, icon: Icon }) => (
          <button key={id} className={mode === id ? 'active' : ''} onClick={() => chooseMode(id)}><Icon size={15} />{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="state-panel"><LoaderCircle className="spin" /><span>正在计算内容排序…</span></div>
      ) : error ? (
        <div className="state-panel error"><p>{error}</p><button onClick={() => window.location.reload()}><RefreshCw size={16} />重新加载</button></div>
      ) : notes.length === 0 ? (
        <div className="state-panel"><p>{mode === 'following' ? '你关注的创作者暂时还没有发布内容。' : '暂时没有匹配的笔记。'}</p>{mode === 'following' && <button onClick={() => navigate('/explore')}>去发现创作者</button>}</div>
      ) : (
        <section className="masonry-feed">
          {notes.map((note) => <NoteCard key={note.id} note={note} userId={user?.id} onRequireAuth={onRequireAuth} onOpen={(selected) => navigate(`/note/${selected.id}`)} />)}
        </section>
      )}
    </div>
  )
}