import { useState, type FormEvent } from 'react'
import { Flag, LoaderCircle, X } from 'lucide-react'
import { submitContentReport, type ReportCategory } from '@/services/reports'

type Props = {
  open: boolean
  reporterId: string
  noteId: string
  snapshot: Record<string, unknown>
  onClose: () => void
  onSubmitted: () => void
}

const categories: Array<{ value: ReportCategory; label: string; description: string }> = [
  { value: 'spam', label: '垃圾信息', description: '广告、灌水、诱导跳转或重复内容' },
  { value: 'harassment', label: '骚扰攻击', description: '辱骂、威胁、仇恨或针对个人的攻击' },
  { value: 'misinformation', label: '虚假内容', description: '可能造成误导或现实伤害的不实信息' },
  { value: 'copyright', label: '侵权内容', description: '未经授权使用图片、文字或其他作品' },
  { value: 'adult', label: '色情低俗', description: '成人、露骨或不适合公开展示的内容' },
  { value: 'other', label: '其他问题', description: '不属于以上类别的社区规范问题' },
]

export function ReportDialog({ open, reporterId, noteId, snapshot, onClose, onSubmitted }: Props) {
  const [category, setCategory] = useState<ReportCategory>('spam')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (!open) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      await submitContentReport({ reporterId, noteId, category, reason, snapshot })
      setReason('')
      setCategory('spam')
      onSubmitted()
      onClose()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '举报提交失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={busy ? undefined : onClose}>
      <section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><Flag size={20} /><h2 id="report-title">举报这篇笔记</h2></div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="关闭"><X size={19} /></button>
        </header>
        <form onSubmit={submit}>
          <p>请选择最符合的原因。举报内容与当前笔记摘要会一并交给审核人员。</p>
          <div className="report-category-list">
            {categories.map((item) => (
              <label key={item.value} className={category === item.value ? 'active' : ''}>
                <input type="radio" name="report-category" value={item.value} checked={category === item.value} onChange={() => setCategory(item.value)} />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </label>
            ))}
          </div>
          <label className="report-reason-field">补充说明<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={2} maxLength={500} rows={4} required placeholder="请说明具体问题，便于审核人员判断。" /></label>
          {message && <p className="form-message">{message}</p>}
          <footer><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>取消</button><button className="danger-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Flag size={16} />}{busy ? '提交中…' : '提交举报'}</button></footer>
        </form>
      </section>
    </div>
  )
}
