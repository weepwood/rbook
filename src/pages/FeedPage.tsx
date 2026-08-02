import { useEffect, useMemo, useState } from 'react'
import { Flame, Hash, LoaderCircle, RefreshCw, TrendingUp } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NoteCard } from '@/components/NoteCard'
import { useAuth } from '@/context/AuthContext'
import { fetchFeed } from '@/services/notes'
import { fetchTrendingTopics, type TrendingTopic } from '@/services/topics'
import type { Note } from '@/types'

type Props = {
  mode?: 'home' | 'explore'
  refreshKey: number
  onRequireAuth: () => void
}

function compactCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

export function FeedPage({ mode = 'home', refreshKey, onRequireAuth }: Props) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [notes, setNotes] = useState<Note[]>([])
  const [topics, setTopics] = useState<TrendingTopic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const query = searchParams.get('q') ?? ''

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([
      fetchFeed({ query, viewerId: user?.id, limit: 40 }),
      fetchTrendingTopics(12, 30),
    ]).then(([nextNotes, nextTopics]) => {
      if (cancelled) return
      setNotes(nextNotes)
      setTopics(nextTopics)
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '加载失败')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [query, refreshKey, user?.id])

  const title = useMemo(() => {
    if (query) return `“${query}” 的搜索结果`
    return mode === 'explore' ? '发现正在形成的社区话题' : '今天值得看看'
  }, [mode, query])

  return (
    <div className="feed-page explore-page">
      <section className="feed-heading">
        <div>
          <p>{mode === 'explore' ? 'EXPLORE' : 'FOR YOU'}</p>
          <h1>{title}</h1>
        </div>
        <span>话题热度根据近期发布、浏览、收藏与讨论动态计算</span>
      </section>

      {!query && topics.length > 0 && (
        <section className="trending-topic-section">
          <header><div><Flame size={19} /><h2>热议话题</h2></div><span>持续更新</span></header>
          <div className="trending-topic-grid">
            {topics.slice(0, 8).map((topic, index) => (
              <button key={topic.topic} onClick={() => navigate(`/topic/${encodeURIComponent(topic.topic)}`)}>
                <em>{String(index + 1).padStart(2, '0')}</em>
                <span className="trending-topic-icon"><Hash size={18} /></span>
                <span className="trending-topic-copy">
                  <strong>{topic.topic}</strong>
                  <small>{compactCount(topic.note_count)} 篇 · {compactCount(topic.interaction_count)} 互动</small>
                </span>
                <TrendingUp size={16} />
              </button>
            ))}
          </div>
          <div className="topic-chip-row">
            {topics.slice(8).map((topic) => (
              <button key={topic.topic} onClick={() => navigate(`/topic/${encodeURIComponent(topic.topic)}`)}>#{topic.topic}</button>
            ))}
          </div>
        </section>
      )}

      <section className="explore-note-heading">
        <div><p>DISCOVER NOTES</p><h2>{query ? '匹配笔记' : '最新社区内容'}</h2></div>
        <span>从不同话题里发现具体经验</span>
      </section>

      {loading ? (
        <div className="feed-skeleton-grid">{Array.from({ length: 8 }, (_, index) => <span key={index} className="feed-skeleton" />)}</div>
      ) : error ? (
        <div className="state-panel error">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}><RefreshCw size={16} />重新加载</button>
        </div>
      ) : notes.length === 0 ? (
        <div className="state-panel"><p>暂时没有匹配的笔记。</p></div>
      ) : (
        <section className="masonry-feed">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              userId={user?.id}
              onRequireAuth={onRequireAuth}
              onOpen={(selected) => navigate(`/note/${selected.id}`, { state: { source: 'explore' } })}
            />
          ))}
        </section>
      )}

      {loading && <span className="visually-hidden"><LoaderCircle className="spin" />正在加载</span>}
    </div>
  )
}
