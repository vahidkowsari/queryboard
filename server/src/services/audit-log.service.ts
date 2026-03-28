import { eq, desc, and, gte, lte, count as sqlCount, type SQL } from 'drizzle-orm'
import { auditLogs } from '../db/schema.js'
import type { Db } from '../db/index.js'

export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'login'
  | 'logout'
  | 'shared'
  | 'unshared'
  | 'exported'
  | 'imported'
  | 'refreshed'
  | 'moved'
  | 'reordered'
  | 'detected_schema'
  | 'enriched_schema'
  | 'generated'
  | 'permission_granted'
  | 'permission_revoked'

export type AuditEntityType =
  | 'project'
  | 'dashboard'
  | 'chart'
  | 'conversation'
  | 'group'
  | 'permission'
  | 'schema'
  | 'auth'

export interface AuditLogEntry {
  projectId: string
  userId?: string
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string
  entityName?: string
  details?: Record<string, unknown>
}

export interface AuditLogFilter {
  action?: string
  entityType?: string
  userId?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export function createAuditLogService(db: Db) {
  async function log(entry: AuditLogEntry) {
    try {
      await db.insert(auditLogs).values({
        projectId: entry.projectId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityName: entry.entityName,
        details: entry.details,
      })
    } catch (err) {
      // Never let audit logging break the main operation
      console.error('Failed to write audit log:', err)
    }
  }

  async function list(projectId: string, filter: AuditLogFilter = {}) {
    const conditions: SQL[] = [eq(auditLogs.projectId, projectId)]

    if (filter.action) conditions.push(eq(auditLogs.action, filter.action))
    if (filter.entityType) conditions.push(eq(auditLogs.entityType, filter.entityType))
    if (filter.userId) conditions.push(eq(auditLogs.userId, filter.userId))
    if (filter.from) conditions.push(gte(auditLogs.createdAt, new Date(filter.from)))
    if (filter.to) conditions.push(lte(auditLogs.createdAt, new Date(filter.to)))

    const limit = Math.min(filter.limit ?? 100, 500)
    const offset = filter.offset ?? 0

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)

    return rows
  }

  async function count(projectId: string, filter: AuditLogFilter = {}) {
    const conditions: SQL[] = [eq(auditLogs.projectId, projectId)]

    if (filter.action) conditions.push(eq(auditLogs.action, filter.action))
    if (filter.entityType) conditions.push(eq(auditLogs.entityType, filter.entityType))
    if (filter.userId) conditions.push(eq(auditLogs.userId, filter.userId))
    if (filter.from) conditions.push(gte(auditLogs.createdAt, new Date(filter.from)))
    if (filter.to) conditions.push(lte(auditLogs.createdAt, new Date(filter.to)))

    const [result] = await db
      .select({ count: sqlCount() })
      .from(auditLogs)
      .where(and(...conditions))

    return result.count
  }

  return { log, list, count }
}

export type AuditLogService = ReturnType<typeof createAuditLogService>
