import { useEffect, useRef, useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
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
  Plus,
  X,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useAIAnswer, type AnswerSource, type AIAnswerState } from '../hooks/useAIAnswer'
import { TopBar } from '../components/layout/TopBar'
import { IncharjLogo } from '../components/ui/IncharjLogo'
import { ConnectorIcon } from '../components/ui/ConnectorIcon'
import apiClient from '../services/api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawMessage {
  role: 'user' | 'assistant'
  content: string
  retrieval_metadata: { sources?: AnswerSource[] } | null
  created_at: string
}

interface Turn {
  id: number
  question: string
  answer: AIAnswerState
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripMd(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .trim()
}

function buildTurnsFromMessages(messages: RawMessage[], convId: string): Turn[] {
  const turns: Turn[] = []
  let counter = 0
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role !== 'user') continue
    const next = messages[i + 1]
    const assistant = next?.role === 'assistant' ? next : null
    counter++
    turns.push({
      id: counter,
      question: msg.content,
      answer: assistant
        ? {
            status: 'done',
            text: assistant.content,
            sources: assistant.retrieval_metadata?.sources ?? [],
            error: null,
            elapsedMs: null,
            conversationId: convId,
          }
        : {
            status: 'empty',
            text: '',
            sources: [],
            error: null,
            elapsedMs: null,
            conversationId: convId,
          },
    })
    if (assistant) i++
  }
  return turns
}

const SUGGESTIONS = [
  { icon: FileText,      text: 'What is our refund policy?' },
  { icon: MessageSquare, text: "Summarise last week's Slack discussion" },
  { icon: Users,         text: 'Who owns the onboarding process?' },
  { icon: BookOpen,      text: 'What are our engineering principles?' },
]

// ─── DocPreviewModal ──────────────────────────────────────────────────────────

