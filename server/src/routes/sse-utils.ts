import type { Response } from 'express'

export function initializeSSE(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
}

export function writeSSEEvent(res: Response, event: string, data: unknown): void {
  if (res.writableEnded) return
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function startSSEHeartbeat(res: Response, intervalMs = 15_000): () => void {
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n')
  }, intervalMs)
  return () => clearInterval(heartbeat)
}

export function attachSSELifecycle(
  res: Response,
  opts: {
    label: string
    context: string
    onClientClose: () => void
  }
): void {
  console.log(`${opts.label}: SSE stream started ${opts.context}`)
  res.once('close', () => {
    console.log(`${opts.label}: SSE stream closed by client ${opts.context}`)
    opts.onClientClose()
  })
  res.once('finish', () => {
    console.log(`${opts.label}: SSE stream finished ${opts.context}`)
  })
  res.on('error', (streamErr) => {
    console.error(`${opts.label}: SSE stream error ${opts.context}`, streamErr)
  })
}
