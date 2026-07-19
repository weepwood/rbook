import { useEffect, useMemo, useState } from 'react'
import { Activity, Ban, CheckCircle2, Clock3, Eye, FileText, Flag, Globe2, LoaderCircle, MessageSquare, RefreshCw, ShieldAlert, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  fetchDashboard,
  fetchManagedUsers,
  reviewReport,
  setCommentVisibility,
  setNoteVisibility,
  updateUserAccess,
  type ContentReport,
  type DashboardData,
  type ManagedUser,
} from '@/services/admin'
import type { AccessLevel, AccountState } from '@/types'

type Tab = 'overview' | 'users' | 'access' | 'reports'

const reportCategoryLabels: Record<ContentReport['category'], string> = {
  spam: '垃圾信息',
  harassment: '骚扰攻击',
  misinformation: '虚假内容',
  copyright: '侵权内容',
  adult: '色情低俗',
  other: '其他问题',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return '未知设备'
  if (/mobile|android|iphone/i.test(userAgent)) return '移动设备'
  if (/windows/i.test(userAgent)) return 'Windows'
  if (/macintosh|mac os/i.test(userAgent)) return 'macOS'
  if (/linux/i.test(userAgent)) return 'Linux'
  return '桌面浏览器'
}

function snapshotText(report: ContentReport) {
  const title = typeof report.content_snapshot?.title === 'string' ? report.content_snapshot.title : ''
  const content = typeof report.content_snapshot?.content === 'string' ? report.content_snapshot.content : ''
  return { title, content }
}

function ManagedUserRow({ item, onSaved }: { item: ManagedUser; onSaved: () => void }) {
  const [level, setLevel] = useState<AccessLevel>(item.access.access_level)
  const [state, setState] = useState<AccountState>(item.access.state)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      await updateUserAccess(item.id, level, state)
      onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <td>
        <div className="admin-user-cell">
          <span>{item.profile?.display_name?.slice(0, 1) ?? item.email?.slice(0, 1).toUpperCase() ?? 'R'}</span>
          <div><strong>{item.profile?.display_name ?? '未设置昵称'}</strong><small>{item.email ?? '无邮箱'}</small></div>
        </div>
      </td>
      <td><select value={level} onChange={(event) => setLevel(event.target.value as AccessLevel)}><option value="member">普通用户</option><option value="moderator">审核员</option><option value="administrator">管理员</option></select></td>
      <td><select value={state} onChange={(event) => setState(event.target.value as AccountState)}><option value="enabled">正常</option><option value="disabled">已停用</option></select></td>
      <td>{item.email_confirmed_at ? <span className="status-positive"><CheckCircle2 size={14} />已验证</span> : <span className="status-muted">未验证</span>}</td>
      <td>{item.last_sign_in_at ? formatDate(item.last_sign_in_at) : '从未登录'}</td>
      <td>
        <button className="table-action" disabled={saving} onClick={save}>{saving ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}保存</button>
        {error && <small className="row-error">{error}</small>}
      </td>
    </tr>
  )
}

