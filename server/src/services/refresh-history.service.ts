import { eq, desc } from 'drizzle-orm'
import { refreshHistory } from '../db/schema.js'
import type { Db } from '../db/index.js'

export function createRefreshHistoryService(db: Db) {
  async function recordRefresh(params: {
    chartId: string
    dashboardId: string
    triggeredBy?: string
    triggerType: 'manual' | 'scheduled' | 'filter'
    status: 'success' | 'error'
    executionTimeMs?: number
    rowCount?: number
    errorMessage?: string
  }) {
    const [record] = await db
      .insert(refreshHistory)
      .values({
        chartId: params.chartId,
        dashboardId: params.dashboardId,
        triggeredBy: params.triggeredBy,
        triggerType: params.triggerType,
        status: params.status,
        executionTimeMs: params.executionTimeMs,
        rowCount: params.rowCount,
        errorMessage: params.errorMessage,
      })
      .returning()
    return record
  }

  async function getChartHistory(chartId: string, limit = 50) {
    return db
      .select()
      .from(refreshHistory)
      .where(eq(refreshHistory.chartId, chartId))
      .orderBy(desc(refreshHistory.createdAt))
      .limit(limit)
  }

  async function getDashboardHistory(dashboardId: string, limit = 100) {
    return db
      .select()
      .from(refreshHistory)
      .where(eq(refreshHistory.dashboardId, dashboardId))
      .orderBy(desc(refreshHistory.createdAt))
      .limit(limit)
  }

  async function getLatestRefresh(chartId: string) {
    const [latest] = await db
      .select()
      .from(refreshHistory)
      .where(eq(refreshHistory.chartId, chartId))
      .orderBy(desc(refreshHistory.createdAt))
      .limit(1)
    return latest
  }

  return {
    recordRefresh,
    getChartHistory,
    getDashboardHistory,
    getLatestRefresh,
  }
}

export type RefreshHistoryService = ReturnType<typeof createRefreshHistoryService>
