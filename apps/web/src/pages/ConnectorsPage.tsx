import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  Pause,
  Play,
  Trash2,
  ChevronRight,
  AlertCircle,
  X,
  Plus,
  Search,
  Info,
  Check,
  ArrowRight,
  Zap,
  AlertTriangle,
} from 'lucide-react'

import { useOrgSlug } from '../hooks/useOrgSlug'
import { connectorsService } from '../services/connectors'
import { TopBar } from '../components/layout/TopBar'
import { Button } from '../components/ui/Button'
import { StatusBadge } from '../components/ui/Badge'
import { ConnectorIcon } from '../components/ui/ConnectorIcon'
import { SkeletonCard } from '../components/ui/SkeletonList'
import type { Connector } from '../types'

type ConnectorKind = 'google_drive' | 'slack'
type AuthType = 'oauth2' | 'server_env'

const BRAND_ACCENT: Record<ConnectorKind, string> = {
  google_drive: '#4285F4',
  slack: '#E01E5A',
}

const CONNECTOR_CATALOG: {
  kind: ConnectorKind
  label: string
  description: string
  authType: AuthType
  badge?: string
  requirements?: string
}[] = [
  {
    kind: 'google_drive',
    label: 'Google Drive',
    description: 'Index documents, spreadsheets, and presentations from your Drive.',
    authType: 'oauth2',
  },
  {
    kind: 'slack',
    label: 'Slack',
    description: 'Index messages and threads from public channels in your workspace.',
    authType: 'server_env',
    requirements: 'Requires a Slack bot token configured on the server by your admin.',
  },
]

// ─── Disconnect Confirm Modal ─────────────────────────────────────────────────

interface PendingDisconnect {
  connectorId: string
  label: string
  kind: ConnectorKind
  docCount: number
}

