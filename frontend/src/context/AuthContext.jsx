import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext(null)

// The role comes from app_metadata inside the verified JWT — the same claim the
// backend and RLS policies use. Hiding UI by role is a convenience only; the
// API enforces every permission.
function roleFrom(session) {
  const role = session?.user?.app_metadata?.role
  return ['admin', 'organizer', 'staff'].includes(role) ? role : 'staff'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback(async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error
    return data
  }, [])

  const signOut = useCallback(() => supabase.auth.signOut(), [])

  // Pull a fresh JWT, e.g. after an admin changed this user's role.
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.refreshSession()
    setSession(data.session)
  }, [])

  const value = useMemo(() => {
    const role = roleFrom(session)
    return {
      session,
      user: session?.user ?? null,
      role,
      isAdmin: role === 'admin',
      canManage: role === 'admin' || role === 'organizer',
      loading,
      signIn,
      signUp,
      signOut,
      refresh,
    }
  }, [session, loading, signIn, signUp, signOut, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
