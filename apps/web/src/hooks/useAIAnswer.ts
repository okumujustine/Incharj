import { useState, useRef, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import apiClient from '../services/api'

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
  conversationId: string | null
}

const TIMEOUT_MS = 45_000

const IDLE: AIAnswerState = {
  status: 'idle',
  text: '',
  sources: [],
  error: null,
  elapsedMs: null,
  conversationId: null,
}

export function useAIAnswer(orgId: string | null) {
  const [state, setState] = useState<AIAnswerState>(IDLE)
  const abortRef = useRef<AbortController | null>(null)

  const ask = useCallback(
    (message: string, conversationId: string | null) => {
      const trimmed = message.trim()
      if (!trimmed || !orgId) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const startMs = Date.now()

      setState(prev => ({
        status: 'loading',
        text: '',
        sources: [],
        error: null,
        elapsedMs: null,
        // Preserve conversationId so it's available during the turn
        conversationId: prev.conversationId,
      }))

      const timeoutId = setTimeout(() => {
        controller.abort()
        setState(s =>
          s.status === 'streaming'
            ? { ...s, status: s.text ? 'done' : 'error', error: s.text ? null : 'Request timed out.' }
            : s
        )
      }, TIMEOUT_MS)

      _stream(trimmed, orgId, conversationId, controller, timeoutId, setState, startMs)
    },
    [orgId]
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState(IDLE)
  }, [])

  return { state, ask, reset }
}

function _fetchStream(
  message: string,
  orgId: string,
  conversationId: string | null,
  token: string | null,
  controller: AbortController
): Promise<Response> {
  return fetch(`/api/v1/search/ai-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({
      message,
      org_id: orgId,
      conversation_id: conversationId ?? undefined,
    }),
    signal: controller.signal,
  })
}

async function _stream(
  message: string,
  orgId: string,
  conversationId: string | null,
  controller: AbortController,
  timeoutId: ReturnType<typeof setTimeout>,
  setState: React.Dispatch<React.SetStateAction<AIAnswerState>>,
  startMs: number
) {
  try {
    let token = useAuthStore.getState().accessToken
    let response = await _fetchStream(message, orgId, conversationId, token, controller)

    if (response.status === 401) {
      try {
        const refreshResponse = await apiClient.post<{ access_token: string }>('/auth/refresh')
        token = refreshResponse.data.access_token
        useAuthStore.getState().updateToken(token)
        response = await _fetchStream(message, orgId, conversationId, token, controller)
      } catch {
        clearTimeout(timeoutId)
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return
      }
    }

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
          const parsed: {
            delta?: string
            sources?: AnswerSource[]
            conversation_id?: string
          } = JSON.parse(raw)

          if (parsed.conversation_id) {
            setState(s => ({ ...s, conversationId: parsed.conversation_id! }))
          }
          if (parsed.sources) {
            parsedSources.push(...parsed.sources)
          }
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
