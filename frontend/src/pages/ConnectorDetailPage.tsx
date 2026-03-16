import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  HardDrive,
  FileText,
  MessageSquare,
  Plug,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { connectorsService } from '../services/connectors'
import { TopBar } from '../components/layout/TopBar'
import { Button } from '../components/ui/Button'
import { StatusBadge, Badge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import type { SyncJob } from '../types'

const CONNECTOR_ICONS: Record<string, React.ElementType> = {
  google_drive: HardDrive,
  notion: FileText,
  slack: MessageSquare,
}

function SyncJobRow({ job }: { job: SyncJob }) {
  const statusConfig: Record<
    string,
    { icon: React.ReactNode; variant: 'success' | 'error' | 'info' | 'default' | 'warning' }
  > = {
    done: {
      icon: <CheckCircle size={14} className="text-success" />,
      variant: 'success',
    },
    failed: {
      icon: <XCircle size={14} className="text-error" />,
      variant: 'error',
    },
    running: {
      icon: <Loader2 size={14} className="text-accent animate-spin" />,
      variant: 'info',
    },
    pending: {
      icon: <Clock size={14} className="text-text-muted" />,
      variant: 'default',
    },
  }

  const { icon, variant } = statusConfig[job.status] ?? statusConfig.pending
  const started = job.started_at
    ? format(new Date(job.started_at), 'MMM d, HH:mm')
    : '—'
  const duration =
    job.started_at && job.finished_at
      ? `${Math.round((new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000)}s`
      : '—'

  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0">
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant={variant}>{job.status}</Badge>
          <span className="text-xs text-text-muted font-mono">
            {job.docs_indexed} docs indexed
          </span>
        </div>
        {job.error_message && (
          <p className="text-xs text-error mt-1 truncate">{job.error_message}</p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-text-secondary">{started}</p>
        <p className="text-2xs text-text-muted font-mono">{duration}</p>
      </div>
    </div>
  )
}

export function ConnectorDetailPage() {
  const { orgSlug, id } = useParams<{ orgSlug: string; id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const connectorQuery = useQuery({
    queryKey: ['connector', orgSlug, id],
    queryFn: () => connectorsService.get(orgSlug!, id!),
    enabled: !!orgSlug && !!id,
    refetchInterval: 10000,
  })

  const syncJobsQuery = useQuery({
    queryKey: ['sync-jobs', orgSlug, id],
    queryFn: () => connectorsService.listSyncJobs(orgSlug!, id!),
    enabled: !!orgSlug && !!id,
    refetchInterval: 5000,
  })

  const syncMutation = useMutation({
    mutationFn: () => connectorsService.sync(orgSlug!, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] })
      queryClient.invalidateQueries({ queryKey: ['sync-jobs', orgSlug, id] })
    },
  })

  const pauseMutation = useMutation({
    mutationFn: () => connectorsService.pause(orgSlug!, id!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] }),
  })

  const resumeMutation = useMutation({
    mutationFn: () => connectorsService.resume(orgSlug!, id!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => connectorsService.delete(orgSlug!, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectors', orgSlug] })
      navigate(`/${orgSlug}/connectors`)
    },
  })

  if (connectorQuery.isLoading) return <PageSpinner />

  const connector = connectorQuery.data
  if (!connector) {
    navigate(`/${orgSlug}/connectors`, { replace: true })
    return null
  }

  const Icon = CONNECTOR_ICONS[connector.kind] ?? Plug
  const lastSynced = connector.last_synced_at
    ? formatDistanceToNow(new Date(connector.last_synced_at), { addSuffix: true })
    : 'Never'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        crumbs={[
          { label: orgSlug ?? '', to: `/${orgSlug}/connectors` },
          { label: 'Connectors', to: `/${orgSlug}/connectors` },
          { label: connector.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {connector.status === 'paused' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => resumeMutation.mutate()}
                isLoading={resumeMutation.isPending}
                leftIcon={<Play size={12} />}
              >
                Resume
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => pauseMutation.mutate()}
                isLoading={pauseMutation.isPending}
                leftIcon={<Pause size={12} />}
                disabled={connector.status === 'syncing'}
              >
                Pause
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => syncMutation.mutate()}
              isLoading={syncMutation.isPending || connector.status === 'syncing'}
              leftIcon={<RefreshCw size={12} />}
              disabled={connector.status === 'paused'}
            >
              Sync now
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto p-6 flex flex-col gap-6">

          {/* Connector Info */}
          <div className="bg-bg-surface border border-border rounded">
            <div className="flex items-center gap-4 p-5 border-b border-border">
              <div className="w-12 h-12 bg-bg-elevated border border-border rounded flex items-center justify-center flex-shrink-0">
                <Icon size={22} className="text-accent" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-base font-semibold text-text-primary">
                    {connector.name}
                  </h1>
                  <StatusBadge status={connector.status} />
                </div>
                <p className="text-sm text-text-muted mt-0.5 font-mono capitalize">
                  {connector.kind.replace('_', ' ')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border">
              <div className="px-5 py-4">
                <p className="text-2xs text-text-muted uppercase tracking-wider font-mono mb-1">
                  Documents
                </p>
                <p className="text-xl font-semibold text-text-primary font-mono">
                  {connector.doc_count.toLocaleString()}
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-2xs text-text-muted uppercase tracking-wider font-mono mb-1">
                  Last synced
                </p>
                <p className="text-sm text-text-secondary">{lastSynced}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-2xs text-text-muted uppercase tracking-wider font-mono mb-1">
                  Created
                </p>
                <p className="text-sm text-text-secondary">
                  {formatDistanceToNow(new Date(connector.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>

          {/* Sync History */}
          <div className="bg-bg-surface border border-border rounded">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary">Sync history</h2>
            </div>
            {syncJobsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-text-muted" />
              </div>
            ) : (syncJobsQuery.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No sync jobs yet"
                description="Run a sync to see the history here."
              />
            ) : (
              <div>
                {syncJobsQuery.data!.map((job) => (
                  <SyncJobRow key={job.id} job={job} />
                ))}
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div className="bg-bg-surface border border-error/20 rounded">
            <div className="px-5 py-3 border-b border-error/20">
              <h2 className="text-sm font-semibold text-error">Danger zone</h2>
            </div>
            <div className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-text-primary">Remove connector</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Permanently delete this connector and all indexed documents. This cannot be undone.
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                isLoading={deleteMutation.isPending}
                leftIcon={<Trash2 size={12} />}
                onClick={() => {
                  if (confirm(`Remove "${connector.name}"? This cannot be undone.`)) {
                    deleteMutation.mutate()
                  }
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
