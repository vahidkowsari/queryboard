import { Router } from 'express'
import supertokens from 'supertokens-node'
import { createProjectService } from '../services/project.service.js'
import { createProjectExportService } from '../services/project-export.service.js'
import { createQueryExecutor } from '../services/query-executors/index.js'
import { asyncHandler } from '../middleware/error.js'
import { requireRole } from '../middleware/roles.js'
import { ROLES } from '../auth.js'
import { createAuditLogService } from '../services/audit-log.service.js'
import type { Db } from '../db/index.js'
import type { DbEngine, DbConfig, QueryExecutor } from '../types.js'
import { conversations, charts, dashboards } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import type { SessionRequest } from 'supertokens-node/framework/express/index.js'

export function createProjectRoutes(db: Db): Router {
  const router = Router()
  const projectService = createProjectService(db)
  const exportService = createProjectExportService(db)
  const auditLog = createAuditLogService(db)

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const projects = await projectService.list()
      res.json(projects)
    }),
  )

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const project = await projectService.getById(req.params.id)
      if (!project) return void res.status(404).json({ error: 'Project not found' })
      res.json(project)
    }),
  )

  router.post(
    '/test-connection',
    requireRole(ROLES.ADMIN, ROLES.EDITOR, ROLES.VIEWER),
    asyncHandler(async (req, res) => {
      const { dbEngine, dbConfig } = req.body
      
      console.log('Test connection request:', { dbEngine, dbConfig: dbConfig ? '(present)' : '(missing)' })
      
      const validEngines: DbEngine[] = ['athena', 'postgres', 'mysql', 'bigquery', 'redshift', 'snowflake']
      if (!dbEngine || !validEngines.includes(dbEngine)) {
        console.log('Invalid dbEngine:', dbEngine)
        return void res.status(400).json({ error: 'Invalid or missing dbEngine' })
      }
      if (!dbConfig || typeof dbConfig !== 'object') {
        console.log('Invalid dbConfig:', typeof dbConfig)
        return void res.status(400).json({ error: 'Invalid or missing dbConfig' })
      }
      
      let executor: QueryExecutor | null = null
      try {
        console.log(`Creating ${dbEngine} executor...`)
        executor = createQueryExecutor(dbEngine, dbConfig as DbConfig)
        console.log(`Testing ${dbEngine} connection with SELECT 1...`)
        await executor.execute('SELECT 1')
        console.log(`${dbEngine} connection test successful`)
        res.json({ success: true, message: 'Connection successful!' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connection failed'
        console.error(`${dbEngine} connection test failed:`, message)
        console.error('Full error:', err)
        res.status(400).json({ success: false, error: message })
      } finally {
        if (executor?.cleanup) {
          await executor.cleanup()
        }
      }
    }),
  )

  router.post(
    '/',
    requireRole(ROLES.ADMIN, ROLES.EDITOR),
    asyncHandler(async (req, res) => {
      const { name, description, dbEngine, dbConfig, llmConfig, chartLibrary } = req.body
      if (!name || !dbEngine || !dbConfig) {
        return void res.status(400).json({ error: 'name, dbEngine, and dbConfig are required' })
      }
      const project = await projectService.create(name, dbEngine, dbConfig, description, llmConfig, chartLibrary)
      const userId = (req as SessionRequest).session?.getUserId()
      await auditLog.log({ projectId: project.id, userId, action: 'created', entityType: 'project', entityId: project.id, entityName: name })
      res.status(201).json(project)
    }),
  )

  router.put(
    '/:id',
    requireRole(ROLES.ADMIN, ROLES.EDITOR),
    asyncHandler(async (req, res) => {
      const project = await projectService.update(req.params.id, req.body)
      if (!project) return void res.status(404).json({ error: 'Project not found' })
      const userId = (req as SessionRequest).session?.getUserId()
      await auditLog.log({ projectId: project.id, userId, action: 'updated', entityType: 'project', entityId: project.id, entityName: project.name, details: { fields: Object.keys(req.body) } })
      res.json(project)
    }),
  )

  router.delete(
    '/:id',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const deleted = await projectService.remove(req.params.id)
      if (!deleted) return void res.status(404).json({ error: 'Project not found' })
      const userId = (req as SessionRequest).session?.getUserId()
      // Note: project is already deleted (cascade removes audit_logs FK), so this log
      // cannot reference the deleted projectId. Log without projectId constraint.
      console.log(`Project ${req.params.id} deleted by user ${userId}`)
      res.json({ deleted: true })
    }),
  )

  router.get(
    '/:id/export',
    asyncHandler(async (req, res) => {
      const data = await exportService.exportProject(req.params.id)
      if (!data) return void res.status(404).json({ error: 'Project not found' })
      const userId = (req as SessionRequest).session?.getUserId()
      await auditLog.log({ projectId: req.params.id, userId, action: 'exported', entityType: 'project', entityId: req.params.id, entityName: data.project.name })
      const filename = `${data.project.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.json(data)
    }),
  )

  router.post(
    '/import',
    requireRole(ROLES.ADMIN, ROLES.EDITOR),
    asyncHandler(async (req, res) => {
      const data = req.body
      if (!data?.version || !data?.project?.name || !data?.project?.dbEngine) {
        return void res.status(400).json({ error: 'Invalid project export file' })
      }
      const projectId = await exportService.importProject(data)
      const project = await projectService.getById(projectId)
      const userId = (req as SessionRequest).session?.getUserId()
      await auditLog.log({ projectId, userId, action: 'imported', entityType: 'project', entityId: projectId, entityName: data.project.name })
      res.status(201).json(project)
    }),
  )

  // Returns {id, email}[] for all users who own conversations or created charts in this project.
  // Available to all authenticated project users (no admin role required).
  router.get(
    '/:id/users',
    asyncHandler(async (req, res) => {
      const projectId = req.params.id

      // Collect distinct userIds from conversations
      const convRows = await db
        .select({ userId: conversations.userId })
        .from(conversations)
        .where(eq(conversations.projectId, projectId))

      // Collect distinct createdBy from charts via dashboards join
      const chartRows = await db
        .select({ createdBy: charts.createdBy })
        .from(charts)
        .innerJoin(dashboards, eq(charts.dashboardId, dashboards.id))
        .where(eq(dashboards.projectId, projectId))

      const userIdSet = new Set<string>()
      for (const r of convRows) userIdSet.add(r.userId)
      for (const r of chartRows) if (r.createdBy) userIdSet.add(r.createdBy)

      if (userIdSet.size === 0) return void res.json([])

      const userIds = Array.from(userIdSet)
      const users = await Promise.all(
        userIds.map(async (id) => {
          const user = await supertokens.getUser(id)
          return { id, email: user?.emails?.[0] ?? null }
        }),
      )

      res.json(users)
    }),
  )

  return router
}
