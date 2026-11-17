import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, tokenStore } from '../api/client.js'
import { AuthContext } from './auth-context.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On page load, restore the session if a token is saved
  useEffect(() => {
    let active = true
    async function restore() {
      if (!tokenStore.get()) {
        setLoading(false)
        return
      }
      try {
        const { data } = await api.get('/auth/me')
        if (active) setUser(data.user)
      } catch {
        tokenStore.clear()
      } finally {
        if (active) setLoading(false)
      }
    }
    restore()
    return () => {
      active = false
    }
  }, [])

  // The API client fires this when the server rejects the session
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  const login = useCallback(async (email, password, remember) => {
    const { data } = await api.post('/auth/login', { email, password })
    tokenStore.set(data.token, remember)
    setUser(data.user)
    return data.user
  }, [])

  // Reloads the signed-in user (e.g. after the pharmacy name changes in Settings)
  const refresh = useCallback(async () => {
    const { data } = await api.get('/auth/me')
    setUser(data.user)
  }, [])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const { data } = await api.post('/auth/change-password', { currentPassword, newPassword })
    tokenStore.replace(data.token)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout, refresh, changePassword }), [user, loading, login, logout, refresh, changePassword])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
