import express from 'express'
import cors from 'cors'
import supertokens from 'supertokens-node'
import { middleware as stMiddleware, errorHandler as stErrorHandler, type SessionRequest } from 'supertokens-node/framework/express/index.js'
import { verifySession } from 'supertokens-node/recipe/session/framework/express/index.js'
import pg from 'pg'
import { config } from './config.js'
import { initSuperTokens, seedRoles, ROLES } from './auth.js'
import { requireRole } from './middleware/roles.js'
import { createAdminRoutes } from './routes/admin.js'
import { errorHandler, asyncHandler } from './middleware/error.js'
import { createProjectRoutes } from './routes/projects.js'
import { createDashboardRoutes } from './routes/dashboards.js'
import { createChartRoutes } from './routes/charts.js'
import { createClaudeRoutes } from './routes/claude.js'
import { createSchemaRoutes } from './routes/schema.js'
import { createTokenUsageRoutes } from './routes/token-usage.js'
import { createConversationRoutes } from './routes/conversations.js'
import { createGroupRoutes } from './routes/groups.js'
import { createPermissionRoutes } from './routes/permissions.js'
import { createDashboardService } from './services/dashboard.service.js'
import { createDb } from './db/index.js'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { seedProjectsFromConfig } from './services/project-seeder.js'
import { createRefreshScheduler } from './services/refresh-scheduler.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

initSuperTokens()

const app = express()
app.use(
  cors({
    origin: config.supertokens.websiteDomain,
    allowedHeaders: ['content-type', ...supertokens.getAllCORSHeaders()],
    credentials: true,
  }),
)
app.use(stMiddleware())
app.use(express.json({ limit: '10mb' }))

// --- PostgreSQL + Drizzle ---
const pool = new pg.Pool(config.db)
const db = createDb(pool)
const refreshScheduler = createRefreshScheduler(db)

// --- Startup: connect, migrate, seed ---
pool
  .query('SELECT NOW()')
  .then(() => console.log('PostgreSQL connected'))
  .then(() => migrate(db, { migrationsFolder: join(__dirname, '..', 'migrations') }))
  .then(() => console.log('Migrations applied'))
  .then(() => seedProjectsFromConfig(db))
  .then(() => seedRoles())
  .then(() => console.log('Roles seeded'))
  .then(() => refreshScheduler.loadAllSchedules())
  .catch((err: Error) => console.error('Startup failed:', err.message))

// --- Public: enabled OAuth providers ---
app.get('/auth/providers', (_req, res) => {
  const providers: string[] = []
  if (config.supertokens.googleClientId) providers.push('google')
  if (config.supertokens.githubClientId) providers.push('github')
  if (config.supertokens.microsoftClientId) providers.push('active-directory')
  res.json({ providers })
})

// --- Auth info endpoint ---
app.get('/auth/me', verifySession(), async (req: SessionRequest, res) => {
  const userId = req.session!.getUserId()
  const user = await supertokens.getUser(userId)
  const roles: string[] = req.session!.getAccessTokenPayload()?.roles ?? []
  res.json({ id: userId, email: user?.emails?.[0] ?? null, roles })
})

// --- Protected API routes ---
app.use('/api/projects', verifySession(), createProjectRoutes(db))
app.use('/api/projects/:projectId/dashboards', verifySession(), createDashboardRoutes(db, refreshScheduler))
app.use('/api/projects/:projectId/dashboards', verifySession(), createChartRoutes(db))
app.use('/api/projects/:projectId/claude', verifySession(), createClaudeRoutes(db))
app.use('/api/projects/:projectId/schema', verifySession(), createSchemaRoutes(db))
app.use('/api/projects/:projectId/token-usage', verifySession(), createTokenUsageRoutes(db))
app.use('/api/projects/:projectId/conversations', verifySession(), createConversationRoutes(db))
app.use('/api/projects/:projectId/groups', verifySession(), createGroupRoutes(db))
app.use('/api/projects/:projectId/dashboards', verifySession(), createPermissionRoutes(db))
app.use('/api/admin', verifySession(), requireRole(ROLES.ADMIN), createAdminRoutes())

// --- Public shared dashboard route (no auth required) ---
const sharedDashboardService = createDashboardService(db)
app.get(
  '/api/shared/:token',
  asyncHandler(async (req, res) => {
    const dashboard = await sharedDashboardService.getByShareToken(req.params.token)
    if (!dashboard) return void res.status(404).json({ error: 'Shared dashboard not found' })
    res.json(dashboard)
  }),
)

// --- Error handling (SuperTokens first, then app) ---
app.use(stErrorHandler())
app.use(errorHandler)

// --- Start ---
app.listen(config.port, () => {
  console.log(`QueryBoard server running on http://localhost:${config.port}`)
})
