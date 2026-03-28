import { ref, onUnmounted } from 'vue'
import { API_BASE_URL } from '../services/api'

export interface SSECallbacks {
  onSession?: (data: { sessionId: string }) => void
  onStep?: (data: { step: string }) => void
  onThinking?: (data: { text: string }) => void
  onResult?: (data: Record<string, unknown>) => void
  onError?: (data: { error: string }) => void
  onConversation?: (data: { conversationId: string }) => void
  onSessionEnd?: (data: { status: string }) => void
}

function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: SSECallbacks,
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  let eventType = ''

  function processLines(lines: string[]) {
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim()
      } else if (line.startsWith('data: ') && eventType) {
        let data: Record<string, unknown>
        try {
          data = JSON.parse(line.slice(6))
        } catch {
          eventType = ''
          continue
        }

        if (!data || typeof data !== 'object') {
          eventType = ''
          continue
        }

        switch (eventType) {
          case 'session':
            callbacks.onSession?.(data as { sessionId: string })
            break
          case 'step':
            callbacks.onStep?.(data as { step: string })
            break
          case 'thinking':
            callbacks.onThinking?.(data as { text: string })
            break
          case 'result':
            callbacks.onResult?.(data)
            break
          case 'error':
            callbacks.onError?.(data as { error: string })
            break
          case 'conversation':
            callbacks.onConversation?.(data as { conversationId: string })
            break
          case 'session-end':
            callbacks.onSessionEnd?.(data as { status: string })
            break
        }
        eventType = ''
      }
    }
  }

  return (async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      processLines(lines)
    }
    if (buffer.trim()) {
      processLines(buffer.split('\n'))
    }
  })()
}

export function useResumableSSE() {
  const loading = ref(false)
  const sessionId = ref<string | null>(null)
  let currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null

  /**
   * Start a new SSE session via POST, and register it for resumability.
   */
  async function startSession(
    url: string,
    body: Record<string, unknown>,
    callbacks: SSECallbacks,
  ): Promise<void> {
    loading.value = true

    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')
      currentReader = reader

      // Wrap callbacks to capture the session ID
      const wrappedCallbacks: SSECallbacks = {
        ...callbacks,
        onSession: (data) => {
          sessionId.value = data.sessionId
          callbacks.onSession?.(data)
        },
      }

      await parseSSEStream(reader, wrappedCallbacks)
    } finally {
      currentReader = null
      // Don't remove session here — it might still be running on the server
      // The component should call finishSession() when processing is confirmed done
    }
  }

  /**
   * Reconnect to an existing SSE session via GET.
   * Returns true if reconnection succeeded, false if session not found.
   */
  async function reconnectSession(
    projectId: string,
    existingSessionId: string,
    callbacks: SSECallbacks,
  ): Promise<boolean> {
    loading.value = true
    sessionId.value = existingSessionId

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/agents/sessions/${existingSessionId}`,
        { credentials: 'include' },
      )

      if (!response.ok) {
        sessionId.value = null
        return false
      }

      const reader = response.body?.getReader()
      if (!reader) {
        sessionId.value = null
        return false
      }
      currentReader = reader

      await parseSSEStream(reader, callbacks)
      return true
    } catch {
      return false
    } finally {
      currentReader = null
    }
  }

  async function findLatestSession(
    projectId: string,
    type: 'generate-chart' | 'ask' | 'chart-chat',
    opts?: { dashboardId?: string; chartId?: string; conversationId?: string },
  ): Promise<string | null> {
    const params = new URLSearchParams({ type })
    if (opts?.dashboardId) params.set('dashboardId', opts.dashboardId)
    if (opts?.chartId) params.set('chartId', opts.chartId)
    if (opts?.conversationId) params.set('conversationId', opts.conversationId)

    const response = await fetch(
      `${API_BASE_URL}/api/projects/${projectId}/agents/sessions/latest?${params.toString()}`,
      { credentials: 'include' },
    )

    if (!response.ok) return null
    const data = await response.json().catch(() => ({}))
    return typeof data.sessionId === 'string' ? data.sessionId : null
  }

  /**
   * Mark the current session as finished and remove from store.
   */
  function finishSession(): void {
    sessionId.value = null
    loading.value = false
  }

  /**
   * Detach from the stream without aborting the server session.
   * The session stays in the store for later reconnection.
   */
  function detach(): void {
    if (currentReader) {
      currentReader.cancel().catch(() => {})
      currentReader = null
    }
    loading.value = false
  }

  onUnmounted(() => {
    // On unmount, just detach — don't kill the server session
    detach()
  })

  return {
    loading,
    sessionId,
    startSession,
    reconnectSession,
    findLatestSession,
    finishSession,
    detach,
  }
}
