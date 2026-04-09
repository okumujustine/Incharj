import React from 'react'
import { Loader2 } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover border border-accent/50 hover:border-accent',
  secondary:
    'bg-bg-elevated text-text-primary hover:bg-bg-overlay border border-border hover:border-border-strong',
  ghost:
    'bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-elevated border border-transparent hover:border-border',
  danger:
    'bg-error/10 text-error hover:bg-error/20 border border-error/30 hover:border-error/50',
  outline:
    'bg-transparent text-text-primary border border-border hover:border-border-strong hover:bg-bg-elevated',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={[
        'inline-flex items-center justify-center font-medium transition-colors duration-150',
        'rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        'disabled:opacity-50 disabled:cursor-not-allowed select-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="animate-spin" size={size === 'sm' ? 12 : 14} />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  )
}
