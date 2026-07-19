import { supabase } from '@/lib/supabase'

export type ReportCategory = 'spam' | 'harassment' | 'misinformation' | 'copyright' | 'adult' | 'other'

export async function submitContentReport(input: {
  reporterId: string
  noteId?: string
  commentId?: string
  category: ReportCategory
  reason: string
  snapshot?: Record<string, unknown>
}) {
  if (!supabase) throw new Error('请先连接 Supabase。')
  const db = supabase as any
  const { error } = await db.from('content_reports').insert({
    reporter_id: input.reporterId,
    note_id: input.noteId ?? null,
    comment_id: input.commentId ?? null,
    category: input.category,
    reason: input.reason.trim(),
    content_snapshot: input.snapshot ?? {},
  })
  if (error) {
    if (String(error.code) === '23505') throw new Error('相同类型的举报正在处理中，请勿重复提交。')
    throw error
  }
}
