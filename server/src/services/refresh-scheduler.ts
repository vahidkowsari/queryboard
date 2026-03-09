import cron, { type ScheduledTask } from 'node-cron'
import { eq, isNotNull } from 'drizzle-orm'
import { dashboards, charts, projects } from '../db/schema.js'
import { createQueryExecutor } from './query-executors/index.js'
import type { Db } from '../db/index.js'
import type { DbEngine, DbConfig } from '../types.js'

const activeTasks = new Map<string, ScheduledTask>()

export function createRefreshScheduler(db: Db) {
  async function refreshDashboard(dashboardId: string) {
    const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId))
    if (!dashboard) return

    const [project] = await db.select().from(projects).where(eq(projects.id, dashboard.projectId))
    if (!project) return

    const dashboardCharts = await db.select().from(charts).where(eq(charts.dashboardId, dashboardId))
    if (dashboardCharts.length === 0) return

    const executor = createQueryExecutor(project.dbEngine as DbEngine, project.dbConfig as DbConfig)

    for (const chart of dashboardCharts) {
      if (!chart.query) continue
      try {
        const result = await executor.execute(chart.query)
        await db
          .update(charts)
          .set({ data: result.rows, updatedAt: new Date() })
          .where(eq(charts.id, chart.id))
      } catch (err) {
        console.error(`[CronRefresh] Failed to refresh chart "${chart.name}" (${chart.id}):`, (err as Error).message)
      }
    }

    await db
      .update(dashboards)
      .set({ lastRefreshedAt: new Date(), updatedAt: new Date() })
      .where(eq(dashboards.id, dashboardId))

    console.log(`[CronRefresh] Refreshed dashboard "${dashboard.name}" (${dashboardCharts.length} charts)`)
  }

  function scheduleDashboard(dashboardId: string, cronExpr: string) {
    // Stop existing task if any
    const existing = activeTasks.get(dashboardId)
    if (existing) {
      existing.stop()
      activeTasks.delete(dashboardId)
    }

    if (!cron.validate(cronExpr)) {
      console.error(`[CronRefresh] Invalid cron expression for dashboard ${dashboardId}: ${cronExpr}`)
      return
    }

    const task = cron.schedule(cronExpr, () => {
      refreshDashboard(dashboardId).catch((err) =>
        console.error(`[CronRefresh] Error refreshing dashboard ${dashboardId}:`, err.message),
      )
    })
    activeTasks.set(dashboardId, task)
    console.log(`[CronRefresh] Scheduled dashboard ${dashboardId} with cron "${cronExpr}"`)
  }

  function unscheduleDashboard(dashboardId: string) {
    const existing = activeTasks.get(dashboardId)
    if (existing) {
      existing.stop()
      activeTasks.delete(dashboardId)
      console.log(`[CronRefresh] Unscheduled dashboard ${dashboardId}`)
    }
  }

  async function loadAllSchedules() {
    const rows = await db
      .select({ id: dashboards.id, refreshCron: dashboards.refreshCron })
      .from(dashboards)
      .where(isNotNull(dashboards.refreshCron))

    for (const row of rows) {
      if (row.refreshCron) {
        scheduleDashboard(row.id, row.refreshCron)
      }
    }
    console.log(`[CronRefresh] Loaded ${rows.length} scheduled dashboard(s)`)
  }

  return { scheduleDashboard, unscheduleDashboard, loadAllSchedules, refreshDashboard }
}

export type RefreshScheduler = ReturnType<typeof createRefreshScheduler>
