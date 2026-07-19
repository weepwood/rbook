import { supabase } from '@/lib/supabase'

export type AnalyticsPeriod = 7 | 30 | 90

export type AnalyticsMetricSet = {
  impressions: number
  views: number
  likes: number
  favorites: number
  comments: number
  shares: number
  followers: number
  avg_dwell_ms: number
  engagement_rate: number
}

export type AnalyticsDailyPoint = {
  date: string
  impressions: number
  views: number
  interactions: number
  followers: number
}

export type AnalyticsSource = {
  source: string
  count: number
}

export type AnalyticsTag = {
  tag: string
  views: number
  interactions: number
}

export type AnalyticsNote = {
  note_id: string
  title: string
  cover_url: string | null
  published_at: string | null
  impressions: number
  views: number
  likes: number
  favorites: number
  comments: number
  shares: number
  avg_dwell_ms: number
  engagement_rate: number
}

export type CreatorAnalytics = {
  period_days: number
  period_start: string
  period_end: string
  summary: AnalyticsMetricSet
  previous: AnalyticsMetricSet
  daily: AnalyticsDailyPoint[]
  sources: AnalyticsSource[]
  tags: AnalyticsTag[]
  notes: AnalyticsNote[]
}

const emptyMetrics: AnalyticsMetricSet = {
  impressions: 0,
  views: 0,
  likes: 0,
  favorites: 0,
  comments: 0,
  shares: 0,
  followers: 0,
  avg_dwell_ms: 0,
  engagement_rate: 0,
}

function asNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizeMetrics(value: Partial<AnalyticsMetricSet> | null | undefined): AnalyticsMetricSet {
  return {
    impressions: asNumber(value?.impressions),
    views: asNumber(value?.views),
    likes: asNumber(value?.likes),
    favorites: asNumber(value?.favorites),
    comments: asNumber(value?.comments),
    shares: asNumber(value?.shares),
    followers: asNumber(value?.followers),
    avg_dwell_ms: asNumber(value?.avg_dwell_ms),
    engagement_rate: asNumber(value?.engagement_rate),
  }
}

function publicMediaUrl(path: string | null) {
  if (!path || !supabase) return path
  if (/^https?:\/\//i.test(path)) return path
  return supabase.storage.from('note-media').getPublicUrl(path).data.publicUrl
}

export async function fetchCreatorAnalytics(period: AnalyticsPeriod): Promise<CreatorAnalytics> {
  if (!supabase) throw new Error('Supabase 尚未连接。')
  const db = supabase as any
  const { data, error } = await db.rpc('creator_analytics_summary', { p_days: period })
  if (error) throw error

  const value = (data ?? {}) as Partial<CreatorAnalytics>
  return {
    period_days: asNumber(value.period_days) || period,
    period_start: String(value.period_start ?? ''),
    period_end: String(value.period_end ?? ''),
    summary: normalizeMetrics(value.summary ?? emptyMetrics),
    previous: normalizeMetrics(value.previous ?? emptyMetrics),
    daily: Array.isArray(value.daily)
      ? value.daily.map((item) => ({
          date: String(item.date ?? ''),
          impressions: asNumber(item.impressions),
          views: asNumber(item.views),
          interactions: asNumber(item.interactions),
          followers: asNumber(item.followers),
        }))
      : [],
    sources: Array.isArray(value.sources)
      ? value.sources.map((item) => ({ source: String(item.source ?? 'other'), count: asNumber(item.count) }))
      : [],
    tags: Array.isArray(value.tags)
      ? value.tags.map((item) => ({ tag: String(item.tag ?? ''), views: asNumber(item.views), interactions: asNumber(item.interactions) }))
      : [],
    notes: Array.isArray(value.notes)
      ? value.notes.map((item) => ({
          note_id: String(item.note_id ?? ''),
          title: String(item.title ?? ''),
          cover_url: publicMediaUrl(item.cover_url ?? null),
          published_at: item.published_at ? String(item.published_at) : null,
          impressions: asNumber(item.impressions),
          views: asNumber(item.views),
          likes: asNumber(item.likes),
          favorites: asNumber(item.favorites),
          comments: asNumber(item.comments),
          shares: asNumber(item.shares),
          avg_dwell_ms: asNumber(item.avg_dwell_ms),
          engagement_rate: asNumber(item.engagement_rate),
        }))
      : [],
  }
}
