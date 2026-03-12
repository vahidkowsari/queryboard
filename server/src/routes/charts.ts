import { Router } from 'express'
import { createChartService } from '../services/chart.service.js'
import { createProjectService } from '../services/project.service.js'
import { createQueryExecutor } from '../services/query-executors/index.js'
import { asyncHandler } from '../middleware/error.js'
import { requireDashboardAccess } from '../middleware/dashboard-access.js'
import { createPermissionService } from '../services/permission.service.js'
import type { SessionRequest } from 'supertokens-node/framework/express/index.js'
import type { Db } from '../db/index.js'
import type { DbEngine, DbConfig, ChartFilter } from '../types.js'
import { substituteFilters, hasFilterPlaceholders } from '../services/filter-substitution.js'

export function createChartRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const chartService = createChartService(db)
  const projectService = createProjectService(db)
  const permissionService = createPermissionService(db)
  const canView = requireDashboardAccess(db, 'view')
  const canEdit = requireDashboardAccess(db, 'edit')

  router.post(
    '/:dashboardId/charts',
    canEdit,
    asyncHandler(async (req: SessionRequest, res) => {
      const createdBy = req.session!.getUserId()
      const chart = await chartService.create(req.params.dashboardId, req.body, createdBy)
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
      res.json(chart)
    }),
  )

  router.post(
    '/:dashboardId/charts/:chartId/refresh',
    canView,
    asyncHandler(async (req, res) => {
      const { projectId, dashboardId, chartId } = req.params
      const filterValues: Record<string, string> = req.body?.filterValues || {}
      const chart = await chartService.getById(dashboardId, chartId)
      if (!chart) return void res.status(404).json({ error: 'Chart not found' })
      if (!chart.query) return void res.status(400).json({ error: 'Chart has no SQL query to refresh' })

      const project = await projectService.getById(projectId)
      if (!project) return void res.status(404).json({ error: 'Project not found' })

      const filters = (chart.filters as ChartFilter[] | null) || []
      let sql = chart.query
      if (filters.length > 0 && hasFilterPlaceholders(sql)) {
        sql = substituteFilters(sql, filters, filterValues)
      }

      const executor = createQueryExecutor(project.dbEngine as DbEngine, project.dbConfig as DbConfig)
      const result = await executor.execute(sql)

      const updated = await chartService.updateData(dashboardId, chartId, result.rows)
      res.json(updated)
    }),
  )

  router.post(
    '/:dashboardId/refresh-filtered',
    canView,
    asyncHandler(async (req, res) => {
      const { projectId, dashboardId } = req.params
      const filterValues: Record<string, string> = req.body?.filterValues || {}

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

      for (const chart of allCharts) {
        if (!chart.query) continue
        const filters = (chart.filters as ChartFilter[] | null) || []
        let sql = chart.query
        if (filters.length > 0 && hasFilterPlaceholders(sql)) {
          sql = substituteFilters(sql, filters, filterValues)
        } else {
          continue
        }

        try {
          const result = await executor.execute(sql)
          const updated = await chartService.updateData(dashboardId, chart.id, result.rows)
          results.push(updated!)
        } catch (err) {
          console.error(`Failed to refresh chart ${chart.id}:`, err)
          results.push({ id: chart.id, error: err instanceof Error ? err.message : 'Refresh failed' })
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
      res.json(chart)
    }),
  )

  router.delete(
    '/:dashboardId/charts/:chartId',
    canEdit,
    asyncHandler(async (req, res) => {
      const deleted = await chartService.remove(req.params.dashboardId, req.params.chartId)
      if (!deleted) return void res.status(404).json({ error: 'Chart not found' })
      res.json({ deleted: true })
    }),
  )

  return router
}
