import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { authService } from '../../services/auth'
import { setupService } from '../../services/setup'
import { PageSpinner } from '../ui/Spinner'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, accessToken, setAuth, logout } = useAuthStore()
  const [isChecking, setIsChecking] = useState(true)
  const [initialized, setInitialized] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const status = await setupService.status()
        if (cancelled) return
        setInitialized(status.initialized)

        if (!status.initialized) {
          setIsChecking(false)
          return
        }

        if (user && accessToken) {
          setIsChecking(false)
          return
        }

        const refreshData = await authService.refresh()
        if (cancelled) return
        useAuthStore.getState().updateToken(refreshData.access_token)
        const userData = await authService.me()
        if (cancelled) return
        setAuth(userData, refreshData.access_token)
      } catch {
        if (!cancelled) logout()
      } finally {
        if (!cancelled) setIsChecking(false)
      }
    }

    check()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isChecking) return <PageSpinner />
  if (initialized === false) return <Navigate to="/setup" replace />
  if (!user || !accessToken) return <Navigate to="/login" replace />

  return <>{children}</>
}
