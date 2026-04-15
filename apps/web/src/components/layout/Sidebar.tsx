import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import {
  Search,
  Plug,
  Settings,
  Files,
  ChevronDown,
  LogOut,
  User,
  ChevronsUpDown,
  Plus,
  MessageCircle,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useAuthStore } from '../../stores/authStore'
import { Modal } from '../ui/Modal'
import apiClient from '../../services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string
  title: string | null
  updated_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripMd(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .trim()
}

function groupConversations(list: Conversation[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  const groups = [
    { label: 'Today',     items: [] as Conversation[] },
    { label: 'Yesterday', items: [] as Conversation[] },
    { label: 'Earlier',   items: [] as Conversation[] },
  ]

  for (const c of list) {
    const d = new Date(c.updated_at)
    if (d >= todayStart)          groups[0].items.push(c)
    else if (d >= yesterdayStart) groups[1].items.push(c)
    else                          groups[2].items.push(c)
  }

  return groups.filter(g => g.items.length > 0)
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const navLinks = [
  { to: '/search',     icon: Search, label: 'Search'     },
  { to: '/files',      icon: Files,  label: 'Files'      },
  { to: '/connectors', icon: Plug,   label: 'Connectors' },
  { to: '/settings',   icon: Settings, label: 'Settings' },
]

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { user, logout, currentOrg } = useAuth()
  const orgId = useAuthStore(s => s.currentOrg?.id)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const [userMenuOpen,  setUserMenuOpen]  = useState(false)
  const [switchOrgOpen, setSwitchOrgOpen] = useState(false)

  // Conversation list state
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convLoading,   setConvLoading]   = useState(false)

  const isSearchPage   = location.pathname === '/search'
  const activeConvId   = searchParams.get('c')

  // Fetch conversations whenever we're on /search and the active conversation changes
  useEffect(() => {
    if (!isSearchPage || !orgId) return
    let cancelled = false
    setConvLoading(true)
    apiClient
      .get<Conversation[]>(`/conversations?org_id=${orgId}`)
      .then(r => { if (!cancelled) setConversations(r.data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setConvLoading(false) })
    return () => { cancelled = true }
  }, [isSearchPage, orgId, activeConvId])

  const groups = groupConversations(conversations)

  const userInitials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? '??'

  function handleNewConversation() {
    navigate('/search')
    setSearchParams({}, { replace: true })
  }

  function handleSelectConversation(id: string) {
    navigate(`/search?c=${id}`)
  }

  return (
    <aside
      className="w-[220px] flex-shrink-0 flex flex-col h-screen sticky top-0"
      style={{
        background: 'rgb(var(--color-bg-surface))',
        borderRight: '1px solid rgb(var(--color-border) / 0.5)',
      }}
    >
      {/* ── Org switcher ── */}
      <button
        onClick={() => setSwitchOrgOpen(true)}
        className="group w-full flex items-center gap-2.5 px-3.5 h-12 flex-shrink-0 hover:bg-bg-elevated transition-colors"
        style={{ borderBottom: '1px solid rgb(var(--color-border) / 0.5)' }}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center text-accent text-xs font-bold flex-shrink-0"
          style={{
            background: 'rgb(var(--color-accent) / 0.12)',
            border: '1px solid rgb(var(--color-accent) / 0.2)',
          }}
        >
          {currentOrg ? currentOrg.name.slice(0, 2).toUpperCase() : '—'}
        </div>
        <span className="flex-1 text-sm font-semibold text-text-primary truncate text-left tracking-tight">
          {currentOrg?.name ?? 'No org'}
        </span>
        <ChevronsUpDown size={11} className="text-text-muted flex-shrink-0 opacity-0 group-hover:opacity-70 transition-opacity" />
      </button>

      {/* ── Scrollable body ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Nav links */}
        <nav className="px-2 pt-2 pb-1 flex flex-col gap-px flex-shrink-0">
          {navLinks.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] font-medium transition-colors duration-100',
                  isActive
                    ? 'text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                ].join(' ')
              }
              style={({ isActive }) => isActive ? {
                background: 'rgb(var(--color-accent) / 0.07)',
              } : {}}
            >
              {({ isActive }) => (
                <>
                  <Icon size={13} className={`flex-shrink-0 transition-colors ${isActive ? 'text-accent' : ''}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ── Conversation history (only on /search) ── */}
        {isSearchPage && (
          <>
            {/* Refined divider with new button */}
            <div className="mx-3 mt-1.5 mb-2 flex-shrink-0 flex items-center gap-2">
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgb(var(--color-border) / 0.4))' }} />
              <button
                onClick={handleNewConversation}
                className="flex items-center gap-1 px-1.5 h-[18px] rounded-md transition-all duration-150 group hover:bg-bg-elevated"
                title="New conversation"
                style={{ color: 'rgb(var(--color-text-muted) / 0.6)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgb(var(--color-accent))' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgb(var(--color-text-muted) / 0.6)' }}
              >
                <Plus size={8} className="transition-transform group-hover:rotate-90 duration-200" />
                <span className="text-[8.5px] font-medium tracking-wider uppercase">New</span>
              </button>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgb(var(--color-border) / 0.4))' }} />
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto scrollbar-thin pb-2">
              {convLoading ? (
                <div className="px-3 py-1 space-y-1">
                  {[68, 50, 78, 42].map((w, i) => (
                    <div
                      key={i}
                      className="h-3.5 rounded-sm animate-pulse"
                      style={{
                        width: `${w}%`,
                        background: 'rgb(var(--color-bg-elevated))',
                        animationDelay: `${i * 80}ms`,
                        opacity: 1 - i * 0.15,
                      }}
                    />
                  ))}
                </div>
              ) : groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <MessageCircle size={14} className="mb-2 opacity-20" style={{ color: 'rgb(var(--color-text-muted))' }} />
                  <p className="text-[10px] leading-relaxed" style={{ color: 'rgb(var(--color-text-muted) / 0.35)' }}>
                    Start a conversation to see it here
                  </p>
                </div>
              ) : (
                groups.map(group => (
                  <div key={group.label} className="mb-3">
                    {/* Quiet date label — metadata, not heading */}
                    <p
                      className="px-3 pt-1 pb-0.5 text-[8.5px] select-none font-medium"
                      style={{ color: 'rgb(var(--color-text-muted) / 0.28)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                    >
                      {group.label}
                    </p>
                    {group.items.map(c => {
                      const isActive = c.id === activeConvId
                      const title = c.title ? stripMd(c.title) : 'Untitled'
                      return (
                        <button
                          key={c.id}
                          onClick={() => handleSelectConversation(c.id)}
                          className="w-full flex items-center h-[26px] px-3 text-left text-[11px] truncate transition-all duration-150"
                          style={{
                            color: isActive
                              ? 'rgb(var(--color-text-primary))'
                              : 'rgb(var(--color-text-secondary))',
                            background: isActive ? 'rgb(var(--color-accent) / 0.07)' : 'transparent',
                            borderLeft: isActive
                              ? '2px solid rgb(var(--color-accent) / 0.65)'
                              : '2px solid transparent',
                            fontWeight: isActive ? 500 : 400,
                            letterSpacing: isActive ? '0' : '0.002em',
                          }}
                          onMouseEnter={e => {
                            if (!isActive) {
                              e.currentTarget.style.background = 'rgb(var(--color-bg-elevated))'
                              e.currentTarget.style.color = 'rgb(var(--color-text-primary))'
                            }
                          }}
                          onMouseLeave={e => {
                            if (!isActive) {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = 'rgb(var(--color-text-secondary))'
                            }
                          }}
                        >
                          <span className="truncate">{title}</span>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Spacer when not on search */}
        {!isSearchPage && <div className="flex-1" />}
      </div>

      {/* ── User menu ── */}
      <div
        className="relative flex-shrink-0"
        style={{ borderTop: '1px solid rgb(var(--color-border) / 0.5)' }}
      >
        <button
          onClick={() => setUserMenuOpen(v => !v)}
          className="w-full flex items-center gap-2.5 px-3.5 h-12 hover:bg-bg-elevated transition-colors"
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-accent text-xs font-semibold flex-shrink-0"
            style={{
              background: 'rgb(var(--color-accent) / 0.12)',
              border: '1px solid rgb(var(--color-accent) / 0.2)',
            }}
          >
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
            <div
              className="absolute bottom-full left-2 right-2 z-20 mb-1 rounded-lg overflow-hidden"
              style={{
                background: 'rgb(var(--color-bg-surface))',
                border: '1px solid rgb(var(--color-border))',
                boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
              }}
            >
              <div className="py-1">
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/settings/profile') }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bg-elevated text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  <User size={13} />
                  Profile settings
                </button>
                <div className="mx-2 my-1" style={{ borderTop: '1px solid rgb(var(--color-border) / 0.5)' }} />
                <button
                  onClick={() => { setUserMenuOpen(false); logout() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
                  style={{ color: 'rgb(var(--color-error, 239 68 68))' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgb(239 68 68 / 0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
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
              ? `You are currently in "${currentOrg.name}". Switch to a different organization?`
              : 'No organization selected. Switch to a different organization?'
          }
          confirmLabel="Switch"
          onConfirm={() => { setSwitchOrgOpen(false); navigate('/orgs') }}
          onCancel={() => setSwitchOrgOpen(false)}
        />
      )}
    </aside>
  )
}
