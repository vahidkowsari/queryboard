import { describe, it, expect, vi } from 'vitest'
import { requireRole } from '../roles.js'

function createMockReqResNext(roles: string[]) {
  const req = {
    session: {
      getAccessTokenPayload: () => ({ roles }),
    },
  }
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  const next = vi.fn()
  return { req, res, next }
}

describe('requireRole middleware', () => {
  it('calls next() when user has an allowed role', () => {
    const { req, res, next } = createMockReqResNext(['admin'])
    const middleware = requireRole('admin')

    middleware(req as any, res as any, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('calls next() when user has one of multiple allowed roles', () => {
    const { req, res, next } = createMockReqResNext(['editor'])
    const middleware = requireRole('admin', 'editor')

    middleware(req as any, res as any, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('returns 403 when user has no matching role', () => {
    const { req, res, next } = createMockReqResNext(['viewer'])
    const middleware = requireRole('admin')

    middleware(req as any, res as any, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' })
  })

  it('returns 403 when user has no roles at all', () => {
    const { req, res, next } = createMockReqResNext([])
    const middleware = requireRole('admin')

    middleware(req as any, res as any, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 403 when session has no access token payload', () => {
    const req = { session: { getAccessTokenPayload: () => ({}) } }
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    const next = vi.fn()

    const middleware = requireRole('admin')
    middleware(req as any, res as any, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 403 when session is undefined', () => {
    const req = {} // no session at all
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    const next = vi.fn()

    const middleware = requireRole('admin')
    middleware(req as any, res as any, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('allows access when multiple roles match', () => {
    const { req, res, next } = createMockReqResNext(['admin', 'editor'])
    const middleware = requireRole('editor')

    middleware(req as any, res as any, next)

    expect(next).toHaveBeenCalledOnce()
  })
})
