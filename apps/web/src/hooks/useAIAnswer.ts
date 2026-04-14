import { useState, useRef, useCallback } from 'react'

export interface AnswerSource {
  ref: number
  title: string
  url: string | null
  location: string
  connector: string
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

const TIMEOUT_MS = 45_000

const IDLE: AIAnswerState = {
  status: 'idle',
  text: '',
  sources: [],
  error: null,
  elapsedMs: null,
}

export function useAIAnswer(orgId: string | null) {
  const [state, setState] = useState<AIAnswerState>(IDLE)
  const abortRef = useRef<AbortController | null>(null)

  const ask = useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed || !orgId) return

      // Cancel any in-flight request
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const startMs = Date.now()

      setState({ status: 'loading', text: '', sources: [], error: null, elapsedMs: null })

      const timeoutId = setTimeout(() => {
        controller.abort()
        setState(s =>
          s.status === 'streaming'
            ? { ...s, status: s.text ? 'done' : 'error', error: s.text ? null : 'Request timed out.' }
            : s
        )
      }, TIMEOUT_MS)

      _stream(trimmed, orgId, controller, timeoutId, setState, startMs)
    },
    [orgId]
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState(IDLE)
  }, [])

  return { state, ask, reset }
}

async function _stream(
  query: string,
  orgId: string,
  controller: AbortController,
  timeoutId: ReturnType<typeof setTimeout>,
  setState: React.Dispatch<React.SetStateAction<AIAnswerState>>,
  startMs: number
) {
  try {
    const token = (await import('../stores/authStore')).useAuthStore.getState().accessToken

    const response = await fetch(`/api/v1/search/ai-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ query, org_id: orgId }),
      signal: controller.signal,
    })

    if (!response.ok) {
      clearTimeout(timeoutId)
      setState(s => ({ ...s, status: 'error', error: `Request failed (${response.status})` }))
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
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (raw === '[DONE]') {
          clearTimeout(timeoutId)
          setState(s => ({
            ...s,
            status: s.text.trim() ? 'done' : 'empty',
            sources: parsedSources,
            elapsedMs: Date.now() - startMs,
          }))
          return
        }
        try {
          const parsed: { delta?: string; sources?: AnswerSource[] } = JSON.parse(raw)
          if (parsed.sources) parsedSources.push(...parsed.sources)
          if (parsed.delta) {
            fullText += parsed.delta
            setState(s => ({ ...s, text: fullText }))
          }
        } catch { /* malformed chunk */ }
      }
    }

    clearTimeout(timeoutId)
    setState(s => ({
      ...s,
      status: fullText.trim() ? 'done' : 'empty',
      sources: parsedSources,
      elapsedMs: Date.now() - startMs,
    }))
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') return
    const msg = err instanceof Error ? err.message : 'Unknown error'
    setState(s => ({
      ...s,
      status: s.text ? 'done' : 'error',
      error: s.text ? null : msg,
      elapsedMs: Date.now() - startMs,
    }))
  }
}
