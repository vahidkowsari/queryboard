import { eq, and, sql, asc } from 'drizzle-orm'
import { charts, dashboards } from '../db/schema.js'
import type { Db } from '../db/index.js'
import type { ChartData } from '../types.js'

export function createChartService(db: Db) {
  /**
   * Updates the dashboard's updatedAt timestamp
   */
  async function touchDashboard(dashboardId: string) {
    await db.update(dashboards).set({ updatedAt: new Date() }).where(eq(dashboards.id, dashboardId))
  }

  return {
    /**
     * Fetches a specific chart by dashboard and chart ID
     */
    async getById(dashboardId: string, chartId: string) {
      const rows = await db
        .select()
        .from(charts)
        .where(and(eq(charts.id, chartId), eq(charts.dashboardId, dashboardId)))
      return rows[0] || null
    },

    /**
     * Creates a new chart in a dashboard with auto-incremented position
     */
    async create(dashboardId: string, data: ChartData, createdBy?: string) {
      const [{ nextPos }] = await db
        .select({
          nextPos: sql<number>`COALESCE(MAX(${charts.position}), -1) + 1`,
        })
        .from(charts)
        .where(eq(charts.dashboardId, dashboardId))

      const rows = await db
        .insert(charts)
        .values({
          dashboardId,
          name: data.name,
          userQuery: data.userQuery || null,
          description: data.description || null,
          summary: data.summary || null,
          query: data.query,
          chartType: data.chartType || 'auto',
          chartSpec: data.chartSpec || null,
          data: data.data || null,
          colorConfig: data.colorConfig || null,
          filters: data.filters || null,
          position: nextPos,
          createdBy: createdBy || null,
        })
        .returning()

      await touchDashboard(dashboardId)
      return rows[0]
    },

    /**
     * Updates a chart's configuration and metadata
     */
    async update(dashboardId: string, chartId: string, data: ChartData) {
      const rows = await db
        .update(charts)
        .set({
          name: data.name,
          userQuery: data.userQuery || null,
          description: data.description || null,
          summary: data.summary || null,
          query: data.query,
          chartType: data.chartType || 'auto',
          chartSpec: data.chartSpec || null,
          data: data.data || null,
          colorConfig: data.colorConfig || null,
          filters: data.filters || null,
          updatedAt: new Date(),
        })
        .where(and(eq(charts.id, chartId), eq(charts.dashboardId, dashboardId)))
        .returning()

      if (rows[0]) await touchDashboard(dashboardId)
      return rows[0] || null
    },

    /**
     * Updates only the data field of a chart (used for refresh operations)
     */
    async updateData(dashboardId: string, chartId: string, data: unknown) {
      const rows = await db
        .update(charts)
        .set({
          data: data || null,
          updatedAt: new Date(),
        })
        .where(and(eq(charts.id, chartId), eq(charts.dashboardId, dashboardId)))
        .returning()

      if (rows[0]) await touchDashboard(dashboardId)
      return rows[0] || null
    },

    /**
     * Reorders charts within a dashboard based on provided chart ID array
     */
    async reorder(dashboardId: string, chartIds: string[]) {
      await db.transaction(async (tx) => {
        for (let i = 0; i < chartIds.length; i++) {
          await tx
            .update(charts)
            .set({ position: i })
            .where(and(eq(charts.id, chartIds[i]), eq(charts.dashboardId, dashboardId)))
        }
        await tx.update(dashboards).set({ updatedAt: new Date() }).where(eq(dashboards.id, dashboardId))
      })
    },

    /**
     * Moves a chart from one dashboard to another
     */
    async move(chartId: string, fromDashboardId: string, toDashboardId: string) {
      const [{ nextPos }] = await db
        .select({ nextPos: sql<number>`COALESCE(MAX(${charts.position}), -1) + 1` })
        .from(charts)
        .where(eq(charts.dashboardId, toDashboardId))

      const rows = await db
        .update(charts)
        .set({ dashboardId: toDashboardId, position: nextPos, updatedAt: new Date() })
        .where(and(eq(charts.id, chartId), eq(charts.dashboardId, fromDashboardId)))
        .returning()

      if (rows[0]) {
        await touchDashboard(fromDashboardId)
        await touchDashboard(toDashboardId)
      }
      return rows[0] || null
    },

    /**
     * Deletes a chart from a dashboard
     */
    async remove(dashboardId: string, chartId: string) {
      const rows = await db
        .delete(charts)
        .where(and(eq(charts.id, chartId), eq(charts.dashboardId, dashboardId)))
        .returning({ id: charts.id })
      if (rows.length > 0) {
        await touchDashboard(dashboardId)
        return true
      }
      return false
    },
  }
}
