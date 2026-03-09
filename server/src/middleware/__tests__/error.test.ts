import { describe, it, expect, vi } from 'vitest'
import { errorHandler, asyncHandler } from '../error.js'

describe('errorHandler', () => {
  it('returns 500 with error message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('Something broke')
    const req = {} as any
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    const next = vi.fn()

    errorHandler(err, req, res as any, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Something broke' })
  })

  it('logs the error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('logged error')
    const req = {} as any
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    const next = vi.fn()

    errorHandler(err, req, res as any, next)

    expect(consoleSpy).toHaveBeenCalledWith('[Error] logged error')
    consoleSpy.mockRestore()
  })
})

describe('asyncHandler', () => {
  it('calls the wrapped async function', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const handler = asyncHandler(fn)
    const req = {} as any
    const res = {} as any
    const next = vi.fn()

    handler(req, res, next)

    // Allow microtask to resolve
    await new Promise((r) => setTimeout(r, 0))
    expect(fn).toHaveBeenCalledWith(req, res, next)
  })

  it('calls next with error when async function throws', async () => {
    const error = new Error('async failure')
    const fn = vi.fn().mockRejectedValue(error)
    const handler = asyncHandler(fn)
    const req = {} as any
    const res = {} as any
    const next = vi.fn()

    handler(req, res, next)

    await new Promise((r) => setTimeout(r, 0))
    expect(next).toHaveBeenCalledWith(error)
  })

  it('does not call next on success', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const handler = asyncHandler(fn)
    const req = {} as any
    const res = {} as any
    const next = vi.fn()

    handler(req, res, next)

    await new Promise((r) => setTimeout(r, 0))
    expect(next).not.toHaveBeenCalled()
  })
})
