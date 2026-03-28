import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface ActiveSSESession {
  sessionId: string
  type: 'generate-chart' | 'ask' | 'chart-chat'
  projectId: string
  /** Dashboard ID (for generate-chart and chart-chat) */
  dashboardId?: string
  /** Chart ID (for chart-chat and generate-chart edit) */
  chartId?: string
  startedAt: number
}

const STORAGE_KEY = 'qb-sse-sessions'
const CLIENT_SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function loadFromStorage(): ActiveSSESession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ActiveSSESession[]
    const now = Date.now()
    const filtered = parsed.filter((s) => now - s.startedAt < CLIENT_SESSION_TTL_MS)
    if (filtered.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    }
    return filtered
  } catch {
    return []
  }
}

function saveToStorage(sessions: ActiveSSESession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // localStorage full or unavailable
  }
}

export const useSSESessionStore = defineStore('sse-sessions', () => {
  const sessions = ref<ActiveSSESession[]>(loadFromStorage())

  // Persist to localStorage on every change
  watch(sessions, (val) => saveToStorage(val), { deep: true })

  function addSession(session: ActiveSSESession): void {
    // Remove any existing session of the same type for the same context
    sessions.value = sessions.value.filter((s) => {
      if (s.type !== session.type || s.projectId !== session.projectId) return true
      if (session.type === 'chart-chat' && s.chartId !== session.chartId) return true
      if (session.type === 'generate-chart' && s.dashboardId !== session.dashboardId) return true
      return false
    })
    sessions.value.push(session)
  }

  function removeSession(sessionId: string): void {
    sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId)
  }

  function getSession(
    type: ActiveSSESession['type'],
    projectId: string,
    opts?: { dashboardId?: string; chartId?: string },
  ): ActiveSSESession | undefined {
    return sessions.value.find((s) => {
      if (s.type !== type || s.projectId !== projectId) return false
      if (type === 'generate-chart' && opts?.dashboardId && s.dashboardId !== opts.dashboardId) return false
      if (type === 'chart-chat' && opts?.chartId && s.chartId !== opts.chartId) return false
      return true
    })
  }

  function clearAll(): void {
    sessions.value = []
  }

  return {
    sessions,
    addSession,
    removeSession,
    getSession,
    clearAll,
  }
})
