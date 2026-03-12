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
import type { SchemaProgressEvent } from '../types.js'

const DETECTION_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

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

  // SSE endpoint: streams progress events during schema detection
  router.get(
    '/detect',
    requireRole(ROLES.ADMIN, ROLES.EDITOR),
    (req, res) => {
      const project = req.project!

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no') // disable nginx buffering
      res.flushHeaders()

      let finished = false

      function sendEvent(event: SchemaProgressEvent) {
        if (!finished) {
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        }
      }

      function finish() {
        if (!finished) {
          finished = true
          clearTimeout(timeoutId)
          res.end()
        }
      }

      const timeoutId = setTimeout(() => {
        sendEvent({ phase: 'error', message: 'Schema detection timed out after 10 minutes' })
        finish()
      }, DETECTION_TIMEOUT_MS)

      req.on('close', () => {
        finished = true
        clearTimeout(timeoutId)
      })

      async function run() {
        try {
          const provider = createSchemaProvider(project.dbEngine, project.dbConfig)
          const rawSchema = await detectSchema(
            provider,
            { force: true, projectId: project.id },
            sendEvent,
          )

          const { schema, totalUsage, vendor, model } = await enrichSchemaWithDescriptions(
            rawSchema,
            project.llmConfig,
            sendEvent,
          )

          sendEvent({ phase: 'saving', message: 'Saving schema to database...' })
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

          sendEvent({ phase: 'complete', message: 'Schema detection complete!' })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Schema detection failed'
          sendEvent({ phase: 'error', message })
        } finally {
          finish()
        }
      }

      run()
    },
  )

  router.post(
    '/',
    requireRole(ROLES.ADMIN, ROLES.EDITOR),
    asyncHandler(async (req, res) => {
      const project = req.project!

      const provider = createSchemaProvider(project.dbEngine, project.dbConfig)
      const rawSchema = await detectSchema(provider, { force: true, projectId: project.id })
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
