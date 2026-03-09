import { Router } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { loadProject } from '../middleware/project.js'
import { requireRole } from '../middleware/roles.js'
import { ROLES } from '../auth.js'
import { createProjectService } from '../services/project.service.js'
import { createSchemaProvider } from '../services/schema-providers/index.js'
import { detectSchema } from '../services/schema-detector.js'
import { enrichSchemaWithDescriptions } from '../services/schema-enricher.js'
import { createTokenUsageService } from '../services/token-usage.service.js'
import type { Db } from '../db/index.js'

export function createSchemaRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const projectService = createProjectService(db)
  const tokenUsageService = createTokenUsageService(db)
  router.use(loadProject(db))

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const project = req.project!
      if (project.schemaCache) {
        return void res.json(project.schemaCache)
      }
      res.status(503).json({ error: 'Schema not detected yet. POST to this endpoint to detect.' })
    }),
  )

  router.post(
    '/',
    requireRole(ROLES.ADMIN, ROLES.EDITOR),
    asyncHandler(async (req, res) => {
      const project = req.project!

      const provider = createSchemaProvider(project.dbEngine, project.dbConfig)
      const rawSchema = await detectSchema(provider, { force: true })
      const { schema, totalUsage, vendor, model } = await enrichSchemaWithDescriptions(rawSchema, project.llmConfig)

      if (totalUsage.totalTokens > 0) {
        await tokenUsageService.record({
          projectId: project.id,
          vendor,
          model,
          promptTokens: totalUsage.promptTokens,
          completionTokens: totalUsage.completionTokens,
          totalTokens: totalUsage.totalTokens,
          operation: 'schema-enrich',
        })
      }

      await projectService.updateSchemaCache(project.id, schema)
      res.json(schema)
    }),
  )

  return router
}
