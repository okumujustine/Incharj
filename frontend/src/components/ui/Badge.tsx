import React from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'syncing'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
  pulse?: boolean
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-bg-overlay text-text-muted border-border',
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  error: 'bg-error/10 text-error border-error/20',
  info: 'bg-accent/10 text-accent border-accent/20',
  syncing: 'bg-accent/10 text-accent border-accent/20',
}

export function Badge({ variant = 'default', children, className = '', pulse = false }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5',
        'text-2xs font-mono font-medium uppercase tracking-wider',
        'border rounded',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: 'idle' | 'syncing' | 'error' | 'paused' }) {
  const config: Record<string, { variant: BadgeVariant; label: string; pulse: boolean }> = {
    idle: { variant: 'default', label: 'Idle', pulse: false },
    syncing: { variant: 'syncing', label: 'Syncing', pulse: true },
    error: { variant: 'error', label: 'Error', pulse: false },
    paused: { variant: 'warning', label: 'Paused', pulse: false },
  }
  const { variant, label, pulse } = config[status] ?? config.idle
  return <Badge variant={variant} pulse={pulse}>{label}</Badge>
}

export function RoleBadge({ role }: { role: 'owner' | 'admin' | 'member' | 'viewer' }) {
  const config: Record<string, { variant: BadgeVariant }> = {
    owner: { variant: 'info' },
    admin: { variant: 'warning' },
    member: { variant: 'default' },
    viewer: { variant: 'default' },
  }
  const { variant } = config[role] ?? config.member
  return <Badge variant={variant}>{role}</Badge>
}
