import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sseSessionManager } from '../sse-session.service.js'

describe('sse-session.service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('persists conversationId when creating an ask session', async () => {
    const now = new Date('2026-03-28T00:00:00.000Z')
    const returningRow = {
      id: 'sess-1',
      type: 'ask',
      projectId: 'proj-1',
      userId: 'user-1',
      dashboardId: null,
      chartId: null,
      conversationId: 'conv-1',
      status: 'running',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      expiresAt: null,
    }

    const returning = vi.fn().mockResolvedValue([returningRow])
    const values = vi.fn().mockReturnValue({ returning })
    const insert = vi.fn().mockReturnValue({ values })

    sseSessionManager.initialize({ insert } as any)

    const session = await sseSessionManager.create('ask', 'proj-1', 'user-1', {
      conversationId: 'conv-1',
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ask',
        projectId: 'proj-1',
        userId: 'user-1',
        conversationId: 'conv-1',
      }),
    )
    expect(session.conversationId).toBe('conv-1')
  })

  it('logs persistence error when addEvent insert fails', async () => {
    const dbErr = new Error('insert failed')
    const values = vi.fn().mockRejectedValue(dbErr)
    const insert = vi.fn().mockReturnValue({ values })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    sseSessionManager.initialize({ insert } as any)

    expect(() => sseSessionManager.addEvent('sess-err', 'step', { step: 'x' })).not.toThrow()

    await Promise.resolve()

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('SSESession: failed to persist event session=sess-err event=step'),
      dbErr,
    )
  })
})
