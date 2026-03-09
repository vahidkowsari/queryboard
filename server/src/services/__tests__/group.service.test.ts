import { describe, it, expect, vi } from 'vitest'
import { createGroupService } from '../group.service.js'

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}))

vi.mock('../../db/schema.js', () => ({
  groups: Symbol('groups'),
  groupMembers: Symbol('groupMembers'),
}))

// ---------------------------------------------------------------------------
// Mock DB — returns canned data in call order per operation type
// ---------------------------------------------------------------------------

function createMockDb(opts: {
  selectResults?: unknown[][]
  insertReturning?: unknown[][]
  updateReturning?: unknown[][]
  deleteReturning?: unknown[][]
} = {}) {
  const selectQueue = [...(opts.selectResults ?? [[]])]
  const insertQueue = [...(opts.insertReturning ?? [[]])]
  const updateQueue = [...(opts.updateReturning ?? [[]])]
  const deleteQueue = [...(opts.deleteReturning ?? [[]])]

  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => selectQueue.shift() ?? []),
      }),
    })),

    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => insertQueue.shift() ?? []),
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => insertQueue.shift() ?? []),
        }),
      }),
    })),

    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => updateQueue.shift() ?? []),
        }),
      }),
    })),

    delete: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockImplementation(() => deleteQueue.shift() ?? []),
      })),
    })),
  }
}

describe('group.service', () => {
  describe('list', () => {
    it('returns groups with their members', async () => {
      const group1 = { id: 'g1', projectId: 'proj-1', name: 'Team A', description: null }
      const member1 = { id: 'm1', groupId: 'g1', userId: 'u1' }
      const db = createMockDb({
        selectResults: [
          [group1],   // groups query
          [member1],  // members for g1
        ],
      })
      const svc = createGroupService(db as any)

      const result = await svc.list('proj-1')

      expect(result).toEqual([{ ...group1, members: [member1] }])
    })

    it('returns empty array when no groups exist', async () => {
      const db = createMockDb({ selectResults: [[]] })
      const svc = createGroupService(db as any)

      expect(await svc.list('proj-1')).toEqual([])
    })
  })

  describe('getById', () => {
    it('returns group with members when found', async () => {
      const group = { id: 'g1', projectId: 'proj-1', name: 'Team A', description: null }
      const member = { id: 'm1', groupId: 'g1', userId: 'u1' }
      const db = createMockDb({
        selectResults: [[group], [member]],
      })
      const svc = createGroupService(db as any)

      const result = await svc.getById('g1')

      expect(result).toEqual({ ...group, members: [member] })
    })

    it('returns null when group not found', async () => {
      const db = createMockDb({ selectResults: [[]] })
      const svc = createGroupService(db as any)

      expect(await svc.getById('nonexistent')).toBeNull()
    })
  })

  describe('create', () => {
    it('creates group and returns it with empty members', async () => {
      const created = { id: 'g1', projectId: 'proj-1', name: 'New Group', description: null }
      const db = createMockDb({ insertReturning: [[created]] })
      const svc = createGroupService(db as any)

      const result = await svc.create('proj-1', 'New Group')

      expect(result).toEqual({ ...created, members: [] })
    })

    it('passes description when provided', async () => {
      const created = { id: 'g1', projectId: 'proj-1', name: 'Team', description: 'A team' }
      const db = createMockDb({ insertReturning: [[created]] })
      const svc = createGroupService(db as any)

      const result = await svc.create('proj-1', 'Team', 'A team')

      expect(result.description).toBe('A team')
    })
  })

  describe('update', () => {
    it('returns updated group', async () => {
      const updated = { id: 'g1', projectId: 'proj-1', name: 'Renamed', description: null }
      const db = createMockDb({ updateReturning: [[updated]] })
      const svc = createGroupService(db as any)

      const result = await svc.update('g1', 'Renamed')

      expect(result).toEqual(updated)
    })

    it('returns null when group not found', async () => {
      const db = createMockDb({ updateReturning: [[]] })
      const svc = createGroupService(db as any)

      expect(await svc.update('nonexistent', 'Name')).toBeNull()
    })
  })

  describe('remove', () => {
    it('returns true when group is deleted', async () => {
      const db = createMockDb({ deleteReturning: [[{ id: 'g1' }]] })
      const svc = createGroupService(db as any)

      expect(await svc.remove('g1')).toBe(true)
    })

    it('returns false when group not found', async () => {
      const db = createMockDb({ deleteReturning: [[]] })
      const svc = createGroupService(db as any)

      expect(await svc.remove('nonexistent')).toBe(false)
    })
  })

  describe('addMember', () => {
    it('returns the new membership row', async () => {
      const membership = { id: 'm1', groupId: 'g1', userId: 'u1' }
      const db = createMockDb({ insertReturning: [[membership]] })
      const svc = createGroupService(db as any)

      const result = await svc.addMember('g1', 'u1')

      expect(result).toEqual(membership)
    })

    it('returns null on conflict (already a member)', async () => {
      const db = createMockDb({ insertReturning: [[]] })
      const svc = createGroupService(db as any)

      expect(await svc.addMember('g1', 'u1')).toBeNull()
    })
  })

  describe('removeMember', () => {
    it('returns true when member is removed', async () => {
      const db = createMockDb({ deleteReturning: [[{ id: 'm1' }]] })
      const svc = createGroupService(db as any)

      expect(await svc.removeMember('g1', 'u1')).toBe(true)
    })

    it('returns false when member not found', async () => {
      const db = createMockDb({ deleteReturning: [[]] })
      const svc = createGroupService(db as any)

      expect(await svc.removeMember('g1', 'u1')).toBe(false)
    })
  })

  describe('getGroupsForUser', () => {
    it('returns only groups the user belongs to', async () => {
      const groupA = { id: 'g1', projectId: 'proj-1', name: 'A', description: null }
      const groupB = { id: 'g2', projectId: 'proj-1', name: 'B', description: null }
      const membership = { id: 'm1', groupId: 'g1', userId: 'u1' }

      const db = createMockDb({
        selectResults: [
          [groupA, groupB],  // all groups in project
          [membership],      // user memberships (only in g1)
        ],
      })
      const svc = createGroupService(db as any)

      const result = await svc.getGroupsForUser('proj-1', 'u1')

      expect(result).toEqual([groupA])
    })

    it('returns empty when user is not in any group', async () => {
      const groupA = { id: 'g1', projectId: 'proj-1', name: 'A', description: null }
      const db = createMockDb({
        selectResults: [[groupA], []],
      })
      const svc = createGroupService(db as any)

      expect(await svc.getGroupsForUser('proj-1', 'u1')).toEqual([])
    })

    it('returns empty when project has no groups', async () => {
      const db = createMockDb({ selectResults: [[], []] })
      const svc = createGroupService(db as any)

      expect(await svc.getGroupsForUser('proj-1', 'u1')).toEqual([])
    })
  })
})
