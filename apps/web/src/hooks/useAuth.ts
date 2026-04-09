import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { authService } from '../services/auth'
import type { LoginPayload } from '../types'

export function useAuth() {
  const navigate = useNavigate()
  const { user, accessToken, currentOrg, setAuth, setCurrentOrg, logout: storeLogout } = useAuthStore()

  const login = useCallback(
    async (payload: LoginPayload) => {
      const data = await authService.login(payload)
      useAuthStore.getState().updateToken(data.access_token)
      const userData = await authService.me()
      setAuth(userData, data.access_token)
      return userData
    },
    [setAuth]
  )

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch {
      // ignore errors on logout
    } finally {
      storeLogout()
      navigate('/login')
    }
  }, [storeLogout, navigate])

  const isAuthenticated = !!accessToken && !!user

  return {
    user,
    accessToken,
    currentOrg,
    isAuthenticated,
    login,
    logout,
    setCurrentOrg,
  }
}
