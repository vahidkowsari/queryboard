import type { Response } from 'express'
import { and, asc, desc, eq, lt } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { sseSessions, sseSessionEvents } from '../db/schema.js'
import { initializeSSE, writeSSEEvent, startSSEHeartbeat } from '../routes/sse-utils.js'

export interface SSEEvent {
  event: string
  data: unknown
}

export interface SSESessionInfo {
  id: string
  type: 'generate-chart' | 'ask' | 'chart-chat'
  projectId: string
  userId: string
  dashboardId: string | null
  chartId: string | null
  conversationId: string | null
  status: 'running' | 'completed' | 'error'
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
  expiresAt: Date | null
  /** Currently connected SSE clients (may reconnect) */
  clients: Set<Response>
  /** Heartbeat cleanup functions per client */
  heartbeats: Map<Response, () => void>
}

const SESSION_TTL_MS = 10 * 60 * 1000 // 10 minutes after completion
const CLEANUP_INTERVAL_MS = 60_000

class SSESessionManager {
  private db: Db | null = null
  private liveClients = new Map<string, Set<Response>>()
  private heartbeats = new Map<string, Map<Response, () => void>>()
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor() {
    this.cleanupTimer = setInterval(() => {
      void this.cleanup()
    }, CLEANUP_INTERVAL_MS)
  }

  initialize(db: Db): void {
    this.db = db
  }

  private assertDb(): Db {
    if (!this.db) {
      throw new Error('SSESessionManager not initialized with DB')
    }
    return this.db
  }

  private getLiveClients(sessionId: string): Set<Response> {
    let set = this.liveClients.get(sessionId)
    if (!set) {
      set = new Set<Response>()
      this.liveClients.set(sessionId, set)
    }
    return set
  }

  private getHeartbeatMap(sessionId: string): Map<Response, () => void> {
    let map = this.heartbeats.get(sessionId)
    if (!map) {
      map = new Map<Response, () => void>()
      this.heartbeats.set(sessionId, map)
    }
    return map
  }

