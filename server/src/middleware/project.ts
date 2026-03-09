import type { Request, Response, NextFunction } from 'express'
import { createProjectService } from '../services/project.service.js'
import type { Db } from '../db/index.js'
import type { ProjectRow } from '../types.js'

declare global {
  namespace Express {
    interface Request {
      project?: ProjectRow
    }
  }
}

export function loadProject(db: Db) {
  const projectService = createProjectService(db)

  return async (req: Request, res: Response, next: NextFunction) => {
    const { projectId } = req.params
    if (!projectId) return void res.status(400).json({ error: 'projectId is required' })

    const project = await projectService.getById(projectId)
    if (!project) return void res.status(404).json({ error: 'Project not found' })

    req.project = project as ProjectRow
    next()
  }
}
