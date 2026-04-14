import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Search,
  Plug,
  Settings,
  Files,
  ChevronDown,
  LogOut,
  User,
  ChevronsUpDown,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Modal } from '../ui/Modal'

const navLinks = [
  { to: '/search',     icon: Search,   label: 'Search'     },
  { to: '/files',      icon: Files,    label: 'Files'      },
  { to: '/connectors', icon: Plug,     label: 'Connectors' },
  { to: '/settings',   icon: Settings, label: 'Settings'   },
]

export function Sidebar() {
  const { user, logout, currentOrg } = useAuth()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen]   = useState(false)
  const [switchOrgOpen, setSwitchOrgOpen] = useState(false)

  const userInitials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? '??'

  return (
    <aside className="w-[220px] lg:w-[240px] xl:w-[260px] flex-shrink-0 flex flex-col bg-bg-surface border-r border-border h-screen sticky top-0">

      {/* Org switcher */}
      <button
        onClick={() => setSwitchOrgOpen(true)}
        className="group w-full flex items-center gap-2.5 px-3.5 h-12 xl:h-14 border-b border-border hover:bg-bg-elevated transition-colors"
      >
        <div className="w-6 h-6 rounded bg-accent/15 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
          {currentOrg ? currentOrg.name.slice(0, 2).toUpperCase() : '—'}
        </div>
        <span className="flex-1 text-sm font-semibold text-text-primary truncate text-left tracking-tight">
          {currentOrg?.name ?? 'No org selected'}
        </span>
        <ChevronsUpDown size={12} className="text-text-muted flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      {/* Nav Links */}
      <nav className="flex-1 py-2.5 overflow-y-auto scrollbar-thin">
        <div className="px-2 flex flex-col gap-0.5">
          {navLinks.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2.5 px-2.5 h-8 xl:h-9 rounded text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
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
          className="w-full flex items-center gap-2.5 px-3.5 h-12 xl:h-14 hover:bg-bg-elevated transition-colors"
        >
          <div className="w-6 h-6 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center text-accent text-xs font-semibold flex-shrink-0">
            {userInitials}
          </div>
          <div className="flex flex-col items-start flex-1 min-w-0">
            <span className="text-xs font-semibold text-text-primary truncate w-full text-left">
              {user?.full_name ?? user?.email ?? 'User'}
            </span>
            {user?.full_name && (
              <span className="text-2xs text-text-muted truncate w-full text-left">
                {user.email}
              </span>
            )}
          </div>
          <ChevronDown size={11} className="text-text-muted flex-shrink-0" />
        </button>

        {userMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
            <div className="absolute bottom-full left-2 right-2 z-20 mb-1 bg-bg-surface border border-border rounded-lg shadow-lg overflow-hidden animate-scale-in">
              <div className="py-1">
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/settings/profile') }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bg-elevated text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  <User size={13} />
                  Profile settings
                </button>
                <div className="mx-2 my-1 border-t border-border" />
                <button
                  onClick={() => { setUserMenuOpen(false); logout() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-error/5 text-sm text-error transition-colors"
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {switchOrgOpen && (
        <Modal
          title="Switch organization?"
          description={
            currentOrg?.name
              ? `You are currently in "${currentOrg.name}". Do you want to switch to a different organization?`
              : 'No organization is currently selected. Do you want to switch to a different organization?'
          }
          confirmLabel="Switch"
          onConfirm={() => { setSwitchOrgOpen(false); navigate('/orgs') }}
          onCancel={() => setSwitchOrgOpen(false)}
        />
      )}
    </aside>
  )
}
