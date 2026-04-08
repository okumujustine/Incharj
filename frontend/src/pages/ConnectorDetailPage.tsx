import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrgSlug } from '../hooks/useOrgSlug'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  Pause,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Ban,
  RotateCcw,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { connectorsService } from '../services/connectors'
import { ConnectorIcon } from '../components/ui/ConnectorIcon'
import { TopBar } from '../components/layout/TopBar'
import { Button } from '../components/ui/Button'
import { StatusBadge, Badge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import type { SyncJob } from '../types'



function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return '—'
  const secs = Math.round(
    (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000
  )
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

function SyncJobRow({
  job,
  orgSlug,
  onCancel,
  isCancelling,
}: {
  job: SyncJob
  orgSlug: string
  onCancel: (jobId: string) => void
  isCancelling: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const isPartial = job.status === 'done' && job.docs_errored > 0
  const displayStatus = isPartial ? 'partial' : job.status
  const isActive = job.status === 'pending' || job.status === 'running'

  const statusConfig: Record<
    string,
    { icon: React.ReactNode; variant: 'success' | 'error' | 'info' | 'default' | 'warning'; label: string }
  > = {
    done: {
      icon: <CheckCircle size={14} className="text-success" />,
      variant: 'success',
      label: 'done',
    },
    partial: {
      icon: <AlertTriangle size={14} className="text-warning" />,
      variant: 'warning',
      label: 'partial',
    },
    failed: {
      icon: <XCircle size={14} className="text-error" />,
      variant: 'error',
      label: 'failed',
    },
    running: {
      icon: <Loader2 size={14} className="text-accent animate-spin" />,
      variant: 'info',
      label: 'running',
    },
    pending: {
      icon: <Clock size={14} className="text-text-muted" />,
      variant: 'default',
      label: 'pending',
    },
    cancelled: {
      icon: <Ban size={14} className="text-text-muted" />,
      variant: 'default',
      label: 'cancelled',
    },
  }

  const { icon, variant, label } = statusConfig[displayStatus] ?? statusConfig.pending
  const started = job.started_at ? format(new Date(job.started_at), 'MMM d, HH:mm') : '—'
  const startedFull = job.started_at ? format(new Date(job.started_at), 'MMM d yyyy, HH:mm:ss') : '—'
  const finishedFull = job.finished_at ? format(new Date(job.finished_at), 'MMM d yyyy, HH:mm:ss') : '—'
  const duration = formatDuration(job.started_at, job.finished_at)
  const capped = typeof job.meta?.documents_capped === 'number'
    ? Number(job.meta.documents_capped)
    : null
  const truncated = typeof job.meta?.documents_truncated === 'number'
    ? Number(job.meta.documents_truncated)
    : null
  const capApplied = typeof job.meta?.document_limit_applied === 'number'
    ? Number(job.meta.document_limit_applied)
    : null

  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-bg-elevated/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={variant}>{label}</Badge>
            <span className="text-xs text-text-muted font-mono">
              {job.docs_indexed} new · {job.docs_skipped} unchanged
              {job.docs_errored > 0 && (
                <span className="text-warning"> · {job.docs_errored} failed</span>
              )}
            </span>
            <span className="text-2xs text-text-muted capitalize">
              · {job.triggered_by ?? 'manual'}
            </span>
          </div>
          {!expanded && job.error_message && (
            <p className="text-xs text-error mt-1 truncate">{job.error_message}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-text-secondary">{started}</p>
            <p className="text-2xs text-text-muted font-mono">{duration}</p>
          </div>
          {isActive && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCancel(job.id)
              }}
              disabled={isCancelling}
              className="flex items-center gap-1 px-2 py-1 text-2xs text-error hover:bg-error/10 border border-error/20 rounded transition-colors disabled:opacity-50"
            >
              {isCancelling ? <Loader2 size={10} className="animate-spin" /> : <Ban size={10} />}
              Cancel
            </button>
          )}
          <span className="text-text-muted">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 grid grid-cols-2 gap-x-8 gap-y-2 bg-bg-elevated/30 border-t border-border/50">
          <div className="col-span-2 pt-3 pb-1">
            <p className="text-2xs text-text-muted uppercase tracking-wider font-mono">Details</p>
          </div>

          <div>
            <p className="text-2xs text-text-muted font-mono mb-0.5">Started</p>
            <p className="text-xs text-text-secondary font-mono">{startedFull}</p>
          </div>
          <div>
            <p className="text-2xs text-text-muted font-mono mb-0.5">Finished</p>
            <p className="text-xs text-text-secondary font-mono">{finishedFull}</p>
          </div>

          <div>
            <p className="text-2xs text-text-muted font-mono mb-0.5">Triggered by</p>
            <p className="text-xs text-text-secondary capitalize">{job.triggered_by ?? 'manual'}</p>
          </div>
          <div>
            <p className="text-2xs text-text-muted font-mono mb-0.5">Duration</p>
            <p className="text-xs text-text-secondary font-mono">{duration}</p>
          </div>

          <div>
            <p className="text-2xs text-text-muted font-mono mb-0.5">Retrieved from source</p>
            <p className="text-xs text-text-primary font-mono">
              {job.docs_indexed + job.docs_skipped + job.docs_errored} docs
            </p>
          </div>
          <div />

          {(capped !== null || capApplied !== null || truncated !== null) && (
            <>
              <div>
                <p className="text-2xs text-text-muted font-mono mb-0.5">Capped for this run</p>
                <p className="text-xs text-warning font-mono">
                  {capped ?? job.docs_enqueued} docs
                </p>
              </div>
              <div>
                <p className="text-2xs text-text-muted font-mono mb-0.5">Dropped by cap</p>
                <p className="text-xs text-warning font-mono">{truncated ?? 0} docs</p>
              </div>
            </>
          )}

          <div>
            <p className="text-2xs text-text-muted font-mono mb-0.5">Indexed</p>
            <p className="text-xs text-success font-mono">{job.docs_indexed} docs</p>
          </div>
          <div>
            <p className="text-2xs text-text-muted font-mono mb-0.5">Unchanged</p>
            <p className="text-xs text-text-secondary font-mono">{job.docs_skipped} docs</p>
          </div>

          {job.docs_errored > 0 && (
            <div className="col-span-2">
              <p className="text-2xs text-text-muted font-mono mb-0.5">Failed</p>
              <p className="text-xs text-warning font-mono">{job.docs_errored} docs failed to index</p>
            </div>
          )}

          {job.error_message && (
            <div className="col-span-2">
              <p className="text-2xs text-text-muted font-mono mb-0.5">Error</p>
              <p className="text-xs text-error bg-error/5 border border-error/20 rounded px-3 py-2 font-mono whitespace-pre-wrap break-all">
                {job.error_message}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


function SyncLimitCard({
  currentLimit,
  onSave,
  isSaving,
}: {
  currentLimit: number | null
  onSave: (limit: number | null) => void
  isSaving: boolean
}) {
  const [value, setValue] = useState(currentLimit?.toString() ?? '')

  useEffect(() => {
    setValue(currentLimit?.toString() ?? '')
  }, [currentLimit])

  const parsed = value.trim() === '' ? null : parseInt(value, 10)
  const isValid = value.trim() === '' || (!isNaN(parsed!) && parsed! > 0 && parsed! <= 5)
  const isDirty = (parsed ?? null) !== (currentLimit ?? null)

  return (
    <div className="bg-bg-surface border border-border rounded">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary">Sync limit</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Google Drive enforces a hard cap of 5 documents per sync. Set a value from 1 to 5.
        </p>
      </div>
      <div className="p-5 flex items-center gap-3">
        <input
          type="number"
          min={1}
          max={5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="5"
          className="w-36 h-8 bg-bg-elevated text-text-primary text-sm border border-border rounded px-3 focus:outline-none focus:border-accent placeholder:text-text-muted"
        />
        <span className="text-xs text-text-muted">documents per sync</span>
        {isDirty && isValid && (
          <Button
            size="sm"
            onClick={() => onSave(parsed)}
            isLoading={isSaving}
          >
            Save
          </Button>
        )}
        {!isValid && (
          <span className="text-xs text-error">Must be a number between 1 and 5</span>
        )}
      </div>
    </div>
  )
}

export function ConnectorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const orgSlug = useOrgSlug()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const connectorQuery = useQuery({
    queryKey: ['connector', orgSlug, id],
    queryFn: () => connectorsService.get(orgSlug, id!),
    enabled: !!id,
    refetchInterval: 10000,
  })

  const syncJobsQuery = useQuery({
    queryKey: ['sync-jobs', orgSlug, id],
    queryFn: () => connectorsService.listSyncJobs(orgSlug, id!),
    enabled: !!id,
    refetchInterval: 5000,
  })

  const syncMutation = useMutation({
    mutationFn: () => connectorsService.sync(orgSlug, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] })
      queryClient.invalidateQueries({ queryKey: ['sync-jobs', orgSlug, id] })
    },
  })

  const pauseMutation = useMutation({
    mutationFn: () => connectorsService.pause(orgSlug, id!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] }),
  })

  const resumeMutation = useMutation({
    mutationFn: () => connectorsService.resume(orgSlug, id!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] }),
  })

  const updateMutation = useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      connectorsService.update(orgSlug, id!, { config }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] }),
  })

  const embedMutation = useMutation({
    mutationFn: () => connectorsService.embed(orgSlug, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] })
      queryClient.invalidateQueries({ queryKey: ['sync-jobs', orgSlug, id] })
    },
  })

  const cancelJobMutation = useMutation({
    mutationFn: (jobId: string) => connectorsService.cancelSyncJob(orgSlug, jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-jobs', orgSlug, id] })
    },
  })

  const resetSyncMutation = useMutation({
    mutationFn: () => connectorsService.resetSync(orgSlug, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] })
      queryClient.invalidateQueries({ queryKey: ['sync-jobs', orgSlug, id] })
    },
  })


  if (connectorQuery.isLoading) return <PageSpinner />

  const connector = connectorQuery.data
  if (!connector) {
    navigate('/connectors', { replace: true })
    return null
  }

  const lastSynced = connector.last_synced_at
    ? formatDistanceToNow(new Date(connector.last_synced_at), { addSuffix: true })
    : 'Never'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        crumbs={[
          { label: 'Connectors', to: '/connectors' },
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => embedMutation.mutate()}
              isLoading={embedMutation.isPending}
              leftIcon={<Sparkles size={12} />}
              disabled={connector.status === 'paused'}
            >
              Embed indexed
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm('This will delete all synced documents and reset the sync checkpoint. The next sync will re-index everything from scratch. Continue?')) {
                  resetSyncMutation.mutate()
                }
              }}
              isLoading={resetSyncMutation.isPending}
              leftIcon={<RotateCcw size={12} />}
              disabled={connector.status === 'syncing'}
            >
              Reset sync
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
                <ConnectorIcon kind={connector.kind} size={22} />
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

          <SyncLimitCard
            currentLimit={
              typeof connector.config?.max_documents === 'number'
                ? connector.config.max_documents
                : null
            }
            onSave={(max) =>
              updateMutation.mutate({ ...connector.config, max_documents: max })
            }
            isSaving={updateMutation.isPending}
          />

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
                  <SyncJobRow
                    key={job.id}
                    job={job}
                    orgSlug={orgSlug!}
                    onCancel={(jobId) => cancelJobMutation.mutate(jobId)}
                    isCancelling={cancelJobMutation.isPending && cancelJobMutation.variables === job.id}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