  async create(
    type: SSESessionInfo['type'],
    projectId: string,
    userId: string,
    context?: { dashboardId?: string; chartId?: string; conversationId?: string },
  ): Promise<SSESessionInfo> {
    const db = this.assertDb()
    const now = new Date()
    const [row] = await db
      .insert(sseSessions)
      .values({
        type,
        projectId,
        userId,
        dashboardId: context?.dashboardId ?? null,
        chartId: context?.chartId ?? null,
        conversationId: context?.conversationId ?? null,
        status: 'running',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    const session = this.toSessionInfo(row)
    console.log(`SSESession: created session=${session.id} type=${type} user=${userId}`)
    return session
  }

  async findLatestRunning(
    type: SSESessionInfo['type'],
    projectId: string,
    userId: string,
    context?: { dashboardId?: string; chartId?: string; conversationId?: string },
  ): Promise<SSESessionInfo | undefined> {
    const db = this.assertDb()
    const predicates = [
      eq(sseSessions.type, type),
      eq(sseSessions.projectId, projectId),
      eq(sseSessions.userId, userId),
      eq(sseSessions.status, 'running'),
    ]

    if (context?.dashboardId) {
      predicates.push(eq(sseSessions.dashboardId, context.dashboardId))
    }

    if (context?.chartId) {
      predicates.push(eq(sseSessions.chartId, context.chartId))
    }

    if (context?.conversationId) {
      predicates.push(eq(sseSessions.conversationId, context.conversationId))
    }

    const [row] = await db
      .select()
      .from(sseSessions)
      .where(and(...predicates))
      .orderBy(desc(sseSessions.createdAt))
      .limit(1)

    if (!row) return undefined
    return this.toSessionInfo(row)
  }

  async get(sessionId: string): Promise<SSESessionInfo | undefined> {
    const db = this.assertDb()
    const [row] = await db.select().from(sseSessions).where(eq(sseSessions.id, sessionId)).limit(1)
    if (!row) return undefined
    return this.toSessionInfo(row)
  }

  /**
   * Add an event to the session buffer and broadcast to all connected clients.
   */
  addEvent(sessionId: string, event: string, data: unknown): void {
    const db = this.assertDb()

    // Persist event (fire-and-forget) so sessions can be resumed after restarts.
    void db
      .insert(sseSessionEvents)
      .values({
        sessionId,
        event,
        data,
        createdAt: new Date(),
      })
      .catch((err) => {
        console.error(`SSESession: failed to persist event session=${sessionId} event=${event}`, err)
      })

    // Broadcast to all currently connected live clients
    const clients = this.getLiveClients(sessionId)
    for (const client of clients) {
      if (!client.writableEnded) {
        writeSSEEvent(client, event, data)
      }
    }
  }

  /**
   * Mark session as completed and close all connected clients.
   */
  async complete(sessionId: string): Promise<void> {
    const db = this.assertDb()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

    await db
      .update(sseSessions)
      .set({
        status: 'completed',
        updatedAt: now,
        completedAt: now,
        expiresAt,
      })
      .where(eq(sseSessions.id, sessionId))

    console.log(`SSESession: completed session=${sessionId}`)
    this.closeAllClients(sessionId, 'completed')
  }

  /**
   * Mark session as errored and close all connected clients.
   */
  async fail(sessionId: string): Promise<void> {
    const db = this.assertDb()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

    await db
      .update(sseSessions)
      .set({
        status: 'error',
        updatedAt: now,
        completedAt: now,
        expiresAt,
      })
      .where(eq(sseSessions.id, sessionId))

    console.log(`SSESession: failed session=${sessionId}`)
    this.closeAllClients(sessionId, 'error')
  }

  /**
   * Connect a new SSE client to a session. Replays all buffered events,
   * then keeps connection open if session is still running.
   * Returns true if connected, false if session not found.
   */
  async connectClient(sessionId: string, res: Response): Promise<boolean> {
    const db = this.assertDb()
    const [sessionRow] = await db.select().from(sseSessions).where(eq(sseSessions.id, sessionId)).limit(1)
    if (!sessionRow) return false

    initializeSSE(res)

    // Replay all buffered events from DB
    const events = await db
      .select()
      .from(sseSessionEvents)
      .where(eq(sseSessionEvents.sessionId, sessionId))
      .orderBy(asc(sseSessionEvents.createdAt), asc(sseSessionEvents.id))

    for (const evt of events) {
      if (res.writableEnded) break
      writeSSEEvent(res, evt.event, evt.data as unknown)
    }

    if (sessionRow.status !== 'running') {
      // Session already finished — send done marker and close
      writeSSEEvent(res, 'session-end', { status: sessionRow.status })
      if (!res.writableEnded) res.end()
      return true
    }

    // Session still running — keep connection open for new events
    const stopHeartbeat = startSSEHeartbeat(res)
    const clients = this.getLiveClients(sessionId)
    const hbMap = this.getHeartbeatMap(sessionId)
    clients.add(res)
    hbMap.set(res, stopHeartbeat)

    res.once('close', () => {
      console.log(`SSESession: client disconnected from session=${sessionId}`)
      clients.delete(res)
      const hb = hbMap.get(res)
      if (hb) hb()
      hbMap.delete(res)
    })

    return true
  }

  /**
   * Disconnect a specific client without affecting the session.
   */
  disconnectClient(sessionId: string, res: Response): void {
    const clients = this.liveClients.get(sessionId)
    const hbMap = this.heartbeats.get(sessionId)
    if (!clients || !hbMap) return

    clients.delete(res)
    const hb = hbMap.get(res)
    if (hb) hb()
    hbMap.delete(res)
  }

  /**
   * Check if a session is still running.
   */
  async isRunning(sessionId: string): Promise<boolean> {
    const db = this.assertDb()
    const [row] = await db
      .select({ status: sseSessions.status })
      .from(sseSessions)
      .where(eq(sseSessions.id, sessionId))
      .limit(1)
    return row?.status === 'running'
  }

  private closeAllClients(sessionId: string, status: 'completed' | 'error'): void {
    const clients = this.liveClients.get(sessionId)
    const hbMap = this.heartbeats.get(sessionId)
    if (!clients || !hbMap) return

    for (const client of clients) {
      const hb = hbMap.get(client)
      if (hb) hb()
      if (!client.writableEnded) {
        writeSSEEvent(client, 'session-end', { status })
        client.end()
      }
    }
    clients.clear()
    hbMap.clear()
    this.liveClients.delete(sessionId)
    this.heartbeats.delete(sessionId)
  }

  private async cleanup(): Promise<void> {
    const db = this.db
    if (!db) return

    const now = new Date()
    const expired = await db
      .select({ id: sseSessions.id })
      .from(sseSessions)
      .where(lt(sseSessions.expiresAt, now))

    if (!expired.length) return

    for (const row of expired) {
      const sessionId = row.id
      const clients = this.liveClients.get(sessionId)
      if (clients?.size) {
        this.closeAllClients(sessionId, 'error')
      }
    }

    await db.delete(sseSessions).where(lt(sseSessions.expiresAt, now))
    console.log(`SSESession: cleaned up ${expired.length} expired sessions`)
  }

  destroy(): void {
    clearInterval(this.cleanupTimer)
    for (const [sessionId] of this.liveClients) {
      this.closeAllClients(sessionId, 'error')
    }
    this.liveClients.clear()
    this.heartbeats.clear()
  }

  private toSessionInfo(row: typeof sseSessions.$inferSelect): SSESessionInfo {
    return {
      id: row.id,
      type: row.type as SSESessionInfo['type'],
      projectId: row.projectId,
      userId: row.userId,
      dashboardId: row.dashboardId,
      chartId: row.chartId,
      conversationId: row.conversationId,
      status: row.status as SSESessionInfo['status'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
      clients: this.getLiveClients(row.id),
      heartbeats: this.getHeartbeatMap(row.id),
    }
  }
}

// Singleton instance
export const sseSessionManager = new SSESessionManager()

export function initializeSSESessionManager(db: Db): void {
  sseSessionManager.initialize(db)
}
