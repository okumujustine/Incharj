import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { IncharjLogo } from '../components/ui/IncharjLogo'
import { useToastStore } from '../stores/toastStore'

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const showToast = useToastStore((state) => state.showToast)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    try {
      await login({ email, password })
      navigate('/orgs', { replace: true })
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Invalid email or password'
      showToast({ variant: 'error', title: 'Sign in failed', description: message })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex w-[420px] xl:w-[480px] flex-shrink-0 flex-col bg-text-primary relative overflow-hidden">
        {/* Geometric grid */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Accent circle */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-accent opacity-20 blur-3xl" />
        <div className="absolute top-1/3 -right-20 w-64 h-64 rounded-full bg-accent opacity-10 blur-2xl" />

        <div className="relative flex flex-col h-full p-10">
          {/* Logo */}
          <IncharjLogo size={28} className="[&_span]:text-white [&_span]:opacity-90" />

          {/* Middle copy */}
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-3xl font-semibold text-white leading-snug mb-4">
              Your knowledge base,<br />always within reach.
            </p>
            <p className="text-sm text-white/50 leading-relaxed max-w-xs">
              Search across documents, connectors, and teammates — all from one place.
            </p>
          </div>

          {/* Footer */}
          <p className="text-xs text-white/25 font-mono">incharj.io</p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center bg-bg-primary p-6">
        <div className="w-full max-w-sm animate-fade-up">
          {/* Mobile logo */}
          <div className="mb-10 lg:hidden">
            <IncharjLogo size={24} />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-text-primary tracking-tight mb-1">
              Welcome back
            </h1>
            <p className="text-sm text-text-muted">Sign in to continue to your workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              placeholder="••••••••"
              autoComplete="current-password"
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
              className="w-full mt-2"
            >
              Sign in
            </Button>
          </form>

          <p className="text-center text-sm text-text-muted mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-accent hover:text-accent-hover font-medium transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
