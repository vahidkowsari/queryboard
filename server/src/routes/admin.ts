import { Router } from 'express'
import supertokens from 'supertokens-node'
import Session from 'supertokens-node/recipe/session/index.js'
import UserRoles from 'supertokens-node/recipe/userroles/index.js'
import { asyncHandler } from '../middleware/error.js'
import { ROLES, type AppRole } from '../auth.js'

export function createAdminRoutes(): Router {
  const router = Router()

  router.get(
    '/users',
    asyncHandler(async (_req, res) => {
      const { users } = await supertokens.getUsersNewestFirst({ tenantId: 'public', limit: 500 })
      const result = await Promise.all(
        users.map(async (u) => {
          const rolesRes = await UserRoles.getRolesForUser('public', u.id)
          return {
            id: u.id,
            email: u.emails[0] ?? null,
            roles: rolesRes.status === 'OK' ? rolesRes.roles : [],
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

  return router
}
