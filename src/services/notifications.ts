import { supabase } from '@/lib/supabase'
import type { NotificationItem } from '@/types'

const notificationSelect = `
  id,recipient_id,actor_id,kind,note_id,comment_id,target_type,target_id,target_path,message,metadata,read_at,created_at,
  profiles!notifications_actor_id_fkey (id,display_name,avatar_url)
`

let notificationChannelSequence = 0

function mapNotification(row: any): NotificationItem {
  return {
    id: row.id,
    recipient_id: row.recipient_id,
    actor_id: row.actor_id,
    kind: row.kind,
    note_id: row.note_id,
    comment_id: row.comment_id,
    target_type: row.target_type,
    target_id: row.target_id,
    target_path: row.target_path,
    message: row.message,
    metadata: row.metadata ?? {},
    read_at: row.read_at,
    created_at: row.created_at,
    actor: row.profiles ?? null,
  }
}

export async function fetchNotifications(userId: string): Promise<NotificationItem[]> {
  if (!supabase) return []
  const db = supabase as any
  const { data, error } = await db
    .from('notifications')
    .select(notificationSelect)
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(80)
  if (error) throw error
  return (data ?? []).map(mapNotification)
}

export async function fetchUnreadNotificationCount(userId: string) {
  if (!supabase) return 0
  const db = supabase as any
  const { count, error } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .is('read_at', null)
  if (error) throw error
  return Number(count ?? 0)
}

export async function markNotificationRead(notificationId: string, userId: string) {
  if (!supabase) return
  const db = supabase as any
  const { error } = await db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_id', userId)
    .is('read_at', null)
  if (error) throw error
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

export function subscribeToNotifications(userId: string, onChange: () => void) {
  const client = supabase
  if (!client) return () => undefined

  notificationChannelSequence += 1
  const topic = `rbook-notifications:${userId}:${Date.now()}:${notificationChannelSequence}`

  try {
    const channel = client
      .channel(topic)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${userId}`,
      }, onChange)
      .subscribe()

    let removed = false
    return () => {
      if (removed) return
      removed = true
      void client.removeChannel(channel)
    }
  } catch (error) {
    console.warn('RBook notification realtime subscription failed', error)
    return () => undefined
  }
}
