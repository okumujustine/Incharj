import React, { useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Search,
  ExternalLink,
  HardDrive,
  FileText,
  MessageSquare,
  X,
  AlertCircle,
  SlidersHorizontal,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { useSearch } from '../hooks/useSearch'
import { connectorsService } from '../services/connectors'
import { TopBar } from '../components/layout/TopBar'
import { Badge } from '../components/ui/Badge'
import { SkeletonList } from '../components/ui/SkeletonList'
import { EmptyState } from '../components/ui/EmptyState'
import type { SearchResult, Connector } from '../types'

const CONNECTOR_ICONS: Record<string, React.ReactNode> = {
  google_drive: <HardDrive size={12} />,
  notion: <FileText size={12} />,
  slack: <MessageSquare size={12} />,
}

function renderSnippet(snippet: string) {
  const parts = snippet.split(/<<(.*?)>>/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="bg-yellow-400/20 text-yellow-300 rounded px-0.5 not-italic"
      >
        {part}
      </mark>
    ) : (
      part
    )
  )
}

function ConnectorIcon({ kind }: { kind: string }) {
  return (
    <span className="text-text-muted">
      {CONNECTOR_ICONS[kind] ?? <FileText size={12} />}
    </span>
  )
}

interface SearchResultItemProps {
  result: SearchResult
  isSelected: boolean
  onSelect: () => void
}

