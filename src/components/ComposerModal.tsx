import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Cloud, Globe2, ImagePlus, LoaderCircle, Lock, MapPin, Save, Star, Trash2, X } from 'lucide-react'
import { publishDraft, saveDraft } from '@/services/composer'
import type { NoteVisibility } from '@/types'
import { prepareImage, type PreparedImage } from '@/utils/images'

type Props = {
  open: boolean
  userId: string
  initialTopic?: string | null
  onClose: () => void
  onPublished: () => void
}

type ComposerImage = PreparedImage & {
  id: string
  preview: string
}

type StoredDraft = {
  draftId: string | null
  title: string
  content: string
  tagText: string
  location: string
  visibility: NoteVisibility
  updatedAt: string
}

function draftKey(userId: string) {
  return `rbook-composer-draft:${userId}`
}

function normalizeTopic(value?: string | null) {
  return value?.trim().replace(/^#+/, '').slice(0, 60) ?? ''
}

export function ComposerModal({ open, userId, initialTopic, onClose, onPublished }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagText, setTagText] = useState('')
  const [location, setLocation] = useState('')
  const [visibility, setVisibility] = useState<NoteVisibility>('public')
  const [images, setImages] = useState<ComposerImage[]>([])
  const [busy, setBusy] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 })
  const [message, setMessage] = useState('')

  const tags = useMemo(
    () => tagText.split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8),
    [tagText],
  )

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !busy && !processing) {
        event.preventDefault()
        formRef.current?.requestSubmit()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, busy, processing, onClose])

  useEffect(() => {
    if (!open) return
    const stored = localStorage.getItem(draftKey(userId))
    if (!stored) return
    try {
      const draft = JSON.parse(stored) as Partial<StoredDraft>
      setDraftId(draft.draftId ?? null)
      setTitle(draft.title ?? '')
      setContent(draft.content ?? '')
      setTagText(draft.tagText ?? '')
      setLocation(draft.location ?? '')
      setVisibility(draft.visibility === 'private' ? 'private' : 'public')
      setSavedAt(draft.updatedAt ?? null)
    } catch {
      localStorage.removeItem(draftKey(userId))
    }
  }, [open, userId])

  useEffect(() => {
    if (!open) return
    const topic = normalizeTopic(initialTopic)
    if (!topic) return
    setTagText((current) => {
      const currentTags = current.split(/[，,\s]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)
      if (currentTags.includes(topic.toLowerCase())) return current
      return [current.trim(), topic].filter(Boolean).join(' ')
    })
  }, [open, initialTopic])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      const updatedAt = new Date().toISOString()
      const draft: StoredDraft = { draftId, title, content, tagText, location, visibility, updatedAt }
      localStorage.setItem(draftKey(userId), JSON.stringify(draft))
      setSavedAt(updatedAt)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [open, userId, draftId, title, content, tagText, location, visibility])

  useEffect(() => {
    if (!open || (!title.trim() && !content.trim()) || busy) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSavingDraft(true)
      saveDraft({ authorId: userId, draftId, title, content, tags, location, visibility })
        .then((draft) => {
          if (!cancelled) {
            setDraftId(draft.id)
            setSavedAt(new Date().toISOString())
          }
        })
        .catch(() => {
          // 本地草稿仍然保留；网络恢复后下一次输入会继续尝试同步。
        })
        .finally(() => {
          if (!cancelled) setSavingDraft(false)
        })
    }, 1800)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, userId, draftId, title, content, tags, location, visibility, busy])

  if (!open) return null

  async function addFiles(files: File[]) {
    const remaining = Math.max(0, 9 - images.length)
    const selected = files.slice(0, remaining)
    if (!selected.length) return
    setProcessing(true)
    setMessage('')
    try {
      const prepared = await Promise.all(selected.map(prepareImage))
      setImages((current) => [
        ...current,
        ...prepared.map((item) => ({ ...item, id: crypto.randomUUID(), preview: URL.createObjectURL(item.file) })),
      ])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '图片处理失败。')
    } finally {
      setProcessing(false)
    }
  }

  function removeImage(index: number) {
    setImages((current) => {
      const target = current[index]
      if (target) URL.revokeObjectURL(target.preview)
      return current.filter((_, itemIndex) => itemIndex !== index)
    })
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next
    })
  }

  function makeCover(index: number) {
    if (index === 0) return
    setImages((current) => {
      const next = [...current]
      const [selected] = next.splice(index, 1)
      next.unshift(selected)
      return next
    })
  }

  async function persistDraft() {
    if (!title.trim() && !content.trim()) return setMessage('请先填写一些内容。')
    setSavingDraft(true)
    setMessage('')
    try {
      const draft = await saveDraft({ authorId: userId, draftId, title, content, tags, location, visibility })
      setDraftId(draft.id)
      const now = new Date().toISOString()
      setSavedAt(now)
      localStorage.setItem(draftKey(userId), JSON.stringify({ draftId: draft.id, title, content, tagText, location, visibility, updatedAt: now } satisfies StoredDraft))
      setMessage('草稿已同步。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '草稿同步失败，本地版本仍然保留。')
    } finally {
      setSavingDraft(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!images.length) return setMessage('请至少添加一张图片。')
    setBusy(true)
    setMessage('')
    setUploadProgress({ completed: 0, total: images.length })
    try {
      await publishDraft({
        authorId: userId,
        draftId,
        title,
        content,
        tags,
        location,
        visibility,
        files: images,
        onProgress: (completed, total) => setUploadProgress({ completed, total }),
      })
      images.forEach((image) => URL.revokeObjectURL(image.preview))
      setDraftId(null)
      setTitle('')
      setContent('')
      setTagText('')
      setLocation('')
      setVisibility('public')
      setImages([])
      setSavedAt(null)
      localStorage.removeItem(draftKey(userId))
      onPublished()
      onClose()
    } catch (error) {
      setMessage(error instanceof Error ? `${error.message}。草稿已保留，可稍后重试。` : '发布失败，草稿已保留。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={busy ? undefined : onClose}>
      <section className="composer-modal composer-workbench" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="composer-title">
        <header className="composer-header">
          <button className="icon-button" onClick={onClose} aria-label="关闭" disabled={busy}><X size={20} /></button>
          <div className="composer-title-group">
            <h2 id="composer-title">发布笔记</h2>
            <span className="draft-status"><Cloud size={13} />{savingDraft ? '正在同步草稿…' : savedAt ? `已保存 ${new Date(savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '自动保存已开启'}</span>
          </div>
          <div className="composer-header-actions">
            <button type="button" className="secondary-button compact" onClick={() => void persistDraft()} disabled={savingDraft || busy}><Save size={15} />保存草稿</button>
            <button form="composer-form" className="primary-button compact" disabled={busy || processing}>
              {busy ? `上传 ${uploadProgress.completed}/${uploadProgress.total}` : visibility === 'private' ? '保存私密笔记' : '发布'}
            </button>
          </div>
        </header>

        <form ref={formRef} id="composer-form" className="composer-form" onSubmit={submit}>
          <section className="composer-media-pane">
            <div className="composer-pane-heading"><strong>图片</strong><span>最多 9 张，首张图片作为封面</span></div>
            <label className={images.length ? 'upload-zone compact' : 'upload-zone'}>
              {processing ? <LoaderCircle className="spin" size={28} /> : <ImagePlus size={28} />}
              <strong>{processing ? '正在处理图片…' : images.length ? '继续添加' : '上传图片'}</strong>
              <span>{images.length ? `已选择 ${images.length}/9 张` : '支持 JPEG、PNG、WebP 和 AVIF'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                disabled={processing || busy || images.length >= 9}
                onChange={(event) => {
                  void addFiles(Array.from(event.target.files ?? []))
                  event.currentTarget.value = ''
                }}
              />
            </label>

            {images.length > 0 && (
              <div className="composer-image-grid">
                {images.map((image, index) => (
                  <article key={image.id} className={index === 0 ? 'composer-image-item cover' : 'composer-image-item'}>
                    <img src={image.preview} alt={`预览 ${index + 1}`} />
                    {index === 0 && <span className="cover-label"><Star size={12} />封面</span>}
                    <div className="composer-image-actions">
                      <button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0} aria-label="前移"><ArrowLeft size={15} /></button>
                      <button type="button" onClick={() => moveImage(index, 1)} disabled={index === images.length - 1} aria-label="后移"><ArrowRight size={15} /></button>
                      {index > 0 && <button type="button" onClick={() => makeCover(index)} aria-label="设为封面"><Star size={15} /></button>}
                      <button type="button" onClick={() => removeImage(index)} aria-label="移除"><Trash2 size={15} /></button>
                    </div>
                    <small>{Math.max(1, Math.round(image.file.size / 1024))} KB</small>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="composer-editor-pane">
            <div className="composer-pane-heading"><strong>笔记内容</strong><span>标题清楚、正文具体，更容易被找到</span></div>
            <input
              className="title-input"
              placeholder="填写标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              required
              autoFocus
            />
            <textarea
              placeholder="分享你的经验、过程与真实感受…"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={9}
              maxLength={3000}
              required
            />
            <div className="composer-field-meta"><span>{content.length}/3000</span><span>{tags.length}/8 个话题</span></div>

            <label className="composer-field-row">
              <span>话题</span>
              <input placeholder="输入话题，用空格分隔" value={tagText} onChange={(event) => setTagText(event.target.value)} />
            </label>

            <label className="composer-field-row location-field">
              <span><MapPin size={15} />地点</span>
              <input placeholder="添加地点" value={location} onChange={(event) => setLocation(event.target.value)} />
            </label>

            <section className="visibility-picker" aria-label="笔记可见范围">
              <button type="button" className={visibility === 'public' ? 'active' : ''} onClick={() => setVisibility('public')}>
                <Globe2 size={18} />
                <span><strong>公开</strong><small>进入推荐、搜索和个人主页</small></span>
              </button>
              <button type="button" className={visibility === 'private' ? 'active' : ''} onClick={() => setVisibility('private')}>
                <Lock size={18} />
                <span><strong>私密</strong><small>仅自己可见，图片受保护</small></span>
              </button>
            </section>

            {visibility === 'private' && <p className="privacy-hint"><Lock size={14} />私密笔记不会进入推荐、搜索或社交互动。</p>}
            {message && <p className="form-message">{message}</p>}
            <div className="composer-shortcut-hint">Ctrl / ⌘ + Enter 快速发布</div>
          </section>
        </form>
      </section>
    </div>
  )
}