function DisconnectConfirmModal({
  pending,
  isDeleting,
  onConfirm,
  onCancel,
}: {
  pending: PendingDisconnect
  isDeleting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const accent = BRAND_ACCENT[pending.kind]

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative bg-bg-surface border border-border rounded-2xl w-full max-w-[380px] mx-4 shadow-2xl animate-scale-in overflow-hidden">
        {/* Error hairline */}
        <div className="h-[2px] w-full bg-error" />

        <div className="px-6 pt-6 pb-5">
          {/* Warning icon + connector identity row */}
          <div className="flex items-center gap-4 mb-5">
            <div className="relative flex-shrink-0">
              {/* Connector icon — dimmed to signal "this is being removed" */}
              <div
                className="w-11 h-11 rounded-xl border border-border flex items-center justify-center opacity-60"
                style={{ backgroundColor: `${accent}12` }}
              >
                <ConnectorIcon kind={pending.kind} size={24} />
              </div>
              {/* Error badge overlaid bottom-right */}
              <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-error flex items-center justify-center border-2 border-bg-surface">
                <AlertTriangle size={10} className="text-white" strokeWidth={2.5} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-text-primary leading-snug">
                Disconnect {pending.label}?
              </h3>
              <p className="text-xs text-text-muted mt-0.5">This action cannot be undone.</p>
            </div>
          </div>

          {/* Consequence block */}
          <div className="bg-error/5 border border-error/20 rounded-xl px-4 py-3 mb-5">
            <p className="text-xs text-text-secondary leading-relaxed">
              Disconnecting will permanently remove{' '}
              {pending.docCount > 0 ? (
                <>
                  <span className="font-semibold text-text-primary">
                    {pending.docCount.toLocaleString()} indexed document
                    {pending.docCount !== 1 ? 's' : ''}
                  </span>{' '}
                  and all credentials for{' '}
                </>
              ) : (
                'all credentials for '
              )}
              <span className="font-semibold text-text-primary">{pending.label}</span>
              . You'll need to reconnect and re-sync to restore access.
            </p>
          </div>

          {/* Actions — cancel is the visually safe choice */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onCancel}
              disabled={isDeleting}
              className="flex-1 h-9 rounded-xl border border-border bg-bg-elevated text-sm font-medium text-text-primary hover:border-border-strong hover:bg-bg-overlay transition-all duration-150 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 h-9 rounded-xl bg-error text-white text-sm font-medium flex items-center justify-center gap-1.5 hover:opacity-90 transition-all duration-150 disabled:opacity-60 active:scale-[0.98]"
            >
              {isDeleting ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <>
                  <Trash2 size={12} />
                  Disconnect
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Connect Error Modal ──────────────────────────────────────────────────────

function ConnectErrorModal({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-surface border border-border rounded-xl w-full max-w-sm mx-4 shadow-2xl animate-scale-in overflow-hidden">
        <div className="h-0.5 bg-error w-full" />
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-error/10 flex items-center justify-center">
            <AlertCircle size={15} className="text-error" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">Connection failed</h3>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors"
          >
            <X size={13} />
          </button>
        </div>
        <div className="flex justify-end px-5 py-3 border-t border-border bg-bg-primary/50">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Connector Install Modal ──────────────────────────────────────────────────

function ConnectorInstallModal({
  catalog,
  isInstalled,
  isConnecting,
  onConnect,
  onClose,
}: {
  catalog: (typeof CONNECTOR_CATALOG)[number]
  isInstalled: boolean
  isConnecting: boolean
  onConnect: () => void
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const accent = BRAND_ACCENT[catalog.kind as ConnectorKind] ?? 'rgb(var(--color-accent))'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-bg-surface border border-border rounded-2xl w-full max-w-[360px] mx-4 shadow-2xl animate-scale-in overflow-hidden">
        <div className="h-[2px] w-full" style={{ backgroundColor: accent }} />
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors z-10"
        >
          <X size={13} />
        </button>

        <div className="flex flex-col items-center px-7 pt-7 pb-7">
          {/* Icon with glow halo */}
          <div className="relative mb-5">
            <div
              className="absolute inset-0 rounded-2xl blur-2xl opacity-25 scale-150"
              style={{ backgroundColor: accent }}
            />
            <div className="relative w-[72px] h-[72px] rounded-2xl border border-border bg-bg-elevated flex items-center justify-center shadow-sm">
              <ConnectorIcon kind={catalog.kind} size={38} />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[17px] font-semibold tracking-tight text-text-primary">
              {catalog.label}
            </h2>
            {catalog.badge && (
              <span className="text-[10px] font-medium px-2 py-0.5 bg-bg-elevated text-text-muted rounded-full border border-border uppercase tracking-wide">
                {catalog.badge}
              </span>
            )}
          </div>

          <p className="text-sm text-text-secondary text-center leading-relaxed mb-6 max-w-[260px]">
            {catalog.description}
          </p>

          {catalog.requirements && (
            <div className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-3 mb-6 flex items-start gap-2.5">
              <Info size={13} className="text-text-muted mt-[1px] flex-shrink-0" />
              <p className="text-xs text-text-secondary leading-relaxed">{catalog.requirements}</p>
            </div>
          )}

          {isInstalled ? (
            <div
              className="flex items-center gap-2 text-sm font-medium"
              style={{ color: 'rgb(var(--color-success))' }}
            >
              <div className="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center">
                <Check size={11} className="text-success" />
              </div>
              Already connected
            </div>
          ) : (
            <button
              onClick={onConnect}
              disabled={isConnecting}
              className="w-full h-10 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed text-white shadow-sm hover:shadow-md active:scale-[0.98]"
              style={{ backgroundColor: accent }}
            >
              {isConnecting ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <>
                  <Plus size={13} />
                  Connect
                  <ArrowRight size={13} className="opacity-70" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Add Connector Modal ──────────────────────────────────────────────────────

function AddConnectorModal({
  open,
  onClose,
  connectors,
  connectingKind,
  onConnect,
}: {
  open: boolean
  onClose: () => void
  connectors: Connector[]
  connectingKind: ConnectorKind | null
  onConnect: (kind: ConnectorKind) => void
}) {
  const [search, setSearch] = useState('')
  const [selectedKind, setSelectedKind] = useState<ConnectorKind | null>(null)

  useEffect(() => {
    if (!open) {
      setSearch('')
      setSelectedKind(null)
    }
  }, [open])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (selectedKind) {
          setSelectedKind(null)
        } else {
          onClose()
        }
      }
    }
    if (open) {
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }
  }, [open, selectedKind, onClose])

  if (!open) return null

  const filtered = CONNECTOR_CATALOG.filter(
    (c) =>
      c.label.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase())
  )

  const selectedCatalog = selectedKind
    ? CONNECTOR_CATALOG.find((c) => c.kind === selectedKind)
    : null

  const installedCount = connectors.filter((c) => c.has_credentials).length

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={onClose}
        />
        <div
          className="relative bg-bg-surface border border-border rounded-2xl w-full max-w-[560px] mx-4 shadow-2xl animate-scale-in flex flex-col overflow-hidden"
          style={{ maxHeight: 'min(620px, 90vh)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Add connector</h2>
              <p className="text-xs text-text-muted mt-0.5">
                {CONNECTOR_CATALOG.length} available
                {installedCount > 0 && ` · ${installedCount} connected`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Search */}
          <div className="px-5 pb-3 flex-shrink-0">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search connectors…"
                autoFocus
                className="w-full pl-9 pr-3 h-9 bg-bg-elevated border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 focus:bg-bg-surface transition-colors"
              />
            </div>
          </div>

          <div className="h-px bg-border flex-shrink-0" />

          {/* Grid */}
          <div className="overflow-y-auto scrollbar-thin p-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-9 h-9 rounded-xl bg-bg-elevated border border-border flex items-center justify-center mb-3">
                  <Search size={15} className="text-text-muted" />
                </div>
                <p className="text-sm text-text-muted">No connectors match your search.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filtered.map((catalog, i) => {
                  const isInstalled = connectors.some(
                    (c) => c.kind === catalog.kind && c.has_credentials
                  )
                  const accent = BRAND_ACCENT[catalog.kind as ConnectorKind]
                  return (
                    <button
                      key={catalog.kind}
                      onClick={() => setSelectedKind(catalog.kind)}
                      className="group flex items-start gap-3.5 p-3.5 bg-bg-primary border border-border rounded-xl hover:border-border-strong hover:-translate-y-px hover:shadow-sm transition-all duration-150 text-left animate-fade-up"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl border border-border flex items-center justify-center flex-shrink-0 transition-all duration-150 group-hover:border-border-strong"
                        style={{ backgroundColor: `${accent}12` }}
                      >
                        <ConnectorIcon kind={catalog.kind} size={22} />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-text-primary">
                            {catalog.label}
                          </span>
                          {catalog.badge && (
                            <span className="text-[10px] font-medium px-1.5 py-px bg-bg-elevated border border-border text-text-muted rounded uppercase tracking-wide">
                              {catalog.badge}
                            </span>
                          )}
                          {isInstalled && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-px rounded text-success bg-success/10 uppercase tracking-wide">
                              <Check size={9} strokeWidth={3} />
                              Connected
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted mt-0.5 line-clamp-2 leading-relaxed">
                          {catalog.description}
                        </p>
                      </div>
                      <ChevronRight
                        size={14}
                        className="text-text-muted flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-150"
                      />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedCatalog && (
        <ConnectorInstallModal
          catalog={selectedCatalog}
          isInstalled={connectors.some(
            (c) => c.kind === selectedCatalog.kind && c.has_credentials
          )}
          isConnecting={connectingKind === selectedCatalog.kind}
          onConnect={() => {
            onConnect(selectedCatalog.kind)
            setSelectedKind(null)
            onClose()
          }}
          onClose={() => setSelectedKind(null)}
        />
      )}
    </>
  )
}

// ─── Connector Tile ───────────────────────────────────────────────────────────

interface ConnectorTileProps {
  catalog: (typeof CONNECTOR_CATALOG)[number]
  connector: Connector
  isSyncing: boolean
  isConnecting: boolean
  onConnect: () => void
  onSync: () => void
  onPause: () => void
  onResume: () => void
  onDelete: () => void
}

function ConnectorTile({
  catalog,
  connector,
  isSyncing,
  onSync,
  onPause,
  onResume,
  onDelete,
}: ConnectorTileProps) {
  const navigate = useNavigate()
  const accent = BRAND_ACCENT[catalog.kind as ConnectorKind]

  return (
    <div className="group bg-bg-surface border border-border rounded-xl flex flex-col transition-all duration-150 hover:border-border-strong hover:shadow-sm overflow-hidden h-full">
      {/* Body */}
      <div className="flex items-start gap-4 px-5 pt-4 pb-3">
        <div
          className="w-10 h-10 rounded-xl border border-border flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${accent}12` }}
        >
          <ConnectorIcon kind={catalog.kind} size={22} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-text-primary">{catalog.label}</h3>
            <StatusBadge status={connector.status} />
            {connector.status === 'syncing' && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1 leading-relaxed line-clamp-2">
            {catalog.description}
          </p>
          {connector.doc_count > 0 && (
            <p className="text-[11px] text-text-muted mt-1.5 font-medium tabular-nums">
              {connector.doc_count.toLocaleString()} documents indexed
            </p>
          )}
        </div>

        <button
          onClick={() => navigate(`/connectors/${connector.id}`)}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors opacity-0 group-hover:opacity-100"
          title="View details"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-border mt-auto bg-bg-primary/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSync}
          isLoading={isSyncing || connector.status === 'syncing'}
          leftIcon={<RefreshCw size={11} />}
          disabled={connector.status === 'paused'}
        >
          Sync
        </Button>

        {connector.status === 'paused' ? (
          <Button variant="ghost" size="sm" onClick={onResume} leftIcon={<Play size={11} />}>
            Resume
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onPause}
            leftIcon={<Pause size={11} />}
            disabled={connector.status === 'syncing'}
          >
            Pause
          </Button>
        )}

        <button
          onClick={onDelete}
          className="ml-auto inline-flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium text-text-muted hover:text-error hover:bg-error/8 transition-all duration-150"
        >
          <Trash2 size={11} />
          Disconnect
        </button>
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-up">
      <div className="flex items-center gap-3 mb-8 opacity-40">
        {CONNECTOR_CATALOG.map((c, i) => (
          <div
            key={c.kind}
            className="w-11 h-11 rounded-xl border border-border bg-bg-elevated flex items-center justify-center animate-fade-up"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <ConnectorIcon kind={c.kind} size={22} />
          </div>
        ))}
      </div>

      <div className="w-11 h-11 rounded-xl bg-accent/8 border border-accent/20 flex items-center justify-center mb-4">
        <Zap size={18} className="text-accent" fill="currentColor" />
      </div>

      <h3 className="text-sm font-semibold text-text-primary mb-1.5">No connectors yet</h3>
      <p className="text-xs text-text-muted max-w-[240px] mb-6 leading-relaxed">
        Connect your tools and data sources to start building your knowledge base.
      </p>

      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-accent text-white text-sm font-medium border border-accent/50 hover:bg-accent-hover transition-all duration-150 shadow-sm hover:shadow-md active:scale-[0.97]"
      >
        <Plus size={13} />
        Add connector
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const OAUTH_CALLBACK_KEY = 'oauth_callback_result'

export function ConnectorsPage() {
  const orgSlug = useOrgSlug()
  const queryClient = useQueryClient()
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())
  const [connectingKind, setConnectingKind] = useState<ConnectorKind | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [pendingDisconnect, setPendingDisconnect] = useState<PendingDisconnect | null>(null)
  const oauthTabRef = useRef<Window | null>(null)
  const oauthPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== OAUTH_CALLBACK_KEY || !e.newValue) return
      try {
        const { success } = JSON.parse(e.newValue)
        if (success) {
          localStorage.removeItem(OAUTH_CALLBACK_KEY)
          setConnectingKind(null)
          queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
        }
      } catch {
        // ignore malformed
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [orgSlug, queryClient])

  function startTabClosedPoller(tab: Window) {
    if (oauthPollRef.current) clearInterval(oauthPollRef.current)
    oauthPollRef.current = setInterval(() => {
      if (tab.closed) {
        clearInterval(oauthPollRef.current!)
        oauthPollRef.current = null
        setConnectingKind(null)
        queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
      }
    }, 800)
  }

  const connectorsQuery = useQuery({
    queryKey: ['connectors', orgSlug],
    queryFn: () => connectorsService.list(orgSlug),
    refetchInterval: 10000,
  })

  const oauthMutation = useMutation({
    mutationFn: async (kind: ConnectorKind) => {
      const catalog = CONNECTOR_CATALOG.find((c) => c.kind === kind)!
      const existing = connectorsQuery.data?.find((c) => c.kind === kind && !c.has_credentials)
      const connector =
        existing ?? (await connectorsService.create(orgSlug, { kind, name: catalog.label }))
      try {
        const { url, state } = await connectorsService.getOAuthUrl(
          orgSlug,
          kind as 'google_drive',
          connector.id
        )
        localStorage.setItem(
          `oauth_state:${state}`,
          JSON.stringify({ connector_id: connector.id, org_slug: orgSlug, kind })
        )
        return url
      } catch (err) {
        if (!existing) await connectorsService.delete(orgSlug, connector.id)
        throw err
      }
    },
    onMutate: (kind) => setConnectingKind(kind),
    onSuccess: (url) => {
      const tab = window.open(url, '_blank')
      if (tab) {
        oauthTabRef.current = tab
        startTabClosedPoller(tab)
      } else {
        window.location.href = url
      }
    },
    onError: () => {
      setConnectingKind(null)
      queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
    },
  })

  const serverEnvMutation = useMutation({
    mutationFn: async (kind: ConnectorKind) => {
      const catalog = CONNECTOR_CATALOG.find((c) => c.kind === kind)!
      const existing = connectorsQuery.data?.find((c) => c.kind === kind && !c.has_credentials)
      const connector =
        existing ?? (await connectorsService.create(orgSlug, { kind, name: catalog.label }))
      try {
        await connectorsService.connect(orgSlug, connector.id)
      } catch (err) {
        if (!existing) await connectorsService.delete(orgSlug, connector.id).catch(() => {})
        throw err
      }
    },
    onMutate: (kind) => {
      setConnectingKind(kind)
      setConnectError(null)
    },
    onSuccess: () => {
      setConnectingKind(null)
      queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
    },
    onError: (err: unknown) => {
      setConnectingKind(null)
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Connection failed. Check server configuration.'
      setConnectError(msg)
      queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
    },
  })

  const syncMutation = useMutation({
    mutationFn: (connectorId: string) => connectorsService.sync(orgSlug, connectorId),
    onMutate: (id) => setSyncingIds((s) => new Set([...s, id])),
    onSettled: (_, __, id) => {
      setSyncingIds((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
      queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
    },
  })

  const pauseMutation = useMutation({
    mutationFn: (id: string) => connectorsService.pause(orgSlug, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] }),
  })

  const resumeMutation = useMutation({
    mutationFn: (id: string) => connectorsService.resume(orgSlug, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => connectorsService.delete(orgSlug, id),
    onSuccess: () => {
      setPendingDisconnect(null)
      queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
    },
    onError: () => {
      setPendingDisconnect(null)
      queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
    },
  })

  const allConnectors = connectorsQuery.data ?? []
  const installedConnectors = allConnectors.filter((c) => c.has_credentials)

  function handleConnect(kind: ConnectorKind) {
    const catalog = CONNECTOR_CATALOG.find((c) => c.kind === kind)!
    if (catalog.authType === 'server_env') {
      serverEnvMutation.mutate(kind)
    } else {
      oauthMutation.mutate(kind)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar crumbs={[{ label: 'Connectors' }]} />

      {connectError && (
        <ConnectErrorModal message={connectError} onClose={() => setConnectError(null)} />
      )}

      {pendingDisconnect && (
        <DisconnectConfirmModal
          pending={pendingDisconnect}
          isDeleting={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(pendingDisconnect.connectorId)}
          onCancel={() => setPendingDisconnect(null)}
        />
      )}

      <AddConnectorModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        connectors={allConnectors}
        connectingKind={connectingKind}
        onConnect={(kind) => {
          handleConnect(kind)
          setIsAddModalOpen(false)
        }}
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-5xl mx-auto p-5">
          {connectorsQuery.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : installedConnectors.length === 0 ? (
            <EmptyState onAdd={() => setIsAddModalOpen(true)} />
          ) : (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">Connectors</h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    {installedConnectors.length} active data source
                    {installedConnectors.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Plus size={13} />}
                  onClick={() => setIsAddModalOpen(true)}
                >
                  Add connector
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {installedConnectors.map((connector, i) => {
                  const catalog = CONNECTOR_CATALOG.find((c) => c.kind === connector.kind)
                  if (!catalog) return null
                  return (
                    <div
                      key={connector.id}
                      className="animate-fade-up h-full"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <ConnectorTile
                        catalog={catalog}
                        connector={connector}
                        isSyncing={syncingIds.has(connector.id)}
                        isConnecting={connectingKind === catalog.kind}
                        onConnect={() => handleConnect(catalog.kind)}
                        onSync={() => syncMutation.mutate(connector.id)}
                        onPause={() => pauseMutation.mutate(connector.id)}
                        onResume={() => resumeMutation.mutate(connector.id)}
                        onDelete={() =>
                          setPendingDisconnect({
                            connectorId: connector.id,
                            label: catalog.label,
                            kind: catalog.kind,
                            docCount: connector.doc_count,
                          })
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
