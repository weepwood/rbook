import { supabase } from '@/lib/supabase'
import type { NotificationItem } from '@/types'

export async function fetchNotifications(userId: string): Promise<NotificationItem[]> {
  if (!supabase) return []
  const db = supabase as any
  const { data, error } = await db
    .from('notifications')
    .select(`
      id,recipient_id,actor_id,kind,note_id,comment_id,message,read_at,created_at,
      profiles!notifications_actor_id_fkey (id,display_name,avatar_url)
    `)
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    recipient_id: row.recipient_id,
    actor_id: row.actor_id,
    kind: row.kind,
    note_id: row.note_id,
    comment_id: row.comment_id,
    message: row.message,
    read_at: row.read_at,
    created_at: row.created_at,
    actor: row.profiles ?? null,
  }))
}

export async function markNotificationsRead(userId: string) {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .is('read_at', null)
  if (error) throw error
}
