import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock3, Flame, Hash, LoaderCircle, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { NoteCard } from '@/components/NoteCard'
import { useAuth } from '@/context/AuthContext'
import {
  fetchTopicFollowState,
  fetchTopicNotes,
  fetchTrendingTopics,
  toggleTopicFollow,
  type TopicSort,
  type TrendingTopic,
} from '@/services/topics'
import type { Note } from '@/types'

const PAGE_SIZE = 20

function cleanTopic(value: string) {
  try {
    return decodeURIComponent(value).trim().replace(/^#+/, '')
  } catch {
    return value.trim().replace(/^#+/, '')
  }
}

function compactCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

function deduplicate(current: Note[], incoming: Note[]) {
  const ids = new Set(current.map((item) => item.id))
  return [...current, ...incoming.filter((item) => !ids.has(item.id))]
}

export function TopicPage({ onRequireAuth }: { onRequireAuth: () => void }) {
  const { topicName = '' } = useParams()
  const topic = useMemo(() => cleanTopic(topicName), [topicName])
  const { user } = useAuth()
  const navigate = useNavigate()
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [sort, setSort] = useState<TopicSort>('hot')
  const [notes, setNotes] = useState<Note[]>([])
  const [trending, setTrending] = useState<TrendingTopic[]>([])
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setNotes([])
    setOffset(0)

    Promise.all([
      fetchTopicNotes(topic, sort, user?.id, PAGE_SIZE, 0),
      fetchTrendingTopics(20, 30),
      user ? fetchTopicFollowState(user.id, topic) : Promise.resolve(false),
    ]).then(([page, topics, followed]) => {
      if (cancelled) return
      setNotes(page.notes)
      setOffset(page.sourceCount)
      setHasMore(page.sourceCount === PAGE_SIZE)
      setTrending(topics)
      setFollowing(followed)
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '话题加载失败。')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [topic, sort, user?.id])

  const loadMore = useCallback(async () => {
    if (!topic || loading || loadingMore || !hasMore) return
    setLoadingMore(true)
    setError('')
    try {
      const page = await fetchTopicNotes(topic, sort, user?.id, PAGE_SIZE, offset)
      setNotes((current) => deduplicate(current, page.notes))
      setOffset((current) => current + page.sourceCount)
      setHasMore(page.sourceCount === PAGE_SIZE)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加载更多失败。')
    } finally {
      setLoadingMore(false)
    }
  }, [topic, loading, loadingMore, hasMore, sort, user?.id, offset])

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore()
    }, { rootMargin: '500px 0px' })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  const summary = trending.find((item) => item.topic.toLowerCase() === topic.toLowerCase())
  const relatedTopics = trending.filter((item) => item.topic.toLowerCase() !== topic.toLowerCase()).slice(0, 8)

  async function changeFollow() {
    if (!user) return onRequireAuth()
    if (followBusy) return
    const previous = following
    setFollowing(!previous)
    setFollowBusy(true)
    try {
      await toggleTopicFollow(user.id, topic, previous)
    } catch (reason) {
      setFollowing(previous)
      setError(reason instanceof Error ? reason.message : '关注话题失败。')
    } finally {
      setFollowBusy(false)
    }
  }

  function createForTopic() {
    if (!user) return onRequireAuth()
    navigate(`/?compose=1&topic=${encodeURIComponent(topic)}`)
  }

  if (!topic) return <div className="state-panel error"><p>话题名称不能为空。</p></div>

  return (
    <div className="topic-page">
      <section className="topic-hero">
        <div className="topic-hero-icon"><Hash size={34} /></div>
        <div className="topic-hero-copy">
          <p>TOPIC COMMUNITY</p>
          <h1>{topic}</h1>
          <span>围绕同一个具体话题，沉淀真实经验、过程和可复用的方法。</span>
          <div className="topic-stats">
            <strong>{compactCount(summary?.note_count ?? notes.length)} <em>篇笔记</em></strong>
            <strong>{compactCount(summary?.recent_note_count ?? 0)} <em>近期新增</em></strong>
            <strong>{compactCount(summary?.interaction_count ?? 0)} <em>社区互动</em></strong>
          </div>
        </div>
        <div className="topic-hero-actions">
          <button className={following ? 'secondary-button topic-following' : 'primary-button'} disabled={followBusy} onClick={() => void changeFollow()}>
            {following ? <Check size={17} /> : <Plus size={17} />}{following ? '已关注' : '关注话题'}
          </button>
          <button className="secondary-button" onClick={createForTopic}><Sparkles size={17} />发布相关笔记</button>
        </div>
      </section>

      <div className="topic-layout">
        <main className="topic-main">
          <header className="topic-content-heading">
            <div><p>COMMUNITY NOTES</p><h2>话题内容</h2></div>
            <nav className="topic-sort" aria-label="话题排序">
              <button className={sort === 'hot' ? 'active' : ''} onClick={() => setSort('hot')}><Flame size={15} />热门</button>
              <button className={sort === 'latest' ? 'active' : ''} onClick={() => setSort('latest')}><Clock3 size={15} />最新</button>
            </nav>
          </header>

          {error && notes.length > 0 && <p className="page-message error">{error}</p>}
          {loading ? (
            <div className="feed-skeleton-grid">{Array.from({ length: 8 }, (_, index) => <span key={index} className="feed-skeleton" />)}</div>
          ) : error && notes.length === 0 ? (
            <div className="state-panel error"><p>{error}</p><button onClick={() => window.location.reload()}><RefreshCw size={16} />重新加载</button></div>
          ) : notes.length === 0 ? (
            <div className="topic-empty"><Hash size={34} /><h2>还没有相关笔记</h2><p>成为第一个认真记录这个话题的人。</p><button className="primary-button" onClick={createForTopic}>发布第一篇</button></div>
          ) : (
            <>
              <section className="masonry-feed topic-note-feed">
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
              <div ref={sentinelRef} className="feed-load-sentinel">
                {loadingMore ? <><LoaderCircle className="spin" size={17} />正在加载更多…</> : hasMore ? '继续浏览话题内容' : '已经看完当前话题' }
              </div>
            </>
          )}
        </main>

        <aside className="topic-sidebar">
          <header><Flame size={18} /><div><strong>正在热议</strong><span>根据发布、浏览和互动综合计算</span></div></header>
          <div className="topic-ranking-list">
            {relatedTopics.map((item, index) => (
              <button key={item.topic} onClick={() => navigate(`/topic/${encodeURIComponent(item.topic)}`)}>
                <em>{String(index + 1).padStart(2, '0')}</em>
                <span><strong>#{item.topic}</strong><small>{compactCount(item.note_count)} 篇 · {compactCount(item.interaction_count)} 互动</small></span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
