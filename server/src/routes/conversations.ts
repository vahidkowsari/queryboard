import { Router } from 'express'
import type { SessionRequest } from 'supertokens-node/framework/express/index.js'
import { asyncHandler } from '../middleware/error.js'
import { requireConversationAccess } from '../middleware/conversation-access.js'
import { createConversationService } from '../services/conversation.service.js'
import { createPermissionService } from '../services/permission.service.js'
import type { Db } from '../db/index.js'

export function createConversationRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const service = createConversationService(db)
  const permissionService = createPermissionService(db)
  const canView = requireConversationAccess(db, 'view')
  const canEdit = requireConversationAccess(db, 'edit')

  function getUserId(req: SessionRequest): string {
    return req.session!.getUserId()
  }

  // GET /api/projects/:projectId/conversations
  router.get(
    '/',
    asyncHandler(async (req: SessionRequest, res) => {
      const { projectId } = req.params
      const conversations = await service.listByProject(projectId)

      // Admins and editors see all conversations (editors always have view access)
      const roles: string[] = req.session?.getAccessTokenPayload()?.roles ?? []
      if (roles.includes('admin') || roles.includes('editor')) return void res.json(conversations)

      // Filter to only conversations the user can view
      const userId = getUserId(req)
      const visible = await Promise.all(
        conversations.map(async (c) => {
          const allowed = await permissionService.canAccessConversation(c.id, userId, 'view')
          return allowed ? c : null
        }),
      )
      res.json(visible.filter(Boolean))
    }),
  )

  // POST /api/projects/:projectId/conversations
  router.post(
    '/',
    asyncHandler(async (req: SessionRequest, res) => {
      const { title } = req.body
      const conv = await service.create(req.params.projectId, getUserId(req), title)
      res.status(201).json(conv)
    }),
  )

  // GET /api/projects/:projectId/conversations/:conversationId
  router.get(
    '/:conversationId',
    canView,
    asyncHandler(async (req: SessionRequest, res) => {
      const conv = await service.getById(req.params.conversationId)
      if (!conv) return void res.status(404).json({ error: 'Conversation not found' })

      const messages = await service.getMessages(req.params.conversationId)
      res.json({ ...conv, messages })
    }),
  )

  // PATCH /api/projects/:projectId/conversations/:conversationId
  router.patch(
    '/:conversationId',
    canEdit,
    asyncHandler(async (req: SessionRequest, res) => {
      const { title } = req.body
      const conv = await service.updateTitle(req.params.conversationId, title)
      if (!conv) return void res.status(404).json({ error: 'Conversation not found' })
      res.json(conv)
    }),
  )

  // DELETE /api/projects/:projectId/conversations/:conversationId
  router.delete(
    '/:conversationId',
    canEdit,
    asyncHandler(async (req: SessionRequest, res) => {
      const deleted = await service.remove(req.params.conversationId)
      if (!deleted) return void res.status(404).json({ error: 'Conversation not found' })
      res.json({ deleted: true })
    }),
  )

  return router
}
