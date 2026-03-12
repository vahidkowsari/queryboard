import type { Request, Response, NextFunction } from 'express'

/**
 * Global error handler middleware that logs errors and returns 500 responses
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error(`[Error] ${err.message}`)
  res.status(500).json({ error: err.message })
}

/**
 * Wraps async route handlers to catch promise rejections and pass them to error middleware
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}
