import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCheck, LoaderCircle, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  fetchNotifications,
  markNotificationRead,
  markNotificationsRead,
} from '@/services/notifications'
import type { NotificationItem } from '@/types'

type Props = {
  open: boolean
  userId: string
  refreshKey: number
  onClose: () => void
  onUnreadChange?: (count: number) => void
}

function notificationText(item: NotificationItem) {
  const actor = item.actor?.display_name ?? '一位用户'
  if (item.message) return item.message
  if (item.kind === 'like') return `${actor} 赞了你的笔记`
  if (item.kind === 'comment') return `${actor} 评论了你的笔记`
  if (item.kind === 'reply') return `${actor} 回复了你的评论`
  if (item.kind === 'follow') return `${actor} 关注了你`
  return '你有一条系统通知'
}

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return `${Math.floor(seconds / 86400)} 天前`
}

function targetPath(item: NotificationItem) {
  if (item.target_path) return item.target_path
  if (item.note_id) return `/note/${item.note_id}${item.comment_id ? `#comment-${item.comment_id}` : ''}`
  const username = typeof item.metadata?.username === 'string' ? item.metadata.username : null
  if (item.kind === 'follow' && username) return `/user/${username}`
  return null
}

export function NotificationPanel({ open, userId, refreshKey, onClose, onUnreadChange }: Props) {
  const navigate = useNavigate()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setMessage('')
    const data = await fetchNotifications(userId)
    setItems(data)
    onUnreadChange?.(data.filter((item) => !item.read_at).length)
  }, [userId, onUnreadChange])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    load()
      .catch((error) => setMessage(error instanceof Error ? error.message : '通知加载失败。'))
      .finally(() => setLoading(false))
  }, [open, refreshKey, load])

  if (!open) return null

  async function markAll() {
    try {
      await markNotificationsRead(userId)
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })))
      onUnreadChange?.(0)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败。')
    }
  }

  async function openItem(item: NotificationItem) {
    const path = targetPath(item)
    try {
      if (!item.read_at) await markNotificationRead(item.id, userId)
      setItems((current) => current.map((value) => value.id === item.id ? { ...value, read_at: value.read_at ?? new Date().toISOString() } : value))
      onUnreadChange?.(Math.max(0, items.filter((value) => !value.read_at).length - (item.read_at ? 0 : 1)))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '标记通知失败。')
    }
    if (path) {
      navigate(path)
      onClose()
    }
  }

  return (
    <aside className="notification-panel" aria-label="通知中心">
      <header>
        <div><Bell size={19} /><strong>通知</strong></div>
        <div>
          <button className="icon-button" onClick={() => void markAll()} aria-label="全部已读"><CheckCheck size={18} /></button>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </div>
      </header>
      {loading ? (
        <div className="notification-state"><LoaderCircle className="spin" />加载通知…</div>
      ) : items.length === 0 ? (
        <div className="notification-state">暂时没有新通知。</div>
      ) : (
        <div className="notification-list">
          {items.map((item) => (
            <button key={item.id} className={item.read_at ? 'notification-item' : 'notification-item unread'} onClick={() => void openItem(item)}>
              {item.actor?.avatar_url ? <img src={item.actor.avatar_url} alt="" /> : <span>{item.actor?.display_name?.slice(0, 1) ?? 'R'}</span>}
              <div><p>{notificationText(item)}</p><time>{relativeTime(item.created_at)}</time></div>
            </button>
          ))}
        </div>
      )}
      {message && <p className="panel-message">{message}</p>}
    </aside>
  )
}
