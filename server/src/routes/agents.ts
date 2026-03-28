import { Router } from 'express'
import { createChartService } from '../services/chart.service.js'
import { loadProject } from '../middleware/project.js'
import { requireRole } from '../middleware/roles.js'
import { ROLES } from '../auth.js'
import { createTokenUsageService } from '../services/token-usage.service.js'
import { createConversationService } from '../services/conversation.service.js'
import { createAuditLogService } from '../services/audit-log.service.js'
import {
  registerGenerateRoute,
  registerGenerateChartRoute,
  registerAskRoute,
  registerChartChatRoute,
  registerChartChatHistoryRoute,
} from './agents/handlers.js'
import type { Db } from '../db/index.js'

export function createAgentRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const tokenUsageService = createTokenUsageService(db)
  const conversationService = createConversationService(db)
  const chartService = createChartService(db)
  const auditLog = createAuditLogService(db)
  router.use(loadProject(db))
  router.use(requireRole(ROLES.ADMIN, ROLES.EDITOR))

  const deps = { db, tokenUsageService, conversationService, chartService, auditLog }
  registerGenerateRoute(router, deps)
  registerGenerateChartRoute(router, deps)
  registerAskRoute(router, deps)
  registerChartChatRoute(router, deps)
  registerChartChatHistoryRoute(router, deps)

  return router
}
