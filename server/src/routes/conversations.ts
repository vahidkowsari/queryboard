import { Router } from 'express'
import type { SessionRequest } from 'supertokens-node/framework/express/index.js'
import { asyncHandler } from '../middleware/error.js'
import { createConversationService } from '../services/conversation.service.js'
import type { Db } from '../db/index.js'

export function createConversationRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const service = createConversationService(db)

  function getUserId(req: SessionRequest): string {
    return req.session!.getUserId()
  }

  // GET /api/projects/:projectId/conversations
  router.get(
    '/',
    asyncHandler(async (req: SessionRequest, res) => {
      const list = await service.listByProject(req.params.projectId, getUserId(req))
      res.json(list)
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
    asyncHandler(async (req: SessionRequest, res) => {
      const conv = await service.getById(req.params.conversationId, getUserId(req))
      if (!conv) return void res.status(404).json({ error: 'Conversation not found' })
      const messages = await service.getMessages(conv.id)
      res.json({ ...conv, messages })
    }),
  )

  // PATCH /api/projects/:projectId/conversations/:conversationId
  router.patch(
    '/:conversationId',
    asyncHandler(async (req: SessionRequest, res) => {
      const { title } = req.body
      const conv = await service.updateTitle(req.params.conversationId, getUserId(req), title)
      if (!conv) return void res.status(404).json({ error: 'Conversation not found' })
      res.json(conv)
    }),
  )

  // DELETE /api/projects/:projectId/conversations/:conversationId
  router.delete(
    '/:conversationId',
    asyncHandler(async (req: SessionRequest, res) => {
      const deleted = await service.remove(req.params.conversationId, getUserId(req))
      if (!deleted) return void res.status(404).json({ error: 'Conversation not found' })
      res.json({ deleted: true })
    }),
  )

  return router
}
