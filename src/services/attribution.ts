import { supabase } from '@/lib/supabase'

export type ContentSource = 'recommendation' | 'following' | 'latest' | 'search' | 'profile' | 'related' | 'explore' | 'direct' | 'other'
export type AttributedContentEvent = 'impression' | 'open' | 'dwell' | 'like' | 'favorite' | 'comment' | 'share' | 'follow_author'

const sources = new Set<ContentSource>(['recommendation', 'following', 'latest', 'search', 'profile', 'related', 'explore', 'direct', 'other'])

function getSessionId() {
  const key = 'rbook-session-id'
  let value = localStorage.getItem(key)
  if (!value) {
    value = crypto.randomUUID()
    localStorage.setItem(key, value)
  }
  return value
}

export function normalizeContentSource(value: unknown): ContentSource {
  return typeof value === 'string' && sources.has(value as ContentSource) ? value as ContentSource : 'direct'
}

export async function recordAttributedContentEvent(
  noteId: string,
  eventType: AttributedContentEvent,
  source: ContentSource,
  dwellMs?: number,
) {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.rpc('record_content_event', {
    p_note_id: noteId,
    p_event_type: eventType,
    p_session_id: getSessionId(),
    p_dwell_ms: dwellMs ?? null,
    p_source: source,
  })
  if (error && !String(error.message).includes('note_not_available')) console.warn('RBook attributed event tracking failed', error)
}
