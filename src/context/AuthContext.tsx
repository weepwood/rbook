/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { AccessLevel, AccountState, Profile, UserAccess } from '@/types'

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: Profile | null
  access: UserAccess | null
  accessLevel: AccessLevel
  accountState: AccountState
  isAdmin: boolean
  isModerator: boolean
  loading: boolean
  configured: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [access, setAccess] = useState<UserAccess | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  const loadIdentity = useCallback(async (userId?: string) => {
    if (!supabase || !userId) {
      setProfile(null)
      setAccess(null)
      return
    }

    const db = supabase as any
    const [profileResult, accessResult] = await Promise.all([
      db.from('profiles').select('id,username,display_name,avatar_url,bio,location,follower_count,following_count,note_count,created_at,updated_at').eq('id', userId).maybeSingle(),
      db.from('user_access').select('user_id,access_level,state,updated_at').eq('user_id', userId).maybeSingle(),
    ])

    setProfile(profileResult.data ?? null)
    setAccess(accessResult.data ?? { user_id: userId, access_level: 'member', state: 'enabled' })
  }, [])

  const refreshProfile = useCallback(async () => {
    await loadIdentity(session?.user.id)
  }, [loadIdentity, session?.user.id])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadIdentity(data.session?.user.id)
      if (active) setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      void loadIdentity(nextSession?.user.id).finally(() => setLoading(false))
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [loadIdentity])

  const accessLevel = access?.access_level ?? 'member'
  const accountState = access?.state ?? 'enabled'
  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      access,
      accessLevel,
      accountState,
      isAdmin: accessLevel === 'administrator' && accountState === 'enabled',
      isModerator: (accessLevel === 'moderator' || accessLevel === 'administrator') && accountState === 'enabled',
      loading,
      configured: isSupabaseConfigured,
      refreshProfile,
      signOut: async () => {
        if (supabase) await supabase.auth.signOut()
      },
    }),
    [session, profile, access, accessLevel, accountState, loading, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
