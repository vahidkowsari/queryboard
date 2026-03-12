import { Router } from 'express'
import supertokens from 'supertokens-node'
import Session from 'supertokens-node/recipe/session/index.js'
import UserRoles from 'supertokens-node/recipe/userroles/index.js'
import { asyncHandler } from '../middleware/error.js'
import { ROLES, type AppRole } from '../auth.js'
import type { Db } from '../db/index.js'
import { groups, groupMembers, projects } from '../db/schema.js'
import { eq, inArray, and } from 'drizzle-orm'

export function createAdminRoutes(db: Db): Router {
  const router = Router()

  router.get(
    '/users',
    asyncHandler(async (_req, res) => {
      const { users } = await supertokens.getUsersNewestFirst({ tenantId: 'public', limit: 500 })
      
      if (users.length === 0) {
        res.json([])
        return
      }
      
      const userIds = users.map((u) => u.id)
      
      // Batch fetch all group memberships for all users in a single query
      const allMemberships = await db
        .select({
          userId: groupMembers.userId,
          groupId: groups.id,
          groupName: groups.name,
          projectId: groups.projectId,
          projectName: projects.name,
        })
        .from(groupMembers)
        .innerJoin(groups, eq(groupMembers.groupId, groups.id))
        .innerJoin(projects, eq(groups.projectId, projects.id))
        .where(inArray(groupMembers.userId, userIds))
      
      // Build lookup map for O(1) access
      const userGroupsMap = new Map<string, Array<{ id: string; name: string; projectId: string; projectName: string }>>()
      for (const membership of allMemberships) {
        if (!userGroupsMap.has(membership.userId)) {
          userGroupsMap.set(membership.userId, [])
        }
        userGroupsMap.get(membership.userId)!.push({
          id: membership.groupId,
          name: membership.groupName,
          projectId: membership.projectId,
          projectName: membership.projectName,
        })
      }
      
      const result = await Promise.all(
        users.map(async (u) => {
          const rolesRes = await UserRoles.getRolesForUser('public', u.id)
          return {
            id: u.id,
            email: u.emails[0] ?? null,
            roles: rolesRes.status === 'OK' ? rolesRes.roles : [],
            groups: userGroupsMap.get(u.id) || [],
            createdAt: u.timeJoined,
          }
        }),
      )
      res.json(result)
    }),
  )

  router.put(
    '/users/:userId/role',
    asyncHandler(async (req, res) => {
      const { userId } = req.params
      const { role } = req.body as { role: string }
      const validRoles = Object.values(ROLES) as string[]
      if (!validRoles.includes(role)) {
        return void res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` })
      }

      // Remove existing roles, then assign the new one
      const existing = await UserRoles.getRolesForUser('public', userId)
      if (existing.status === 'OK') {
        for (const r of existing.roles) {
          await UserRoles.removeUserRole('public', userId, r)
        }
      }
      await UserRoles.addRoleToUser('public', userId, role as AppRole)

      // Revoke existing sessions so the user gets a new JWT with updated roles
      await Session.revokeAllSessionsForUser(userId)

      res.json({ userId, role })
    }),
  )

  router.get(
    '/groups',
    asyncHandler(async (_req, res) => {
      const allGroups = await db
        .select({
          id: groups.id,
          name: groups.name,
          projectId: groups.projectId,
          projectName: projects.name,
        })
        .from(groups)
        .innerJoin(projects, eq(groups.projectId, projects.id))
      
      res.json(allGroups)
    }),
  )

  router.post(
    '/users/:userId/groups/:groupId',
    asyncHandler(async (req, res) => {
      const { userId, groupId } = req.params
      
      await db
        .insert(groupMembers)
        .values({ groupId, userId })
        .onConflictDoNothing()
      
      res.json({ success: true })
    }),
  )

  router.delete(
    '/users/:userId/groups/:groupId',
    asyncHandler(async (req, res) => {
      const { userId, groupId } = req.params
      
      await db
        .delete(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      
      res.json({ success: true })
    }),
  )

  return router
}
