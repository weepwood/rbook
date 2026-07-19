import { useEffect, useMemo, useState } from 'react'
import { Hash, LoaderCircle, MapPin, Search, UserRound } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NoteCard } from '@/components/NoteCard'
import { useAuth } from '@/context/AuthContext'
import { recordSearchEvent, searchRbook, type SearchKind, type SearchResults } from '@/services/search'

const tabs: Array<{ id: SearchKind; label: string }> = [
  { id: 'all', label: '综合' },
  { id: 'note', label: '笔记' },
  { id: 'user', label: '用户' },
  { id: 'topic', label: '话题' },
]

const emptyResults: SearchResults = {
  notes: [],
  users: [],
  topics: [],
  totalLoaded: 0,
  hasMore: false,
}

export function SearchPage({ onRequireAuth }: { onRequireAuth: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q')?.trim() ?? ''
  const requestedKind = searchParams.get('type') as SearchKind | null
  const kind = tabs.some((tab) => tab.id === requestedKind) ? requestedKind! : 'all'
  const [results, setResults] = useState<SearchResults>(emptyResults)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!query) {
        setResults(emptyResults)
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      searchRbook({ query, kind, viewerId: user?.id })
        .then((data) => {
          if (!cancelled) {
            setResults(data)
            void recordSearchEvent({ query })
          }
        })
        .catch((reason) => {
          if (!cancelled) setError(reason instanceof Error ? reason.message : '搜索失败。')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, kind, user?.id])

  const visibleCount = useMemo(
    () => results.notes.length + results.users.length + results.topics.length,
    [results],
  )

  function chooseKind(next: SearchKind) {
    const nextParams = new URLSearchParams(searchParams)
    if (next === 'all') nextParams.delete('type')
    else nextParams.set('type', next)
    setSearchParams(nextParams)
  }

  async function loadMore() {
    if (!query || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const next = await searchRbook({
        query,
        kind,
        viewerId: user?.id,
        offset: results.totalLoaded,
      })
      setResults((current) => ({
        notes: [...current.notes, ...next.notes.filter((item) => !current.notes.some((existing) => existing.id === item.id))],
        users: [...current.users, ...next.users.filter((item) => !current.users.some((existing) => existing.id === item.id))],
        topics: [...current.topics, ...next.topics.filter((item) => !current.topics.some((existing) => existing.name === item.name))],
        totalLoaded: current.totalLoaded + next.totalLoaded,
        hasMore: next.hasMore,
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加载更多失败。')
    } finally {
      setLoadingMore(false)
    }
  }

  if (!query) {
    return (
      <div className="search-empty-page">
        <Search size={42} />
        <h1>搜索 RBook</h1>
        <p>查找真实经验、创作者和感兴趣的话题。</p>
      </div>
    )
  }

  return (
    <div className="search-page">
      <header className="search-page-heading">
        <div><p>SEARCH</p><h1>“{query}” 的搜索结果</h1></div>
        {!loading && <span>已显示 {visibleCount} 项</span>}
      </header>

      <nav className="search-tabs" aria-label="搜索结果分类">
        {tabs.map((tab) => (
          <button key={tab.id} className={kind === tab.id ? 'active' : ''} onClick={() => chooseKind(tab.id)}>{tab.label}</button>
        ))}
      </nav>

      {error && <p className="page-message error">{error}</p>}
      {loading ? (
        <div className="state-panel"><LoaderCircle className="spin" /><span>正在搜索笔记、用户和话题…</span></div>
      ) : visibleCount === 0 ? (
        <div className="search-no-results"><Search size={34} /><h2>没有找到匹配内容</h2><p>尝试缩短关键词，或者搜索一个标签名称。</p></div>
      ) : (
        <>
          {results.users.length > 0 && (
            <section className="search-section">
              <header><UserRound size={19} /><h2>用户</h2></header>
              <div className="search-user-grid">
                {results.users.map((item) => (
                  <button
                    key={item.id}
                    className="search-user-card"
                    onClick={() => {
                      void recordSearchEvent({ query, resultType: 'user', resultId: item.id, eventType: 'click' })
                      navigate(`/user/${item.username}`)
                    }}
                  >
                    {item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : <span>{item.displayName.slice(0, 1)}</span>}
                    <div><strong>{item.displayName}</strong><small>@{item.username}</small><p>{item.bio || '这位创作者还没有填写简介。'}</p><footer>{item.followerCount} 粉丝 · {item.noteCount} 篇笔记{item.location ? <em><MapPin size={12} />{item.location}</em> : null}</footer></div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {results.topics.length > 0 && (
            <section className="search-section">
              <header><Hash size={19} /><h2>话题</h2></header>
              <div className="search-topic-list">
                {results.topics.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => {
                      void recordSearchEvent({ query, resultType: 'topic', resultId: item.name, eventType: 'click' })
                      setSearchParams({ q: item.name, type: 'note' })
                    }}
                  >
                    <span>#</span><div><strong>{item.name}</strong><small>{item.noteCount} 篇公开笔记</small></div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {results.notes.length > 0 && (
            <section className="search-section">
              <header><Search size={19} /><h2>笔记</h2></header>
              <div className="masonry-feed">
                {results.notes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    userId={user?.id}
                    onRequireAuth={onRequireAuth}
                    onOpen={(selected) => {
                      void recordSearchEvent({ query, resultType: 'note', resultId: selected.id, eventType: 'click' })
                      navigate(`/note/${selected.id}`)
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {results.hasMore && <button className="search-load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <><LoaderCircle className="spin" size={17} />加载中…</> : '加载更多结果'}</button>}
        </>
      )}
    </div>
  )
}
