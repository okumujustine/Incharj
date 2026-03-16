import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { authService } from '../services/auth'
import type { LoginPayload, RegisterPayload } from '../types'

export function useAuth() {
  const navigate = useNavigate()
  const { user, accessToken, currentOrg, setAuth, setCurrentOrg, logout: storeLogout } = useAuthStore()

  const login = useCallback(
    async (payload: LoginPayload) => {
      const data = await authService.login(payload)
      // Token first so /auth/me request is authenticated
      useAuthStore.getState().updateToken(data.access_token)
      const user = await authService.me()
      setAuth(user, data.access_token)
      return data
    },
    [setAuth]
  )

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const data = await authService.register(payload)
      useAuthStore.getState().updateToken(data.access_token)
      const user = await authService.me()
      setAuth(user, data.access_token)
      return data
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
    register,
    logout,
    setCurrentOrg,
  }
}
