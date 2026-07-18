import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Props = {
  open: boolean
  onClose: () => void
}

const defaultSiteUrl = 'https://rrrrbook.netlify.app'

function getEmailRedirectUrl() {
  const configuredSiteUrl = import.meta.env.VITE_SITE_URL?.trim()
  const siteUrl = configuredSiteUrl || defaultSiteUrl
  return `${siteUrl.replace(/\/$/, '')}/`
}

export function AuthModal({ open, onClose }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (!open) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) {
      setMessage('当前是演示模式。配置 .env 后即可启用登录。')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: getEmailRedirectUrl(),
          },
        })
        if (error) throw error
        setMessage('注册成功，请查收验证邮件。验证后将返回 RBook。')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onClose()
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="auth-modal" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog">
        <button className="icon-button modal-close" onClick={onClose} aria-label="关闭">
          <X size={20} />
        </button>
        <div className="auth-brand">
          <span className="brand-mark">R</span>
          <h2>{mode === 'signin' ? '登录 RBook' : '创建账号'}</h2>
          <p>记录真实、具体、有用的生活经验。</p>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && (
            <label>
              昵称
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} required />
            </label>
          )}
          <label>
            邮箱
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            密码
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
          </label>
          <button className="primary-button auth-submit" disabled={busy}>
            {busy ? '处理中…' : mode === 'signin' ? '登录' : '注册'}
          </button>
          {message && <p className="form-message">{message}</p>}
        </form>
        <button className="text-button switch-auth" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? '还没有账号？立即注册' : '已有账号？返回登录'}
        </button>
      </section>
    </div>
  )
}
