import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Search,
  Plug,
  Settings,
  Files,
  ChevronDown,
  LogOut,
  User,
} from 'lucide-react'
import { IncharjLogo } from '../ui/IncharjLogo'
import { useAuth } from '../../hooks/useAuth'

const navLinks = [
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/files', icon: Files, label: 'Files' },
  { to: '/connectors', icon: Plug, label: 'Connectors' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const userInitials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? '??'

  return (
    <aside className="w-[220px] lg:w-[240px] xl:w-[260px] flex-shrink-0 flex flex-col bg-bg-surface border-r border-border h-screen sticky top-0">
      {/* Logo */}
      <div className="px-3 h-12 xl:h-14 flex items-center border-b border-border">
        <IncharjLogo size={22} />
      </div>

      {/* Nav Links */}
      <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
        <div className="px-2 flex flex-col gap-0.5">
          {navLinks.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2.5 px-2.5 h-8 xl:h-9 rounded text-sm transition-colors',
                  isActive
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated border border-transparent',
                ].join(' ')
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* User Menu */}
      <div className="relative border-t border-border">
        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 px-3 h-12 xl:h-14 hover:bg-bg-elevated transition-colors"
        >
          <div className="w-6 h-6 rounded bg-bg-overlay border border-border flex items-center justify-center text-text-muted text-xs font-medium flex-shrink-0">
            {userInitials}
          </div>
          <div className="flex flex-col items-start flex-1 min-w-0">
            <span className="text-xs font-medium text-text-primary truncate w-full text-left">
              {user?.full_name ?? user?.email ?? 'User'}
            </span>
            {user?.full_name && (
              <span className="text-2xs text-text-muted truncate w-full text-left">
                {user.email}
              </span>
            )}
          </div>
          <ChevronDown size={12} className="text-text-muted flex-shrink-0" />
        </button>

        {userMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
            <div className="absolute bottom-full left-0 right-0 z-20 bg-bg-elevated border border-border shadow-xl">
              <div className="py-1">
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/settings/profile') }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bg-overlay text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  <User size={14} />
                  Profile settings
                </button>
                <div className="border-t border-border mt-1 pt-1">
                  <button
                    onClick={() => { setUserMenuOpen(false); logout() }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bg-overlay text-sm text-error hover:text-error transition-colors"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
