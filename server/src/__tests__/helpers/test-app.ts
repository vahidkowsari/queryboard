import express, { Request, Response, NextFunction, Router } from 'express'
import { createConversationRoutes } from '../../routes/conversations.js'
import { createProjectRoutes } from '../../routes/projects.js'
import { createSchemaRoutes } from '../../routes/schema.js'
import { errorHandler } from '../../middleware/error.js'
import type { Db } from '../../db/index.js'

// Mock session for testing
export function mockSession(userId: string, roles: string[] = ['admin']) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as any).session = {
      getUserId: () => userId,
      getAccessTokenPayload: () => ({ roles }),
    }
    next()
  }
}

export function createTestApp(db: Db, userId: string = 'test-user-id') {
  const app = express()
  app.use(express.json())
  
  // Mock authentication middleware
  app.use(mockSession(userId))
  
  // Mount routes with proper nesting
  const projectRouter = Router({ mergeParams: true })
  projectRouter.use('/:projectId/conversations', createConversationRoutes(db))
  projectRouter.use('/:projectId/schema', createSchemaRoutes(db))
  
  app.use('/api/projects', projectRouter)
  app.use('/api/projects', createProjectRoutes(db))
  
  // Error handler
  app.use(errorHandler)
  
  return app
}
