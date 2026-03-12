import { eq, and } from 'drizzle-orm'
import { groups, groupMembers } from '../db/schema.js'
import type { Db } from '../db/index.js'

export function createGroupService(db: Db) {
  return {
    /**
     * Fetches all groups for a project with their members
     */
    async list(projectId: string) {
      const rows = await db.select().from(groups).where(eq(groups.projectId, projectId))
      const result = await Promise.all(
        rows.map(async (g) => {
          const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, g.id))
          return { ...g, members }
        }),
      )
      return result
    },

    /**
     * Fetches a specific group with its members
     */
    async getById(id: string) {
      const rows = await db.select().from(groups).where(eq(groups.id, id))
      if (!rows.length) return null
      const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id))
      return { ...rows[0], members }
    },

    /**
     * Creates a new group in a project
     */
    async create(projectId: string, name: string, description?: string) {
      const rows = await db
        .insert(groups)
        .values({ projectId, name, description: description || null })
        .returning()
      return { ...rows[0], members: [] }
    },

    /**
     * Updates group name and description
     */
    async update(id: string, name: string, description?: string) {
      const rows = await db
        .update(groups)
        .set({ name, description: description || null })
        .where(eq(groups.id, id))
        .returning()
      return rows[0] || null
    },

    /**
     * Deletes a group and all its memberships
     */
    async remove(id: string) {
      const rows = await db.delete(groups).where(eq(groups.id, id)).returning({ id: groups.id })
      return rows.length > 0
    },

    /**
     * Adds a user to a group (idempotent)
     */
    async addMember(groupId: string, userId: string) {
      const rows = await db
        .insert(groupMembers)
        .values({ groupId, userId })
        .onConflictDoNothing()
        .returning()
      return rows[0] || null
    },

    /**
     * Removes a user from a group
     */
    async removeMember(groupId: string, userId: string) {
      const rows = await db
        .delete(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .returning({ id: groupMembers.id })
      return rows.length > 0
    },

    /**
     * Fetches all groups that a user belongs to in a project
     */
    async getGroupsForUser(projectId: string, userId: string) {
      const allGroups = await db.select().from(groups).where(eq(groups.projectId, projectId))
      const userMemberships = await db.select().from(groupMembers).where(eq(groupMembers.userId, userId))
      const memberGroupIds = new Set(userMemberships.map((m) => m.groupId))
      return allGroups.filter((g) => memberGroupIds.has(g.id))
    },
  }
}
