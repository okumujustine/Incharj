import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { IncharjLogo } from '../components/ui/IncharjLogo'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useToastStore } from '../stores/toastStore'

export function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const showToast = useToastStore((state) => state.showToast)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)

    try {
      await register({ full_name: fullName, email, password })
      navigate('/login')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Registration failed. Please try again.'
      showToast({
        variant: 'error',
        title: 'Registration failed',
        description: message,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8">
          <IncharjLogo size={32} />
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-text-primary mb-1">Create account</h1>
          <p className="text-sm text-text-muted">Get started with Incharj for free</p>
        </div>

        <div className="bg-bg-surface border border-border rounded p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Full name"
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
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="hover:text-text-secondary transition-colors"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              }
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              className="w-full mt-1"
            >
              Create account
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-text-muted mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:text-accent-hover transition-colors">
            Sign in
          </Link>
        </p>

        <p className="text-center text-xs text-text-muted mt-4">
          By creating an account, you agree to our{' '}
          <span className="text-text-secondary">Terms of Service</span> and{' '}
          <span className="text-text-secondary">Privacy Policy</span>.
        </p>
      </div>
    </div>
  )
}
