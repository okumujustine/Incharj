import { useEffect, useRef, useCallback, useState } from 'react'
import {
  ArrowUp,
  Sparkles,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  MessageSquare,
  Users,
  BookOpen,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useAIAnswer, type AnswerSource, type AIAnswerState } from '../hooks/useAIAnswer'
import { TopBar } from '../components/layout/TopBar'
import { IncharjLogo } from '../components/ui/IncharjLogo'
import { ConnectorIcon } from '../components/ui/ConnectorIcon'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Turn {
  id: number
  question: string
  answer: AIAnswerState
}

// ---------------------------------------------------------------------------
// Suggestion chips — each with an icon for visual anchoring
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  { icon: FileText,      text: 'What is our refund policy?' },
  { icon: MessageSquare, text: "Summarise last week's Slack discussion" },
  { icon: Users,         text: 'Who owns the onboarding process?' },
  { icon: BookOpen,      text: 'What are our engineering principles?' },
]

// ---------------------------------------------------------------------------
// Streaming cursor — a refined ink blink
// ---------------------------------------------------------------------------

function StreamingCursor() {
  return (
    <span
      className="inline-block w-px h-[1.1em] bg-text-secondary ml-0.5 align-text-bottom animate-pulse"
      aria-hidden="true"
    />
  )
}

// ---------------------------------------------------------------------------
// Answer text — bold + citation markers
// ---------------------------------------------------------------------------

function AnswerText({ text, streaming }: { text: string; streaming: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[0-9]+\])/g)
  return (
    <p className="text-sm text-text-primary leading-[1.75] tracking-[0.01em]">
      {parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part))
          return <strong key={i} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>
        if (/^\[[0-9]+\]$/.test(part))
          return (
            <sup key={i} className="text-accent text-[9px] font-bold ml-0.5 cursor-default select-none">
              {part}
            </sup>
          )
        return <span key={i}>{part}</span>
      })}
      {streaming && <StreamingCursor />}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Source pill — compact, document-like
// ---------------------------------------------------------------------------

