import { supabase } from '@/lib/supabase'
import type { Note, Profile } from '@/types'

export const noteSelect = `
  id,
  author_id,
  title,
  content,
  tags,
  location,
  cover_url,
  visibility,
  view_count,
  created_at,
  updated_at,
  published_at,
  status,
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
    storage_bucket,
    width,
    height,
    sort_order,
    mime_type,
    size_bytes,
    thumbnail_path,
    alt_text,
    upload_state
  ),
  likes ( count ),
  favorites ( count ),
  comments ( count )
`

type SignedUrlMap = Map<string, string>

async function createPrivateSignedUrls(rows: any[]): Promise<SignedUrlMap> {
  const result = new Map<string, string>()
  if (!supabase) return result

  const paths = Array.from(new Set(
    rows.flatMap((row: any) => (row.note_media ?? [])
      .filter((item: any) => (item.storage_bucket ?? (row.visibility === 'private' ? 'private-note-media' : 'note-media')) === 'private-note-media')
      .map((item: any) => item.storage_path)
      .filter(Boolean)),
  )) as string[]

  if (!paths.length) return result

  const { data, error } = await supabase.storage.from('private-note-media').createSignedUrls(paths, 60 * 60)
  if (error) throw error

  for (const item of data ?? []) {
    if (item.path && item.signedUrl) result.set(item.path, item.signedUrl)
  }
  return result
}

function resolveMediaUrl(path: string, bucket: string, signedUrls: SignedUrlMap) {
  if (!supabase) return path
  if (bucket === 'private-note-media') return signedUrls.get(path) ?? null
  return supabase.storage.from('note-media').getPublicUrl(path).data.publicUrl
}

export async function hydrateNotes(
  rows: any[],
  viewerId?: string,
  reasons = new Map<string, string>(),
): Promise<Note[]> {
  const signedUrls = await createPrivateSignedUrls(rows ?? [])

  const notes = (rows ?? []).map((row: any) => {
    const visibility = row.visibility === 'private' ? 'private' : 'public'
    const media = (row.note_media ?? [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((item: any) => {
        const storageBucket = item.storage_bucket ?? (visibility === 'private' ? 'private-note-media' : 'note-media')
        return {
          ...item,
          storage_bucket: storageBucket,
          public_url: resolveMediaUrl(item.storage_path, storageBucket, signedUrls) ?? undefined,
        }
      })

    const coverBucket = media[0]?.storage_bucket ?? (visibility === 'private' ? 'private-note-media' : 'note-media')
    const coverUrl = media[0]?.public_url
      ?? (row.cover_url ? resolveMediaUrl(row.cover_url, coverBucket, signedUrls) : null)

    return {
      id: row.id,
      author_id: row.author_id,
      title: row.title,
      content: row.content,
      tags: row.tags ?? [],
      location: row.location,
      cover_url: coverUrl,
      visibility,
      view_count: Number(row.view_count ?? 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
      published_at: row.published_at,
      status: row.status,
      author: row.profiles as Profile,
      media,
      like_count: row.likes?.[0]?.count ?? 0,
      favorite_count: row.favorites?.[0]?.count ?? 0,
      comment_count: row.comments?.[0]?.count ?? 0,
      viewer_liked: false,
      viewer_favorited: false,
      recommendation_reason: reasons.get(row.id),
    } satisfies Note
  })

  if (!supabase || !viewerId || notes.length === 0) return notes

  const db = supabase as any
  const ids = notes.filter((note) => note.visibility === 'public').map((note) => note.id)
  if (!ids.length) return notes

  const [likes, favorites] = await Promise.all([
    db.from('likes').select('note_id').eq('user_id', viewerId).in('note_id', ids),
    db.from('favorites').select('note_id').eq('user_id', viewerId).in('note_id', ids),
  ])
  const liked = new Set((likes.data ?? []).map((row: any) => row.note_id))
  const saved = new Set((favorites.data ?? []).map((row: any) => row.note_id))

  return notes.map((note) => ({
    ...note,
    viewer_liked: note.visibility === 'public' && liked.has(note.id),
    viewer_favorited: note.visibility === 'public' && saved.has(note.id),
  }))
}
