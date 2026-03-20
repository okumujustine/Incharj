import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plug,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  ChevronRight,
  Link2,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { connectorsService } from '../services/connectors'
import { TopBar } from '../components/layout/TopBar'
import { Button } from '../components/ui/Button'
import { StatusBadge } from '../components/ui/Badge'
import { ConnectorIcon } from '../components/ui/ConnectorIcon'
import { SkeletonCard } from '../components/ui/SkeletonList'
import type { Connector } from '../types'

const CONNECTOR_CATALOG = [
  {
    kind: 'google_drive' as const,
    label: 'Google Drive',
    description: 'Index documents, spreadsheets, and presentations from your Drive.',
  },
]

interface ConnectorTileProps {
  catalog: (typeof CONNECTOR_CATALOG)[number]
  connector: Connector | undefined
  orgSlug: string
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
  orgSlug,
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

  const lastSynced = connector?.last_synced_at
    ? formatDistanceToNow(new Date(connector.last_synced_at), { addSuffix: true })
    : 'Never'

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
            onClick={() => navigate(`/${orgSlug}/connectors/${connector.id}`)}
            className="text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
            title="View details"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {/* Stats — only when connected */}
      {connected && (
        <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
          <div className="px-5 py-3">
            <p className="text-2xs text-text-muted uppercase tracking-wider font-mono mb-0.5">
              Documents
            </p>
            <p className="text-sm font-medium text-text-primary font-mono">
              {(connector.doc_count ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="px-5 py-3">
            <p className="text-2xs text-text-muted uppercase tracking-wider font-mono mb-0.5">
              Last synced
            </p>
            <p className="text-xs text-text-secondary">{lastSynced}</p>
          </div>
        </div>
      )}

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
              <Button
                variant="ghost"
                size="sm"
                onClick={onResume}
                leftIcon={<Play size={12} />}
              >
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

export function ConnectorsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const queryClient = useQueryClient()
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())
  const [connectingKind, setConnectingKind] = useState<string | null>(null)

  const connectorsQuery = useQuery({
    queryKey: ['connectors', orgSlug],
    queryFn: () => connectorsService.list(orgSlug!),
    enabled: !!orgSlug,
    refetchInterval: 10000,
  })

  const connectMutation = useMutation({
    mutationFn: async (kind: 'google_drive') => {
      const catalog = CONNECTOR_CATALOG.find((c) => c.kind === kind)!
      // Reuse existing incomplete connector or create a new one
      const existing = connectorsQuery.data?.find(
        (c) => c.kind === kind && !c.has_credentials
      )
      const connector = existing ?? await connectorsService.create(orgSlug!, {
        kind,
        name: catalog.label,
      })
      try {
        const { url, state } = await connectorsService.getOAuthUrl(orgSlug!, kind, connector.id)
        // Persist state → {connector_id, org_slug} so the callback page can resume
        localStorage.setItem(`oauth_state:${state}`, JSON.stringify({
          connector_id: connector.id,
          org_slug: orgSlug!,
          kind,
        }))
        return url
      } catch (err) {
        if (!existing) await connectorsService.delete(orgSlug!, connector.id)
        throw err
      }
    },
    onMutate: (kind) => setConnectingKind(kind),
    onSuccess: (url) => {
      queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
      window.location.href = url
    },
    onError: () => {
      setConnectingKind(null)
      queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
    },
  })

  const syncMutation = useMutation({
    mutationFn: (connectorId: string) => connectorsService.sync(orgSlug!, connectorId),
    onMutate: (id) => setSyncingIds((s) => new Set([...s, id])),
    onSettled: (_, __, id) => {
      setSyncingIds((s) => { const n = new Set(s); n.delete(id); return n })
      queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
    },
  })

  const pauseMutation = useMutation({
    mutationFn: (id: string) => connectorsService.pause(orgSlug!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] }),
  })

  const resumeMutation = useMutation({
    mutationFn: (id: string) => connectorsService.resume(orgSlug!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => connectorsService.delete(orgSlug!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] }),
  })

  const connectors = connectorsQuery.data ?? []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar crumbs={[{ label: orgSlug ?? '' }, { label: 'Connectors' }]} />

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
                      orgSlug={orgSlug!}
                      isSyncing={connector ? syncingIds.has(connector.id) : false}
                      isConnecting={connectingKind === catalog.kind}
                      onConnect={() => connectMutation.mutate(catalog.kind)}
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
