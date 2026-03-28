import type { Router, Response } from 'express'
import type { SessionRequest } from 'supertokens-node/framework/express/index.js'
import { asyncHandler } from '../../middleware/error.js'
import { ROLES } from '../../auth.js'
import { askLLM } from '../../services/claude.service.js'
import { runChartAgent } from '../../services/chart-agent.js'
import { runQAAgent } from '../../services/qa-agent.js'
import { runChartChatAgent, type ChartContext } from '../../services/chart-chat-agent.js'
import { createQueryExecutor } from '../../services/query-executors/index.js'
import type { Schema, ChartFilter } from '../../types.js'
import type { Db } from '../../db/index.js'
import { createPermissionService } from '../../services/permission.service.js'
import { initializeSSE, writeSSEEvent, startSSEHeartbeat, attachSSELifecycle } from '../sse-utils.js'
import { sseSessionManager, type SSESessionInfo } from '../../services/sse-session.service.js'
import {
  llmGenerateBodySchema,
  generateChartBodySchema,
  askBodySchema,
  chartChatBodySchema,
  chartChatHistoryQuerySchema,
  sessionLatestQuerySchema,
} from './validation.js'
import { toConversationHistory, recordTokenUsageSafe, getErrorMessage } from './helpers.js'
import type { createTokenUsageService } from '../../services/token-usage.service.js'
import type { createConversationService } from '../../services/conversation.service.js'
import type { createChartService } from '../../services/chart.service.js'
import type { createAuditLogService } from '../../services/audit-log.service.js'

type AgentRouteDeps = {
  db: Db
  tokenUsageService: ReturnType<typeof createTokenUsageService>
  conversationService: ReturnType<typeof createConversationService>
  chartService: ReturnType<typeof createChartService>
  auditLog: ReturnType<typeof createAuditLogService>
}

function parseOrBadRequest<T>(res: Response, parsed: { success: boolean; data?: T; error?: { issues: unknown } }): T | null {
  if (parsed.success && parsed.data !== undefined) return parsed.data
  res.status(400).json({ error: 'Invalid request payload', details: parsed.error?.issues })
  return null
}

async function runSSESession(
  res: Response,
  opts: {
    label: string
    context: string
    onClientClose: () => void
    run: () => Promise<void>
    onError: (err: unknown) => void
    onFinally?: () => Promise<void>
  },
): Promise<void> {
  initializeSSE(res)
  attachSSELifecycle(res, {
    label: opts.label,
    context: opts.context,
    onClientClose: opts.onClientClose,
  })

  const stopHeartbeat = startSSEHeartbeat(res)
  try {
    await opts.run()
  } catch (err) {
    opts.onError(err)
  } finally {
    stopHeartbeat()
    if (opts.onFinally) {
      await opts.onFinally()
    }
    if (!res.writableEnded) res.end()
  }
}

/**
 * Run an SSE session backed by the session manager for resumability.
 * The agent continues running even if the client disconnects.
 * Events are buffered and can be replayed via the reconnect endpoint.
 */
async function runResumableSSESession(
  res: Response,
  session: SSESessionInfo,
  opts: {
    label: string
    run: () => Promise<void>
    onError: (err: unknown) => void
    onFinally?: () => Promise<void>
  },
): Promise<void> {
  // Connect the initial client to the session
  initializeSSE(res)
  const stopHeartbeat = startSSEHeartbeat(res)
  session.clients.add(res)
  session.heartbeats.set(res, stopHeartbeat)

  // Send session ID as the first event so the client can reconnect
  sseSessionManager.addEvent(session.id, 'session', { sessionId: session.id })

  res.once('close', () => {
    console.log(`${opts.label}: client disconnected from session=${session.id} (agent continues)`)
    session.clients.delete(res)
    const hb = session.heartbeats.get(res)
    if (hb) hb()
    session.heartbeats.delete(res)
  })

  try {
    await opts.run()
    await sseSessionManager.complete(session.id)
  } catch (err) {
    opts.onError(err)
    await sseSessionManager.fail(session.id)
  } finally {
    if (opts.onFinally) {
      await opts.onFinally()
    }
    // Close any remaining clients
    stopHeartbeat()
    if (!res.writableEnded) res.end()
  }
}

export function registerGenerateRoute(router: Router, deps: AgentRouteDeps): void {
  const { tokenUsageService } = deps

  router.post(
    '/generate',
    asyncHandler(async (req, res) => {
      const body = parseOrBadRequest(res, llmGenerateBodySchema.safeParse(req.body))
      if (!body) return

      const { prompt, maxTokens = 2048 } = body
      const result = await askLLM(prompt, maxTokens, req.project?.llmConfig)

      if (result.usage.totalTokens > 0) {
        await tokenUsageService.record({
          projectId: req.project!.id,
          vendor: result.vendor,
          model: result.model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          operation: 'llm-generate',
        })
      }

      res.json({ text: result.text })
    }),
  )
}

