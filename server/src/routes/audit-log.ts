import { Router } from 'express'
import { createAuditLogService } from '../services/audit-log.service.js'
import { asyncHandler } from '../middleware/error.js'
import { loadProject } from '../middleware/project.js'
import { requireRole } from '../middleware/roles.js'
import { ROLES } from '../auth.js'
import type { Db } from '../db/index.js'

export function createAuditLogRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const auditLogService = createAuditLogService(db)
  router.use(loadProject(db))

  router.get(
    '/',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const { projectId } = req.params
      const { action, entityType, userId, from, to, limit, offset } = req.query

      const filter = {
        action: action as string | undefined,
        entityType: entityType as string | undefined,
        userId: userId as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        limit: limit ? (isNaN(parseInt(limit as string, 10)) ? undefined : parseInt(limit as string, 10)) : undefined,
        offset: offset ? (isNaN(parseInt(offset as string, 10)) ? undefined : parseInt(offset as string, 10)) : undefined,
      }

      const [rows, total] = await Promise.all([
        auditLogService.list(projectId, filter),
        auditLogService.count(projectId, filter),
      ])

      res.json({ rows, total })
    }),
  )

  return router
}
