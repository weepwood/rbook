import { demoNotes } from '@/data/demo'
import { supabase } from '@/lib/supabase'
import { hydrateNotes, noteSelect } from '@/services/noteHydration'
import type { CommentItem, Note, NoteVisibility, Profile } from '@/types'

type FeedOptions = {
  query?: string
  tag?: string
  limit?: number
  viewerId?: string
}

type CollectionKind = 'notes' | 'private' | 'favorites' | 'liked'

export async function fetchFeed(options: FeedOptions = {}): Promise<Note[]> {
  if (!supabase) {
    const query = options.query?.toLowerCase().trim()
    const tag = options.tag?.trim()
    return demoNotes.filter((note) => {
      const matchesQuery =
        !query ||
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        note.tags.some((item) => item.toLowerCase().includes(query))
      const matchesTag = !tag || tag === '推荐' || note.tags.includes(tag)
      return matchesQuery && matchesTag
    })
  }

  const db = supabase as any
  let request = db
    .from('notes')
    .select(noteSelect)
    .eq('status', 'published')
    .eq('is_hidden', false)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 40)

  if (options.query?.trim()) {
    const escaped = options.query.trim().replaceAll(',', ' ')
    request = request.or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`)
  }
  if (options.tag && options.tag !== '推荐') request = request.contains('tags', [options.tag])

  const { data, error } = await request
  if (error) throw error
  return hydrateNotes(data ?? [], options.viewerId)
}

async function fetchNotesByIds(ids: string[], viewerId?: string) {
  if (!supabase || ids.length === 0) return []
  const db = supabase as any
  const { data, error } = await db
    .from('notes')
    .select(noteSelect)
    .in('id', ids)
    .eq('status', 'published')
    .eq('is_hidden', false)
  if (error) throw error
  const hydrated = await hydrateNotes(data ?? [], viewerId)
  const order = new Map(ids.map((id, index) => [id, index]))
  return hydrated.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

export async function fetchUserCollection(userId: string, kind: CollectionKind): Promise<Note[]> {
  if (!supabase) return kind === 'notes' ? demoNotes : kind === 'private' ? [] : demoNotes.slice(0, 2)
  const db = supabase as any

  if (kind === 'notes' || kind === 'private') {
    const { data, error } = await db
      .from('notes')
      .select(noteSelect)
      .eq('author_id', userId)
      .eq('status', 'published')
      .eq('visibility', kind === 'private' ? 'private' : 'public')
      .order('created_at', { ascending: false })
    if (error) throw error
    return hydrateNotes(data ?? [], userId)
  }

  const table = kind === 'favorites' ? 'favorites' : 'likes'
  const { data, error } = await db
    .from(table)
    .select('note_id,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return fetchNotesByIds((data ?? []).map((row: any) => row.note_id), userId)
}

export async function fetchComments(noteId: string): Promise<CommentItem[]> {
  if (!supabase) return []
  const db = supabase as any
  const { data, error } = await db
    .from('comments')
    .select(`
      id,note_id,author_id,parent_id,content,created_at,updated_at,like_count,reply_count,
      profiles!comments_author_id_fkey (id,username,display_name,avatar_url)
    `)
    .eq('note_id', noteId)
    .eq('is_hidden', false)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    note_id: row.note_id,
    author_id: row.author_id,
    parent_id: row.parent_id,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    like_count: Number(row.like_count ?? 0),
    reply_count: Number(row.reply_count ?? 0),
    author: row.profiles,
  }))
}

export async function addComment(input: { noteId: string; authorId: string; content: string; parentId?: string | null }) {
  if (!supabase) throw new Error('请先连接 Supabase。')
  const db = supabase as any
  const { data, error } = await db
    .from('comments')
    .insert({ note_id: input.noteId, author_id: input.authorId, content: input.content.trim(), parent_id: input.parentId ?? null })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function deleteComment(commentId: string) {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.from('comments').delete().eq('id', commentId)
  if (error) throw error
}

export async function reportContent(input: { reporterId: string; noteId?: string; commentId?: string; reason: string }) {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.from('content_reports').insert({
    reporter_id: input.reporterId,
    note_id: input.noteId ?? null,
    comment_id: input.commentId ?? null,
    reason: input.reason.trim(),
  })
  if (error) throw error
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const db = supabase as any
  const { data, error } = await db
    .from('profiles')
    .select('id,username,display_name,avatar_url,bio,location,follower_count,following_count,note_count,created_at,updated_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function updateProfile(userId: string, values: Pick<Profile, 'display_name' | 'username' | 'bio' | 'location'>) {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.from('profiles').update(values).eq('id', userId)
  if (error) throw error
}

export async function toggleLike(noteId: string, userId: string, active: boolean) {
  if (!supabase) return
  const db = supabase as any
  if (active) {
    const { error } = await db.from('likes').delete().eq('note_id', noteId).eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await db.from('likes').insert({ note_id: noteId, user_id: userId })
    if (error) throw error
  }
}

export async function toggleFavorite(noteId: string, userId: string, active: boolean) {
  if (!supabase) return
  const db = supabase as any
  if (active) {
    const { error } = await db.from('favorites').delete().eq('note_id', noteId).eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await db.from('favorites').insert({ note_id: noteId, user_id: userId })
    if (error) throw error
  }
}

export async function publishNote(input: {
  authorId: string
  title: string
  content: string
  tags: string[]
  location?: string
  visibility?: NoteVisibility
  files: File[]
}) {
  if (!supabase) throw new Error('请先配置 Supabase 环境变量。')
  const db = supabase as any
  const visibility = input.visibility ?? 'public'
  const storageBucket = visibility === 'private' ? 'private-note-media' : 'note-media'
  const { data: note, error: noteError } = await db
    .from('notes')
    .insert({
      author_id: input.authorId,
      title: input.title,
      content: input.content,
      tags: input.tags,
      location: input.location || null,
      visibility,
      status: 'published',
    })
    .select('id')
    .single()

  if (noteError) throw noteError

  try {
    const mediaRows = []
    for (let index = 0; index < input.files.length; index += 1) {
      const file = input.files[index]
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const storagePath = `${input.authorId}/${note.id}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from(storageBucket).upload(storagePath, file, {
        cacheControl: '31536000',
        upsert: false,
      })
      if (uploadError) throw uploadError
      mediaRows.push({ note_id: note.id, storage_path: storagePath, storage_bucket: storageBucket, sort_order: index })
    }

    if (mediaRows.length) {
      const { error: mediaError } = await db.from('note_media').insert(mediaRows)
      if (mediaError) throw mediaError
      const { error: coverError } = await db.from('notes').update({ cover_url: mediaRows[0].storage_path }).eq('id', note.id)
      if (coverError) throw coverError
    }
    return note.id as string
  } catch (error) {
    await db.from('notes').delete().eq('id', note.id)
    throw error
  }
}
