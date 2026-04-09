import React from 'react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center py-16 px-6 text-center',
        className,
      ].join(' ')}
    >
      {icon && (
        <div className="mb-4 text-text-muted opacity-40">
          {icon}
        </div>
      )}
      <h3 className="text-base font-medium text-text-secondary mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-text-muted max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
