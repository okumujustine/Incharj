import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IncharjLogo } from '../components/ui/IncharjLogo'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { setupService } from '../services/setup'
import { authService } from '../services/auth'
import { useAuthStore } from '../stores/authStore'

export function SetupPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const data = await setupService.initialize({ full_name: fullName, email, password, org_name: orgName })
      useAuthStore.getState().updateToken(data.access_token)
      const userData = await authService.me()
      setAuth(userData, data.access_token)
      navigate('/search', { replace: true })
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Setup failed. Please try again.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <IncharjLogo size={32} />
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-text-primary mb-1">Set up Incharj</h1>
          <p className="text-sm text-text-muted">Create your organization and admin account to get started.</p>
        </div>

        <div className="bg-bg-surface border border-border rounded p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Organization name"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              required
            />
            <Input
              label="Your full name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
              required
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
            />

            {error && (
              <div className="bg-error/10 border border-error/20 rounded px-3 py-2">
                <p className="text-xs text-error">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              className="w-full mt-1"
            >
              Create organization
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
