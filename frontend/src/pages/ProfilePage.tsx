import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useAuthStore } from '../stores/authStore'
import apiClient from '../services/api'
import { TopBar } from '../components/layout/TopBar'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

export function ProfilePage() {
  const { user, logout } = useAuth()
  const setAuth = useAuthStore((s) => s.setAuth)
  const accessToken = useAuthStore((s) => s.accessToken)

  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [nameSuccess, setNameSuccess] = useState(false)
  const [nameError, setNameError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const updateProfile = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiClient.patch('/auth/me', { full_name: name })
      return res.data
    },
    onSuccess: (updatedUser) => {
      if (user && accessToken) {
        setAuth({ ...user, ...updatedUser }, accessToken)
      }
      setNameSuccess(true)
      setTimeout(() => setNameSuccess(false), 2000)
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Update failed'
      setNameError(msg)
    },
  })

  const updatePassword = useMutation({
    mutationFn: async () => {
      await apiClient.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
    },
    onSuccess: () => {
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setTimeout(() => setPasswordSuccess(false), 2000)
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to update password'
      setPasswordError(msg)
    },
  })

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? '??'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar crumbs={[{ label: 'Profile settings' }]} />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto p-6 flex flex-col gap-6">

          {/* Profile info */}
          <div className="bg-bg-surface border border-border rounded">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary">Profile</h2>
            </div>
            <div className="p-5 flex flex-col gap-5">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded bg-bg-elevated border border-border flex items-center justify-center text-lg font-semibold text-text-secondary">
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {user?.full_name ?? 'User'}
                  </p>
                  <p className="text-xs text-text-muted">{user?.email}</p>
                </div>
              </div>

              <Input
                label="Full name"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value)
                  setNameError('')
                  setNameSuccess(false)
                }}
                placeholder="Ada Lovelace"
                error={nameError}
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Email
                </label>
                <div className="flex items-center h-9 bg-bg-elevated border border-border rounded px-3">
                  <span className="text-sm text-text-muted">{user?.email}</span>
                </div>
                <p className="text-xs text-text-muted">Email cannot be changed.</p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={updateProfile.isPending}
                  onClick={() => updateProfile.mutate(fullName)}
                  disabled={!fullName.trim() || fullName === user?.full_name}
                >
                  Save changes
                </Button>
                {nameSuccess && (
                  <span className="text-xs text-success">Saved!</span>
                )}
              </div>
            </div>
          </div>

          {/* Change password */}
          <div className="bg-bg-surface border border-border rounded">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary">Change password</h2>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <Input
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value)
                  setPasswordError('')
                  setPasswordSuccess(false)
                }}
                placeholder="••••••••"
              />
              <Input
                label="New password"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setPasswordError('')
                  setPasswordSuccess(false)
                }}
                placeholder="Min 8 characters"
                error={passwordError}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="hover:text-text-secondary transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                }
              />

              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={updatePassword.isPending}
                  onClick={() => updatePassword.mutate()}
                  disabled={!currentPassword || !newPassword || newPassword.length < 8}
                >
                  Update password
                </Button>
                {passwordSuccess && (
                  <span className="text-xs text-success">Password updated!</span>
                )}
              </div>
            </div>
          </div>

          {/* Sign out */}
          <div className="bg-bg-surface border border-border rounded">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary">Session</h2>
            </div>
            <div className="p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">Sign out</p>
                <p className="text-xs text-text-muted mt-0.5">
                  End your current session on this device.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={logout}>
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
