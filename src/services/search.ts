import { supabase } from '@/lib/supabase'
import { fetchNotesByIds } from '@/services/social'
import type { Note } from '@/types'

export type SearchKind = 'all' | 'note' | 'user' | 'topic'

export type SearchUserResult = {
  id: string
  username: string
  displayName: string
  bio: string
  avatarUrl: string | null
  followerCount: number
  noteCount: number
  location: string | null
}

export type SearchTopicResult = {
  name: string
  noteCount: number
}

export type SearchResults = {
  notes: Note[]
  users: SearchUserResult[]
  topics: SearchTopicResult[]
  totalLoaded: number
  hasMore: boolean
}

type SearchRow = {
  result_type: 'note' | 'user' | 'topic'
  result_id: string
  title: string
  subtitle: string
  username: string | null
  tags: string[]
  created_at: string | null
  score: number
  metadata: Record<string, unknown> | null
}

const SESSION_KEY = 'rbook-search-session-id'

function getSearchSessionId() {
  let value = localStorage.getItem(SESSION_KEY)
  if (!value) {
    value = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, value)
  }
  return value
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function searchRbook(input: {
  query: string
  kind?: SearchKind
  limit?: number
  offset?: number
  viewerId?: string
}): Promise<SearchResults> {
  const query = input.query.trim()
  const limit = Math.max(1, Math.min(input.limit ?? 20, 50))
  const offset = Math.max(0, input.offset ?? 0)

  if (!query || !supabase) {
    return { notes: [], users: [], topics: [], totalLoaded: 0, hasMore: false }
  }

  const db = supabase as any
  const { data, error } = await db.rpc('search_rbook', {
    p_query: query,
    p_type: input.kind ?? 'all',
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error

  const rows = (data ?? []) as SearchRow[]
  const noteRows = rows.filter((row) => row.result_type === 'note')
  const notes = await fetchNotesByIds(noteRows.map((row) => row.result_id), input.viewerId)
  const noteOrder = new Map(noteRows.map((row, index) => [row.result_id, index]))
  notes.sort((a, b) => (noteOrder.get(a.id) ?? 0) - (noteOrder.get(b.id) ?? 0))

  const users = rows
    .filter((row) => row.result_type === 'user')
    .map((row) => ({
      id: row.result_id,
      username: row.username ?? '',
      displayName: row.title,
      bio: row.subtitle,
      avatarUrl: typeof row.metadata?.avatar_url === 'string' ? row.metadata.avatar_url : null,
      followerCount: numberValue(row.metadata?.follower_count),
      noteCount: numberValue(row.metadata?.note_count),
      location: typeof row.metadata?.location === 'string' ? row.metadata.location : null,
    }))

  const topics = rows
    .filter((row) => row.result_type === 'topic')
    .map((row) => ({ name: row.result_id, noteCount: numberValue(row.metadata?.note_count) }))

  return {
    notes,
    users,
    topics,
    totalLoaded: rows.length,
    hasMore: rows.length === limit,
  }
}

export async function recordSearchEvent(input: {
  query: string
  resultType?: SearchRow['result_type']
  resultId?: string
  eventType?: 'search' | 'click'
}) {
  if (!supabase || !input.query.trim()) return
  const db = supabase as any
  const { error } = await db.rpc('record_search_event', {
    p_query: input.query.trim(),
    p_session_id: getSearchSessionId(),
    p_result_type: input.resultType ?? null,
    p_result_id: input.resultId ?? null,
    p_event_type: input.eventType ?? 'search',
  })
  if (error) console.warn('RBook search event failed', error)
}
