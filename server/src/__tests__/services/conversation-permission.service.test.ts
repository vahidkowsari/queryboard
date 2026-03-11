import { describe, it, expect, beforeEach } from 'vitest'
import { createPermissionService } from '../../services/permission.service.js'
import { createConversationService } from '../../services/conversation.service.js'
import { setupTestDb, clearAllTables } from '../helpers/test-db.js'
import * as schema from '../../db/schema.js'
import type { Db } from '../../db/index.js'

describe('ConversationPermissionService', () => {
  let db: Db
  let permissionService: ReturnType<typeof createPermissionService>
  let conversationService: ReturnType<typeof createConversationService>

  const testProjectId = '00000000-0000-0000-0000-000000000001'
  const userId1 = 'user-1'
  const userId2 = 'user-2'
  const userId3 = 'user-3'

  beforeEach(async () => {
    db = await setupTestDb()
    await clearAllTables(db)
    permissionService = createPermissionService(db)
    conversationService = createConversationService(db)
    
    // Create test project
    await db.insert(schema.projects).values({
      id: testProjectId,
      name: 'Test Project',
      dbEngine: 'athena',
      dbConfig: {},
    })
  })

  describe('canAccessConversation', () => {
    it('returns true when no permissions are set (open access)', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      const allowed = await permissionService.canAccessConversation(conv.id, userId2, 'view')
      expect(allowed).toBe(true)
    })

    it('returns true when user has direct view permission', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      await permissionService.setConversationPermission(conv.id, 'view', userId2)

      const allowed = await permissionService.canAccessConversation(conv.id, userId2, 'view')
      expect(allowed).toBe(true)
    })

    it('returns true when user has direct edit permission and requests view', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      await permissionService.setConversationPermission(conv.id, 'edit', userId2)

      const allowed = await permissionService.canAccessConversation(conv.id, userId2, 'view')
      expect(allowed).toBe(true)
    })

    it('returns true when user has direct edit permission and requests edit', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      await permissionService.setConversationPermission(conv.id, 'edit', userId2)

      const allowed = await permissionService.canAccessConversation(conv.id, userId2, 'edit')
      expect(allowed).toBe(true)
    })

    it('returns false when user has view permission but requests edit', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      await permissionService.setConversationPermission(conv.id, 'view', userId2)

      const allowed = await permissionService.canAccessConversation(conv.id, userId2, 'edit')
      expect(allowed).toBe(false)
    })

    it('returns false when user has no permission and permissions exist', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      await permissionService.setConversationPermission(conv.id, 'view', userId2)

      const allowed = await permissionService.canAccessConversation(conv.id, userId3, 'view')
      expect(allowed).toBe(false)
    })

    it('returns true when user is in group with view permission', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      
      // Create a group and add user2 to it
      const group = await db.insert(schema.groups).values({
        projectId: testProjectId,
        name: 'Test Group',
      }).returning()
      
      await db.insert(schema.groupMembers).values({
        groupId: group[0].id,
        userId: userId2,
      })

      await permissionService.setConversationPermission(conv.id, 'view', undefined, group[0].id)

      const allowed = await permissionService.canAccessConversation(conv.id, userId2, 'view')
      expect(allowed).toBe(true)
    })

    it('returns true when user is in group with edit permission', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      
      const group = await db.insert(schema.groups).values({
        projectId: testProjectId,
        name: 'Test Group',
      }).returning()
      
      await db.insert(schema.groupMembers).values({
        groupId: group[0].id,
        userId: userId2,
      })

      await permissionService.setConversationPermission(conv.id, 'edit', undefined, group[0].id)

      const allowed = await permissionService.canAccessConversation(conv.id, userId2, 'edit')
      expect(allowed).toBe(true)
    })

    it('returns false when user is in group with view permission but requests edit', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      
      const group = await db.insert(schema.groups).values({
        projectId: testProjectId,
        name: 'Test Group',
      }).returning()
      
      await db.insert(schema.groupMembers).values({
        groupId: group[0].id,
        userId: userId2,
      })

      await permissionService.setConversationPermission(conv.id, 'view', undefined, group[0].id)

      const allowed = await permissionService.canAccessConversation(conv.id, userId2, 'edit')
      expect(allowed).toBe(false)
    })

    it('returns false when user is not in the group with permission', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      
      const group = await db.insert(schema.groups).values({
        projectId: testProjectId,
        name: 'Test Group',
      }).returning()
      
      await db.insert(schema.groupMembers).values({
        groupId: group[0].id,
        userId: userId2,
      })

      await permissionService.setConversationPermission(conv.id, 'view', undefined, group[0].id)

      const allowed = await permissionService.canAccessConversation(conv.id, userId3, 'view')
      expect(allowed).toBe(false)
    })
  })

  describe('setConversationPermission', () => {
    it('creates permission for user', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      const perm = await permissionService.setConversationPermission(conv.id, 'view', userId2)

      expect(perm.conversationId).toBe(conv.id)
      expect(perm.userId).toBe(userId2)
      expect(perm.groupId).toBeNull()
      expect(perm.permission).toBe('view')
    })

    it('creates permission for group', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      
      const group = await db.insert(schema.groups).values({
        projectId: testProjectId,
        name: 'Test Group',
      }).returning()

      const perm = await permissionService.setConversationPermission(conv.id, 'edit', undefined, group[0].id)

      expect(perm.conversationId).toBe(conv.id)
      expect(perm.userId).toBeNull()
      expect(perm.groupId).toBe(group[0].id)
      expect(perm.permission).toBe('edit')
    })

    it('replaces existing permission for same user', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      await permissionService.setConversationPermission(conv.id, 'view', userId2)
      await permissionService.setConversationPermission(conv.id, 'edit', userId2)

      const perms = await permissionService.listForConversation(conv.id)
      expect(perms).toHaveLength(1)
      expect(perms[0].permission).toBe('edit')
    })

    it('replaces existing permission for same group', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      
      const group = await db.insert(schema.groups).values({
        projectId: testProjectId,
        name: 'Test Group',
      }).returning()

      await permissionService.setConversationPermission(conv.id, 'view', undefined, group[0].id)
      await permissionService.setConversationPermission(conv.id, 'edit', undefined, group[0].id)

      const perms = await permissionService.listForConversation(conv.id)
      expect(perms).toHaveLength(1)
      expect(perms[0].permission).toBe('edit')
    })

    it('throws error when neither userId nor groupId provided', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      
      await expect(
        permissionService.setConversationPermission(conv.id, 'view')
      ).rejects.toThrow('userId or groupId required')
    })

    it('throws error when both userId and groupId provided', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      
      const group = await db.insert(schema.groups).values({
        projectId: testProjectId,
        name: 'Test Group',
      }).returning()

      await expect(
        permissionService.setConversationPermission(conv.id, 'view', userId2, group[0].id)
      ).rejects.toThrow('Cannot specify both userId and groupId')
    })
  })

  describe('listForConversation', () => {
    it('returns empty array when no permissions set', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      const perms = await permissionService.listForConversation(conv.id)
      expect(perms).toEqual([])
    })

    it('returns all permissions for conversation', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      await permissionService.setConversationPermission(conv.id, 'view', userId2)
      await permissionService.setConversationPermission(conv.id, 'edit', userId3)

      const perms = await permissionService.listForConversation(conv.id)
      expect(perms).toHaveLength(2)
    })
  })

  describe('removeConversationPermission', () => {
    it('removes permission by id', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      const perm = await permissionService.setConversationPermission(conv.id, 'view', userId2)

      const deleted = await permissionService.removeConversationPermission(perm.id)
      expect(deleted).toBe(true)

      const perms = await permissionService.listForConversation(conv.id)
      expect(perms).toHaveLength(0)
    })

    it('returns false when permission not found', async () => {
      const deleted = await permissionService.removeConversationPermission('00000000-0000-0000-0000-000000000000')
      expect(deleted).toBe(false)
    })
  })

  describe('removeAllForConversation', () => {
    it('removes all permissions for conversation', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      await permissionService.setConversationPermission(conv.id, 'view', userId2)
      await permissionService.setConversationPermission(conv.id, 'edit', userId3)

      await permissionService.removeAllForConversation(conv.id)

      const perms = await permissionService.listForConversation(conv.id)
      expect(perms).toHaveLength(0)
    })

    it('does nothing when no permissions exist', async () => {
      const conv = await conversationService.create(testProjectId, userId1, 'Test')
      await permissionService.removeAllForConversation(conv.id)

      const perms = await permissionService.listForConversation(conv.id)
      expect(perms).toHaveLength(0)
    })
  })
})
