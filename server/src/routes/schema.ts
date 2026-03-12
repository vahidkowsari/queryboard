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
import { createSchemaJobService } from '../services/schema-job.service.js'
import type { Db } from '../db/index.js'
import type { SchemaProgressEvent, ProjectRow } from '../types.js'

// In-memory SSE listeners per project: projectId → Set of callbacks
const projectListeners = new Map<string, Set<(event: SchemaProgressEvent) => void>>()

function broadcast(projectId: string, event: SchemaProgressEvent) {
  const listeners = projectListeners.get(projectId)
  if (listeners) {
    for (const fn of listeners) fn(event)
  }
}

async function runDetectionJob(
  project: ProjectRow,
  jobId: string,
  services: {
    schemaJobService: ReturnType<typeof createSchemaJobService>
    projectService: ReturnType<typeof createProjectService>
    tokenUsageService: ReturnType<typeof createTokenUsageService>
  },
) {
  const { schemaJobService, projectService, tokenUsageService } = services

  const onProgress = (event: SchemaProgressEvent) => {
    schemaJobService.updateProgress(jobId, event).catch((err) =>
      console.error(`Schema job ${jobId}: failed to persist progress - ${err instanceof Error ? err.message : err}`),
    )
    broadcast(project.id, event)
  }

  try {
    const provider = createSchemaProvider(project.dbEngine, project.dbConfig)
    const rawSchema = await detectSchema(provider, { force: true, projectId: project.id }, onProgress)

    const { schema, totalUsage, vendor, model } = await enrichSchemaWithDescriptions(
      rawSchema,
      project.llmConfig,
      onProgress,
    )

    onProgress({ phase: 'saving', message: 'Saving schema to database...' })
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
    onProgress({ phase: 'complete', message: 'Schema detection complete!' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Schema detection failed'
    onProgress({ phase: 'error', message })
  }
}

export function createSchemaRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const projectService = createProjectService(db)
  const tokenUsageService = createTokenUsageService(db)
  const schemaJobService = createSchemaJobService(db)
  router.use(loadProject(db))

  // GET / — return cached schema
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const project = req.project!
      if (project.schemaCache) {
        return void res.json(project.schemaCache)
      }
      res.status(503).json({ error: 'Schema not detected yet. POST to /detect to start detection.' })
    }),
  )

  // GET /job — poll current job status for this project
  router.get(
    '/job',
    asyncHandler(async (req, res) => {
      const project = req.project!
      const job = await schemaJobService.getLatestForProject(project.id)
      res.json(job ?? null)
    }),
  )

  // POST /detect — start background schema detection job
  router.post(
    '/detect',
    requireRole(ROLES.ADMIN, ROLES.EDITOR),
    asyncHandler(async (req, res) => {
      const project = req.project!

      if (await schemaJobService.hasRunningJob(project.id)) {
        return void res.status(409).json({ error: 'Schema detection is already running for this project' })
      }

      const job = await schemaJobService.create(project.id)

      // Fire-and-forget background execution
      runDetectionJob(project, job.id, { schemaJobService, projectService, tokenUsageService }).catch((err) =>
        console.error(`Schema job ${job.id} unexpected error: ${err instanceof Error ? err.message : err}`),
      )

      res.json({ jobId: job.id })
    }),
  )

  // GET /detect — SSE stream; sends current job status then streams live updates
  router.get(
    '/detect',
    requireRole(ROLES.ADMIN, ROLES.EDITOR),
    asyncHandler(async (req, res) => {
      const project = req.project!

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
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
          res.end()
        }
      }

      // Send current job state so the client is immediately up to date
      const currentJob = await schemaJobService.getLatestForProject(project.id)
      if (currentJob) {
        if (currentJob.status === 'complete') {
          sendEvent({ phase: 'complete', message: currentJob.message ?? 'Schema detection complete!' })
          finish()
          return
        }
        if (currentJob.status === 'error') {
          sendEvent({ phase: 'error', message: currentJob.errorMessage ?? 'Schema detection failed' })
          finish()
          return
        }
        if (currentJob.phase) {
          sendEvent({
            phase: currentJob.phase as SchemaProgressEvent['phase'],
            message: currentJob.message ?? '',
            current: currentJob.current ?? undefined,
            total: currentJob.total ?? undefined,
          })
        }
      }

      // Subscribe to live broadcasts
      if (!projectListeners.has(project.id)) {
        projectListeners.set(project.id, new Set())
      }
      const listeners = projectListeners.get(project.id)!

      function onEvent(event: SchemaProgressEvent) {
        sendEvent(event)
        if (event.phase === 'complete' || event.phase === 'error') {
          cleanup()
          finish()
        }
      }

      function cleanup() {
        listeners.delete(onEvent)
        if (listeners.size === 0) projectListeners.delete(project.id)
      }

      listeners.add(onEvent)

      req.on('close', () => {
        finished = true
        cleanup()
      })
    }),
  )

  return router
}
