import { supabase } from '@/lib/supabase'
import { fetchNotesByIds } from '@/services/social'
import type { Note } from '@/types'

export type TopicSort = 'hot' | 'latest'

export type TrendingTopic = {
  topic: string
  note_count: number
  recent_note_count: number
  interaction_count: number
  score: number
  is_followed: boolean
}

const starterTopicNames = [
  '效率工具',
  '知识管理',
  'AI 实践',
  '独立开发',
  '桌面整理',
  '阅读笔记',
  '城市漫游',
  '一人食',
  '低成本改造',
  '周末徒步',
  '创意实验',
  '真实体验',
]

function normalizeTopic(value: string) {
  return value.trim().replace(/^#+/, '').slice(0, 60)
}

function starterTopics(limit: number, followed: Set<string>, excluded = new Set<string>()): TrendingTopic[] {
  return starterTopicNames
    .filter((topic) => !excluded.has(topic.toLowerCase()))
    .slice(0, limit)
    .map((topic, index) => ({
      topic,
      note_count: 0,
      recent_note_count: 0,
      interaction_count: 0,
      score: Math.max(0, starterTopicNames.length - index),
      is_followed: followed.has(topic.toLowerCase()),
    }))
}

export async function fetchTrendingTopics(limit = 12, windowDays = 30): Promise<TrendingTopic[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50))
  if (!supabase) return starterTopics(safeLimit, new Set())
  const db = supabase as any
  const [{ data, error }, followedResult] = await Promise.all([
    db.rpc('get_trending_topics', {
      p_limit: safeLimit,
      p_window_days: Math.max(1, Math.min(windowDays, 365)),
    }),
    db.from('topic_follows').select('topic'),
  ])
  if (error) throw error

  const followed = new Set((followedResult.data ?? []).map((row: any) => String(row.topic).toLowerCase()))
  const topics: TrendingTopic[] = (data ?? []).map((row: any) => ({
    topic: String(row.topic),
    note_count: Number(row.note_count ?? 0),
    recent_note_count: Number(row.recent_note_count ?? 0),
    interaction_count: Number(row.interaction_count ?? 0),
    score: Number(row.score ?? 0),
    is_followed: Boolean(row.is_followed) || followed.has(String(row.topic).toLowerCase()),
  }))

  if (topics.length >= safeLimit) return topics.slice(0, safeLimit)
  const existing = new Set(topics.map((item) => item.topic.toLowerCase()))
  return [...topics, ...starterTopics(safeLimit - topics.length, followed, existing)]
}

export async function fetchTopicNotes(
  topic: string,
  sort: TopicSort,
  viewerId?: string,
  limit = 20,
  offset = 0,
): Promise<{ notes: Note[]; sourceCount: number }> {
  if (!supabase) return { notes: [], sourceCount: 0 }
  const normalized = normalizeTopic(topic)
  if (!normalized) return { notes: [], sourceCount: 0 }

  const db = supabase as any
  const { data, error } = await db.rpc('get_topic_note_ids', {
    p_topic: normalized,
    p_sort: sort,
    p_limit: Math.max(1, Math.min(limit, 50)),
    p_offset: Math.max(0, offset),
  })
  if (error) throw error
  const rows = data ?? []
  const ids = rows.map((row: any) => String(row.note_id))
  const notes = await fetchNotesByIds(ids, viewerId)
  return { notes, sourceCount: rows.length }
}

export async function fetchTopicFollowState(userId: string, topic: string) {
  if (!supabase) return false
  const normalized = normalizeTopic(topic)
  if (!normalized) return false
  const db = supabase as any
  const { data, error } = await db
    .from('topic_follows')
    .select('topic')
    .eq('user_id', userId)
    .ilike('topic', normalized)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function toggleTopicFollow(userId: string, topic: string, active: boolean) {
  if (!supabase) return
  const normalized = normalizeTopic(topic)
  if (!normalized) throw new Error('话题名称不能为空。')
  const db = supabase as any

  if (active) {
    const { error } = await db
      .from('topic_follows')
      .delete()
      .eq('user_id', userId)
      .ilike('topic', normalized)
    if (error) throw error
    return
  }

  const { error } = await db.from('topic_follows').insert({ user_id: userId, topic: normalized })
  if (error) throw error
}
