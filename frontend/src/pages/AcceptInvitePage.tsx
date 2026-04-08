import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Zap, CheckCircle, XCircle } from 'lucide-react'
import { authService } from '../services/auth'
import { useAuthStore } from '../stores/authStore'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage('Invalid invitation link.')
      return
    }

    async function accept() {
      try {
        const data = await authService.acceptInvite(token!)
        const resolvedUser = data.user ?? await authService.me()
        setAuth(resolvedUser, data.access_token)
        setStatus('success')
        setTimeout(() => navigate('/search'), 2000)
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          'This invitation link is invalid or has expired.'
        setErrorMessage(message)
        setStatus('error')
      }
    }

    accept()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-7 h-7 bg-accent/20 border border-accent/30 rounded flex items-center justify-center">
            <Zap size={14} className="text-accent" />
          </div>
          <span className="text-base font-semibold text-text-primary tracking-tight">
            Incharj
          </span>
        </div>

        <div className="bg-bg-surface border border-border rounded p-8 flex flex-col items-center gap-4">
          {status === 'loading' && (
            <>
              <Spinner size={32} className="text-accent" />
              <div>
                <p className="text-sm font-medium text-text-primary">Accepting invitation...</p>
                <p className="text-xs text-text-muted mt-1">Please wait a moment</p>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={32} className="text-success" />
              <div>
                <p className="text-sm font-medium text-text-primary">Invitation accepted!</p>
                <p className="text-xs text-text-muted mt-1">Redirecting you to your organizations...</p>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle size={32} className="text-error" />
              <div>
                <p className="text-sm font-medium text-text-primary">Failed to accept invitation</p>
                <p className="text-xs text-text-muted mt-1">{errorMessage}</p>
              </div>
              <Button variant="primary" size="sm" onClick={() => navigate('/login')}>
                Go to login
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
