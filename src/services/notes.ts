import { demoNotes } from '@/data/demo'
import { supabase } from '@/lib/supabase'
import type { CommentItem, Note, Profile } from '@/types'

type FeedOptions = {
  query?: string
  tag?: string
  limit?: number
  viewerId?: string
}

type CollectionKind = 'notes' | 'favorites' | 'liked'

const noteSelect = `
  id,
  author_id,
  title,
  content,
  tags,
  location,
  cover_url,
  created_at,
  profiles!notes_author_id_fkey (
    id,
    username,
    display_name,
    avatar_url,
    bio,
    location,
    follower_count,
    following_count,
    note_count
  ),
  note_media (
    id,
    note_id,
    storage_path,
    width,
    height,
    sort_order
  ),
  likes ( count ),
  comments ( count )
`

function publicMediaUrl(path: string) {
  if (!supabase) return path
  return supabase.storage.from('note-media').getPublicUrl(path).data.publicUrl
}

async function hydrateNotes(rows: any[], viewerId?: string): Promise<Note[]> {
  const notes = (rows ?? []).map((row: any) => {
    const author = row.profiles as Profile
    const media = (row.note_media ?? [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((item: any) => ({ ...item, public_url: publicMediaUrl(item.storage_path) }))

    return {
      id: row.id,
      author_id: row.author_id,
      title: row.title,
      content: row.content,
      tags: row.tags ?? [],
      location: row.location,
      cover_url: row.cover_url ? publicMediaUrl(row.cover_url) : media[0]?.public_url ?? null,
      created_at: row.created_at,
      author,
      media,
      like_count: row.likes?.[0]?.count ?? 0,
      comment_count: row.comments?.[0]?.count ?? 0,
      favorite_count: 0,
      viewer_liked: false,
      viewer_favorited: false,
    } satisfies Note
  })

  if (!supabase || !viewerId || notes.length === 0) return notes
  const ids = notes.map((note) => note.id)
  const db = supabase as any
  const [likesResult, favoritesResult] = await Promise.all([
    db.from('likes').select('note_id').eq('user_id', viewerId).in('note_id', ids),
    db.from('favorites').select('note_id').eq('user_id', viewerId).in('note_id', ids),
  ])
  const liked = new Set((likesResult.data ?? []).map((row: any) => row.note_id))
  const favorited = new Set((favoritesResult.data ?? []).map((row: any) => row.note_id))
  return notes.map((note) => ({ ...note, viewer_liked: liked.has(note.id), viewer_favorited: favorited.has(note.id) }))
}

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
  if (!supabase) return kind === 'notes' ? demoNotes : demoNotes.slice(0, 2)
  const db = supabase as any

  if (kind === 'notes') {
    const { data, error } = await db
      .from('notes')
      .select(noteSelect)
      .eq('author_id', userId)
      .eq('status', 'published')
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
      id,note_id,author_id,parent_id,content,created_at,updated_at,
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
  files: File[]
}) {
  if (!supabase) throw new Error('请先配置 Supabase 环境变量。')
  const db = supabase as any
  const { data: note, error: noteError } = await db
    .from('notes')
    .insert({
      author_id: input.authorId,
      title: input.title,
      content: input.content,
      tags: input.tags,
      location: input.location || null,
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
      const { error: uploadError } = await supabase.storage.from('note-media').upload(storagePath, file, {
        cacheControl: '31536000',
        upsert: false,
      })
      if (uploadError) throw uploadError
      mediaRows.push({ note_id: note.id, storage_path: storagePath, sort_order: index })
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