function SourcePill({ source }: { source: AnswerSource }) {
  const label = source.title.replace(/[*#_`]/g, '').split('\n')[0].slice(0, 44)
  const inner = (
    <span className="flex items-center gap-1.5">
      <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-text-primary/8 text-text-secondary text-[8px] font-bold flex items-center justify-center font-mono">
        {source.ref}
      </span>
      <ConnectorIcon kind={source.connector} size={10} />
      <span className="truncate max-w-[130px] text-text-secondary group-hover:text-text-primary transition-colors">
        {label}
      </span>
      {source.url && (
        <ExternalLink size={8} className="text-text-muted flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
      )}
    </span>
  )

  const cls = "group inline-flex items-center h-[26px] px-2.5 rounded-md border border-border bg-bg-surface hover:border-border-strong hover:shadow-sm transition-all text-xs"

  return source.url
    ? <a href={source.url} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
    : <span className={cls} title={source.snippet}>{inner}</span>
}

// ---------------------------------------------------------------------------
// Sources section
// ---------------------------------------------------------------------------

function Sources({ sources }: { sources: AnswerSource[] }) {
  const [expanded, setExpanded] = useState(false)
  if (!sources.length) return null
  const visible = expanded ? sources : sources.slice(0, 4)

  return (
    <div className="mt-4 pt-3 border-t border-border/40">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-2xs font-medium text-text-muted hover:text-text-secondary mb-2.5 transition-colors tracking-wide uppercase"
      >
        Sources · {sources.length}
        {sources.length > 4 && (expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />)}
      </button>
      <div className="flex flex-wrap gap-1.5">
        {visible.map(s => <SourcePill key={s.ref} source={s} />)}
        {!expanded && sources.length > 4 && (
          <button
            onClick={() => setExpanded(true)}
            className="inline-flex items-center h-[26px] px-2.5 rounded-md border border-dashed border-border text-2xs text-text-muted hover:text-text-secondary hover:border-border-strong transition-all"
          >
            +{sources.length - 4} more
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton — three lines of varying width
// ---------------------------------------------------------------------------

function AnswerSkeleton() {
  return (
    <div className="space-y-2.5 py-1">
      {[100, 83, 67].map((w, i) => (
        <div
          key={i}
          className="h-[13px] bg-bg-elevated rounded animate-pulse"
          style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single conversation turn
// ---------------------------------------------------------------------------

function TurnBlock({ turn }: { turn: Turn }) {
  const { question, answer } = turn
  const [copied, setCopied] = useState(false)
  const isStreaming = answer.status === 'streaming'
  const isLoading   = answer.status === 'loading'
  const isDone      = answer.status === 'done'
  const isEmpty     = answer.status === 'empty'
  const isError     = answer.status === 'error'

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(answer.text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [answer.text])

  return (
    <div className="animate-fade-up py-8 border-b border-border/40 last:border-0">

      {/* ── Question ── */}
      <div className="flex justify-end mb-6">
        <div
          className="max-w-[78%] px-4 py-3 rounded-xl text-sm font-medium text-text-primary leading-relaxed"
          style={{ background: 'rgb(var(--color-bg-elevated))', border: '1px solid rgb(var(--color-border))' }}
        >
          {question}
        </div>
      </div>

      {/* ── Answer ── */}
      <div className="flex gap-3.5">
        {/* Icon column */}
        <div className="flex-shrink-0 pt-0.5">
          <div className="w-6 h-6 rounded-md border border-accent/25 bg-accent/8 flex items-center justify-center">
            {isLoading || isStreaming
              ? <Loader2 size={11} className="text-accent animate-spin" />
              : <Sparkles size={11} className="text-accent" />
            }
          </div>
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0">
          {isLoading && <AnswerSkeleton />}

          {(isStreaming || isDone) && answer.text && (
            <AnswerText text={answer.text} streaming={isStreaming} />
          )}

          {isEmpty && (
            <p className="text-sm text-text-muted italic leading-relaxed">
              No relevant information found in your connected sources.
            </p>
          )}

          {isError && (
            <div className="flex items-start gap-2 py-1">
              <AlertCircle size={13} className="text-error flex-shrink-0 mt-0.5" />
              <p className="text-sm text-error leading-relaxed">{answer.error}</p>
            </div>
          )}

          {(isStreaming || isDone) && answer.sources.length > 0 && (
            <Sources sources={answer.sources} />
          )}

          {isDone && answer.text && (
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 h-6 px-2.5 rounded text-2xs text-text-muted hover:text-text-primary hover:bg-bg-elevated border border-transparent hover:border-border transition-all"
              >
                {copied
                  ? <><Check size={10} className="text-success" /> Copied</>
                  : <><Copy size={10} /> Copy</>
                }
              </button>
              {answer.elapsedMs && (
                <span className="text-2xs text-text-muted font-mono ml-auto opacity-60">
                  {(answer.elapsedMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composer — fixed bottom, premium feel
// ---------------------------------------------------------------------------

interface ComposerProps {
  onSubmit: (q: string) => void
  disabled: boolean
  inputRef: React.RefObject<HTMLTextAreaElement>
}

function Composer({ onSubmit, disabled, inputRef }: ComposerProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const q = value.trim()
    if (!q || disabled) return
    onSubmit(q)
    setValue('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }

  const canSend = !!value.trim() && !disabled

  return (
    <div className="flex-shrink-0 bg-bg-primary px-4 pb-4 pt-3"
      style={{ boxShadow: '0 -1px 0 rgb(var(--color-border))' }}
    >
      <div className="max-w-3xl mx-auto">
        <div
          className="flex items-end gap-3 bg-bg-surface rounded-xl px-4 py-3 transition-all duration-150"
          style={{
            border: focused
              ? '1px solid rgb(var(--color-accent) / 0.4)'
              : '1px solid rgb(var(--color-border-strong))',
            boxShadow: focused
              ? '0 0 0 3px rgb(var(--color-accent) / 0.08)'
              : '0 1px 3px rgb(0 0 0 / 0.06)',
          }}
        >
          <textarea
            ref={inputRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ask anything about your knowledge base…"
            rows={1}
            disabled={disabled}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none leading-relaxed py-0.5 min-h-[22px] max-h-40 disabled:opacity-40"
          />
          <button
            onClick={submit}
            disabled={!canSend}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 mb-px"
            style={{
              background: canSend ? 'rgb(var(--color-accent))' : 'rgb(var(--color-bg-elevated))',
              color: canSend ? 'white' : 'rgb(var(--color-text-muted))',
              border: canSend ? 'none' : '1px solid rgb(var(--color-border))',
              transform: canSend ? 'scale(1)' : 'scale(0.95)',
            }}
          >
            {disabled
              ? <Loader2 size={13} className="animate-spin" />
              : <ArrowUp size={14} />
            }
          </button>
        </div>

        <p className="text-center text-2xs text-text-muted/60 mt-2 font-mono tracking-wide">
          ↵ send · ⇧↵ newline · ⌘K focus
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main SearchPage
// ---------------------------------------------------------------------------

export function SearchPage() {
  const currentOrg = useAuthStore(s => s.currentOrg)
  const orgId = currentOrg?.id ?? null

  const { state: streamState, ask, reset } = useAIAnswer(orgId)

  const [turns, setTurns] = useState<Turn[]>([])
  const [activeTurnId, setActiveTurnId] = useState<number | null>(null)
  const turnCounter = useRef(0)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)

  // Cmd+K focuses input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Sync streaming state into the active turn
  useEffect(() => {
    if (activeTurnId === null) return
    setTurns(prev =>
      prev.map(t => t.id === activeTurnId ? { ...t, answer: streamState } : t)
    )
  }, [streamState, activeTurnId])

  // Auto-scroll to bottom as answer streams in
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  function handleSubmit(question: string) {
    reset()
    const id = ++turnCounter.current
    const newTurn: Turn = {
      id,
      question,
      answer: { status: 'loading', text: '', sources: [], error: null, elapsedMs: null },
    }
    setTurns(prev => [...prev, newTurn])
    setActiveTurnId(id)
    ask(question)
  }

  function handleSuggestion(q: string) {
    inputRef.current?.focus()
    handleSubmit(q)
  }

  const isStreaming = streamState.status === 'loading' || streamState.status === 'streaming'
  const hasConversation = turns.length > 0

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg-primary">
      <TopBar crumbs={[{ label: 'Search' }]} />

      {/* Thread / empty state */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {!hasConversation ? (

          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center h-full px-6 animate-fade-up">

            {/* Logo mark only */}
            <div className="mb-7 opacity-90">
              <IncharjLogo size={32} wordmark={false} />
            </div>

            <h1 className="text-[1.6rem] font-semibold text-text-primary tracking-tight mb-2 text-center leading-tight">
              Ask anything
            </h1>
            <p className="text-sm text-text-muted text-center mb-10 max-w-[340px] leading-relaxed">
              Search across connected documents and conversations using natural language.
            </p>

            {/* 2×2 suggestion grid */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-[480px]">
              {SUGGESTIONS.map(({ icon: Icon, text }, i) => (
                <button
                  key={text}
                  onClick={() => handleSuggestion(text)}
                  className="animate-fade-up flex items-start gap-3 px-4 py-3.5 bg-bg-surface border border-border rounded-xl text-left hover:border-border-strong hover:shadow-sm hover:-translate-y-px transition-all duration-150 group"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <Icon size={13} className="flex-shrink-0 text-text-muted group-hover:text-accent transition-colors mt-0.5" />
                  <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors leading-relaxed">
                    {text}
                  </span>
                </button>
              ))}
            </div>
          </div>

        ) : (

          /* ── Conversation thread ── */
          <div className="max-w-3xl mx-auto w-full px-6 pb-6">
            {turns.map(turn => (
              <TurnBlock key={turn.id} turn={turn} />
            ))}
            <div ref={threadEndRef} />
          </div>

        )}
      </div>

      {/* Fixed composer */}
      <Composer onSubmit={handleSubmit} disabled={isStreaming} inputRef={inputRef} />
    </div>
  )
}