export function registerGenerateChartRoute(router: Router, deps: AgentRouteDeps): void {
  const { tokenUsageService, auditLog } = deps

  router.post(
    '/generate-chart',
    asyncHandler(async (req: SessionRequest, res) => {
      const body = parseOrBadRequest(res, generateChartBodySchema.safeParse(req.body))
      if (!body) return

      const { userQuery, chartType = 'auto', existingChart, dashboardId } = body
      const project = req.project!
      const schema = project.schemaCache as Schema | null
      const userId = req.session?.getUserId() ?? 'unknown'

      if (!schema) {
        return void res.status(400).json({ error: 'No schema available. Please detect schema first.' })
      }

      console.log(`ChartAgent: user=${userId} project=${project.id} query="${userQuery.substring(0, 80)}"`)

      const executor = createQueryExecutor(project.dbEngine, project.dbConfig)
      const session = await sseSessionManager.create('generate-chart', project.id, userId, {
        dashboardId,
      })
      await runResumableSSESession(res, session, {
        label: 'ChartAgent',
        run: async () => {
          const result = await runChartAgent(
            userQuery,
            schema,
            executor,
            chartType,
            (step) => sseSessionManager.addEvent(session.id, 'step', { step }),
            (text) => sseSessionManager.addEvent(session.id, 'thinking', { text }),
            (existingChart as object | undefined) || undefined,
            project.llmConfig,
            project.chartLibrary,
            project.colorConfig,
          )

          sseSessionManager.addEvent(session.id, 'result', {
            title: result.title,
            chartType: result.chartType,
            sql: result.sql,
            description: result.description,
            summary: result.summary,
            chartSpec: result.chartSpec,
            data: result.data,
            columns: result.columns,
            steps: result.steps,
            filters: result.filters,
          })

          await recordTokenUsageSafe(async () => {
            if (result.tokenUsage.totalTokens > 0) {
              await tokenUsageService.record({
                projectId: project.id,
                vendor: result.tokenUsage.vendor,
                model: result.tokenUsage.model,
                promptTokens: result.tokenUsage.promptTokens,
                completionTokens: result.tokenUsage.completionTokens,
                totalTokens: result.tokenUsage.totalTokens,
                operation: 'chart-generate',
              })
            }
            await auditLog.log({
              projectId: project.id,
              userId,
              action: 'generated',
              entityType: 'chart',
              entityName: result.title,
              details: { userQuery: userQuery.substring(0, 200), chartType: result.chartType },
            })
          }, 'Failed to record token usage or audit log:')
        },
        onError: (err) => {
          console.error('ChartAgent: generation failed', err)
          sseSessionManager.addEvent(session.id, 'error', { error: getErrorMessage(err, 'Chart generation failed') })
        },
        onFinally: async () => {
          if (executor.cleanup) {
            try {
              await executor.cleanup()
            } catch (cleanupErr) {
              console.error('ChartAgent: executor cleanup failed', cleanupErr)
            }
          }
        },
      })
    }),
  )
}