function SearchResultItem({ result, isSelected, onSelect }: SearchResultItemProps) {
  const relativeDate = result.mtime
    ? formatDistanceToNow(new Date(result.mtime), { addSuffix: true })
    : null

  function handleClick() {
    onSelect()
    if (result.url) {
      window.open(result.url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div
      onClick={handleClick}
      className={[
        'flex flex-col gap-2 px-5 py-4 border-b border-border cursor-pointer transition-colors',
        isSelected ? 'bg-bg-elevated' : 'hover:bg-bg-surface/50',
      ].join(' ')}
    >
      {/* Title row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-text-primary leading-tight truncate">
              {result.title || 'Untitled'}
            </h3>
            {result.url && (
              <ExternalLink
                size={11}
                className="text-text-muted flex-shrink-0 opacity-60"
              />
            )}
          </div>
        </div>
        {relativeDate && (
          <span className="text-2xs text-text-muted font-mono flex-shrink-0">
            {relativeDate}
          </span>
        )}
      </div>

      {/* Snippet */}
      <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
        {renderSnippet(result.snippet)}
      </p>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-text-muted">
          <ConnectorIcon kind={result.connector_kind} />
          <span className="text-2xs font-mono">{result.connector_name}</span>
        </div>
        <span className="text-text-muted text-2xs">·</span>
        <Badge variant="default">{result.kind}</Badge>
        {result.ext && (
          <Badge variant="default">.{result.ext}</Badge>
        )}
        {result.author_name && (
          <>
            <span className="text-text-muted text-2xs">·</span>
            <span className="text-2xs text-text-muted">{result.author_name}</span>
          </>
        )}
      </div>
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

export function SearchPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    query,
    setQuery,
    filters,
    updateFilter,
    clearFilters,
    selectedIndex,
    setSelectedIndex,
    navigateResults,
    openSelected,
    results,
    total,
    isLoading,
    isError,
    hasQuery,
  } = useSearch({ orgSlug: orgSlug! })

  const connectorsQuery = useQuery({
    queryKey: ['connectors', orgSlug],
    queryFn: () => connectorsService.list(orgSlug!),
    enabled: !!orgSlug,
    staleTime: 60 * 1000,
  })

  // Global keyboard shortcut Cmd+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Arrow key navigation in results
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        navigateResults('down')
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        navigateResults('up')
      } else if (e.key === 'Enter') {
        e.preventDefault()
        openSelected(results)
      } else if (e.key === 'Escape') {
        inputRef.current?.blur()
        setSelectedIndex(-1)
      }
    },
    [navigateResults, openSelected, results, setSelectedIndex]
  )

  const hasFilters = !!(filters.connector_id || filters.kind)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        crumbs={[{ label: orgSlug ?? '' }, { label: 'Search' }]}
      />

      {/* Search bar */}
      <div className="border-b border-border bg-bg-surface">
      <div className="max-w-6xl mx-auto px-5 py-4">
        <div className="relative flex items-center">
          <Search
            size={16}
            className="absolute left-4 text-text-muted pointer-events-none"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search your knowledge base... (⌘K)"
            className={[
              'w-full h-12 bg-bg-elevated text-text-primary text-sm',
              'border border-border rounded-md pl-11 pr-4',
              'placeholder:text-text-muted',
              'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20',
              'transition-colors duration-150',
            ].join(' ')}
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 text-text-muted hover:text-text-secondary transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Filters row */}
      <FiltersRow
        connectors={connectorsQuery.data ?? []}
        selectedConnector={filters.connector_id ?? ''}
        selectedKind={filters.kind ?? ''}
        onConnectorChange={(v) => updateFilter('connector_id', v || undefined)}
        onKindChange={(v) => updateFilter('kind', v || undefined)}
        onClear={clearFilters}
        hasFilters={hasFilters}
      />

      {/* Results */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-6xl mx-auto">
        {/* Results count */}
        {hasQuery && !isLoading && !isError && results.length > 0 && (
          <div className="px-5 py-2 border-b border-border">
            <p className="text-xs text-text-muted font-mono">
              {total.toLocaleString()} result{total !== 1 ? 's' : ''} for{' '}
              <span className="text-text-secondary">"{query}"</span>
            </p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && <SkeletonList count={6} />}

        {/* Error state */}
        {isError && !isLoading && (
          <EmptyState
            icon={<AlertCircle size={36} />}
            title="Search failed"
            description="Unable to fetch search results. Please try again."
          />
        )}

        {/* Empty state — no query */}
        {!hasQuery && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full py-24 text-center px-6">
            <div className="w-12 h-12 rounded-md bg-bg-elevated border border-border flex items-center justify-center mb-5">
              <Search size={20} className="text-text-muted" />
            </div>
            <h2 className="text-base font-medium text-text-secondary mb-2">
              Search your knowledge base
            </h2>
            <p className="text-sm text-text-muted max-w-sm">
              Type a query to search across all connected sources — Google Drive,
              Notion, Slack, and more.
            </p>
            <div className="flex items-center gap-1.5 mt-6 text-xs text-text-muted font-mono border border-border rounded px-3 py-1.5">
              <span className="bg-bg-elevated border border-border rounded px-1.5 py-0.5 text-text-secondary">⌘K</span>
              <span>to focus search</span>
            </div>
          </div>
        )}

        {/* No results */}
        {hasQuery && !isLoading && !isError && results.length === 0 && (
          <EmptyState
            icon={<Search size={36} />}
            title="No results found"
            description={`No documents match "${query}". Try different keywords or check your connectors.`}
          />
        )}

        {/* Results list */}
        {!isLoading && !isError && results.length > 0 && (
          <div>
            {results.map((result, idx) => (
              <SearchResultItem
                key={result.id}
                result={result}
                isSelected={idx === selectedIndex}
                onSelect={() => setSelectedIndex(idx)}
              />
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Keyboard hints at bottom */}
      {hasQuery && results.length > 0 && (
        <div className="border-t border-border px-5 py-2 flex items-center gap-4 bg-bg-surface flex-shrink-0">
          <div className="flex items-center gap-1.5 text-2xs text-text-muted font-mono">
            <kbd className="bg-bg-elevated border border-border rounded px-1 py-0.5">↑↓</kbd>
            <span>navigate</span>
          </div>
          <div className="flex items-center gap-1.5 text-2xs text-text-muted font-mono">
            <kbd className="bg-bg-elevated border border-border rounded px-1 py-0.5">↵</kbd>
            <span>open</span>
          </div>
          <div className="flex items-center gap-1.5 text-2xs text-text-muted font-mono">
            <kbd className="bg-bg-elevated border border-border rounded px-1 py-0.5">Esc</kbd>
            <span>dismiss</span>
          </div>
        </div>
      )}
    </div>
  )
}
