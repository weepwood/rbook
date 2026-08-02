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

function normalizeTopic(value: string) {
  return value.trim().replace(/^#+/, '').slice(0, 60)
}

export async function fetchTrendingTopics(limit = 12, windowDays = 30): Promise<TrendingTopic[]> {
  if (!supabase) return []
  const db = supabase as any
  const { data, error } = await db.rpc('get_trending_topics', {
    p_limit: Math.max(1, Math.min(limit, 50)),
    p_window_days: Math.max(1, Math.min(windowDays, 365)),
  })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    topic: String(row.topic),
    note_count: Number(row.note_count ?? 0),
    recent_note_count: Number(row.recent_note_count ?? 0),
    interaction_count: Number(row.interaction_count ?? 0),
    score: Number(row.score ?? 0),
    is_followed: Boolean(row.is_followed),
  }))
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
