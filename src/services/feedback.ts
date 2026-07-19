import { supabase } from '@/lib/supabase'
import type { NoteDismissReason } from '@/components/NoteCard'
import { fetchRecommendedFeed, type FeedMode } from '@/services/social'
import type { Note } from '@/types'

export async function recordNoteFeedback(noteId: string, reason: NoteDismissReason) {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db.rpc('record_note_feedback', {
    p_note_id: noteId,
    p_feedback_type: reason,
  })
  if (error) throw error
}

export async function fetchFilteredRecommendationPage(
  mode: FeedMode,
  viewerId?: string,
  limit = 20,
  offset = 0,
): Promise<{ notes: Note[]; sourceCount: number }> {
  const notes = await fetchRecommendedFeed(mode, viewerId, limit, offset)
  if (!supabase || !viewerId || notes.length === 0) return { notes, sourceCount: notes.length }

  const db = supabase as any
  const [{ data: feedbackRows, error: feedbackError }, { data: hiddenRows, error: hiddenError }] = await Promise.all([
    db.from('user_note_feedback').select('note_id').eq('user_id', viewerId).in('note_id', notes.map((note) => note.id)),
    db.from('user_hidden_authors').select('author_id').eq('user_id', viewerId).in('author_id', Array.from(new Set(notes.map((note) => note.author_id)))),
  ])
  if (feedbackError) throw feedbackError
  if (hiddenError) throw hiddenError

  const hiddenNotes = new Set((feedbackRows ?? []).map((row: any) => row.note_id))
  const hiddenAuthors = new Set((hiddenRows ?? []).map((row: any) => row.author_id))
  return {
    notes: notes.filter((note) => !hiddenNotes.has(note.id) && !hiddenAuthors.has(note.author_id)),
    sourceCount: notes.length,
  }
}
