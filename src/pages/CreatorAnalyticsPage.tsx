import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  BarChart3,
  Bookmark,
  Clock3,
  Eye,
  Heart,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  fetchCreatorAnalytics,
  type AnalyticsMetricSet,
  type AnalyticsPeriod,
  type CreatorAnalytics,
} from '@/services/analytics'

const periods: AnalyticsPeriod[] = [7, 30, 90]

const sourceLabels: Record<string, string> = {
  recommendation: '推荐流',
  following: '关注流',
  latest: '最新流',
  search: '搜索',
  profile: '个人主页',
  related: '相关推荐',
  explore: '发现页',
  direct: '直接访问',
  other: '其他 / 历史数据',
}

type MetricKey = 'impressions' | 'views' | 'likes' | 'favorites' | 'comments' | 'shares' | 'followers' | 'avg_dwell_ms'

type MetricDefinition = {
  key: MetricKey
  label: string
  icon: typeof Eye
  formatter?: (value: number) => string
}

const metrics: MetricDefinition[] = [
  { key: 'impressions', label: '内容曝光', icon: Sparkles },
  { key: 'views', label: '笔记打开', icon: Eye },
  { key: 'likes', label: '获得点赞', icon: Heart },
  { key: 'favorites', label: '新增收藏', icon: Bookmark },
  { key: 'comments', label: '新增评论', icon: MessageCircle },
  { key: 'shares', label: '内容分享', icon: Share2 },
  { key: 'followers', label: '新增粉丝', icon: Users },
  { key: 'avg_dwell_ms', label: '平均停留', icon: Clock3, formatter: formatDuration },
]

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

