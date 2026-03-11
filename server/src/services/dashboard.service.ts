import crypto from 'crypto'
import { eq, desc, asc, sql } from 'drizzle-orm'
import { dashboards, charts } from '../db/schema.js'
import type { Db } from '../db/index.js'

export function createDashboardService(db: Db) {
  return {
    /**
     * Fetches all dashboards for a project with chart counts
     */
    async list(projectId: string) {
      return db
        .select({
          id: dashboards.id,
          projectId: dashboards.projectId,
          name: dashboards.name,
          description: dashboards.description,
          shareToken: dashboards.shareToken,
          thumbnail: dashboards.thumbnail,
          refreshCron: dashboards.refreshCron,
          lastRefreshedAt: dashboards.lastRefreshedAt,
          createdAt: dashboards.createdAt,
          updatedAt: dashboards.updatedAt,
          chartCount: sql<number>`(SELECT count(*)::int FROM charts c WHERE c.dashboard_id = "dashboards"."id")`,
        })
        .from(dashboards)
        .where(eq(dashboards.projectId, projectId))
        .orderBy(desc(dashboards.updatedAt))
    },

    /**
     * Fetches a specific dashboard with all its charts
     */
    async getById(id: string) {
      const rows = await db.select().from(dashboards).where(eq(dashboards.id, id))
      if (rows.length === 0) return null

      const chartRows = await db
        .select()
        .from(charts)
        .where(eq(charts.dashboardId, id))
        .orderBy(asc(charts.position), asc(charts.createdAt))

      return { ...rows[0], charts: chartRows }
    },

    /**
     * Creates a new dashboard in a project
     */
    async create(projectId: string, name: string, description?: string) {
      const rows = await db
        .insert(dashboards)
        .values({
          projectId,
          name,
          description: description || null,
        })
        .returning()
      return rows[0]
    },

    /**
     * Updates dashboard name and description
     */
    async update(id: string, name: string, description?: string) {
      const rows = await db
        .update(dashboards)
        .set({
          name,
          description: description || null,
          updatedAt: new Date(),
        })
        .where(eq(dashboards.id, id))
        .returning()
      return rows[0] || null
    },

    /**
     * Deletes a dashboard and all its charts
     */
    async remove(id: string) {
      const rows = await db.delete(dashboards).where(eq(dashboards.id, id)).returning({ id: dashboards.id })
      return rows.length > 0
    },

    /**
     * Generates a random share token for public dashboard access
     */
    async createShareToken(id: string) {
      const token = crypto.randomBytes(32).toString('hex')
      const rows = await db
        .update(dashboards)
        .set({
          shareToken: token,
          updatedAt: new Date(),
        })
        .where(eq(dashboards.id, id))
        .returning()
      return rows[0] || null
    },

    /**
     * Removes the share token to disable public access
     */
    async revokeShareToken(id: string) {
      const rows = await db
        .update(dashboards)
        .set({
          shareToken: null,
          updatedAt: new Date(),
        })
        .where(eq(dashboards.id, id))
        .returning()
      return rows[0] || null
    },

    /**
     * Sets a cron expression for automatic dashboard refresh
     */
    async setRefreshCron(id: string, cronExpr: string) {
      const rows = await db
        .update(dashboards)
        .set({ refreshCron: cronExpr, updatedAt: new Date() })
        .where(eq(dashboards.id, id))
        .returning()
      return rows[0] || null
    },

    /**
     * Removes the automatic refresh schedule
     */
    async clearRefreshCron(id: string) {
      const rows = await db
        .update(dashboards)
        .set({ refreshCron: null, updatedAt: new Date() })
        .where(eq(dashboards.id, id))
        .returning()
      return rows[0] || null
    },

    /**
     * Fetches a publicly shared dashboard using its share token
     */
    async getByShareToken(token: string) {
      const rows = await db.select().from(dashboards).where(eq(dashboards.shareToken, token))
      if (rows.length === 0) return null

      const chartRows = await db
        .select()
        .from(charts)
        .where(eq(charts.dashboardId, rows[0].id))
        .orderBy(asc(charts.position), asc(charts.createdAt))

      return { ...rows[0], charts: chartRows }
    },

    /**
     * Updates the dashboard thumbnail image
     */
    async updateThumbnail(id: string, thumbnail: Buffer) {
      const rows = await db
        .update(dashboards)
        .set({
          thumbnail,
          updatedAt: new Date(),
        })
        .where(eq(dashboards.id, id))
        .returning()
      return rows[0] || null
    },
  }
}
