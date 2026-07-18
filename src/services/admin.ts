import { supabase } from '@/lib/supabase'
import type { AccessLevel, AccountState, Profile, UserAccess } from '@/types'

export type DashboardSummary = {
  users: number
  published_notes: number
  comments: number
  pending_reports: number
  visits_today: number
  unique_sessions_today: number
}

export type DailyAccess = {
  date: string
  visits: number
  unique_sessions: number
  errors: number
  average_duration_ms: number
}

export type AccessLog = {
  id: number
  user_id: string | null
  path: string
  status_code: number
  duration_ms: number | null
  ip_masked: string | null
  country: string | null
  city: string | null
  user_agent: string | null
  referrer: string | null
  created_at: string
}

export type ContentReport = {
  id: string
  reason: string
  review_state: 'pending' | 'resolved' | 'dismissed'
  created_at: string
  note_id: string | null
  comment_id: string | null
  reporter_id: string
}

export type DashboardData = {
  summary: DashboardSummary
  daily: DailyAccess[]
  top_paths: Array<{ path: string; visits: number }>
  recent_access: AccessLog[]
  reports: ContentReport[]
}

export type ManagedUser = {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  banned_until: string | null
  profile: Profile | null
  access: UserAccess
}

async function administratorRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabase) throw new Error('Supabase 尚未连接。')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('请先登录管理员账号。')
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!baseUrl || !publishableKey) throw new Error('缺少 Supabase 环境变量。')

  const response = await fetch(`${baseUrl}/functions/v1/admin-console${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `管理员接口请求失败（${response.status}）`)
  return payload as T
}

export function fetchDashboard() {
  return administratorRequest<DashboardData>('')
}

export function fetchManagedUsers(page = 1, perPage = 50) {
  return administratorRequest<{ users: ManagedUser[]; total: number; page: number; per_page: number }>(`?view=users&page=${page}&per_page=${perPage}`)
}

export function updateUserAccess(targetId: string, accessLevel: AccessLevel, state: AccountState) {
  return administratorRequest<{ ok: boolean }>('', {
    method: 'POST',
    body: JSON.stringify({ action: 'update_access', target_id: targetId, target_type: 'user', access_level: accessLevel, state }),
  })
}

export function setNoteVisibility(targetId: string, hidden: boolean, reason?: string) {
  return administratorRequest<{ ok: boolean }>('', {
    method: 'POST',
    body: JSON.stringify({ action: 'set_note_visibility', target_id: targetId, target_type: 'note', hidden, reason }),
  })
}

export function setCommentVisibility(targetId: string, hidden: boolean) {
  return administratorRequest<{ ok: boolean }>('', {
    method: 'POST',
    body: JSON.stringify({ action: 'set_comment_visibility', target_id: targetId, target_type: 'comment', hidden }),
  })
}

export function reviewReport(targetId: string, reviewState: 'resolved' | 'dismissed') {
  return administratorRequest<{ ok: boolean }>('', {
    method: 'POST',
    body: JSON.stringify({ action: 'review_report', target_id: targetId, target_type: 'report', review_state: reviewState }),
  })
}
