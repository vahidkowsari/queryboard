import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireDashboardAccess } from '../dashboard-access.js'

// Mock the permission service module
const mockCanAccess = vi.fn()

vi.mock('../../services/permission.service.js', () => ({
  createPermissionService: () => ({
    canAccess: mockCanAccess,
  }),
}))

function createMockReq(overrides: {
  userId?: string | null
  roles?: string[]
  params?: Record<string, string>
} = {}) {
  const { userId = 'user-1', roles = [], params = {} } = overrides
  return {
    session: userId
      ? {
          getUserId: () => userId,
          getAccessTokenPayload: () => ({ roles }),
        }
      : undefined,
    params,
  }
}

function createMockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
}

describe('requireDashboardAccess middleware', () => {
  const fakeDb = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when no session exists', async () => {
    const middleware = requireDashboardAccess(fakeDb, 'view')
    const req = { params: { id: 'dash-1' } } // no session
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 400 when no dashboardId is present', async () => {
    const middleware = requireDashboardAccess(fakeDb, 'view')
    const req = createMockReq({ params: {} })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Dashboard ID required' })
    expect(next).not.toHaveBeenCalled()
  })

  it('bypasses permission check for admins', async () => {
    const middleware = requireDashboardAccess(fakeDb, 'edit')
    const req = createMockReq({ roles: ['admin'], params: { id: 'dash-1' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(next).toHaveBeenCalledOnce()
    expect(mockCanAccess).not.toHaveBeenCalled()
  })

  it('calls next() when permissionService.canAccess returns true', async () => {
    mockCanAccess.mockResolvedValue(true)
    const middleware = requireDashboardAccess(fakeDb, 'view')
    const req = createMockReq({ roles: ['viewer'], params: { id: 'dash-1' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(mockCanAccess).toHaveBeenCalledWith('dash-1', 'user-1', 'view')
    expect(next).toHaveBeenCalledOnce()
  })

  it('returns 403 when permissionService.canAccess returns false', async () => {
    mockCanAccess.mockResolvedValue(false)
    const middleware = requireDashboardAccess(fakeDb, 'edit')
    const req = createMockReq({ roles: ['viewer'], params: { id: 'dash-1' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(mockCanAccess).toHaveBeenCalledWith('dash-1', 'user-1', 'edit')
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: 'You do not have permission to access this dashboard',
    })
  })

  it('reads dashboardId from params.dashboardId fallback', async () => {
    mockCanAccess.mockResolvedValue(true)
    const middleware = requireDashboardAccess(fakeDb, 'view')
    const req = createMockReq({ roles: ['viewer'], params: { dashboardId: 'dash-99' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(mockCanAccess).toHaveBeenCalledWith('dash-99', 'user-1', 'view')
    expect(next).toHaveBeenCalledOnce()
  })

  it('prefers params.id over params.dashboardId', async () => {
    mockCanAccess.mockResolvedValue(true)
    const middleware = requireDashboardAccess(fakeDb, 'view')
    const req = createMockReq({
      roles: ['viewer'],
      params: { id: 'dash-primary', dashboardId: 'dash-fallback' },
    })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(mockCanAccess).toHaveBeenCalledWith('dash-primary', 'user-1', 'view')
  })

  it('admin bypass works with edit level too', async () => {
    const middleware = requireDashboardAccess(fakeDb, 'edit')
    const req = createMockReq({ roles: ['admin'], params: { dashboardId: 'dash-1' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(next).toHaveBeenCalledOnce()
    expect(mockCanAccess).not.toHaveBeenCalled()
  })
})
