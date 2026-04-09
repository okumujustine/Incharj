import React, { useState, useCallback } from 'react'
import {
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  MessageSquare,
} from 'lucide-react'
import type { AIAnswerState, AnswerSource } from '../../hooks/useAIAnswer'
import { ConnectorIcon } from '../ui/ConnectorIcon'


function StreamingCursor() {
  return (
    <span
      className="inline-block w-[2px] h-[1em] bg-accent ml-0.5 align-text-bottom animate-pulse"
      aria-hidden="true"
    />
  )
}


function SourcePill({ source }: { source: AnswerSource }) {
  const label = source.title.replace(/[*#_`]/g, '').split('\n')[0].slice(0, 50)
  const isLinked = !!source.url

  const inner = (
    <span className="flex items-center gap-1.5 group">
      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent/15 text-accent text-[9px] font-bold flex-shrink-0">
        {source.ref}
      </span>
      <ConnectorIcon kind={source.connector} size={11} />
      <span className="text-text-secondary group-hover:text-text-primary transition-colors truncate max-w-[160px]">
        {label}
      </span>
      {isLinked && (
        <ExternalLink size={9} className="text-text-muted flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </span>
  )

  if (isLinked) {
    return (
      <a
        href={source.url!}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center h-6 px-2 rounded-md border border-border bg-bg-elevated hover:bg-bg-surface hover:border-accent/30 transition-all text-xs cursor-pointer"
        title={source.snippet}
      >
        {inner}
      </a>
    )
  }

  return (
    <span
      className="inline-flex items-center h-6 px-2 rounded-md border border-border bg-bg-elevated text-xs"
      title={`${source.location} · ${source.snippet}`}
    >
      {inner}
    </span>
  )
}

// Renders markdown bold (**text**) and inline [N] citations inline

function AnswerText({ text, streaming }: { text: string; streaming: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[0-9]+\])/g)

  return (
    <p className="text-sm text-text-primary leading-relaxed">
      {parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) {
          return <strong key={i} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>
        }
        if (/^\[[0-9]+\]$/.test(part)) {
          return (
            <sup key={i} className="text-accent text-[10px] font-bold ml-0.5 cursor-default" title={`Source ${part}`}>
              {part}
            </sup>
          )
        }
        return <React.Fragment key={i}>{part}</React.Fragment>
      })}
      {streaming && <StreamingCursor />}
    </p>
  )
}


function AnswerSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-3 bg-bg-elevated rounded w-full" />
      <div className="h-3 bg-bg-elevated rounded w-5/6" />
      <div className="h-3 bg-bg-elevated rounded w-4/6" />
    </div>
  )
}


function SourcesSection({ sources, expanded, onToggle }: {
  sources: AnswerSource[]
  expanded: boolean
  onToggle: () => void
}) {
  if (!sources.length) return null

  const visible = expanded ? sources : sources.slice(0, 3)
  const hasMore = sources.length > 3

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-2xs font-medium text-text-muted hover:text-text-secondary mb-2 transition-colors"
      >
        <span>Sources ({sources.length})</span>
        {hasMore && (expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
      </button>

      <div className="flex flex-wrap gap-1.5">
        {visible.map((s) => (
          <SourcePill key={s.ref} source={s} />
        ))}
        {!expanded && hasMore && (
          <button
            onClick={onToggle}
            className="inline-flex items-center h-6 px-2 rounded-md border border-dashed border-border text-2xs text-text-muted hover:text-text-secondary hover:border-accent/30 transition-all"
          >
            +{sources.length - 3} more
          </button>
        )}
      </div>
    </div>
  )
}


function ActionBar({
  text,
  onAskFollowUp,
}: {
  text: string
  onAskFollowUp?: (q: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  const suggestions = [
    'Tell me more',
    'Show the breakdown',
    'Compare to last year',
  ]

  return (
    <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center gap-2 flex-wrap">
      {/* Copy */}
      <button
        onClick={handleCopy}
        className="flex items-center gap-1 h-6 px-2 rounded text-2xs text-text-muted hover:text-text-secondary hover:bg-bg-elevated border border-transparent hover:border-border transition-all"
      >
        {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
        {copied ? 'Copied' : 'Copy'}
      </button>

      {/* Divider */}
      <span className="text-border text-xs">|</span>

      {/* Follow-up suggestions */}
      {onAskFollowUp && suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onAskFollowUp(s)}
          className="flex items-center gap-1 h-6 px-2 rounded text-2xs text-text-muted hover:text-accent hover:bg-accent/5 border border-transparent hover:border-accent/20 transition-all"
        >
          <MessageSquare size={9} />
          {s}
        </button>
      ))}
    </div>
  )
}


interface AIAnswerPanelProps {
  state: AIAnswerState
  onFollowUp?: (query: string) => void
}

export function AIAnswerPanel({ state, onFollowUp }: AIAnswerPanelProps) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false)
  const { status, text, sources, error, elapsedMs } = state

  if (status === 'idle') return null

  const isStreaming = status === 'streaming'
  const isLoading  = status === 'loading'
  const isError    = status === 'error'
  const isDone     = status === 'done'
  const isEmpty    = status === 'empty'

  return (
    <div className="border-b border-border bg-bg-surface">
      <div className="max-w-6xl mx-auto px-5 py-4">

        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center w-5 h-5 rounded bg-accent/10">
            {isLoading || isStreaming ? (
              <Loader2 size={11} className="text-accent animate-spin" />
            ) : (
              <Sparkles size={11} className="text-accent" />
            )}
          </div>
          <span className="text-xs font-medium text-text-secondary">
            {isLoading   && 'Thinking…'}
            {isStreaming && 'Answering…'}
            {isDone      && 'AI Answer'}
            {isEmpty     && 'AI Answer'}
            {isError     && 'AI Answer'}
          </span>
          {isDone && elapsedMs && (
            <span className="text-2xs text-text-muted font-mono ml-auto">
              {(elapsedMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>

        {/* Body */}
        {isLoading && <AnswerSkeleton />}

        {(isStreaming || isDone) && text && (
          <AnswerText text={text} streaming={isStreaming} />
        )}

        {isEmpty && (
          <p className="text-sm text-text-muted italic">
            No relevant information found in your connected sources.
          </p>
        )}

        {isError && (
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-error flex-shrink-0 mt-0.5" />
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        {/* Sources (shown while streaming and after) */}
        {(isStreaming || isDone) && sources.length > 0 && (
          <SourcesSection
            sources={sources}
            expanded={sourcesExpanded}
            onToggle={() => setSourcesExpanded(v => !v)}
          />
        )}

        {/* Actions (only when done) */}
        {isDone && text && (
          <ActionBar text={text} onAskFollowUp={onFollowUp} />
        )}

      </div>
    </div>
  )
}
