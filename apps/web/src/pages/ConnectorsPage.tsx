import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  Pause,
  Play,
  Trash2,
  ChevronRight,
  Link2,
  AlertCircle,
  X,
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

const CONNECTOR_CATALOG: {
  kind: ConnectorKind
  label: string
  description: string
  authType: AuthType
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
  },
]

// ─── Connect Error Modal ──────────────────────────────────────────────────────

function ConnectErrorModal({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-bg-surface border border-border rounded-lg w-full max-w-sm mx-4 shadow-xl">
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-error/10 flex items-center justify-center">
            <AlertCircle size={16} className="text-error" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">Connection failed</h3>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">{message}</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 text-text-muted hover:text-text-secondary transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="flex justify-end px-5 py-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>Dismiss</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Connector Tile ───────────────────────────────────────────────────────────

interface ConnectorTileProps {
  catalog: (typeof CONNECTOR_CATALOG)[number]
  connector: Connector | undefined
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
  isConnecting,
  onConnect,
  onSync,
  onPause,
  onResume,
  onDelete,
}: ConnectorTileProps) {
  const navigate = useNavigate()
  const connected = !!connector && connector.has_credentials

  return (
    <div
      className={[
        'bg-bg-surface border rounded flex flex-col transition-colors',
        connected ? 'border-border' : 'border-border hover:border-border-strong',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start gap-4 p-5">
        <div className="w-10 h-10 rounded border border-border bg-bg-elevated flex items-center justify-center flex-shrink-0">
          <ConnectorIcon kind={catalog.kind} size={22} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-text-primary">{catalog.label}</h3>
            {connected && <StatusBadge status={connector.status} />}
          </div>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
            {catalog.description}
          </p>
        </div>

        {connected && (
          <button
            onClick={() => navigate(`/connectors/${connector.id}`)}
            className="text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
            title="View details"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-5 py-3 border-t border-border mt-auto">
        {!connected ? (
          <Button
            variant="primary"
            size="sm"
            isLoading={isConnecting}
            leftIcon={<Link2 size={12} />}
            onClick={onConnect}
          >
            Connect
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSync}
              isLoading={isSyncing || connector.status === 'syncing'}
              leftIcon={<RefreshCw size={12} />}
              disabled={connector.status === 'paused'}
            >
              Sync now
            </Button>

            {connector.status === 'paused' ? (
              <Button variant="ghost" size="sm" onClick={onResume} leftIcon={<Play size={12} />}>
                Resume
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={onPause}
                leftIcon={<Pause size={12} />}
                disabled={connector.status === 'syncing'}
              >
                Pause
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              leftIcon={<Trash2 size={12} />}
              className="ml-auto text-error hover:text-error"
            >
              Disconnect
            </Button>
          </>
        )}
      </div>
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
  const oauthTabRef = useRef<Window | null>(null)
  const oauthPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Listen for OAuth callback signal from the new tab
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

  // OAuth flow (google_drive)
  const oauthMutation = useMutation({
    mutationFn: async (kind: ConnectorKind) => {
      const catalog = CONNECTOR_CATALOG.find((c) => c.kind === kind)!
      const existing = connectorsQuery.data?.find((c) => c.kind === kind && !c.has_credentials)
      const connector = existing ?? await connectorsService.create(orgSlug, { kind, name: catalog.label })
      try {
        const { url, state } = await connectorsService.getOAuthUrl(orgSlug, kind as 'google_drive', connector.id)
        localStorage.setItem(`oauth_state:${state}`, JSON.stringify({ connector_id: connector.id, org_slug: orgSlug, kind }))
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

  // Server-env flow (slack, future api_key connectors)
  const serverEnvMutation = useMutation({
    mutationFn: async (kind: ConnectorKind) => {
      const catalog = CONNECTOR_CATALOG.find((c) => c.kind === kind)!
      const existing = connectorsQuery.data?.find((c) => c.kind === kind && !c.has_credentials)
      const connector = existing ?? await connectorsService.create(orgSlug, { kind, name: catalog.label })
      try {
        await connectorsService.connect(orgSlug, connector.id)
      } catch (err) {
        // Clean up the connector we just created if it was a new one and connect failed
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
      setSyncingIds((s) => { const n = new Set(s); n.delete(id); return n })
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] }),
  })

  const connectors = connectorsQuery.data ?? []

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

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-6xl mx-auto p-5">
          {connectorsQuery.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h2 className="text-sm font-medium text-text-primary">Data sources</h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Connect your tools to start indexing your knowledge base.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {CONNECTOR_CATALOG.map((catalog) => {
                  const connector = connectors.find((c) => c.kind === catalog.kind)
                  return (
                    <ConnectorTile
                      key={catalog.kind}
                      catalog={catalog}
                      connector={connector}
                      isSyncing={connector ? syncingIds.has(connector.id) : false}
                      isConnecting={connectingKind === catalog.kind}
                      onConnect={() => handleConnect(catalog.kind)}
                      onSync={() => connector && syncMutation.mutate(connector.id)}
                      onPause={() => connector && pauseMutation.mutate(connector.id)}
                      onResume={() => connector && resumeMutation.mutate(connector.id)}
                      onDelete={() => {
                        if (connector && confirm(`Disconnect "${catalog.label}"? All indexed documents will be removed.`)) {
                          deleteMutation.mutate(connector.id)
                        }
                      }}
                    />
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
