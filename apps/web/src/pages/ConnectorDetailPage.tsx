import React, { useState, useEffect, useRef } from 'react'
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
  Ban,
  RotateCcw,
  Trash2,
  FileText,
  ChevronLeft,
  Minus,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { connectorsService } from '../services/connectors'
import { ConnectorIcon } from '../components/ui/ConnectorIcon'
import { TopBar } from '../components/layout/TopBar'
import { Button } from '../components/ui/Button'
import { StatusBadge, Badge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import type { SyncJob, Document } from '../types'

type Tab = 'documents' | 'history' | 'settings'
type DocFilter = 'all' | 'succeeded' | 'failed' | 'empty'

const PAGE_SIZE = 50

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Document Log Table ──────────────────────────────────────────────────────

function DocStatusIcon({ status }: { status: Document['extraction_status'] }) {
  if (status === 'succeeded')
    return <CheckCircle size={14} className="text-success flex-shrink-0" />
  if (status === 'failed')
    return <XCircle size={14} className="text-error flex-shrink-0" />
  if (status === 'skipped')
    return <Minus size={14} className="text-text-muted flex-shrink-0" />
  return <Clock size={14} className="text-text-muted flex-shrink-0" />
}

function DocStatusBadge({ status }: { status: Document['extraction_status'] }) {
  if (status === 'succeeded') return <Badge variant="success">indexed</Badge>
  if (status === 'failed') return <Badge variant="error">failed</Badge>
  if (status === 'empty') return <Badge variant="warning">empty</Badge>
  return <Badge variant="default">{status ?? 'unknown'}</Badge>
}

function DocumentsTab({
  orgSlug,
  connectorId,
  isSyncing,
}: {
  orgSlug: string
  connectorId: string
  isSyncing: boolean
}) {
  const [filter, setFilter] = useState<DocFilter>('all')
  const [offset, setOffset] = useState(0)

  // Reset offset when filter changes
  useEffect(() => setOffset(0), [filter])

  const docsQuery = useQuery({
    queryKey: ['connector-docs', orgSlug, connectorId, filter, offset],
    queryFn: () =>
      connectorsService.listDocuments(orgSlug, connectorId, {
        status: filter === 'all' ? undefined : filter,
        limit: PAGE_SIZE,
        offset,
      }),
    refetchInterval: 8000,
  })

  const docs = docsQuery.data?.results ?? []
  const total = docsQuery.data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  const filters: { key: DocFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'succeeded', label: 'Indexed' },
    { key: 'failed', label: 'Failed' },
    { key: 'empty', label: 'Empty' },
  ]

  return (
    <div className="bg-bg-surface border border-border rounded overflow-hidden">
      {/* Filter strip */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-b border-border bg-bg-elevated/30">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={[
              'px-3 py-1 rounded text-xs font-medium transition-colors',
              filter === f.key
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
        {total > 0 && (
          <span className="ml-auto text-2xs text-text-muted font-mono">
            {total.toLocaleString()} document{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-5 py-2 border-b border-border">
        <span className="text-2xs text-text-muted uppercase tracking-widest font-mono w-16">Status</span>
        <span className="text-2xs text-text-muted uppercase tracking-widest font-mono">Resource</span>
        <span className="text-2xs text-text-muted uppercase tracking-widest font-mono w-28 text-right">Indexed</span>
        <span className="text-2xs text-text-muted uppercase tracking-widest font-mono w-8" />
      </div>

      {/* Syncing indicator */}
      {isSyncing && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-accent/5 border-b border-accent/20">
          <Loader2 size={13} className="animate-spin text-accent flex-shrink-0" />
          <span className="text-xs text-accent">Sync in progress — results will appear as documents are indexed</span>
        </div>
      )}

      {/* Rows */}
      {docsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={18} className="animate-spin text-text-muted" />
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          title={
            isSyncing
              ? 'Sync in progress…'
              : filter === 'all'
              ? 'No documents yet'
              : `No ${filter} documents`
          }
          description={
            isSyncing
              ? 'Documents will appear here as they are indexed.'
              : filter === 'all'
              ? 'Run a sync to start indexing documents.'
              : 'Try a different filter.'
          }
        />
      ) : (
        <div className="divide-y divide-border/60">
          {docs.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-bg-elevated/20">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={13} /> Previous
          </button>
          <span className="text-2xs text-text-muted font-mono">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

function DocumentRow({ doc }: { doc: Document }) {
  const [expanded, setExpanded] = useState(false)

  const title = doc.title || doc.external_id || 'Untitled'
  const sourcePath = (doc.metadata?.source_path as string | undefined) ?? null
  const indexedAt = doc.indexed_at
    ? formatDistanceToNow(new Date(doc.indexed_at), { addSuffix: true })
    : '—'

  const hasFailed = doc.extraction_status === 'failed'

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full grid grid-cols-[auto_1fr_auto_auto] gap-x-4 items-start px-5 py-3 text-left hover:bg-bg-elevated/40 transition-colors"
      >
        {/* Status */}
        <div className="flex items-center gap-2 w-16 pt-0.5">
          <DocStatusIcon status={doc.extraction_status} />
          <DocStatusBadge status={doc.extraction_status} />
        </div>

        {/* Resource */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={13} className="text-text-muted flex-shrink-0" />
            <span className="text-sm text-text-primary truncate">{title}</span>
            {doc.ext && (
              <span className="text-2xs text-text-muted font-mono bg-bg-elevated px-1.5 py-0.5 rounded flex-shrink-0">
                {doc.ext}
              </span>
            )}
          </div>
          {sourcePath && (
            <p className="text-2xs text-text-muted mt-0.5 ml-5 truncate font-mono">{sourcePath}</p>
          )}
          {hasFailed && doc.extraction_error_code && (
            <p className="text-xs text-error mt-1 ml-5 font-mono">{doc.extraction_error_code}</p>
          )}
        </div>

        {/* Indexed at */}
        <span className="text-xs text-text-muted w-28 text-right whitespace-nowrap pt-0.5">
          {indexedAt}
        </span>

        {/* Expand chevron */}
        <span className="text-text-muted w-8 flex justify-end pt-0.5">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {expanded && (
        <div className="px-5 pb-4 bg-bg-elevated/30 border-t border-border/50 grid grid-cols-2 gap-x-8 gap-y-3">
          <div className="col-span-2 pt-3 pb-0">
            <p className="text-2xs text-text-muted uppercase tracking-wider font-mono">Document details</p>
          </div>

          {doc.author_name && (
            <div>
              <p className="text-2xs text-text-muted font-mono mb-0.5">Author</p>
              <p className="text-xs text-text-secondary">{doc.author_name}</p>
            </div>
          )}
          {doc.word_count != null && (
            <div>
              <p className="text-2xs text-text-muted font-mono mb-0.5">Word count</p>
              <p className="text-xs text-text-secondary font-mono">{doc.word_count.toLocaleString()}</p>
            </div>
          )}
          {doc.mtime && (
            <div>
              <p className="text-2xs text-text-muted font-mono mb-0.5">Source modified</p>
              <p className="text-xs text-text-secondary font-mono">
                {format(new Date(doc.mtime), 'MMM d yyyy, HH:mm')}
              </p>
            </div>
          )}
          {doc.indexed_at && (
            <div>
              <p className="text-2xs text-text-muted font-mono mb-0.5">Indexed at</p>
              <p className="text-xs text-text-secondary font-mono">
                {format(new Date(doc.indexed_at), 'MMM d yyyy, HH:mm')}
              </p>
            </div>
          )}
          {doc.external_id && (
            <div className="col-span-2">
              <p className="text-2xs text-text-muted font-mono mb-0.5">External ID</p>
              <p className="text-xs text-text-muted font-mono break-all">{doc.external_id}</p>
            </div>
          )}
          {doc.url && (
            <div className="col-span-2">
              <p className="text-2xs text-text-muted font-mono mb-0.5">Source URL</p>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline break-all font-mono"
              >
                {doc.url}
              </a>
            </div>
          )}
          {hasFailed && doc.extraction_error_code && (
            <div className="col-span-2">
              <p className="text-2xs text-text-muted font-mono mb-0.5">Error</p>
              <p className="text-xs text-error bg-error/5 border border-error/20 rounded px-3 py-2 font-mono">
                {doc.extraction_error_code}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sync History Tab ────────────────────────────────────────────────────────

// Returns true if the string looks like a UUID (triggered_by stores user_id sometimes)
function isUUID(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function jobSummary(job: SyncJob): string {
  const isActive = job.status === 'pending' || job.status === 'running'
  if (isActive) return 'Sync in progress…'
  if (job.status === 'cancelled') return 'Sync was cancelled'
  if (job.status === 'failed') return job.error_message ? job.error_message : 'Sync failed'

  // done or partial
  const { docs_indexed, docs_skipped, docs_errored } = job
  const total = docs_indexed + docs_skipped + docs_errored

  if (total === 0) return 'No documents found in source'

  const parts: string[] = []
  if (docs_indexed > 0) parts.push(`${docs_indexed} new${docs_indexed === 1 ? ' document' : ' documents'} indexed`)
  if (docs_skipped > 0) parts.push(`${docs_skipped} unchanged`)
  if (docs_errored > 0) parts.push(`${docs_errored} failed`)

  return parts.join(' · ')
}

function SyncJobRow({
  job,
  onCancel,
  isCancelling,
}: {
  job: SyncJob
  onCancel: (jobId: string) => void
  isCancelling: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const isPartial = job.status === 'done' && job.docs_errored > 0
  const displayStatus = isPartial ? 'partial' : job.status
  const isActive = job.status === 'pending' || job.status === 'running'

  const statusConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    done:      { icon: <CheckCircle size={15} />, color: 'text-success' },
    partial:   { icon: <AlertTriangle size={15} />, color: 'text-warning' },
    failed:    { icon: <XCircle size={15} />, color: 'text-error' },
    running:   { icon: <Loader2 size={15} className="animate-spin" />, color: 'text-accent' },
    pending:   { icon: <Clock size={15} />, color: 'text-text-muted' },
    cancelled: { icon: <Ban size={15} />, color: 'text-text-muted' },
  }

  const { icon, color } = statusConfig[displayStatus] ?? statusConfig.pending
  const started = job.started_at ? format(new Date(job.started_at), 'MMM d, HH:mm') : '—'
  const startedFull = job.started_at ? format(new Date(job.started_at), 'MMM d yyyy, HH:mm:ss') : null
  const finishedFull = job.finished_at ? format(new Date(job.finished_at), 'MMM d yyyy, HH:mm:ss') : null
  const duration = formatDuration(job.started_at, job.finished_at)
  const triggeredBy = !job.triggered_by || isUUID(job.triggered_by) ? 'manual' : job.triggered_by
  const truncated = typeof job.meta?.documents_truncated === 'number' ? Number(job.meta.documents_truncated) : 0

  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-bg-elevated/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`flex-shrink-0 ${color}`}>{icon}</span>

        <div className="flex-1 min-w-0">
          <p className={`text-sm ${displayStatus === 'failed' ? 'text-error' : 'text-text-primary'} truncate`}>
            {jobSummary(job)}
          </p>
          <p className="text-2xs text-text-muted mt-0.5">
            {triggeredBy === 'manual' ? 'Manual sync' : `Scheduled · ${triggeredBy}`}
            {duration !== '—' && ` · ${duration}`}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-text-muted">{started}</span>
          {isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(job.id) }}
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
        <div className="px-5 pb-4 pt-3 flex flex-col gap-3 bg-bg-elevated/30 border-t border-border/50">

          {/* Timestamps */}
          <div className="flex gap-8">
            {startedFull && (
              <div>
                <p className="text-2xs text-text-muted font-mono mb-0.5">Started</p>
                <p className="text-xs text-text-secondary font-mono">{startedFull}</p>
              </div>
            )}
            {finishedFull && (
              <div>
                <p className="text-2xs text-text-muted font-mono mb-0.5">Finished</p>
                <p className="text-xs text-text-secondary font-mono">{finishedFull}</p>
              </div>
            )}
            {duration !== '—' && (
              <div>
                <p className="text-2xs text-text-muted font-mono mb-0.5">Duration</p>
                <p className="text-xs text-text-secondary font-mono">{duration}</p>
              </div>
            )}
          </div>

          {/* What happened — only show non-zero counts */}
          {(job.docs_indexed > 0 || job.docs_skipped > 0 || job.docs_errored > 0) && (
            <div className="flex gap-6">
              {job.docs_indexed > 0 && (
                <div>
                  <p className="text-2xs text-text-muted font-mono mb-0.5">Newly indexed</p>
                  <p className="text-xs text-success font-mono">{job.docs_indexed}</p>
                </div>
              )}
              {job.docs_skipped > 0 && (
                <div>
                  <p className="text-2xs text-text-muted font-mono mb-0.5">Already up to date</p>
                  <p className="text-xs text-text-secondary font-mono">{job.docs_skipped}</p>
                </div>
              )}
              {job.docs_errored > 0 && (
                <div>
                  <p className="text-2xs text-text-muted font-mono mb-0.5">Failed to index</p>
                  <p className="text-xs text-error font-mono">{job.docs_errored}</p>
                </div>
              )}
              {truncated > 0 && (
                <div>
                  <p className="text-2xs text-text-muted font-mono mb-0.5">Skipped (over limit)</p>
                  <p className="text-xs text-warning font-mono">{truncated}</p>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {job.error_message && (
            <div>
              <p className="text-2xs text-text-muted font-mono mb-1">Error</p>
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

// ─── Clear History Modal ─────────────────────────────────────────────────────

function ClearHistoryModal({
  onConfirm,
  onClose,
  isLoading,
}: {
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={dialogRef}
        className="relative bg-bg-surface border border-border rounded-lg w-full max-w-sm mx-4 shadow-xl"
      >
        <div className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0">
              <Trash2 size={16} className="text-error" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Clear sync history</h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                All completed, failed, and cancelled sync records will be permanently removed.
                Any currently running sync will not be affected.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            Clear history
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({
  jobs,
  isLoading,
  onCancel,
  isCancelling,
  onClearHistory,
  isClearingHistory,
}: {
  jobs: SyncJob[]
  isLoading: boolean
  onCancel: (jobId: string) => void
  isCancelling: (jobId: string) => boolean
  onClearHistory: () => void
  isClearingHistory: boolean
}) {
  const [showClearModal, setShowClearModal] = useState(false)

  return (
    <>
      {showClearModal && (
        <ClearHistoryModal
          onClose={() => setShowClearModal(false)}
          onConfirm={() => {
            onClearHistory()
            setShowClearModal(false)
          }}
          isLoading={isClearingHistory}
        />
      )}

      <div className="bg-bg-surface border border-border rounded overflow-hidden">
        {jobs.length > 0 && (
          <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-bg-elevated/20">
            <button
              onClick={() => setShowClearModal(true)}
              className="text-2xs text-text-muted hover:text-error transition-colors"
            >
              Clear history
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={18} className="animate-spin text-text-muted" />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No sync history"
            description="Run a sync to see the history here."
          />
        ) : (
          <div>
            {jobs.map((job) => (
              <SyncJobRow
                key={job.id}
                job={job}
                onCancel={onCancel}
                isCancelling={isCancelling(job.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

function SettingsTab({
  currentLimit,
  onSave,
  isSaving,
}: {
  currentLimit: number | null
  onSave: (limit: number | null) => void
  isSaving: boolean
}) {
  const [value, setValue] = useState(currentLimit?.toString() ?? '')

  useEffect(() => setValue(currentLimit?.toString() ?? ''), [currentLimit])

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
          <Button size="sm" onClick={() => onSave(parsed)} isLoading={isSaving}>
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

// ─── Main Page ───────────────────────────────────────────────────────────────

export function ConnectorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const orgSlug = useOrgSlug()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('history')

  const connectorQuery = useQuery({
    queryKey: ['connector', orgSlug, id],
    queryFn: () => connectorsService.get(orgSlug, id!),
    enabled: !!id,
    refetchInterval: 10000,
  })

  const syncJobsQuery = useQuery({
    queryKey: ['sync-jobs', orgSlug, id],
    queryFn: () => connectorsService.listSyncJobs(orgSlug, id!),
    enabled: !!id && activeTab === 'history',
    refetchInterval: 5000,
  })

  const syncMutation = useMutation({
    mutationFn: () => connectorsService.sync(orgSlug, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] })
      queryClient.invalidateQueries({ queryKey: ['sync-jobs', orgSlug, id] })
      queryClient.invalidateQueries({ queryKey: ['connector-docs', orgSlug, id] })
    },
  })

  const pauseMutation = useMutation({
    mutationFn: () => connectorsService.pause(orgSlug, id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] }),
  })

  const resumeMutation = useMutation({
    mutationFn: () => connectorsService.resume(orgSlug, id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] }),
  })

  const updateMutation = useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      connectorsService.update(orgSlug, id!, { config }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connector', orgSlug, id] }),
  })

  const cancelJobMutation = useMutation({
    mutationFn: (jobId: string) => connectorsService.cancelSyncJob(orgSlug, jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync-jobs', orgSlug, id] }),
  })

  const clearHistoryMutation = useMutation({
    mutationFn: () => connectorsService.clearSyncHistory(orgSlug, id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync-jobs', orgSlug, id] }),
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

  const tabs: { key: Tab; label: string }[] = [
    { key: 'history', label: 'Sync history' },
    { key: 'documents', label: 'Documents' },
    { key: 'settings', label: 'Settings' },
  ]

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
        <div className="max-w-4xl mx-auto p-6 flex flex-col gap-5">

          {/* Header card */}
          <div className="bg-bg-surface border border-border rounded overflow-hidden">
            <div className="flex items-center gap-4 px-6 py-5 border-b border-border">
              <div className="w-11 h-11 bg-bg-elevated border border-border rounded-lg flex items-center justify-center flex-shrink-0">
                <ConnectorIcon kind={connector.kind} size={22} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-base font-semibold text-text-primary">{connector.name}</h1>
                  <StatusBadge status={connector.status} />
                </div>
                <p className="text-xs text-text-muted mt-0.5 font-mono capitalize">
                  {connector.kind.replace(/_/g, ' ')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border">
              <div className="px-6 py-4">
                <p className="text-2xs text-text-muted uppercase tracking-widest font-mono mb-1">Documents</p>
                <p className="text-2xl font-semibold text-text-primary font-mono tabular-nums">
                  {connector.doc_count.toLocaleString()}
                </p>
              </div>
              <div className="px-6 py-4">
                <p className="text-2xs text-text-muted uppercase tracking-widest font-mono mb-1">Last synced</p>
                <p className="text-sm text-text-secondary">{lastSynced}</p>
                {connector.last_synced_at && (
                  <p className="text-2xs text-text-muted font-mono mt-0.5">
                    {format(new Date(connector.last_synced_at), 'MMM d, HH:mm')}
                  </p>
                )}
              </div>
              <div className="px-6 py-4">
                <p className="text-2xs text-text-muted uppercase tracking-widest font-mono mb-1">Connected</p>
                <p className="text-sm text-text-secondary">
                  {formatDistanceToNow(new Date(connector.created_at), { addSuffix: true })}
                </p>
                <p className="text-2xs text-text-muted font-mono mt-0.5">
                  {format(new Date(connector.created_at), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-0 border-b border-border -mb-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                  activeTab === tab.key
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-muted hover:text-text-secondary',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'documents' && (
            <DocumentsTab
              orgSlug={orgSlug}
              connectorId={id!}
              isSyncing={connector.status === 'syncing'}
            />
          )}

          {activeTab === 'history' && (
            <HistoryTab
              jobs={syncJobsQuery.data ?? []}
              isLoading={syncJobsQuery.isLoading}
              onCancel={(jobId) => cancelJobMutation.mutate(jobId)}
              isCancelling={(jobId) => cancelJobMutation.isPending && cancelJobMutation.variables === jobId}
              onClearHistory={() => clearHistoryMutation.mutate()}
              isClearingHistory={clearHistoryMutation.isPending}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              currentLimit={
                typeof connector.config?.max_documents === 'number'
                  ? connector.config.max_documents
                  : null
              }
              onSave={(max) => updateMutation.mutate({ ...connector.config, max_documents: max })}
              isSaving={updateMutation.isPending}
            />
          )}

        </div>
      </div>
    </div>
  )
}
