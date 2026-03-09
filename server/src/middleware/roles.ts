import { Response, NextFunction } from 'express'
import type { SessionRequest } from 'supertokens-node/framework/express/index.js'
import type { AppRole } from '../auth.js'

export function requireRole(...allowed: AppRole[]) {
  return (req: SessionRequest, res: Response, next: NextFunction) => {
    const roles: string[] = req.session?.getAccessTokenPayload()?.roles ?? []
    if (allowed.some((r) => roles.includes(r))) return next()
    res.status(403).json({ error: 'Insufficient permissions' })
  }
}
