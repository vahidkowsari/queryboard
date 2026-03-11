import { Router } from 'express'
import { createPermissionService } from '../services/permission.service.js'
import { createConversationService } from '../services/conversation.service.js'
import { asyncHandler } from '../middleware/error.js'
import { requireRole } from '../middleware/roles.js'
import { ROLES } from '../auth.js'
import type { Db } from '../db/index.js'

export function createPermissionRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const permissionService = createPermissionService(db)

  // GET /api/projects/:projectId/dashboards/:dashboardId/permissions
  router.get(
    '/:dashboardId/permissions',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const perms = await permissionService.listForDashboard(req.params.dashboardId)
      res.json(perms)
    }),
  )

  // POST /api/projects/:projectId/dashboards/:dashboardId/permissions
  router.post(
    '/:dashboardId/permissions',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const { userId, groupId, permission } = req.body
      if (!['view', 'edit'].includes(permission)) {
        return void res.status(400).json({ error: 'permission must be view or edit' })
      }
      if (!userId && !groupId) {
        return void res.status(400).json({ error: 'userId or groupId required' })
      }
      const perm = await permissionService.setPermission(req.params.dashboardId, permission, userId, groupId)
      res.status(201).json(perm)
    }),
  )

  // DELETE /api/projects/:projectId/dashboards/:dashboardId/permissions/:permId
  router.delete(
    '/:dashboardId/permissions/:permId',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const deleted = await permissionService.removePermission(req.params.permId)
      if (!deleted) return void res.status(404).json({ error: 'Permission not found' })
      res.json({ deleted: true })
    }),
  )

  return router
}

export function createConversationPermissionRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const permissionService = createPermissionService(db)
  const conversationService = createConversationService(db)

  // GET /api/projects/:projectId/conversations/:conversationId/permissions
  router.get(
    '/:conversationId/permissions',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const perms = await permissionService.listForConversation(req.params.conversationId)
      res.json(perms)
    }),
  )

  // POST /api/projects/:projectId/conversations/:conversationId/permissions
  router.post(
    '/:conversationId/permissions',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const { userId, groupId, permission } = req.body
      const { conversationId, projectId } = req.params
      
      if (!['view', 'edit'].includes(permission)) {
        return void res.status(400).json({ error: 'permission must be view or edit' })
      }
      if (!userId && !groupId) {
        return void res.status(400).json({ error: 'userId or groupId required' })
      }
      if (userId && groupId) {
        return void res.status(400).json({ error: 'Cannot specify both userId and groupId' })
      }
      
      // Validate conversation exists and belongs to project
      const conv = await conversationService.getById(conversationId)
      if (!conv || conv.projectId !== projectId) {
        return void res.status(404).json({ error: 'Conversation not found' })
      }
      
      const perm = await permissionService.setConversationPermission(conversationId, permission, userId, groupId)
      res.status(201).json(perm)
    }),
  )

  // DELETE /api/projects/:projectId/conversations/:conversationId/permissions/:permId
  router.delete(
    '/:conversationId/permissions/:permId',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const deleted = await permissionService.removeConversationPermission(req.params.permId)
      if (!deleted) return void res.status(404).json({ error: 'Permission not found' })
      res.json({ deleted: true })
    }),
  )

  return router
}