function DocPreviewModal({ source, onClose }: { source: AnswerSource; onClose: () => void }) {
  const title = stripMd(source.title).split('\n')[0].trim()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.45)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl overflow-hidden animate-fade-up"
        style={{
          background: 'rgb(var(--color-bg-primary))',
          border: '1px solid rgb(var(--color-border-strong))',
          boxShadow: '0 24px 64px rgb(0 0 0 / 0.22)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgb(var(--color-border) / 0.6)' }}
        >
          <div
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
            style={{
              background: 'rgb(var(--color-accent) / 0.08)',
              border: '1px solid rgb(var(--color-accent) / 0.18)',
            }}
          >
            <ConnectorIcon kind={source.connector} size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary leading-snug line-clamp-2">{title}</p>
            {source.location && (
              <p className="text-2xs text-text-muted mt-0.5 truncate font-mono">{source.location}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-all"
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          {source.snippet ? (
            <p className="text-sm text-text-secondary leading-[1.8] whitespace-pre-wrap">
              {stripMd(source.snippet)}
            </p>
          ) : (
            <p className="text-sm text-text-muted italic">No preview available.</p>
          )}
        </div>

        {/* Footer */}
        {source.url && (
          <div
            className="flex items-center justify-end px-5 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid rgb(var(--color-border) / 0.6)' }}
          >
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium text-white transition-all"
              style={{
                background: 'rgb(var(--color-accent))',
                boxShadow: '0 1px 3px rgb(var(--color-accent) / 0.35)',
              }}
            >
              Open <ExternalLink size={10} />
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// ─── SourcePill ───────────────────────────────────────────────────────────────

function SourcePill({ source, onPreview }: { source: AnswerSource; onPreview: (s: AnswerSource) => void }) {
  const label = stripMd(source.title).split('\n')[0].trim().slice(0, 44)
  return (
    <button
      onClick={() => onPreview(source)}
      className="group inline-flex items-center h-[22px] px-2 rounded-lg border border-border/70 bg-bg-surface hover:border-accent/35 hover:bg-accent/5 transition-all duration-150 text-xs cursor-pointer"
    >
      <span className="flex items-center gap-1">
        <span className="flex-shrink-0 w-[16px] h-[16px] rounded-md bg-accent/10 text-accent text-[7.5px] font-bold flex items-center justify-center font-mono tabular-nums">
          {source.ref}
        </span>
        <ConnectorIcon kind={source.connector} size={9} />
        <span className="truncate max-w-[120px] text-text-secondary group-hover:text-text-primary transition-colors">
          {label}
        </span>
        <ExternalLink size={7} className="text-text-muted flex-shrink-0 opacity-0 group-hover:opacity-50 transition-opacity ml-0.5" />
      </span>
    </button>
  )
}

// ─── Sources ──────────────────────────────────────────────────────────────────

function Sources({ sources }: { sources: AnswerSource[] }) {
  const [expanded, setExpanded] = useState(false)
  const [preview, setPreview] = useState<AnswerSource | null>(null)
  if (!sources.length) return null
  const visible = expanded ? sources : sources.slice(0, 4)

  return (
    <div className="mt-5 pt-4 border-t border-border/30">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 text-2xs font-semibold text-text-muted hover:text-text-secondary mb-3 transition-colors tracking-widest uppercase"
      >
        Sources <span className="font-mono text-accent/80">{sources.length}</span>
        {sources.length > 4 && (expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />)}
      </button>
      <div className="flex flex-wrap gap-1">
        {visible.map(s => <SourcePill key={s.ref} source={s} onPreview={setPreview} />)}
        {!expanded && sources.length > 4 && (
          <button
            onClick={() => setExpanded(true)}
            className="inline-flex items-center h-[22px] px-2 rounded-lg border border-dashed border-border/60 text-2xs text-text-muted hover:text-text-secondary hover:border-accent/35 transition-all duration-150"
          >
            +{sources.length - 4} more
          </button>
        )}
      </div>
      {preview && <DocPreviewModal source={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

// ─── Misc small components ────────────────────────────────────────────────────

function StreamingCursor() {
  return (
    <span
      className="inline-block w-[2px] h-[0.9em] bg-accent/70 ml-0.5 align-text-bottom animate-pulse rounded-full"
      aria-hidden="true"
    />
  )
}

function AnswerText({ text, streaming }: { text: string; streaming: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[0-9]+\])/g)
  return (
    <p className="text-sm text-text-primary leading-[1.8] tracking-[0.01em]">
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

function AnswerSkeleton() {
  return (
    <div className="space-y-3 py-1">
      {[92, 75, 55].map((w, i) => (
        <div
          key={i}
          className="h-[11px] bg-bg-elevated rounded-full animate-pulse"
          style={{ width: `${w}%`, animationDelay: `${i * 100}ms`, opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  )
}

// ─── TurnBlock ────────────────────────────────────────────────────────────────

function TurnBlock({ turn }: { turn: Turn }) {
  const { question, answer } = turn
  const [copied, setCopied] = useState(false)
  const isStreaming = answer.status === 'streaming'
  const isLoading   = answer.status === 'loading'
  const isDone      = answer.status === 'done'
  const isEmpty     = answer.status === 'empty'
  const isError     = answer.status === 'error'

  const copyTextToClipboard = useCallback(async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch { /* fall through */ }

    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.setAttribute('readonly', '')
    textArea.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try { return document.execCommand('copy') }
    catch { return false }
    finally { document.body.removeChild(textArea) }
  }, [])

  const handleCopy = useCallback(() => {
    void copyTextToClipboard(answer.text).then(ok => {
      if (!ok) return
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [answer.text, copyTextToClipboard])

  return (
    <div className="animate-fade-up py-8 border-b border-border/25 last:border-0">
      {/* Question bubble */}
      <div className="flex justify-end mb-7">
        <div
          className="max-w-[76%] px-4 py-3 rounded-2xl text-sm text-text-primary leading-relaxed"
          style={{
            background: 'linear-gradient(135deg, rgb(var(--color-bg-elevated)) 0%, rgb(var(--color-bg-overlay)) 100%)',
            border: '1px solid rgb(var(--color-border-strong))',
            boxShadow: '0 1px 3px rgb(0 0 0 / 0.08), 0 4px 12px rgb(0 0 0 / 0.05), inset 0 1px 0 rgb(255 255 255 / 0.6)',
            fontWeight: 460,
            letterSpacing: '0.01em',
          }}
        >
          {question}
        </div>
      </div>

      {/* Answer area */}
      <div className="flex gap-4">
        <div className="flex-shrink-0 pt-0.5">
          <div
            className="w-[26px] h-[26px] rounded-lg flex items-center justify-center"
            style={{
              background: 'rgb(var(--color-accent) / 0.08)',
              border: '1px solid rgb(var(--color-accent) / 0.18)',
            }}
          >
            {isLoading || isStreaming
              ? <Loader2 size={12} className="text-accent animate-spin" />
              : <Sparkles size={12} className="text-accent" />
            }
          </div>
        </div>

        <div
          className="flex-1 min-w-0 pl-4"
          style={{ borderLeft: '2px solid rgb(var(--color-accent) / 0.38)' }}
        >
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
            <div className="flex items-center gap-2 mt-5">
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
                <span className="text-2xs text-text-muted font-mono ml-auto opacity-50 tabular-nums">
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

// ─── Composer ─────────────────────────────────────────────────────────────────

interface ComposerProps {
  onSubmit: (q: string) => void
  disabled: boolean
  inputRef: React.RefObject<HTMLTextAreaElement>
}

function Composer({ onSubmit, disabled, inputRef }: ComposerProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
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
    <div
      className="flex-shrink-0 px-4 pb-5 pt-3"
      style={{
        background: 'rgb(var(--color-bg-primary))',
        borderTop: '1px solid rgb(var(--color-border) / 0.6)',
      }}
    >
      <div className="max-w-3xl mx-auto">
        <div
          className="flex items-end gap-3 rounded-xl px-4 py-3 transition-all duration-200"
          style={{
            background: 'rgb(var(--color-bg-surface))',
            border: focused
              ? '1px solid rgb(var(--color-accent) / 0.45)'
              : '1px solid rgb(var(--color-border-strong))',
            boxShadow: focused
              ? '0 0 0 3px rgb(var(--color-accent) / 0.07), 0 2px 8px rgb(0 0 0 / 0.06)'
              : '0 1px 4px rgb(0 0 0 / 0.05)',
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
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted/60 resize-none focus:outline-none leading-relaxed py-0.5 min-h-[22px] max-h-40 disabled:opacity-40"
          />
          <button
            onClick={submit}
            disabled={!canSend}
            className="flex-shrink-0 w-[30px] h-[30px] rounded-lg flex items-center justify-center transition-all duration-200 mb-px active:scale-90"
            style={{
              background: canSend
                ? 'linear-gradient(145deg, rgb(var(--color-accent)), rgb(var(--color-accent-hover)))'
                : 'rgb(var(--color-bg-elevated))',
              color: canSend ? 'white' : 'rgb(var(--color-text-muted))',
              border: canSend ? '1px solid rgb(var(--color-accent-hover) / 0.4)' : '1px solid rgb(var(--color-border))',
              boxShadow: canSend
                ? '0 3px 8px rgb(var(--color-accent) / 0.35), 0 1px 2px rgb(var(--color-accent) / 0.25), inset 0 1px 0 rgb(255 255 255 / 0.15)'
                : 'none',
              transform: canSend ? 'scale(1)' : 'scale(0.85)',
              opacity: canSend ? 1 : 0.45,
            }}
          >
            {disabled ? <Loader2 size={12} className="animate-spin" /> : <ArrowUp size={13} />}
          </button>
        </div>
        <p className="text-center text-2xs text-text-muted/40 mt-2.5 tracking-widest font-mono uppercase select-none">
          ↵ send · ⇧↵ newline · ⌘K focus
        </p>
      </div>
    </div>
  )
}

// ─── SearchPage ───────────────────────────────────────────────────────────────

export function SearchPage() {
  const currentOrg = useAuthStore(s => s.currentOrg)
  const orgId = currentOrg?.id ?? null

  const { state: streamState, ask, reset } = useAIAnswer(orgId)
  const [searchParams, setSearchParams] = useSearchParams()

  const [turns, setTurns] = useState<Turn[]>([])
  const [activeTurnId, setActiveTurnId] = useState<number | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [convLoading, setConvLoading] = useState(false)
  const turnCounter = useRef(0)
  // Cache: convId → Turn[] so switching back to a previous thread is instant
  const turnsCache = useRef<Map<string, Turn[]>>(new Map())

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)

  // ── Load conversation whenever ?c= changes (mount + sidebar navigation) ─────
  useEffect(() => {
    const cId = searchParams.get('c')

    if (!cId) {
      if (conversationId) {
        reset()
        setTurns([])
        setActiveTurnId(null)
        setConversationId(null)
        turnCounter.current = 0
      }
      return
    }

    if (cId === conversationId) return
    if (!orgId) return

    // Serve from cache instantly — no loading, no blink
    const cached = turnsCache.current.get(cId)
    if (cached) {
      setTurns(cached)
      setConversationId(cId)
      turnCounter.current = cached.length
      return
    }

    // First visit — fetch from server
    setConvLoading(true)
    apiClient
      .get<RawMessage[]>(`/conversations/${cId}/messages?org_id=${orgId}`)
      .then(r => {
        const restored = buildTurnsFromMessages(r.data, cId)
        turnsCache.current.set(cId, restored)
        setTurns(restored)
        setConversationId(cId)
        turnCounter.current = restored.length
      })
      .catch(() => setSearchParams({}, { replace: true }))
      .finally(() => setConvLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('c')])

  // ── Cmd+K focuses input ─────────────────────────────────────────────────────
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

  // ── Sync streaming state into active turn + keep cache up to date ───────────
  useEffect(() => {
    if (activeTurnId === null) return
    setTurns(prev => {
      const updated = prev.map(t => t.id === activeTurnId ? { ...t, answer: streamState } : t)
      if (conversationId) turnsCache.current.set(conversationId, updated)
      return updated
    })
  }, [streamState, activeTurnId, conversationId])

  // ── Capture conversation_id from stream + push to URL ───────────────────────
  useEffect(() => {
    if (!streamState.conversationId || streamState.conversationId === conversationId) return
    setConversationId(streamState.conversationId)
    setSearchParams({ c: streamState.conversationId }, { replace: true })
  }, [streamState.conversationId, conversationId, setSearchParams])

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  // ── Actions ─────────────────────────────────────────────────────────────────
  function handleSubmit(question: string) {
    reset()
    const id = ++turnCounter.current
    setTurns(prev => [...prev, {
      id,
      question,
      answer: { status: 'loading', text: '', sources: [], error: null, elapsedMs: null, conversationId: null },
    }])
    setActiveTurnId(id)
    ask(question, conversationId)
  }

  function handleNewConversation() {
    reset()
    setTurns([])
    setActiveTurnId(null)
    setConversationId(null)
    turnCounter.current = 0
    setSearchParams({}, { replace: true })
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleSuggestion(q: string) {
    inputRef.current?.focus()
    handleSubmit(q)
  }

  const isStreaming = streamState.status === 'loading' || streamState.status === 'streaming'
  const hasConversation = turns.length > 0

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg-primary">
      <TopBar
        crumbs={[{ label: 'Search' }]}
        actions={
          hasConversation ? (
            <button
              onClick={handleNewConversation}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium text-text-muted hover:text-text-primary hover:bg-bg-elevated border border-transparent hover:border-border transition-all"
            >
              <Plus size={11} />
              New conversation
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Thin progress bar — visible only while fetching a conversation */}
          <div className="h-[2px] flex-shrink-0 overflow-hidden" style={{ background: 'transparent' }}>
            {convLoading && (
              <div
                className="h-full w-1/3 rounded-full"
                style={{
                  background: 'rgb(var(--color-accent) / 0.45)',
                  animation: 'slide-progress 0.9s ease-in-out infinite',
                }}
              />
            )}
          </div>
          <div className={`flex-1 overflow-y-auto scrollbar-thin transition-opacity duration-150 ${convLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
            {!hasConversation ? (

              /* ── Empty state ── */
              <div className="flex flex-col items-center justify-center h-full px-6 animate-fade-up">
                <div className="relative mb-8">
                  <div
                    className="absolute inset-0 -m-8 rounded-full blur-2xl opacity-25 pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgb(var(--color-accent)) 0%, transparent 70%)' }}
                  />
                  <IncharjLogo size={34} wordmark={false} />
                </div>
                <h1 className="text-[1.65rem] font-semibold text-text-primary tracking-[-0.02em] mb-2.5 text-center leading-[1.2]">
                  Ask anything
                </h1>
                <p className="text-[12.5px] text-text-muted/70 text-center mb-9 max-w-[260px] leading-[1.7] tracking-[0.005em]">
                  Search across your connected sources using natural language.
                </p>
                <div className="grid grid-cols-2 gap-1.5 w-full max-w-[460px]">
                  {SUGGESTIONS.map(({ icon: Icon, text }, i) => (
                    <button
                      key={text}
                      onClick={() => handleSuggestion(text)}
                      className="animate-fade-up flex items-start gap-2.5 px-3.5 py-3 text-left rounded-xl border border-border bg-bg-surface hover:bg-bg-elevated hover:border-accent/20 hover:-translate-y-px hover:shadow-sm transition-all duration-150 group"
                      style={{ animationDelay: `${i * 55}ms` }}
                    >
                      <div
                        className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5"
                        style={{
                          background: 'rgb(var(--color-bg-elevated))',
                          border: '1px solid rgb(var(--color-border-subtle))',
                        }}
                      >
                        <Icon size={11} className="text-text-muted group-hover:text-accent transition-colors" />
                      </div>
                      <span className="text-[12px] text-text-secondary group-hover:text-text-primary transition-colors leading-relaxed">
                        {text}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-9 text-[10px] text-text-muted/30 tracking-widest font-mono uppercase select-none">
                  ⌘K to focus
                </p>
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
      </div>
    </div>
  )
}
