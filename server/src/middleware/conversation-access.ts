import { Response, NextFunction } from 'express'
import type { SessionRequest } from 'supertokens-node/framework/express/index.js'
import { createPermissionService, type PermissionLevel } from '../services/permission.service.js'
import type { Db } from '../db/index.js'

export function requireConversationAccess(db: Db, level: PermissionLevel) {
  const permissionService = createPermissionService(db)

  return async (req: SessionRequest, res: Response, next: NextFunction) => {
    const userId = req.session?.getUserId()
    if (!userId) return void res.status(401).json({ error: 'Unauthorized' })

    const conversationId = req.params.id || req.params.conversationId
    if (!conversationId) return void res.status(400).json({ error: 'Conversation ID required' })

    // Admins bypass conversation-level permission checks
    const roles: string[] = req.session?.getAccessTokenPayload()?.roles ?? []
    if (roles.includes('admin')) return next()

    // Editors can always view any conversation; for edit, check conversation permission
    if (roles.includes('editor') && level === 'view') return next()

    // Editors needing edit, or viewers needing any access, must be explicitly granted
    const allowed = await permissionService.canAccessConversation(conversationId, userId, level)
    if (!allowed) {
      return void res.status(403).json({ error: 'You do not have permission to access this conversation' })
    }

    next()
  }
}