export function registerAskRoute(router: Router, deps: AgentRouteDeps): void {
  const { db, tokenUsageService, conversationService } = deps

  router.post(
    '/ask',
    asyncHandler(async (req: SessionRequest, res) => {
      const body = parseOrBadRequest(res, askBodySchema.safeParse(req.body))
      if (!body) return

      const { question, conversationId } = body
      const project = req.project!
      const schema = project.schemaCache as Schema | null
      const userId = req.session!.getUserId()

      if (!schema) {
        return void res.status(400).json({ error: 'No schema available. Please detect schema first.' })
      }

      console.log(`QAAgent: user=${userId} project=${project.id} question="${question.substring(0, 80)}"`)

      let convId = conversationId
      if (convId) {
        const conv = await conversationService.getById(convId)
        if (!conv || conv.projectId !== project.id) {
          return void res.status(404).json({ error: 'Conversation not found' })
        }

        const roles: string[] = req.session?.getAccessTokenPayload()?.roles ?? []
        if (!roles.includes(ROLES.ADMIN)) {
          const permissionService = createPermissionService(db)
          const allowed = await permissionService.canAccessConversation(convId, userId, 'edit')
          if (!allowed) {
            return void res.status(403).json({ error: 'You do not have permission to access this conversation' })
          }
        }
      } else {
        const conv = await conversationService.create(project.id, userId, question.substring(0, 100))
        convId = conv.id
      }

      const previousMessages = await conversationService.getMessages(convId)
      const conversationHistory = toConversationHistory(previousMessages)
      await conversationService.addMessage(convId, 'user', question)

      const executor = createQueryExecutor(project.dbEngine, project.dbConfig)
      const session = await sseSessionManager.create('ask', project.id, userId, {
        conversationId: convId,
      })
      await runResumableSSESession(res, session, {
        label: 'QAAgent',
        run: async () => {
          sseSessionManager.addEvent(session.id, 'conversation', { conversationId: convId })

          const result = await runQAAgent(
            question,
            schema,
            executor,
            (step) => sseSessionManager.addEvent(session.id, 'step', { step }),
            (text) => sseSessionManager.addEvent(session.id, 'thinking', { text }),
            project.llmConfig,
            undefined,
            conversationHistory,
          )

          sseSessionManager.addEvent(session.id, 'result', {
            answer: result.answer,
            sql: result.sql,
            data: result.data,
            columns: result.columns,
            steps: result.steps,
          })

          await recordTokenUsageSafe(async () => {
            if (result.tokenUsage.totalTokens > 0) {
              await tokenUsageService.record({
                projectId: project.id,
                vendor: result.tokenUsage.vendor,
                model: result.tokenUsage.model,
                promptTokens: result.tokenUsage.promptTokens,
                completionTokens: result.tokenUsage.completionTokens,
                totalTokens: result.tokenUsage.totalTokens,
                operation: 'qa-ask',
              })
            }

            await conversationService.addMessage(convId, 'assistant', result.answer, {
              sql: result.sql,
              data: result.data,
              columns: result.columns,
              steps: result.steps,
            })
          }, 'Failed to record token usage or save conversation:')
        },
        onError: (err) => {
          console.error('QAAgent: failed', err)
          sseSessionManager.addEvent(session.id, 'error', { error: getErrorMessage(err, 'Failed to answer question') })
        },
        onFinally: async () => {
          if (executor.cleanup) {
            try {
              await executor.cleanup()
            } catch (cleanupErr) {
              console.error('QAAgent: executor cleanup failed', cleanupErr)
            }
          }
        },
      })
    }),
  )
}

export function registerChartChatRoute(router: Router, deps: AgentRouteDeps): void {
  const { db, tokenUsageService, conversationService, chartService } = deps

  router.post(
    '/chart-chat',
    asyncHandler(async (req: SessionRequest, res) => {
      const body = parseOrBadRequest(res, chartChatBodySchema.safeParse(req.body))
      if (!body) return

      const { message, dashboardId, chartId, conversationId } = body
      const project = req.project!
      const schema = project.schemaCache as Schema | null
      const userId = req.session?.getUserId() ?? 'unknown'

      if (!schema) {
        return void res.status(400).json({ error: 'No schema available. Please detect schema first.' })
      }

      const chart = await chartService.getById(dashboardId, chartId)
      if (!chart) {
        return void res.status(404).json({ error: 'Chart not found' })
      }

      const chartContext: ChartContext = {
        chartId: chart.id,
        name: chart.name,
        sql: chart.query,
        chartSpec: chart.chartSpec as object | undefined,
        chartType: chart.chartType ?? undefined,
        data: (chart.data as Record<string, string>[] | null) ?? undefined,
        description: chart.description ?? undefined,
        summary: chart.summary ?? undefined,
        userQuery: chart.userQuery ?? undefined,
        filters: (chart.filters as ChartFilter[] | null) ?? undefined,
      }

      console.log(`ChartChatAgent: user=${userId} project=${project.id} chart="${chart.name}" message="${message.substring(0, 80)}"`)

      let convId = conversationId
      if (convId) {
        const conv = await conversationService.getById(convId)
        if (!conv || conv.projectId !== project.id) {
          return void res.status(404).json({ error: 'Conversation not found' })
        }

        const roles: string[] = req.session?.getAccessTokenPayload()?.roles ?? []
        if (!roles.includes(ROLES.ADMIN)) {
          const permissionService = createPermissionService(db)
          const allowed = await permissionService.canAccessConversation(convId, userId, 'edit')
          if (!allowed) {
            return void res.status(403).json({ error: 'You do not have permission to access this conversation' })
          }
        }
      } else {
        const existing = await conversationService.getByChartId(project.id, chartId, userId)
        if (existing) {
          convId = existing.id
        } else {
          const conv = await conversationService.create(project.id, userId, `Chat: ${chart.name}`, chartId)
          convId = conv.id
        }
      }

      const previousMessages = await conversationService.getMessages(convId)
      const conversationHistory = toConversationHistory(previousMessages)
      await conversationService.addMessage(convId, 'user', message)

      const executor = createQueryExecutor(project.dbEngine, project.dbConfig)
      const session = await sseSessionManager.create('chart-chat', project.id, userId, {
        dashboardId,
        chartId,
      })
      await runResumableSSESession(res, session, {
        label: 'ChartChatAgent',
        run: async () => {
          sseSessionManager.addEvent(session.id, 'conversation', { conversationId: convId })

          const result = await runChartChatAgent(
            message,
            chartContext,
            schema,
            executor,
            (step) => sseSessionManager.addEvent(session.id, 'step', { step }),
            (text) => sseSessionManager.addEvent(session.id, 'thinking', { text }),
            project.llmConfig,
            undefined,
            conversationHistory,
          )

          sseSessionManager.addEvent(session.id, 'result', {
            answer: result.answer,
            sql: result.sql,
            data: result.data,
            columns: result.columns,
            steps: result.steps,
          })

          await recordTokenUsageSafe(async () => {
            if (result.tokenUsage.totalTokens > 0) {
              await tokenUsageService.record({
                projectId: project.id,
                chartId: chart.id,
                vendor: result.tokenUsage.vendor,
                model: result.tokenUsage.model,
                promptTokens: result.tokenUsage.promptTokens,
                completionTokens: result.tokenUsage.completionTokens,
                totalTokens: result.tokenUsage.totalTokens,
                operation: 'chart-chat',
              })
            }

            await conversationService.addMessage(convId, 'assistant', result.answer, {
              sql: result.sql,
              data: result.data,
              columns: result.columns,
              steps: result.steps,
            })
          }, 'Failed to record token usage or save conversation:')
        },
        onError: (err) => {
          console.error('ChartChatAgent: failed', err)
          sseSessionManager.addEvent(session.id, 'error', { error: getErrorMessage(err, 'Chart chat failed') })
        },
        onFinally: async () => {
          if (executor.cleanup) {
            try {
              await executor.cleanup()
            } catch (cleanupErr) {
              console.error('ChartChatAgent: executor cleanup failed', cleanupErr)
            }
          }
        },
      })
    }),
  )
}

