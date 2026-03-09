import { Router } from 'express'
import { createProjectService } from '../services/project.service.js'
import { createProjectExportService } from '../services/project-export.service.js'
import { createQueryExecutor } from '../services/query-executors/index.js'
import { asyncHandler } from '../middleware/error.js'
import { requireRole } from '../middleware/roles.js'
import { ROLES } from '../auth.js'
import type { Db } from '../db/index.js'
import type { DbEngine, DbConfig } from '../types.js'

export function createProjectRoutes(db: Db): Router {
  const router = Router()
  const projectService = createProjectService(db)
  const exportService = createProjectExportService(db)

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
    '/',
    requireRole(ROLES.ADMIN, ROLES.EDITOR),
    asyncHandler(async (req, res) => {
      const { name, description, dbEngine, dbConfig, llmConfig, chartLibrary } = req.body
      if (!name || !dbEngine || !dbConfig) {
        return void res.status(400).json({ error: 'name, dbEngine, and dbConfig are required' })
      }
      const project = await projectService.create(name, dbEngine, dbConfig, description, llmConfig, chartLibrary)
      res.status(201).json(project)
    }),
  )

  router.put(
    '/:id',
    requireRole(ROLES.ADMIN, ROLES.EDITOR),
    asyncHandler(async (req, res) => {
      const project = await projectService.update(req.params.id, req.body)
      if (!project) return void res.status(404).json({ error: 'Project not found' })
      res.json(project)
    }),
  )

  router.delete(
    '/:id',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const deleted = await projectService.remove(req.params.id)
      if (!deleted) return void res.status(404).json({ error: 'Project not found' })
      res.json({ deleted: true })
    }),
  )

  router.post(
    '/:id/test-connection',
    asyncHandler(async (req, res) => {
      const project = await projectService.getById(req.params.id)
      if (!project) return void res.status(404).json({ error: 'Project not found' })
      try {
        const executor = createQueryExecutor(project.dbEngine as DbEngine, project.dbConfig as DbConfig)
        await executor.execute('SELECT 1')
        res.json({ success: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connection failed'
        res.status(400).json({ success: false, error: message })
      }
    }),
  )

  router.get(
    '/:id/export',
    asyncHandler(async (req, res) => {
      const data = await exportService.exportProject(req.params.id)
      if (!data) return void res.status(404).json({ error: 'Project not found' })
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
      res.status(201).json(project)
    }),
  )

  return router
}
