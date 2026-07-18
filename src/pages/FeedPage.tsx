import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { NoteCard } from '@/components/NoteCard'
import { NoteDetailModal } from '@/components/NoteDetailModal'
import { useAuth } from '@/context/AuthContext'
import { fetchFeed } from '@/services/notes'
import type { Note } from '@/types'

const topics = ['推荐', '家居灵感', '效率工具', '一人食', '徒步', '知识管理', '城市漫游', '可视化']

type Props = {
  mode?: 'home' | 'explore'
  refreshKey: number
  onRequireAuth: () => void
}

export function FeedPage({ mode = 'home', refreshKey, onRequireAuth }: Props) {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTopic, setActiveTopic] = useState(mode === 'explore' ? '效率工具' : '推荐')
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const query = searchParams.get('q') ?? ''

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchFeed({ query, tag: activeTopic, viewerId: user?.id })
      .then((data) => {
        if (!cancelled) setNotes(data)
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [query, activeTopic, refreshKey, user?.id])

  const title = useMemo(() => {
    if (query) return `“${query}” 的搜索结果`
    return mode === 'explore' ? '发现更多具体经验' : '今天值得看看'
  }, [mode, query])

  function chooseTopic(topic: string) {
    setActiveTopic(topic)
    if (query) setSearchParams({})
  }

  return (
    <div className="feed-page">
      <section className="feed-heading">
        <div>
          <p>{mode === 'explore' ? 'EXPLORE' : 'FOR YOU'}</p>
          <h1>{title}</h1>
        </div>
        <span>持续更新真实、具体、有用的内容</span>
      </section>

      <div className="topic-tabs" role="tablist">
        {topics.map((topic) => (
          <button key={topic} className={activeTopic === topic ? 'active' : ''} onClick={() => chooseTopic(topic)}>
            {topic}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="state-panel"><LoaderCircle className="spin" /><span>正在整理内容…</span></div>
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
            <NoteCard key={note.id} note={note} userId={user?.id} onRequireAuth={onRequireAuth} onOpen={setSelectedNote} />
          ))}
        </section>
      )}

      {selectedNote && (
        <NoteDetailModal note={selectedNote} userId={user?.id} onRequireAuth={onRequireAuth} onClose={() => setSelectedNote(null)} />
      )}
    </div>
  )
}
