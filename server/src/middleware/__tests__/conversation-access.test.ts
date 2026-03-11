import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireConversationAccess } from '../conversation-access.js'

// Mock the permission service module
const mockCanAccessConversation = vi.fn()

vi.mock('../../services/permission.service.js', () => ({
  createPermissionService: () => ({
    canAccessConversation: mockCanAccessConversation,
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

describe('requireConversationAccess middleware', () => {
  const fakeDb = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when no session exists', async () => {
    const middleware = requireConversationAccess(fakeDb, 'view')
    const req = { params: { conversationId: 'conv-1' } } // no session
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 400 when no conversationId is present', async () => {
    const middleware = requireConversationAccess(fakeDb, 'view')
    const req = createMockReq({ params: {} })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Conversation ID required' })
    expect(next).not.toHaveBeenCalled()
  })

  it('bypasses permission check for admins', async () => {
    const middleware = requireConversationAccess(fakeDb, 'edit')
    const req = createMockReq({ roles: ['admin'], params: { conversationId: 'conv-1' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(next).toHaveBeenCalledOnce()
    expect(mockCanAccessConversation).not.toHaveBeenCalled()
  })

  it('bypasses permission check for editors with view level', async () => {
    const middleware = requireConversationAccess(fakeDb, 'view')
    const req = createMockReq({ roles: ['editor'], params: { conversationId: 'conv-1' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(next).toHaveBeenCalledOnce()
    expect(mockCanAccessConversation).not.toHaveBeenCalled()
  })

  it('checks permissions for editors with edit level', async () => {
    mockCanAccessConversation.mockResolvedValue(true)
    const middleware = requireConversationAccess(fakeDb, 'edit')
    const req = createMockReq({ roles: ['editor'], params: { conversationId: 'conv-1' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(mockCanAccessConversation).toHaveBeenCalledWith('conv-1', 'user-1', 'edit')
    expect(next).toHaveBeenCalledOnce()
  })

  it('calls next() when permissionService.canAccessConversation returns true', async () => {
    mockCanAccessConversation.mockResolvedValue(true)
    const middleware = requireConversationAccess(fakeDb, 'view')
    const req = createMockReq({ roles: ['viewer'], params: { conversationId: 'conv-1' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(mockCanAccessConversation).toHaveBeenCalledWith('conv-1', 'user-1', 'view')
    expect(next).toHaveBeenCalledOnce()
  })

  it('returns 403 when permissionService.canAccessConversation returns false', async () => {
    mockCanAccessConversation.mockResolvedValue(false)
    const middleware = requireConversationAccess(fakeDb, 'edit')
    const req = createMockReq({ roles: ['viewer'], params: { conversationId: 'conv-1' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(mockCanAccessConversation).toHaveBeenCalledWith('conv-1', 'user-1', 'edit')
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: 'You do not have permission to access this conversation',
    })
  })

  it('reads conversationId from params.conversationId', async () => {
    mockCanAccessConversation.mockResolvedValue(true)
    const middleware = requireConversationAccess(fakeDb, 'view')
    const req = createMockReq({ roles: ['viewer'], params: { conversationId: 'conv-99' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(mockCanAccessConversation).toHaveBeenCalledWith('conv-99', 'user-1', 'view')
    expect(next).toHaveBeenCalledOnce()
  })

  it('reads conversationId from params.id fallback', async () => {
    mockCanAccessConversation.mockResolvedValue(true)
    const middleware = requireConversationAccess(fakeDb, 'view')
    const req = createMockReq({ roles: ['viewer'], params: { id: 'conv-88' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(mockCanAccessConversation).toHaveBeenCalledWith('conv-88', 'user-1', 'view')
    expect(next).toHaveBeenCalledOnce()
  })

  it('prefers params.id over params.conversationId', async () => {
    mockCanAccessConversation.mockResolvedValue(true)
    const middleware = requireConversationAccess(fakeDb, 'view')
    const req = createMockReq({
      roles: ['viewer'],
      params: { id: 'conv-primary', conversationId: 'conv-fallback' },
    })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(mockCanAccessConversation).toHaveBeenCalledWith('conv-primary', 'user-1', 'view')
  })

  it('viewer without permissions cannot access', async () => {
    mockCanAccessConversation.mockResolvedValue(false)
    const middleware = requireConversationAccess(fakeDb, 'view')
    const req = createMockReq({ roles: ['viewer'], params: { conversationId: 'conv-1' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('admin bypass works with edit level too', async () => {
    const middleware = requireConversationAccess(fakeDb, 'edit')
    const req = createMockReq({ roles: ['admin'], params: { conversationId: 'conv-1' } })
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as any, res as any, next)

    expect(next).toHaveBeenCalledOnce()
    expect(mockCanAccessConversation).not.toHaveBeenCalled()
  })
})