export function registerSessionReconnectRoute(router: Router): void {
  router.get(
    '/sessions/latest',
    asyncHandler(async (req: SessionRequest, res) => {
      const query = parseOrBadRequest(res, sessionLatestQuerySchema.safeParse(req.query))
      if (!query) return

      const userId = req.session?.getUserId() ?? ''
      if (!userId) {
        return void res.status(401).json({ error: 'Unauthorized' })
      }

      const projectId = req.project!.id
      const session = await sseSessionManager.findLatestRunning(query.type, projectId, userId, {
        dashboardId: query.dashboardId,
        chartId: query.chartId,
        conversationId: query.conversationId,
      })

      res.json({ sessionId: session?.id ?? null })
    }),
  )

  router.get(
    '/sessions/:sessionId',
    asyncHandler(async (req: SessionRequest, res) => {
      const { sessionId } = req.params
      const userId = req.session?.getUserId() ?? ''
      if (!userId) {
        return void res.status(401).json({ error: 'Unauthorized' })
      }

      const session = await sseSessionManager.get(sessionId)
      if (!session) {
        return void res.status(404).json({ error: 'Session not found or expired' })
      }

      // Verify the user owns this session and it belongs to the current project
      if (session.userId !== userId) {
        return void res.status(403).json({ error: 'Not your session' })
      }
      if (session.projectId !== req.project!.id) {
        return void res.status(404).json({ error: 'Session not found or expired' })
      }

      console.log(`SSESession: client reconnecting to session=${sessionId} status=${session.status}`)
      await sseSessionManager.connectClient(sessionId, res)
    }),
  )
}

export function registerChartChatHistoryRoute(router: Router, deps: AgentRouteDeps): void {
  const { conversationService } = deps

  router.get(
    '/chart-chat/history',
    asyncHandler(async (req: SessionRequest, res) => {
      const query = parseOrBadRequest(res, chartChatHistoryQuerySchema.safeParse(req.query))
      if (!query) return

      const project = req.project!
      const { chartId } = query

      const userId = req.session?.getUserId() ?? ''
      if (!userId) {
        return void res.status(401).json({ error: 'Unauthorized' })
      }

      const conv = await conversationService.getByChartId(project.id, chartId, userId)
      if (!conv) {
        return void res.json({ conversationId: null, messages: [] })
      }

      const msgs = await conversationService.getMessages(conv.id)
      res.json({
        conversationId: conv.id,
        messages: msgs.map((m) => ({
          role: m.role,
          content: m.content,
          sql: m.sql,
          data: m.data,
          columns: m.columns,
        })),
      })
    }),
  )
}
