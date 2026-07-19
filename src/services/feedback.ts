import { supabase } from '@/lib/supabase'
import type { NoteDismissReason } from '@/components/NoteCard'

export async function recordNoteFeedback(noteId: string, reason: NoteDismissReason) {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.rpc('record_note_feedback', {
    p_note_id: noteId,
    p_feedback_type: reason,
  })
  if (error) throw error
}
