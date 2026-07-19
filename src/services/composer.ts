import { supabase } from '@/lib/supabase'
import type { PreparedImage } from '@/utils/images'

export type DraftInput = {
  authorId: string
  draftId?: string | null
  title: string
  content: string
  tags: string[]
  location?: string
}

export type PublishInput = DraftInput & {
  files: PreparedImage[]
  onProgress?: (completed: number, total: number) => void
}

export async function saveDraft(input: DraftInput) {
  if (!supabase) throw new Error('请先配置 Supabase 环境变量。')
  const db = supabase as any
  const values = {
    author_id: input.authorId,
    title: input.title.trim() || '未命名草稿',
    content: input.content || ' ',
    tags: input.tags,
    location: input.location?.trim() || null,
    status: 'draft',
    updated_at: new Date().toISOString(),
  }

  if (input.draftId) {
    const { data, error } = await db
      .from('notes')
      .update(values)
      .eq('id', input.draftId)
      .eq('author_id', input.authorId)
      .eq('status', 'draft')
      .select('id,version')
      .single()
    if (error) throw error
    return data as { id: string; version: number }
  }

  const { data, error } = await db
    .from('notes')
    .insert(values)
    .select('id,version')
    .single()
  if (error) throw error
  return data as { id: string; version: number }
}

export async function publishDraft(input: PublishInput) {
  if (!supabase) throw new Error('请先配置 Supabase 环境变量。')
  const title = input.title.trim()
  const content = input.content.trim()
  if (!title) throw new Error('发布前请填写标题。')
  if (!content) throw new Error('发布前请填写正文。')
  if (input.files.length === 0) throw new Error('发布前请至少添加一张图片。')

  const client = supabase
  const db = client as any
  const draft = await saveDraft(input)
  const uploadedPaths: string[] = []
  const mediaRows: Array<Record<string, unknown>> = new Array(input.files.length)
  let cursor = 0
  let completed = 0

  async function worker() {
    while (cursor < input.files.length) {
      const index = cursor
      cursor += 1
      const asset = input.files[index]
      const extension = asset.file.name.split('.').pop()?.toLowerCase() || 'webp'
      const storagePath = `${input.authorId}/${draft.id}/${crypto.randomUUID()}.${extension}`
      const { error } = await client.storage.from('note-media').upload(storagePath, asset.file, {
        cacheControl: '31536000',
        upsert: false,
        contentType: asset.file.type,
      })
      if (error) throw error
      uploadedPaths.push(storagePath)
      mediaRows[index] = {
        note_id: draft.id,
        storage_path: storagePath,
        sort_order: index,
        width: asset.width,
        height: asset.height,
        mime_type: asset.file.type,
        size_bytes: asset.file.size,
        upload_state: 'ready',
        alt_text: title,
      }
      completed += 1
      input.onProgress?.(completed, input.files.length)
    }
  }

  try {
    const workerCount = Math.min(3, Math.max(1, input.files.length))
    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    if (mediaRows.length > 0) {
      const { error: mediaError } = await db.from('note_media').insert(mediaRows)
      if (mediaError) throw mediaError
    }

    const publishedAt = new Date().toISOString()
    const { error: publishError } = await db
      .from('notes')
      .update({
        title,
        content,
        tags: input.tags,
        location: input.location?.trim() || null,
        cover_url: mediaRows[0]?.storage_path ?? null,
        status: 'published',
        published_at: publishedAt,
        updated_at: publishedAt,
        version: draft.version + 1,
      })
      .eq('id', draft.id)
      .eq('author_id', input.authorId)
      .eq('status', 'draft')
    if (publishError) throw publishError

    return draft.id
  } catch (error) {
    try {
      if (uploadedPaths.length > 0) await client.storage.from('note-media').remove(uploadedPaths)
    } catch {
      // A scheduled storage cleanup can remove any remaining temporary files.
    }
    try {
      await db.from('note_media').delete().eq('note_id', draft.id)
    } catch {
      // Keep the draft private even if cleanup fails.
    }
    throw error
  }
}

export async function deleteDraft(draftId: string, authorId: string) {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db
    .from('notes')
    .delete()
    .eq('id', draftId)
    .eq('author_id', authorId)
    .eq('status', 'draft')
  if (error) throw error
}
