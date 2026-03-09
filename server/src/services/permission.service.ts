import { eq, and } from 'drizzle-orm'
import { dashboardPermissions, groupMembers } from '../db/schema.js'
import type { Db } from '../db/index.js'

export type PermissionLevel = 'view' | 'edit'

export function createPermissionService(db: Db) {
  return {
    async listForDashboard(dashboardId: string) {
      return db.select().from(dashboardPermissions).where(eq(dashboardPermissions.dashboardId, dashboardId))
    },

    async setPermission(dashboardId: string, permission: PermissionLevel, userId?: string, groupId?: string) {
      if (!userId && !groupId) throw new Error('userId or groupId required')

      // Remove existing permission for this user/group on this dashboard
      const conditions = [eq(dashboardPermissions.dashboardId, dashboardId)]
      if (userId) conditions.push(eq(dashboardPermissions.userId, userId))
      if (groupId) conditions.push(eq(dashboardPermissions.groupId, groupId))
      await db.delete(dashboardPermissions).where(and(...conditions))

      // Insert new
      const rows = await db
        .insert(dashboardPermissions)
        .values({
          dashboardId,
          userId: userId || null,
          groupId: groupId || null,
          permission,
        })
        .returning()
      return rows[0]
    },

    async removePermission(id: string) {
      const rows = await db
        .delete(dashboardPermissions)
        .where(eq(dashboardPermissions.id, id))
        .returning({ id: dashboardPermissions.id })
      return rows.length > 0
    },

    async removeAllForDashboard(dashboardId: string) {
      await db.delete(dashboardPermissions).where(eq(dashboardPermissions.dashboardId, dashboardId))
    },

    async canAccess(dashboardId: string, userId: string, requiredLevel: PermissionLevel): Promise<boolean> {
      // Check if dashboard has any permissions set
      const allPerms = await db
        .select()
        .from(dashboardPermissions)
        .where(eq(dashboardPermissions.dashboardId, dashboardId))

      // No permissions set = open access (everyone with project access can view/edit)
      if (allPerms.length === 0) return true

      // Get user's group IDs
      const memberships = await db.select().from(groupMembers).where(eq(groupMembers.userId, userId))
      const userGroupIds = memberships.map((m) => m.groupId)

      // Find matching permissions for this user (direct or via groups)
      const matchingPerms = allPerms.filter((p) => {
        if (p.userId === userId) return true
        if (p.groupId && userGroupIds.includes(p.groupId)) return true
        return false
      })

      if (matchingPerms.length === 0) return false

      if (requiredLevel === 'view') return true
      // For 'edit', need at least one 'edit' permission
      return matchingPerms.some((p) => p.permission === 'edit')
    },
  }
}
