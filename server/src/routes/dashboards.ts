import { Router } from 'express'
import cron from 'node-cron'
import { createDashboardService } from '../services/dashboard.service.js'
import { asyncHandler } from '../middleware/error.js'
import { requireRole } from '../middleware/roles.js'
import { requireDashboardAccess } from '../middleware/dashboard-access.js'
import { ROLES } from '../auth.js'
import { createPermissionService } from '../services/permission.service.js'
import { createAuditLogService } from '../services/audit-log.service.js'
import type { SessionRequest } from 'supertokens-node/framework/express/index.js'
import type { Db } from '../db/index.js'
import type { RefreshScheduler } from '../services/refresh-scheduler.js'

export function createDashboardRoutes(db: Db, scheduler?: RefreshScheduler): Router {
  const router = Router({ mergeParams: true })
  const dashboardService = createDashboardService(db)
  const permissionService = createPermissionService(db)
  const auditLog = createAuditLogService(db)
  const canView = requireDashboardAccess(db, 'view')
  const canEdit = requireDashboardAccess(db, 'edit')

  router.get(
    '/',
    asyncHandler(async (req: SessionRequest, res) => {
      const { projectId } = req.params
      const dashboards = await dashboardService.list(projectId)

      // Admins and editors see all dashboards (editors always have view access)
      const roles: string[] = req.session?.getAccessTokenPayload()?.roles ?? []
      if (roles.includes('admin') || roles.includes('editor')) return void res.json(dashboards)

      // Filter to only dashboards the user can view
      const userId = req.session!.getUserId()
      const allowedIds = await permissionService.filterAccessibleDashboards(
        dashboards.map((d) => d.id),
        userId,
        'view',
      )
      const allowedIdSet = new Set(allowedIds)
      res.json(dashboards.filter((d) => allowedIdSet.has(d.id)))
    }),
  )

  router.get(
    '/:id',
    canView,
    asyncHandler(async (req, res) => {
      const dashboard = await dashboardService.getById(req.params.id)
      if (!dashboard) return void res.status(404).json({ error: 'Dashboard not found' })
      res.json(dashboard)
    }),
  )

  router.post(
    '/',
    requireRole(ROLES.ADMIN, ROLES.EDITOR),
    asyncHandler(async (req, res) => {
      const { projectId } = req.params
      const { name, description } = req.body
      const dashboard = await dashboardService.create(projectId, name, description)
      const userId = (req as SessionRequest).session?.getUserId()
      await auditLog.log({ projectId, userId, action: 'created', entityType: 'dashboard', entityId: dashboard.id, entityName: name })
      res.status(201).json(dashboard)
    }),
  )

  router.put(
    '/:id',
    canEdit,
    asyncHandler(async (req, res) => {
      const { name, description } = req.body
      const dashboard = await dashboardService.update(req.params.id, name, description)
      if (!dashboard) return void res.status(404).json({ error: 'Dashboard not found' })
      const userId = (req as SessionRequest).session?.getUserId()
      await auditLog.log({ projectId: req.params.projectId, userId, action: 'updated', entityType: 'dashboard', entityId: dashboard.id, entityName: name })
      res.json(dashboard)
    }),
  )

  router.delete(
    '/:id',
    canEdit,
    asyncHandler(async (req, res) => {
      const deleted = await dashboardService.remove(req.params.id)
      if (!deleted) return void res.status(404).json({ error: 'Dashboard not found' })
      const userId = (req as SessionRequest).session?.getUserId()
      await auditLog.log({ projectId: req.params.projectId, userId, action: 'deleted', entityType: 'dashboard', entityId: req.params.id })
      res.json({ deleted: true })
    }),
  )

  router.post(
    '/:id/share',
    canEdit,
    asyncHandler(async (req, res) => {
      const dashboard = await dashboardService.createShareToken(req.params.id)
      if (!dashboard) return void res.status(404).json({ error: 'Dashboard not found' })
      const userId = (req as SessionRequest).session?.getUserId()
      await auditLog.log({ projectId: req.params.projectId, userId, action: 'shared', entityType: 'dashboard', entityId: req.params.id })
      res.json({ shareToken: dashboard.shareToken })
    }),
  )

  router.delete(
    '/:id/share',
    canEdit,
    asyncHandler(async (req, res) => {
      const dashboard = await dashboardService.revokeShareToken(req.params.id)
      if (!dashboard) return void res.status(404).json({ error: 'Dashboard not found' })
      const userId = (req as SessionRequest).session?.getUserId()
      await auditLog.log({ projectId: req.params.projectId, userId, action: 'unshared', entityType: 'dashboard', entityId: req.params.id })
      res.json({ shareToken: null })
    }),
  )

  // --- Refresh schedule ---
  router.get(
    '/:id/refresh-schedule',
    canView,
    asyncHandler(async (req, res) => {
      const dashboard = await dashboardService.getById(req.params.id)
      if (!dashboard) return void res.status(404).json({ error: 'Dashboard not found' })
      res.json({ refreshCron: dashboard.refreshCron ?? null, lastRefreshedAt: dashboard.lastRefreshedAt ?? null })
    }),
  )

  router.put(
    '/:id/refresh-schedule',
    canEdit,
    asyncHandler(async (req, res) => {
      const { refreshCron } = req.body
      if (!refreshCron || !cron.validate(refreshCron)) {
        return void res.status(400).json({ error: 'Invalid cron expression' })
      }
      const dashboard = await dashboardService.setRefreshCron(req.params.id, refreshCron)
      if (!dashboard) return void res.status(404).json({ error: 'Dashboard not found' })
      scheduler?.scheduleDashboard(req.params.id, refreshCron)
      res.json({ refreshCron: dashboard.refreshCron, lastRefreshedAt: dashboard.lastRefreshedAt })
    }),
  )

  router.delete(
    '/:id/refresh-schedule',
    canEdit,
    asyncHandler(async (req, res) => {
      const dashboard = await dashboardService.clearRefreshCron(req.params.id)
      if (!dashboard) return void res.status(404).json({ error: 'Dashboard not found' })
      scheduler?.unscheduleDashboard(req.params.id)
      res.json({ refreshCron: null, lastRefreshedAt: dashboard.lastRefreshedAt })
    }),
  )

  router.post(
    '/:id/thumbnail',
    canEdit,
    asyncHandler(async (req, res) => {
      const { thumbnail } = req.body
      if (!thumbnail || typeof thumbnail !== 'string') {
        return void res.status(400).json({ error: 'Invalid thumbnail data' })
      }
      
      // Validate MIME type
      const mimeMatch = thumbnail.match(/^data:image\/(jpeg|jpg|png|webp);base64,/)
      if (!mimeMatch) {
        return void res.status(400).json({ error: 'Invalid image format. Only JPEG, PNG, and WebP are supported' })
      }

      // Validate size (5MB limit) before decoding to avoid large memory allocation
      const maxSize = 5 * 1024 * 1024
      const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, '')
      const padding = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0
      const estimatedSize = Math.floor((base64Data.length * 3) / 4) - padding
      if (estimatedSize > maxSize) {
        return void res.status(413).json({ error: 'Thumbnail too large. Maximum size is 5MB' })
      }

      const buffer = Buffer.from(base64Data, 'base64')

      // Validate decoded size (defense-in-depth)
      if (buffer.length > maxSize) {
        return void res.status(413).json({ error: 'Thumbnail too large. Maximum size is 5MB' })
      }

      const dashboard = await dashboardService.updateThumbnail(req.params.id, buffer)
      if (!dashboard) return void res.status(404).json({ error: 'Dashboard not found' })
      res.json({ success: true })
    }),
  )

  return router
}
