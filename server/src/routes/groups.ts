import { Router } from 'express'
import { createGroupService } from '../services/group.service.js'
import { asyncHandler } from '../middleware/error.js'
import { requireRole } from '../middleware/roles.js'
import { ROLES } from '../auth.js'
import type { Db } from '../db/index.js'

export function createGroupRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const groupService = createGroupService(db)

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { projectId } = req.params
      const groups = await groupService.list(projectId)
      res.json(groups)
    }),
  )

  router.post(
    '/',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const { projectId } = req.params
      const { name, description } = req.body
      if (!name?.trim()) return void res.status(400).json({ error: 'Name is required' })
      const group = await groupService.create(projectId, name, description)
      res.status(201).json(group)
    }),
  )

  router.put(
    '/:groupId',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const { name, description } = req.body
      if (!name?.trim()) return void res.status(400).json({ error: 'Name is required' })
      const group = await groupService.update(req.params.groupId, name, description)
      if (!group) return void res.status(404).json({ error: 'Group not found' })
      res.json(group)
    }),
  )

  router.delete(
    '/:groupId',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const deleted = await groupService.remove(req.params.groupId)
      if (!deleted) return void res.status(404).json({ error: 'Group not found' })
      res.json({ deleted: true })
    }),
  )

  router.post(
    '/:groupId/members',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const { userId } = req.body
      if (!userId) return void res.status(400).json({ error: 'userId is required' })
      const member = await groupService.addMember(req.params.groupId, userId)
      res.status(201).json(member || { message: 'Already a member' })
    }),
  )

  router.delete(
    '/:groupId/members/:userId',
    requireRole(ROLES.ADMIN),
    asyncHandler(async (req, res) => {
      const removed = await groupService.removeMember(req.params.groupId, req.params.userId)
      if (!removed) return void res.status(404).json({ error: 'Member not found' })
      res.json({ deleted: true })
    }),
  )

  return router
}
