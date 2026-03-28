import { Router } from 'express'
import { createChartService } from '../services/chart.service.js'
import { createProjectService } from '../services/project.service.js'
import { createQueryExecutor } from '../services/query-executors/index.js'
import { asyncHandler } from '../middleware/error.js'
import { requireDashboardAccess } from '../middleware/dashboard-access.js'
import { createPermissionService } from '../services/permission.service.js'
import { createRefreshHistoryService } from '../services/refresh-history.service.js'
import { createAuditLogService } from '../services/audit-log.service.js'
import type { SessionRequest } from 'supertokens-node/framework/express/index.js'
import type { Db } from '../db/index.js'
import type { DbEngine, DbConfig, ChartFilter } from '../types.js'
import { substituteFilters, hasFilterPlaceholders } from '../services/filter-substitution.js'

export function createChartRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const chartService = createChartService(db)
  const projectService = createProjectService(db)
  const permissionService = createPermissionService(db)
  const refreshHistoryService = createRefreshHistoryService(db)
  const auditLog = createAuditLogService(db)
  const canView = requireDashboardAccess(db, 'view')
  const canEdit = requireDashboardAccess(db, 'edit')

  function resolveSqlWithFilters(
    query: string,
    rawFilters: unknown,
    filterValues: Record<string, string>,
  ): { sql: string; hasAppliedFilters: boolean } {
    const filters = (rawFilters as ChartFilter[] | null) || []
    const hasAppliedFilters = filters.length > 0 && hasFilterPlaceholders(query)
    if (!hasAppliedFilters) {
      return { sql: query, hasAppliedFilters: false }
    }
    return { sql: substituteFilters(query, filters, filterValues), hasAppliedFilters: true }
  }

  async function recordRefreshSafely(payload: Parameters<typeof refreshHistoryService.recordRefresh>[0]): Promise<void> {
    try {
      await refreshHistoryService.recordRefresh(payload)
    } catch (historyErr) {
      console.error('Failed to record refresh history:', historyErr)
    }
  }

  router.post(
    '/:dashboardId/charts',
    canEdit,
    asyncHandler(async (req: SessionRequest, res) => {
      const createdBy = req.session!.getUserId()
      const chart = await chartService.create(req.params.dashboardId, req.body, createdBy)
      await auditLog.log({ projectId: req.params.projectId, userId: createdBy, action: 'created', entityType: 'chart', entityId: chart.id, entityName: chart.name })
      res.status(201).json(chart)
    }),
  )

  router.get(
    '/:dashboardId/charts/:chartId',
    canView,
    asyncHandler(async (req, res) => {
      const chart = await chartService.getById(req.params.dashboardId, req.params.chartId)
      if (!chart) return void res.status(404).json({ error: 'Chart not found' })
      res.json(chart)
    }),
  )

  router.put(
    '/:dashboardId/charts/reorder',
    canEdit,
    asyncHandler(async (req, res) => {
      const { chartIds } = req.body
      await chartService.reorder(req.params.dashboardId, chartIds)
      res.json({ success: true })
    }),
  )

  router.put(
    '/:dashboardId/charts/:chartId',
    canEdit,
    asyncHandler(async (req, res) => {
      const chart = await chartService.update(req.params.dashboardId, req.params.chartId, req.body)
      if (!chart) return void res.status(404).json({ error: 'Chart not found' })
      const userId = (req as SessionRequest).session?.getUserId()
      await auditLog.log({ projectId: req.params.projectId, userId, action: 'updated', entityType: 'chart', entityId: chart.id, entityName: chart.name, details: { fields: Object.keys(req.body) } })
      res.json(chart)
    }),
  )

  router.post(
    '/:dashboardId/charts/:chartId/refresh',
    canView,
    asyncHandler(async (req: SessionRequest, res) => {
      const { projectId, dashboardId, chartId } = req.params
      const filterValues: Record<string, string> = req.body?.filterValues || {}
      const userId = req.session?.getUserId()
      const chart = await chartService.getById(dashboardId, chartId)
      if (!chart) return void res.status(404).json({ error: 'Chart not found' })
      if (!chart.query) return void res.status(400).json({ error: 'Chart has no SQL query to refresh' })

      const project = await projectService.getById(projectId)
      if (!project) return void res.status(404).json({ error: 'Project not found' })

      const { sql, hasAppliedFilters } = resolveSqlWithFilters(chart.query, chart.filters, filterValues)

      const executor = createQueryExecutor(project.dbEngine as DbEngine, project.dbConfig as DbConfig)
      const startTime = Date.now()
      let status: 'success' | 'error' = 'success'
      let errorMessage: string | undefined
      let rowCount: number | undefined

      try {
        const result = await executor.execute(sql)
        rowCount = result.rows.length
        const executionTimeMs = Date.now() - startTime

        const updated = await chartService.updateDataWithRefresh(dashboardId, chartId, result.rows)

        await recordRefreshSafely({
          chartId,
          dashboardId,
          triggeredBy: userId,
          triggerType: hasAppliedFilters ? 'filter' : 'manual',
          status,
          executionTimeMs,
          rowCount,
        })

        res.json(updated)
      } catch (err) {
        status = 'error'
        errorMessage = err instanceof Error ? err.message : 'Refresh failed'
        const executionTimeMs = Date.now() - startTime

        await recordRefreshSafely({
          chartId,
          dashboardId,
          triggeredBy: userId,
          triggerType: hasAppliedFilters ? 'filter' : 'manual',
          status,
          executionTimeMs,
          errorMessage,
        })

        throw err
      } finally {
        if (executor.cleanup) {
          try {
            await executor.cleanup()
          } catch (cleanupErr) {
            console.error('Failed to cleanup query executor:', cleanupErr)
          }
        }
      }
    }),
  )

  router.post(
    '/:dashboardId/refresh-filtered',
    canView,
    asyncHandler(async (req: SessionRequest, res) => {
      const { projectId, dashboardId } = req.params
      const filterValues: Record<string, string> = req.body?.filterValues || {}
      const userId = req.session?.getUserId()

      const project = await projectService.getById(projectId)
      if (!project) return void res.status(404).json({ error: 'Project not found' })

      const dashboard = await db.query.dashboards.findFirst({
        where: (d, { eq }) => eq(d.id, dashboardId),
      })
      if (!dashboard) return void res.status(404).json({ error: 'Dashboard not found' })

      const allCharts = await db.query.charts.findMany({
        where: (c, { eq }) => eq(c.dashboardId, dashboardId),
      })

      const executor = createQueryExecutor(project.dbEngine as DbEngine, project.dbConfig as DbConfig)
      const results: Record<string, unknown>[] = []

      try {
        for (const chart of allCharts) {
          if (!chart.query) continue
          const { sql, hasAppliedFilters } = resolveSqlWithFilters(chart.query, chart.filters, filterValues)
          if (!hasAppliedFilters) continue

          const startTime = Date.now()
          try {
            const result = await executor.execute(sql)
            const executionTimeMs = Date.now() - startTime
            const updated = await chartService.updateDataWithRefresh(dashboardId, chart.id, result.rows)

            await recordRefreshSafely({
              chartId: chart.id,
              dashboardId,
              triggeredBy: userId,
              triggerType: 'filter',
              status: 'success',
              executionTimeMs,
              rowCount: result.rows.length,
            })

            if (updated) {
              results.push(updated)
            }
          } catch (err) {
            const executionTimeMs = Date.now() - startTime
            const errorMessage = err instanceof Error ? err.message : 'Refresh failed'

            await recordRefreshSafely({
              chartId: chart.id,
              dashboardId,
              triggeredBy: userId,
              triggerType: 'filter',
              status: 'error',
              executionTimeMs,
              errorMessage,
            })

            console.error(`Failed to refresh chart ${chart.id}:`, err)
            results.push({ id: chart.id, error: errorMessage })
          }
        }
      } finally {
        if (executor.cleanup) {
          try {
            await executor.cleanup()
          } catch (cleanupErr) {
            console.error('Failed to cleanup query executor:', cleanupErr)
          }
        }
      }

      res.json({ charts: results })
    }),
  )

  router.put(
    '/:dashboardId/charts/:chartId/move',
    canEdit,
    asyncHandler(async (req: SessionRequest, res) => {
      const { targetDashboardId } = req.body
      if (!targetDashboardId) return void res.status(400).json({ error: 'targetDashboardId is required' })

      // Verify user has edit access on the target dashboard
      const userId = req.session!.getUserId()
      const roles: string[] = req.session?.getAccessTokenPayload()?.roles ?? []
      if (!roles.includes('admin')) {
        const canAccessTarget = await permissionService.canAccess(targetDashboardId, userId, 'edit')
        if (!canAccessTarget) {
          return void res.status(403).json({ error: 'You do not have edit permission on the target dashboard' })
        }
      }

      const chart = await chartService.move(req.params.chartId, req.params.dashboardId, targetDashboardId)
      if (!chart) return void res.status(404).json({ error: 'Chart not found' })
      await auditLog.log({ projectId: req.params.projectId, userId, action: 'moved', entityType: 'chart', entityId: req.params.chartId, details: { fromDashboard: req.params.dashboardId, toDashboard: targetDashboardId } })
      res.json(chart)
    }),
  )

  router.get(
    '/:dashboardId/charts/:chartId/refresh-history',
    canView,
    asyncHandler(async (req, res) => {
      const { chartId } = req.params
      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50
      const limit = Math.max(1, Math.min(rawLimit, 1000))
      const history = await refreshHistoryService.getChartHistory(chartId, limit)
      res.json(history)
    }),
  )

  router.delete(
    '/:dashboardId/charts/:chartId',
    canEdit,
    asyncHandler(async (req, res) => {
      const deleted = await chartService.remove(req.params.dashboardId, req.params.chartId)
      if (!deleted) return void res.status(404).json({ error: 'Chart not found' })
      const userId = (req as SessionRequest).session?.getUserId()
      await auditLog.log({ projectId: req.params.projectId, userId, action: 'deleted', entityType: 'chart', entityId: req.params.chartId })
      res.json({ deleted: true })
    }),
  )

  return router
}
