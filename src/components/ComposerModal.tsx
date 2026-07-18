import { useMemo, useState, type FormEvent } from 'react'
import { ImagePlus, MapPin, X } from 'lucide-react'
import { publishNote } from '@/services/notes'

type Props = {
  open: boolean
  userId: string
  onClose: () => void
  onPublished: () => void
}

export function ComposerModal({ open, userId, onClose, onPublished }: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagText, setTagText] = useState('')
  const [location, setLocation] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])

  if (!open) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      await publishNote({
        authorId: userId,
        title,
        content,
        tags: tagText.split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8),
        location,
        files,
      })
      setTitle('')
      setContent('')
      setTagText('')
      setLocation('')
      setFiles([])
      onPublished()
      onClose()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '发布失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="composer-modal" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog">
        <header className="composer-header">
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
          <h2>发布笔记</h2>
          <button form="composer-form" className="primary-button compact" disabled={busy}>
            {busy ? '发布中…' : '发布'}
          </button>
        </header>
        <form id="composer-form" className="composer-form" onSubmit={submit}>
          <label className="upload-zone">
            <ImagePlus size={28} />
            <strong>添加图片</strong>
            <span>最多 9 张，建议使用竖图</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 9))}
            />
          </label>
          {previews.length > 0 && (
            <div className="preview-strip">
              {previews.map((src, index) => <img key={src} src={src} alt={`预览 ${index + 1}`} />)}
            </div>
          )}
          <input
            className="title-input"
            placeholder="填写标题会有更多赞哦"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            required
          />
          <textarea
            placeholder="分享你的经验、过程与真实感受…"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={7}
            maxLength={3000}
            required
          />
          <input placeholder="添加标签，用空格分隔" value={tagText} onChange={(event) => setTagText(event.target.value)} />
          <label className="location-field">
            <MapPin size={18} />
            <input placeholder="添加地点" value={location} onChange={(event) => setLocation(event.target.value)} />
          </label>
          {message && <p className="form-message">{message}</p>}
        </form>
      </section>
    </div>
  )
}
