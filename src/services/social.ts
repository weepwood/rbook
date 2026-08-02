import { supabase } from '@/lib/supabase'
import { hydrateNoteCards, hydrateNotes, noteSelect } from '@/services/noteHydration'
import type { CommentItem, CommentThread, Note, Profile, UserConnection } from '@/types'

export type FeedMode = 'for_you' | 'following' | 'latest'
export type CommentSort = 'hot' | 'latest'
export type ContentEventType = 'impression' | 'open' | 'dwell' | 'like' | 'favorite' | 'comment' | 'share' | 'follow_author'

type RecommendationRow = {
  note_id: string
  reason: string
}

type DetailCacheEntry = {
  expiresAt: number
  promise: Promise<Note | null>
}

const detailCache = new Map<string, DetailCacheEntry>()
const DETAIL_CACHE_TTL = 2 * 60 * 1000

function getSessionId() {
  const key = 'rbook-session-id'
  let value = localStorage.getItem(key)
  if (!value) {
    value = crypto.randomUUID()
    localStorage.setItem(key, value)
  }
  return value
}

function detailCacheKey(noteId: string, viewerId?: string) {
  return `${viewerId ?? 'anon'}:${noteId}`
}

export async function fetchNotesByIds(ids: string[], _viewerId?: string, reasons = new Map<string, string>()) {
  if (!supabase || ids.length === 0) return []
  const uniqueIds = Array.from(new Set(ids))
  const db = supabase as any
  const { data, error } = await db.rpc('get_note_cards_by_ids', { p_note_ids: uniqueIds })
  if (error) throw error
  const notes = await hydrateNoteCards(data ?? [], reasons)
  const order = new Map(ids.map((id, index) => [id, index]))
  return notes.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

export function invalidateNoteDetailCache(noteId?: string) {
  if (!noteId) {
    detailCache.clear()
    return
  }
  for (const key of detailCache.keys()) {
    if (key.endsWith(`:${noteId}`)) detailCache.delete(key)
  }
}

export async function fetchNoteById(noteId: string, viewerId?: string) {
  if (!supabase || !noteId) return null
  const key = detailCacheKey(noteId, viewerId)
  const cached = detailCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  if (cached) detailCache.delete(key)

  const db = supabase as any
  const promise = db
    .from('notes')
    .select(noteSelect)
    .eq('id', noteId)
    .eq('status', 'published')
    .eq('is_hidden', false)
    .maybeSingle()
    .then(async ({ data, error }: { data: any; error: any }) => {
      if (error) throw error
      if (!data) return null
      const [note] = await hydrateNotes([data], viewerId)
      return note ?? null
    })
    .catch((error: unknown) => {
      detailCache.delete(key)
      throw error
    })

  detailCache.set(key, { expiresAt: Date.now() + DETAIL_CACHE_TTL, promise })
  return promise
}

export function prefetchNoteById(noteId: string, viewerId?: string) {
  void fetchNoteById(noteId, viewerId).catch(() => undefined)
}

export async function fetchRecommendedFeed(mode: FeedMode, viewerId?: string, limit = 40, offset = 0) {
  if (!supabase) return []
  const db = supabase as any
  const { data, error } = await db.rpc('get_personalized_note_ids', { p_limit: limit, p_offset: offset, p_mode: mode })
  if (error) throw error
  const rows = (data ?? []) as RecommendationRow[]
  const reasons = new Map<string, string>(rows.map((row) => [row.note_id, row.reason]))
  return fetchNotesByIds(rows.map((row) => row.note_id), viewerId, reasons)
}

export async function fetchRelatedNotes(noteId: string, viewerId?: string, limit = 8) {
  if (!supabase) return []
  const db = supabase as any
  const { data, error } = await db.rpc('get_related_note_ids', { p_note_id: noteId, p_limit: limit })
  if (error) throw error
  return fetchNotesByIds((data ?? []).map((row: any) => row.note_id), viewerId)
}

export async function recordContentEvent(noteId: string, eventType: ContentEventType, dwellMs?: number) {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.rpc('record_content_event', {
    p_note_id: noteId,
    p_event_type: eventType,
    p_session_id: getSessionId(),
    p_dwell_ms: dwellMs ?? null,
  })
  if (error && !String(error.message).includes('note_not_available')) console.warn('RBook event tracking failed', error)
}

export async function fetchCommentThreads(noteId: string, viewerId?: string, sort: CommentSort = 'hot'): Promise<CommentThread[]> {
  if (!supabase) return []
  const db = supabase as any
  let request = db.from('comments').select(`
    id,note_id,author_id,parent_id,content,created_at,updated_at,like_count,reply_count,
    profiles!comments_author_id_fkey (id,username,display_name,avatar_url)
  `).eq('note_id', noteId).eq('is_hidden', false).is('deleted_at', null)
  request = sort === 'latest'
    ? request.order('created_at', { ascending: false })
    : request.order('like_count', { ascending: false }).order('created_at', { ascending: false })
  const { data, error } = await request.limit(300)
  if (error) throw error

  const comments: CommentItem[] = (data ?? []).map((row: any) => ({
    id: row.id,
    note_id: row.note_id,
    author_id: row.author_id,
    parent_id: row.parent_id,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    like_count: Number(row.like_count ?? 0),
    reply_count: Number(row.reply_count ?? 0),
    viewer_liked: false,
    author: row.profiles,
  }))

  if (viewerId && comments.length) {
    const { data: likes } = await db.from('comment_likes').select('comment_id').eq('user_id', viewerId).in('comment_id', comments.map((item) => item.id))
    const liked = new Set((likes ?? []).map((row: any) => row.comment_id))
    comments.forEach((item) => { item.viewer_liked = liked.has(item.id) })
  }

  const byId = new Map(comments.map((item) => [item.id, item]))
  const roots = new Map<string, CommentThread>()
  comments.filter((item) => !item.parent_id).forEach((item) => roots.set(item.id, { ...item, replies: [] }))
  comments.filter((item) => item.parent_id).forEach((item) => {
    const directParent = byId.get(item.parent_id!)
    const rootId = directParent?.parent_id ?? item.parent_id!
    const root = roots.get(rootId)
    if (root) root.replies.push(item)
  })
  roots.forEach((root) => root.replies.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
  return Array.from(roots.values())
}

export async function updateComment(commentId: string, content: string) {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.from('comments').update({ content: content.trim(), updated_at: new Date().toISOString() }).eq('id', commentId)
  if (error) throw error
}

export async function toggleCommentLike(commentId: string, userId: string, active: boolean) {
  if (!supabase) return
  const db = supabase as any
  const request = active
    ? db.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId)
    : db.from('comment_likes').insert({ comment_id: commentId, user_id: userId })
  const { error } = await request
  if (error) throw error
}

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  if (!supabase) return null
  const db = supabase as any
  const { data, error } = await db.from('profiles')
    .select('id,username,display_name,avatar_url,bio,location,follower_count,following_count,note_count,created_at,updated_at')
    .eq('username', username.toLowerCase()).maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function fetchProfileNotes(profileId: string, viewerId?: string) {
  if (!supabase) return []
  const db = supabase as any
  const { data, error } = await db.from('notes').select('id')
    .eq('author_id', profileId)
    .eq('status', 'published')
    .eq('is_hidden', false)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
  if (error) throw error
  return fetchNotesByIds((data ?? []).map((row: any) => row.id), viewerId)
}

export async function fetchFollowState(followerId: string, followingId: string) {
  if (!supabase || followerId === followingId) return false
  const db = supabase as any
  const { data, error } = await db.from('follows').select('following_id').eq('follower_id', followerId).eq('following_id', followingId).maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function toggleFollow(followerId: string, followingId: string, active: boolean) {
  if (!supabase || followerId === followingId) return
  const db = supabase as any
  const request = active
    ? db.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId)
    : db.from('follows').insert({ follower_id: followerId, following_id: followingId })
  const { error } = await request
  if (error) throw error
}

export async function fetchConnections(profileId: string, kind: 'followers' | 'following'): Promise<UserConnection[]> {
  if (!supabase) return []
  const db = supabase as any
  const select = kind === 'followers'
    ? 'profiles!follows_follower_id_fkey(id,username,display_name,avatar_url,bio,follower_count,following_count,note_count)'
    : 'profiles!follows_following_id_fkey(id,username,display_name,avatar_url,bio,follower_count,following_count,note_count)'
  const column = kind === 'followers' ? 'following_id' : 'follower_id'
  const { data, error } = await db.from('follows').select(select).eq(column, profileId).order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return (data ?? []).map((row: any) => row.profiles).filter(Boolean)
}

export async function uploadAvatar(userId: string, file: File) {
  if (!supabase) throw new Error('Supabase 尚未连接。')
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${extension}`
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' })
  if (uploadError) throw uploadError
  const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
  const db = supabase as any
  const { error } = await db.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId)
  if (error) throw error
  return publicUrl
}

export async function fetchUserCommentedNotes(userId: string, viewerId?: string) {
  if (!supabase) return []
  const db = supabase as any
  const { data, error } = await db.from('comments').select('note_id,created_at').eq('author_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  const ids = Array.from(new Set((data ?? []).map((row: any) => row.note_id))) as string[]
  return fetchNotesByIds(ids, viewerId)
}
