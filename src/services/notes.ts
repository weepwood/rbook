import { demoNotes } from '@/data/demo'
import { supabase } from '@/lib/supabase'
import type { Note, Profile } from '@/types'

type FeedOptions = {
  query?: string
  tag?: string
  limit?: number
}

function publicMediaUrl(path: string) {
  if (!supabase) return path
  return supabase.storage.from('note-media').getPublicUrl(path).data.publicUrl
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

  let request = supabase
    .from('notes')
    .select(`
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
    `)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 40)

  if (options.query?.trim()) {
    const escaped = options.query.trim().replaceAll(',', ' ')
    request = request.or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`)
  }
  if (options.tag && options.tag !== '推荐') {
    request = request.contains('tags', [options.tag])
  }

  const { data, error } = await request
  if (error) throw error

  return (data ?? []).map((row: any) => {
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
    }
  })
}

export async function toggleLike(noteId: string, userId: string, active: boolean) {
  if (!supabase) return
  if (active) {
    const { error } = await supabase.from('likes').delete().eq('note_id', noteId).eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('likes').insert({ note_id: noteId, user_id: userId })
    if (error) throw error
  }
}

export async function toggleFavorite(noteId: string, userId: string, active: boolean) {
  if (!supabase) return
  if (active) {
    const { error } = await supabase.from('favorites').delete().eq('note_id', noteId).eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('favorites').insert({ note_id: noteId, user_id: userId })
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

  const { data: note, error: noteError } = await supabase
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

      mediaRows.push({
        note_id: note.id,
        storage_path: storagePath,
        sort_order: index,
      })
    }

    if (mediaRows.length) {
      const { error: mediaError } = await supabase.from('note_media').insert(mediaRows)
      if (mediaError) throw mediaError

      const { error: coverError } = await supabase
        .from('notes')
        .update({ cover_url: mediaRows[0].storage_path })
        .eq('id', note.id)
      if (coverError) throw coverError
    }

    return note.id
  } catch (error) {
    await supabase.from('notes').delete().eq('id', note.id)
    throw error
  }
}