function formatDuration(value: number) {
  if (value < 1000) return `${Math.round(value)} ms`
  if (value < 60000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} 秒`
  return `${Math.floor(value / 60000)}分${Math.round((value % 60000) / 1000)}秒`
}

function formatDate(value: string) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / previous) * 100
}

function MetricCard({ definition, current, previous }: { definition: MetricDefinition; current: AnalyticsMetricSet; previous: AnalyticsMetricSet }) {
  const Icon = definition.icon
  const value = current[definition.key]
  const change = percentChange(value, previous[definition.key])
  const positive = change >= 0
  const formatter = definition.formatter ?? formatNumber

  return (
    <article className="analytics-metric-card">
      <div className="analytics-metric-icon"><Icon size={19} /></div>
      <span>{definition.label}</span>
      <strong>{formatter(value)}</strong>
      <small className={positive ? 'positive' : 'negative'}>
        {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {Math.abs(change).toFixed(1)}% 较上一周期
      </small>
    </article>
  )
}

function Panel({ title, eyebrow, children, aside }: { title: string; eyebrow: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="analytics-panel">
      <header className="analytics-panel-heading">
        <div><p>{eyebrow}</p><h2>{title}</h2></div>
        {aside}
      </header>
      {children}
    </section>
  )
}

export function CreatorAnalyticsPage({ onLogin }: { onLogin: () => void }) {
  const { user, configured } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPeriod = Number(searchParams.get('days'))
  const period: AnalyticsPeriod = periods.includes(requestedPeriod as AnalyticsPeriod) ? requestedPeriod as AnalyticsPeriod : 30
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null)
  const [loading, setLoading] = useState(Boolean(user))
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!user) {
      setAnalytics(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetchCreatorAnalytics(period)
      .then((data) => { if (!cancelled) setAnalytics(data) })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '数据中心加载失败。') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, period, reloadKey])

  const maxDaily = useMemo(() => Math.max(1, ...(analytics?.daily.map((item) => item.views + item.interactions) ?? [1])), [analytics])
  const maxSource = useMemo(() => Math.max(1, ...(analytics?.sources.map((item) => item.count) ?? [1])), [analytics])

  if (!user) {
    return (
      <div className="analytics-auth-empty">
        <BarChart3 size={44} />
        <h1>登录后查看创作数据</h1>
        <p>了解内容曝光、互动趋势与粉丝增长，让下一篇笔记有更明确的方向。</p>
        <button className="primary-button" onClick={onLogin}>{configured ? '登录 / 注册' : '查看登录演示'}</button>
      </div>
    )
  }

  return (
    <div className="creator-analytics-page">
      <header className="creator-analytics-heading">
        <div>
          <button className="analytics-back" onClick={() => navigate('/me')}><ArrowLeft size={17} />返回个人中心</button>
          <p>CREATOR STUDIO</p>
          <h1>创作者数据中心</h1>
          <span>指标按真实曝光、打开、停留与互动事件汇总，仅你本人可见。</span>
        </div>
        <nav className="analytics-period-tabs" aria-label="统计周期">
          {periods.map((days) => (
            <button key={days} className={period === days ? 'active' : ''} onClick={() => setSearchParams({ days: String(days) })}>近 {days} 天</button>
          ))}
        </nav>
      </header>

      {error && <div className="analytics-error"><span>{error}</span><button onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={16} />重试</button></div>}

      {loading ? (
        <div className="analytics-loading"><LoaderCircle className="spin" size={24} /><span>正在聚合创作数据…</span></div>
      ) : analytics ? (
        <>
          <section className="analytics-metric-grid">
            {metrics.map((definition) => <MetricCard key={definition.key} definition={definition} current={analytics.summary} previous={analytics.previous} />)}
          </section>

          <section className="analytics-highlight-row">
            <article><span>互动率</span><strong>{analytics.summary.engagement_rate.toFixed(1)}%</strong><p>点赞、收藏、评论和分享占有效触达的比例</p></article>
            <article><span>统计周期</span><strong>{formatDate(analytics.period_start)} — {formatDate(analytics.period_end)}</strong><p>当前周期与前一等长周期进行对比</p></article>
          </section>

          <Panel title="内容趋势" eyebrow="TREND" aside={<div className="analytics-legend"><span><i className="views" />打开</span><span><i className="interactions" />互动</span></div>}>
            {analytics.daily.length ? (
              <div className="analytics-chart" role="img" aria-label="每日内容打开与互动趋势">
                {analytics.daily.map((point, index) => {
                  const total = point.views + point.interactions
                  const height = Math.max(total ? 8 : 2, (total / maxDaily) * 100)
                  const interactionRatio = total ? (point.interactions / total) * 100 : 0
                  const showLabel = analytics.daily.length <= 14 || index % Math.ceil(analytics.daily.length / 8) === 0 || index === analytics.daily.length - 1
                  return (
                    <div className="analytics-chart-column" key={point.date} title={`${point.date}：${point.views} 次打开，${point.interactions} 次互动，${point.followers} 位新粉丝`}>
                      <div className="analytics-chart-bar" style={{ height: `${height}%` }}>
                        <span className="chart-interactions" style={{ height: `${interactionRatio}%` }} />
                      </div>
                      <small>{showLabel ? formatDate(point.date) : ''}</small>
                    </div>
                  )
                })}
              </div>
            ) : <div className="analytics-empty">当前周期还没有趋势数据。</div>}
          </Panel>

          <div className="analytics-two-column">
            <Panel title="流量来源" eyebrow="TRAFFIC">
              {analytics.sources.length ? (
                <div className="analytics-source-list">
                  {analytics.sources.map((item) => (
                    <div key={item.source}>
                      <header><span>{sourceLabels[item.source] ?? item.source}</span><strong>{formatNumber(item.count)}</strong></header>
                      <div><i style={{ width: `${Math.max(3, (item.count / maxSource) * 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
              ) : <div className="analytics-empty">新的访问产生后，会在这里展示来源分布。</div>}
            </Panel>

            <Panel title="热门标签" eyebrow="TOPICS">
              {analytics.tags.length ? (
                <div className="analytics-tag-list">
                  {analytics.tags.map((item, index) => (
                    <article key={item.tag}>
                      <em>{String(index + 1).padStart(2, '0')}</em>
                      <div><strong>#{item.tag}</strong><span>{item.views} 次打开 · {item.interactions} 次互动</span></div>
                    </article>
                  ))}
                </div>
              ) : <div className="analytics-empty">发布带标签的内容后，可在这里比较话题表现。</div>}
            </Panel>
          </div>

          <Panel title="内容表现排行" eyebrow="CONTENT" aside={<span className="analytics-panel-note">按互动率与打开量综合排序</span>}>
            {analytics.notes.length ? (
              <div className="analytics-note-table">
                <div className="analytics-note-table-head"><span>笔记</span><span>打开</span><span>互动</span><span>停留</span><span>互动率</span></div>
                {analytics.notes.map((note) => {
                  const interactions = note.likes + note.favorites + note.comments + note.shares
                  return (
                    <button key={note.note_id} onClick={() => navigate(`/note/${note.note_id}`, { state: { source: 'profile' } })}>
                      <span className="analytics-note-cell">
                        {note.cover_url ? <img src={note.cover_url} alt="" /> : <i />}
                        <div><strong>{note.title}</strong><small>{note.published_at ? formatDate(note.published_at) : '草稿或未发布'}</small></div>
                      </span>
                      <span>{formatNumber(note.views)}</span>
                      <span>{formatNumber(interactions)}</span>
                      <span>{formatDuration(note.avg_dwell_ms)}</span>
                      <span><b>{note.engagement_rate.toFixed(1)}%</b></span>
                    </button>
                  )
                })}
              </div>
            ) : <div className="analytics-empty analytics-empty-large"><BarChart3 size={30} /><strong>还没有可分析的公开笔记</strong><span>发布内容并获得真实访问后，这里会形成可比较的内容排行。</span></div>}
          </Panel>
        </>
      ) : null}
    </div>
  )
}
