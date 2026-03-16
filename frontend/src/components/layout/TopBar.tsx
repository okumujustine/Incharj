import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

interface Crumb {
  label: string
  to?: string
}

interface TopBarProps {
  crumbs?: Crumb[]
  actions?: React.ReactNode
  title?: string
}

function useBreadcrumbs(crumbs?: Crumb[]): Crumb[] {
  const location = useLocation()

  if (crumbs) return crumbs

  const parts = location.pathname.split('/').filter(Boolean)
  return parts.map((part, i) => ({
    label: part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '),
    to: '/' + parts.slice(0, i + 1).join('/'),
  }))
}

export function TopBar({ crumbs, actions, title }: TopBarProps) {
  const breadcrumbs = useBreadcrumbs(crumbs)

  return (
    <header className="h-11 border-b border-border bg-bg-surface flex-shrink-0 flex items-center">
      <div className="w-full max-w-6xl mx-auto px-6 flex items-center">
        <nav className="flex items-center gap-1 flex-1 min-w-0">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <ChevronRight size={12} className="text-text-muted flex-shrink-0" />
              )}
              {crumb.to && i < breadcrumbs.length - 1 ? (
                <Link
                  to={crumb.to}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors truncate max-w-[150px]"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-xs text-text-secondary font-medium truncate">
                  {title ?? crumb.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">{actions}</div>
        )}
      </div>
    </header>
  )
}
