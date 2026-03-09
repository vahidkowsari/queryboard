import { Router } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { loadProject } from '../middleware/project.js'
import { createTokenUsageService } from '../services/token-usage.service.js'
import type { Db } from '../db/index.js'

export function createTokenUsageRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const tokenUsageService = createTokenUsageService(db)
  router.use(loadProject(db))

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const project = req.project!
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
      const offset = parseInt(req.query.offset as string) || 0
      const rows = await tokenUsageService.getByProject(project.id, limit, offset)
      res.json(rows)
    }),
  )

  router.get(
    '/summary',
    asyncHandler(async (req, res) => {
      const project = req.project!
      const days = req.query.days ? parseInt(req.query.days as string) : undefined
      const summary = await tokenUsageService.getSummary(project.id, days)
      res.json(summary)
    }),
  )

  return router
}
