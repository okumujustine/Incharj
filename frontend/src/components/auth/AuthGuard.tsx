import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { authService } from '../../services/auth'
import { PageSpinner } from '../ui/Spinner'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, accessToken, setAuth, logout } = useAuthStore()
  const [isChecking, setIsChecking] = useState(!user || !accessToken)

  useEffect(() => {
    if (user && accessToken) {
      setIsChecking(false)
      return
    }

    let cancelled = false

    async function verifyAuth() {
      try {
        const refreshData = await authService.refresh()
        if (cancelled) return
        // Put token in store before calling /me so the interceptor can attach it
        useAuthStore.getState().updateToken(refreshData.access_token)
        const userData = await authService.me()
        if (cancelled) return
        setAuth(userData, refreshData.access_token)
      } catch {
        if (!cancelled) {
          logout()
        }
      } finally {
        if (!cancelled) setIsChecking(false)
      }
    }

    verifyAuth()

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isChecking) {
    return <PageSpinner />
  }

  if (!user || !accessToken) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
