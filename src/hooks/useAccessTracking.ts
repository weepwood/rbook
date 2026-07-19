import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

function getSessionId() {
  const key = 'rbook_access_session'
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const value = crypto.randomUUID()
  sessionStorage.setItem(key, value)
  return value
}

export function useAccessTracking() {
  const location = useLocation()

  useEffect(() => {
    const client = supabase
    if (!client) return
    const startedAt = performance.now()
    const timer = window.setTimeout(() => {
      void client.functions.invoke('track-access', {
        body: {
          session_id: getSessionId(),
          path: `${location.pathname}${location.search}`,
          method: 'PAGEVIEW',
          status_code: 200,
          duration_ms: Math.round(performance.now() - startedAt),
          referrer: document.referrer || null,
          metadata: {
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            language: navigator.language,
            online: navigator.onLine,
          },
        },
      })
    }, 350)

    return () => window.clearTimeout(timer)
  }, [location.pathname, location.search])
}
