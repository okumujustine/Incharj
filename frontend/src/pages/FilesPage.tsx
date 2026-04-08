import React, { useState } from 'react'
import {
  ExternalLink,
  SlidersHorizontal,
  X,
  AlertCircle,
  Files,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { useOrgSlug } from '../hooks/useOrgSlug'
import { connectorsService } from '../services/connectors'
import { documentsService } from '../services/documents'
import { TopBar } from '../components/layout/TopBar'
import { Badge } from '../components/ui/Badge'
import { SkeletonList } from '../components/ui/SkeletonList'
import { EmptyState } from '../components/ui/EmptyState'
import { ConnectorIcon } from '../components/ui/ConnectorIcon'
import { FileTypeIcon } from '../components/ui/FileTypeIcon'
import type { Document, Connector } from '../types'

const PAGE_SIZE = 50

interface FileRowProps {
  doc: Document
  connector: Connector | undefined
}

function FileRow({ doc, connector }: FileRowProps) {
  const relativeDate = doc.mtime
    ? formatDistanceToNow(new Date(doc.mtime), { addSuffix: true })
    : doc.indexed_at
    ? formatDistanceToNow(new Date(doc.indexed_at), { addSuffix: true })
    : null

  function handleOpen() {
    if (doc.url) window.open(doc.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      onClick={doc.url ? handleOpen : undefined}
      className={[
        'flex items-center gap-4 px-5 py-3 border-b border-border transition-colors',
        doc.url ? 'cursor-pointer hover:bg-bg-elevated' : '',
      ].join(' ')}
    >
      <div className="w-7 h-7 rounded bg-bg-overlay border border-border flex items-center justify-center flex-shrink-0">
        <FileTypeIcon ext={doc.ext} kind={doc.kind} size={14} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">
            {doc.title || 'Untitled'}
          </span>
          {doc.url && (
            <ExternalLink size={10} className="text-text-muted flex-shrink-0 opacity-50" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {connector && (
            <div className="flex items-center gap-1.5">
              <ConnectorIcon kind={connector.kind} size={11} />
              <span className="text-2xs font-mono text-text-muted">{connector.name}</span>
            </div>
          )}
          {connector && <span className="text-text-muted text-2xs">·</span>}
          <Badge variant="default">{doc.kind}</Badge>
          {doc.ext && <Badge variant="default">.{doc.ext}</Badge>}
          {doc.author_name && (
            <>
              <span className="text-text-muted text-2xs">·</span>
              <span className="text-2xs text-text-muted">{doc.author_name}</span>
            </>
          )}
        </div>
      </div>

      {relativeDate && (
        <span className="text-2xs text-text-muted font-mono flex-shrink-0">
          {relativeDate}
        </span>
      )}
    </div>
  )
}

interface FiltersRowProps {
  connectors: Connector[]
  selectedConnector: string
  selectedKind: string
  onConnectorChange: (v: string) => void
  onKindChange: (v: string) => void
  onClear: () => void
  hasFilters: boolean
}

function FiltersRow({
  connectors,
  selectedConnector,
  selectedKind,
  onConnectorChange,
  onKindChange,
  onClear,
  hasFilters,
}: FiltersRowProps) {
  return (
    <div className="border-b border-border bg-bg-surface">
      <div className="max-w-6xl mx-auto flex items-center gap-2 px-5 py-2 flex-wrap">
        <SlidersHorizontal size={12} className="text-text-muted" />
        <select
          value={selectedConnector}
          onChange={(e) => onConnectorChange(e.target.value)}
          className="h-6 text-xs bg-bg-elevated text-text-secondary border border-border rounded px-2 focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value="">All connectors</option>
          {connectors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={selectedKind}
          onChange={(e) => onKindChange(e.target.value)}
          className="h-6 text-xs bg-bg-elevated text-text-secondary border border-border rounded px-2 focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value="">All types</option>
          <option value="document">Document</option>
          <option value="page">Page</option>
          <option value="message">Message</option>
          <option value="spreadsheet">Spreadsheet</option>
          <option value="presentation">Presentation</option>
        </select>
        {hasFilters && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 h-6 px-2 text-2xs text-text-muted hover:text-error border border-border rounded hover:border-error/30 transition-colors"
          >
            <X size={10} />
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (p: number) => void
}

function Pagination({ page, totalPages, total, pageSize, onPageChange }: PaginationProps) {
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  // Build page numbers to show: always first, last, current ±2, with ellipsis
  const pages: (number | 'ellipsis')[] = []
  const range = new Set<number>()
  range.add(1)
  range.add(totalPages)
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) range.add(i)

  const sorted = Array.from(range).sort((a, b) => a - b)
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) pages.push('ellipsis')
    pages.push(sorted[i])
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-bg-surface flex-shrink-0">
      <span className="text-2xs text-text-muted font-mono">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="w-7 h-7 flex items-center justify-center rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={13} />
        </button>

        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="w-7 h-7 flex items-center justify-center text-xs text-text-muted">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={[
                'w-7 h-7 flex items-center justify-center rounded text-xs transition-colors',
                p === page
                  ? 'bg-accent/10 text-accent border border-accent/20 font-medium'
                  : 'border border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
              ].join(' ')}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="w-7 h-7 flex items-center justify-center rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}

export function FilesPage() {
  const orgSlug = useOrgSlug()
  const [selectedConnector, setSelectedConnector] = useState('')
  const [selectedKind, setSelectedKind] = useState('')
  const [page, setPage] = useState(1)

  const connectorsQuery = useQuery({
    queryKey: ['connectors', orgSlug],
    queryFn: () => connectorsService.list(orgSlug),
    staleTime: 60 * 1000,
  })

  const docsQuery = useQuery({
    queryKey: ['documents', orgSlug, selectedConnector, selectedKind, page],
    queryFn: () =>
      documentsService.list(orgSlug, {
        connector_id: selectedConnector || undefined,
        kind: selectedKind || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })

  const connectorMap = new Map<string, Connector>(
    (connectorsQuery.data ?? []).map((c) => [c.id, c])
  )
  const hasFilters = !!(selectedConnector || selectedKind)
  const total = docsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const docs = docsQuery.data?.results ?? []

  function handleFilterChange(connector: string, kind: string) {
    setSelectedConnector(connector)
    setSelectedKind(kind)
    setPage(1)
  }

  function clearFilters() {
    handleFilterChange('', '')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar crumbs={[{ label: 'Files' }]} />

      <FiltersRow
        connectors={connectorsQuery.data ?? []}
        selectedConnector={selectedConnector}
        selectedKind={selectedKind}
        onConnectorChange={(v) => handleFilterChange(v, selectedKind)}
        onKindChange={(v) => handleFilterChange(selectedConnector, v)}
        onClear={clearFilters}
        hasFilters={hasFilters}
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-6xl mx-auto">
          {!docsQuery.isLoading && !docsQuery.isError && total > 0 && (
            <div className="px-5 py-2 border-b border-border">
              <p className="text-xs text-text-muted font-mono">
                {total.toLocaleString()} file{total !== 1 ? 's' : ''}
                {hasFilters ? ' (filtered)' : ' indexed'}
              </p>
            </div>
          )}

          {docsQuery.isLoading && <SkeletonList count={8} />}

          {docsQuery.isError && !docsQuery.isLoading && (
            <EmptyState
              icon={<AlertCircle size={36} />}
              title="Failed to load files"
              description="Unable to fetch indexed documents. Please try again."
            />
          )}

          {!docsQuery.isLoading && !docsQuery.isError && total === 0 && (
            <EmptyState
              icon={<Files size={36} />}
              title={hasFilters ? 'No files match filters' : 'No files indexed'}
              description={
                hasFilters
                  ? 'Try clearing your filters to see all files.'
                  : 'Connect a source and run a sync to index your documents.'
              }
            />
          )}

          {docs.length > 0 && (
            <div className={docsQuery.isFetching && !docsQuery.isLoading ? 'opacity-60 transition-opacity' : ''}>
              {docs.map((doc) => (
                <FileRow
                  key={doc.id}
                  doc={doc}
                  connector={connectorMap.get(doc.connector_id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}
