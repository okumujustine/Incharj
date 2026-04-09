import { useState, useEffect, useRef } from 'react'

export interface AnswerSource {
  ref: number
  title: string
  url: string | null
  location: string        // connector name or channel
  connector: string       // 'slack' | 'google_drive'
  kind: string
  snippet: string
}

export type AnswerStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error' | 'empty'

export interface AIAnswerState {
  status: AnswerStatus
  text: string
  sources: AnswerSource[]
  error: string | null
  elapsedMs: number | null
}

const DEBOUNCE_MS = 600        // longer than search debounce so FTS fires first
const TIMEOUT_MS  = 45_000

export function useAIAnswer(query: string, orgId: string | null): AIAnswerState {
  const [state, setState] = useState<AIAnswerState>({
    status: 'idle',
    text: '',
    sources: [],
    error: null,
    elapsedMs: null,
  })

  const abortRef  = useRef<AbortController | null>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef  = useRef<number>(0)

  useEffect(() => {
    // Clear any pending debounce
    if (timerRef.current) clearTimeout(timerRef.current)

    const trimmed = query.trim()
    if (!trimmed || !orgId) {
      abortRef.current?.abort()
      setState({ status: 'idle', text: '', sources: [], error: null, elapsedMs: null })
      return
    }

    timerRef.current = setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      startRef.current = Date.now()

      // Timeout guard
      const timeoutId = setTimeout(() => {
        controller.abort()
        setState(s =>
          s.status === 'streaming'
            ? { ...s, status: s.text ? 'done' : 'error', error: s.text ? null : 'Request timed out. Please try again.' }
            : s
        )
      }, TIMEOUT_MS)

      setState({ status: 'loading', text: '', sources: [], error: null, elapsedMs: null })

      stream(trimmed, orgId, controller, timeoutId, setState, startRef)
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query, orgId])

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return state
}

async function stream(
  query: string,
  orgId: string,
  controller: AbortController,
  timeoutId: ReturnType<typeof setTimeout>,
  setState: React.Dispatch<React.SetStateAction<AIAnswerState>>,
  startRef: React.MutableRefObject<number>
) {
  try {
    const apiBase = (import.meta as unknown as { env: Record<string, string> }).env.VITE_API_URL
    if (!apiBase) throw new Error('VITE_API_URL is required')
    const response = await fetch(`${apiBase}/api/v1/search/ai-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      credentials: 'include',
      body: JSON.stringify({ query, org_id: orgId }),
      signal: controller.signal,
    })

    if (!response.ok) {
      clearTimeout(timeoutId)
      setState(s => ({ ...s, status: 'error', error: `Search failed (${response.status})` }))
      return
    }

    setState(s => ({ ...s, status: 'streaming' }))

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    const parsedSources: AnswerSource[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''   // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (raw === '[DONE]') {
          clearTimeout(timeoutId)
          const elapsed = Date.now() - startRef.current
          setState(s => ({
            ...s,
            status: s.text.trim() ? 'done' : 'empty',
            sources: parsedSources,
            elapsedMs: elapsed,
          }))
          return
        }

        try {
          const parsed: { delta?: string; sources?: AnswerSource[] } = JSON.parse(raw)
          if (parsed.sources) {
            parsedSources.push(...parsed.sources)
          }
          if (parsed.delta) {
            fullText += parsed.delta
            setState(s => ({ ...s, text: fullText }))
          }
        } catch {
          // malformed chunk — skip
        }
      }
    }

    // Stream ended without [DONE]
    clearTimeout(timeoutId)
    setState(s => ({
      ...s,
      status: fullText.trim() ? 'done' : 'empty',
      sources: parsedSources,
      elapsedMs: Date.now() - startRef.current,
    }))
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') return
    const msg = err instanceof Error ? err.message : 'Unknown error'
    setState(s => ({
      ...s,
      status: s.text ? 'done' : 'error',
      error: s.text ? null : msg,
      elapsedMs: Date.now() - startRef.current,
    }))
  }
}
