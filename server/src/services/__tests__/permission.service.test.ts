import { describe, it, expect, vi } from 'vitest'
import { createPermissionService } from '../permission.service.js'

// ---------------------------------------------------------------------------
// Mock drizzle-orm and schema — these are module-level stubs so the service
// file can import them. The actual data is injected per-test via selectResults.
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}))

vi.mock('../../db/schema.js', () => ({
  dashboardPermissions: Symbol('dashboardPermissions'),
  groupMembers: Symbol('groupMembers'),
}))

// ---------------------------------------------------------------------------
// Mock DB factory — returns canned data in call order.
// canAccess makes two selects: first for dashboard perms, second for group
// memberships. We queue the responses so the real service logic runs against
// realistic data shapes.
// ---------------------------------------------------------------------------

interface PermRow {
  id: string
  dashboardId: string
  userId: string | null
  groupId: string | null
  permission: 'view' | 'edit'
}

interface MemberRow {
  id: string
  groupId: string
  userId: string
}

function createMockDb(opts: {
  selectResults?: unknown[][]
  deleteReturning?: unknown[][]
  insertReturning?: unknown[][]
} = {}) {
  const selectQueue = [...(opts.selectResults ?? [[]])]
  const deleteQueue = [...(opts.deleteReturning ?? [[]])]
  const insertQueue = [...(opts.insertReturning ?? [[]])]

  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => selectQueue.shift() ?? []),
      }),
    })),

    delete: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockImplementation(() => deleteQueue.shift() ?? []),
      })),
    })),

    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => insertQueue.shift() ?? []),
      }),
    })),

    // Run the callback with the same mock as the transaction handle (tx),
    // so delete/insert inside the transaction draw from the same queues.
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(db)),
  }

  return db
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('permission.service', () => {
  describe('canAccess', () => {
    it('returns true when no permissions are set (open access)', async () => {
      const db = createMockDb({ selectResults: [[], []] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'view')).toBe(true)
    })

    it('returns true for edit when no permissions are set (open access)', async () => {
      const db = createMockDb({ selectResults: [[], []] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'edit')).toBe(true)
    })

    it('grants view when user has direct view permission', async () => {
      const perms: PermRow[] = [
        { id: 'p1', dashboardId: 'dash-1', userId: 'user-1', groupId: null, permission: 'view' },
      ]
      const db = createMockDb({ selectResults: [perms, []] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'view')).toBe(true)
    })

    it('denies edit when user only has view permission', async () => {
      const perms: PermRow[] = [
        { id: 'p1', dashboardId: 'dash-1', userId: 'user-1', groupId: null, permission: 'view' },
      ]
      const db = createMockDb({ selectResults: [perms, []] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'edit')).toBe(false)
    })

    it('grants edit when user has direct edit permission', async () => {
      const perms: PermRow[] = [
        { id: 'p1', dashboardId: 'dash-1', userId: 'user-1', groupId: null, permission: 'edit' },
      ]
      const db = createMockDb({ selectResults: [perms, []] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'edit')).toBe(true)
    })

    it('denies access when permissions exist but none match the user', async () => {
      const perms: PermRow[] = [
        { id: 'p1', dashboardId: 'dash-1', userId: 'other-user', groupId: null, permission: 'edit' },
      ]
      const db = createMockDb({ selectResults: [perms, []] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'view')).toBe(false)
    })

    it('grants view via group membership', async () => {
      const perms: PermRow[] = [
        { id: 'p1', dashboardId: 'dash-1', userId: null, groupId: 'group-1', permission: 'view' },
      ]
      const members: MemberRow[] = [
        { id: 'm1', groupId: 'group-1', userId: 'user-1' },
      ]
      const db = createMockDb({ selectResults: [perms, members] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'view')).toBe(true)
    })

    it('grants edit via group membership with edit permission', async () => {
      const perms: PermRow[] = [
        { id: 'p1', dashboardId: 'dash-1', userId: null, groupId: 'group-1', permission: 'edit' },
      ]
      const members: MemberRow[] = [
        { id: 'm1', groupId: 'group-1', userId: 'user-1' },
      ]
      const db = createMockDb({ selectResults: [perms, members] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'edit')).toBe(true)
    })

    it('denies edit when group only has view permission', async () => {
      const perms: PermRow[] = [
        { id: 'p1', dashboardId: 'dash-1', userId: null, groupId: 'group-1', permission: 'view' },
      ]
      const members: MemberRow[] = [
        { id: 'm1', groupId: 'group-1', userId: 'user-1' },
      ]
      const db = createMockDb({ selectResults: [perms, members] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'edit')).toBe(false)
    })

    it('denies access when user is in a different group', async () => {
      const perms: PermRow[] = [
        { id: 'p1', dashboardId: 'dash-1', userId: null, groupId: 'group-1', permission: 'edit' },
      ]
      const members: MemberRow[] = [
        { id: 'm1', groupId: 'group-OTHER', userId: 'user-1' },
      ]
      const db = createMockDb({ selectResults: [perms, members] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'view')).toBe(false)
    })

    it('grants edit when user has view directly + edit via group', async () => {
      const perms: PermRow[] = [
        { id: 'p1', dashboardId: 'dash-1', userId: 'user-1', groupId: null, permission: 'view' },
        { id: 'p2', dashboardId: 'dash-1', userId: null, groupId: 'group-1', permission: 'edit' },
      ]
      const members: MemberRow[] = [
        { id: 'm1', groupId: 'group-1', userId: 'user-1' },
      ]
      const db = createMockDb({ selectResults: [perms, members] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'edit')).toBe(true)
    })

    it('denies access when user has no direct or group permission', async () => {
      const perms: PermRow[] = [
        { id: 'p1', dashboardId: 'dash-1', userId: 'other', groupId: null, permission: 'edit' },
        { id: 'p2', dashboardId: 'dash-1', userId: null, groupId: 'group-1', permission: 'edit' },
      ]
      const members: MemberRow[] = [] // user-1 is in no groups
      const db = createMockDb({ selectResults: [perms, members] })
      const svc = createPermissionService(db as any)

      expect(await svc.canAccess('dash-1', 'user-1', 'view')).toBe(false)
    })
  })

  describe('setPermission', () => {
    it('throws when neither userId nor groupId is provided', async () => {
      const db = createMockDb()
      const svc = createPermissionService(db as any)

      await expect(svc.setPermission('dash-1', 'view')).rejects.toThrow(
        'userId or groupId required',
      )
    })

    it('deletes existing then inserts new permission for a user', async () => {
      const inserted: PermRow = {
        id: 'new-id', dashboardId: 'dash-1', userId: 'user-1', groupId: null, permission: 'edit',
      }
      const db = createMockDb({
        deleteReturning: [[]],
        insertReturning: [[inserted]],
      })
      const svc = createPermissionService(db as any)

      const result = await svc.setPermission('dash-1', 'edit', 'user-1')

      expect(result).toEqual(inserted)
      expect(db.delete).toHaveBeenCalled()
      expect(db.insert).toHaveBeenCalled()
    })

    it('deletes existing then inserts new permission for a group', async () => {
      const inserted: PermRow = {
        id: 'new-id', dashboardId: 'dash-1', userId: null, groupId: 'group-1', permission: 'view',
      }
      const db = createMockDb({
        deleteReturning: [[]],
        insertReturning: [[inserted]],
      })
      const svc = createPermissionService(db as any)

      const result = await svc.setPermission('dash-1', 'view', undefined, 'group-1')

      expect(result).toEqual(inserted)
    })
  })

  describe('removePermission', () => {
    it('returns true when a matching row is deleted', async () => {
      const db = createMockDb({ deleteReturning: [[{ id: 'p1' }]] })
      const svc = createPermissionService(db as any)

      expect(await svc.removePermission('p1')).toBe(true)
    })

    it('returns false when no row matches', async () => {
      const db = createMockDb({ deleteReturning: [[]] })
      const svc = createPermissionService(db as any)

      expect(await svc.removePermission('nonexistent')).toBe(false)
    })
  })

  describe('listForDashboard', () => {
    it('returns all permissions for a dashboard', async () => {
      const perms: PermRow[] = [
        { id: 'p1', dashboardId: 'dash-1', userId: 'u1', groupId: null, permission: 'view' },
        { id: 'p2', dashboardId: 'dash-1', userId: null, groupId: 'g1', permission: 'edit' },
      ]
      const db = createMockDb({ selectResults: [perms] })
      const svc = createPermissionService(db as any)

      const result = await svc.listForDashboard('dash-1')
      expect(result).toEqual(perms)
      expect(result).toHaveLength(2)
    })

    it('returns empty array when none exist', async () => {
      const db = createMockDb({ selectResults: [[]] })
      const svc = createPermissionService(db as any)

      expect(await svc.listForDashboard('dash-1')).toEqual([])
    })
  })

  describe('removeAllForDashboard', () => {
    it('issues a delete call', async () => {
      const db = createMockDb()
      const svc = createPermissionService(db as any)

      await svc.removeAllForDashboard('dash-1')
      expect(db.delete).toHaveBeenCalled()
    })
  })
})