export function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionId, setActionId] = useState('')

  async function load() {
    if (!isAdmin) return
    setLoading(true)
    setError('')
    try {
      const [dashboardData, userData] = await Promise.all([fetchDashboard(), fetchManagedUsers()])
      setDashboard(dashboardData)
      setUsers(userData.users)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '后台数据加载失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [isAdmin])

  const chartMax = useMemo(() => Math.max(1, ...(dashboard?.daily.map((item) => item.visits) ?? [1])), [dashboard])

  async function handleReport(report: ContentReport, action: 'hide' | 'dismiss') {
    setActionId(report.id)
    setError('')
    try {
      if (action === 'hide') {
        if (report.note_id) await setNoteVisibility(report.note_id, true, `举报处理：${report.reason}`)
        if (report.comment_id) await setCommentVisibility(report.comment_id, true)
        await reviewReport(report.id, 'resolved', `已核实“${reportCategoryLabels[report.category]}”问题并隐藏相关内容。`)
      } else {
        await reviewReport(report.id, 'dismissed', '已审核现有内容与上下文，暂未发现违反社区规范的情况。')
      }
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '举报处理失败。')
    } finally {
      setActionId('')
    }
  }

  if (authLoading) return <div className="state-panel"><LoaderCircle className="spin" />正在验证管理员权限…</div>
  if (!isAdmin) {
    return <div className="admin-denied"><ShieldAlert size={44} /><h1>需要管理员权限</h1><p>该页面只对已启用的管理员账号开放。</p></div>
  }

  const summary = dashboard?.summary
  const pendingReports = dashboard?.reports.filter((item) => item.review_state === 'pending') ?? []

  return (
    <div className="admin-page">
      <header className="admin-heading">
        <div><p>RBOOK CONTROL CENTER</p><h1>运营与系统后台</h1><span>用户、内容审核、互动与访问情况统一管理</span></div>
        <button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={17} />刷新</button>
      </header>

      <nav className="admin-tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><Activity size={17} />总览</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={17} />用户管理</button>
        <button className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}><Eye size={17} />访问日志</button>
        <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}><Flag size={17} />内容举报{pendingReports.length > 0 && <em>{pendingReports.length}</em>}</button>
      </nav>

      {error && <div className="admin-alert">{error}</div>}
      {loading && !dashboard ? <div className="state-panel"><LoaderCircle className="spin" />正在汇总运营数据…</div> : null}

      {dashboard && tab === 'overview' && (
        <>
          <section className="metric-grid">
            <article><Users /><span>用户总数</span><strong>{summary?.users ?? 0}</strong><small>已注册账号</small></article>
            <article><FileText /><span>公开笔记</span><strong>{summary?.published_notes ?? 0}</strong><small>当前可见内容</small></article>
            <article><MessageSquare /><span>评论总数</span><strong>{summary?.comments ?? 0}</strong><small>有效社区讨论</small></article>
            <article><Eye /><span>今日访问</span><strong>{summary?.visits_today ?? 0}</strong><small>{summary?.unique_sessions_today ?? 0} 个独立会话</small></article>
            <article><Flag /><span>待处理举报</span><strong>{summary?.pending_reports ?? 0}</strong><small>需要审核</small></article>
          </section>

          <section className="admin-grid-two">
            <article className="admin-card access-chart-card">
              <header><div><strong>近 14 日访问趋势</strong><span>页面访问次数与独立会话</span></div><Activity size={20} /></header>
              <div className="access-chart">
                {dashboard.daily.map((item) => (
                  <div className="chart-column" key={item.date} title={`${item.date}：${item.visits} 次访问`}>
                    <div className="chart-bar" style={{ height: `${Math.max(5, (item.visits / chartMax) * 100)}%` }}><span>{item.visits}</span></div>
                    <small>{item.date.slice(5)}</small>
                  </div>
                ))}
              </div>
            </article>
            <article className="admin-card top-path-card">
              <header><div><strong>热门页面</strong><span>近 14 日访问排行</span></div><Globe2 size={20} /></header>
              <div className="top-path-list">
                {dashboard.top_paths.length ? dashboard.top_paths.map((item, index) => <div key={item.path}><em>{index + 1}</em><span>{item.path}</span><strong>{item.visits}</strong></div>) : <p>尚未积累访问数据。</p>}
              </div>
            </article>
          </section>
        </>
      )}

      {tab === 'users' && (
        <section className="admin-card table-card">
          <header><div><strong>用户与权限</strong><span>调整用户角色，停用账号会同时阻止登录和社区写入</span></div><Users size={20} /></header>
          <div className="table-scroll"><table className="admin-table"><thead><tr><th>用户</th><th>角色</th><th>状态</th><th>邮箱</th><th>最近登录</th><th>操作</th></tr></thead><tbody>{users.map((item) => <ManagedUserRow key={item.id} item={item} onSaved={() => void load()} />)}</tbody></table></div>
        </section>
      )}

      {dashboard && tab === 'access' && (
        <section className="admin-card table-card">
          <header><div><strong>最近访问</strong><span>IP 仅保存脱敏网段，不记录完整地址</span></div><Eye size={20} /></header>
          <div className="table-scroll"><table className="admin-table access-table"><thead><tr><th>时间</th><th>页面</th><th>设备</th><th>位置 / IP</th><th>状态</th><th>耗时</th></tr></thead><tbody>{dashboard.recent_access.map((item) => <tr key={item.id}><td>{formatDate(item.created_at)}</td><td><code>{item.path}</code></td><td>{deviceLabel(item.user_agent)}</td><td>{[item.country, item.city].filter(Boolean).join(' · ') || '未知'}<small>{item.ip_masked ?? '—'}</small></td><td><span className={item.status_code >= 400 ? 'status-error' : 'status-positive'}>{item.status_code}</span></td><td><span className="duration"><Clock3 size={13} />{item.duration_ms ?? 0} ms</span></td></tr>)}</tbody></table></div>
        </section>
      )}

      {dashboard && tab === 'reports' && (
        <section className="admin-card table-card">
          <header><div><strong>内容举报</strong><span>按分类查看内容快照，处理结果会通知举报人并写入审计日志</span></div><Flag size={20} /></header>
          <div className="report-list">
            {dashboard.reports.length === 0 ? <p className="empty-copy">暂无举报。</p> : dashboard.reports.map((report) => {
              const snapshot = snapshotText(report)
              return (
                <article key={report.id} className={`report-item ${report.review_state}`}>
                  <div><span>{report.note_id ? '笔记举报' : '评论举报'} · {reportCategoryLabels[report.category]}</span><time>{formatDate(report.created_at)}</time></div>
                  <p>{report.reason}</p>
                  {(snapshot.title || snapshot.content) && <blockquote className="report-snapshot"><strong>{snapshot.title || '内容快照'}</strong>{snapshot.content && <span>{snapshot.content}</span>}</blockquote>}
                  {report.resolution_note && <p className="report-resolution"><strong>处理说明：</strong>{report.resolution_note}</p>}
                  <footer><em>{report.review_state === 'pending' ? '待处理' : report.review_state === 'resolved' ? '已解决' : '已驳回'}</em>{report.review_state === 'pending' && <div><button className="danger-button" disabled={actionId === report.id} onClick={() => void handleReport(report, 'hide')}><Ban size={15} />隐藏并解决</button><button className="secondary-button compact" disabled={actionId === report.id} onClick={() => void handleReport(report, 'dismiss')}>驳回</button></div>}</footer>
                </article>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
