import type { Response } from 'express'

export function initializeSSE(res: Response): void {
  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
  }
}

export function writeSSEEvent(res: Response, event: string, data: unknown): void {
  if (res.writableEnded) return
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function startSSEHeartbeat(res: Response, intervalMs = 15_000): () => void {
  const timer = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n')
  }, intervalMs)

  return () => {
    clearInterval(timer)
  }
}

export function attachSSELifecycle(
  res: Response,
  opts: {
    label: string
    context?: string
    onClientClose?: () => void
  },
): void {
  res.once('close', () => {
    const context = opts.context ? ` ${opts.context}` : ''
    console.log(`${opts.label}: client disconnected${context}`)
    opts.onClientClose?.()
  })
}
