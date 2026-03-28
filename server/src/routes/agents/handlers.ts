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
import {
  llmGenerateBodySchema,
  generateChartBodySchema,
  askBodySchema,
  chartChatBodySchema,
  chartChatHistoryQuerySchema,
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

      const { userQuery, chartType = 'auto', existingChart } = body
      const project = req.project!
      const schema = project.schemaCache as Schema | null
      const userId = req.session?.getUserId() ?? 'unknown'

      if (!schema) {
        return void res.status(400).json({ error: 'No schema available. Please detect schema first.' })
      }

      console.log(`ChartAgent: user=${userId} project=${project.id} query="${userQuery.substring(0, 80)}"`)

      initializeSSE(res)

      const executor = createQueryExecutor(project.dbEngine, project.dbConfig)
      const ac = new AbortController()
      attachSSELifecycle(res, {
        label: 'ChartAgent',
        context: `user=${userId} project=${project.id}`,
        onClientClose: () => ac.abort(),
      })

      const stopHeartbeat = startSSEHeartbeat(res)

      try {
        const result = await runChartAgent(
          userQuery,
          schema,
          executor,
          chartType,
          (step) => writeSSEEvent(res, 'step', { step }),
          (text) => writeSSEEvent(res, 'thinking', { text }),
          (existingChart as object | undefined) || undefined,
          project.llmConfig,
          project.chartLibrary,
          project.colorConfig,
          ac.signal,
        )

        writeSSEEvent(res, 'result', {
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
      } catch (err) {
        if (ac.signal.aborted) {
          console.log('ChartAgent: generation cancelled by client')
        } else {
          console.error('ChartAgent: generation failed', err)
          writeSSEEvent(res, 'error', { error: getErrorMessage(err, 'Chart generation failed') })
        }
      } finally {
        stopHeartbeat()
      }
      if (!res.writableEnded) res.end()
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

      initializeSSE(res)
      writeSSEEvent(res, 'conversation', { conversationId: convId })

      const executor = createQueryExecutor(project.dbEngine, project.dbConfig)
      const ac = new AbortController()
      attachSSELifecycle(res, {
        label: 'QAAgent',
        context: `user=${userId} project=${project.id}`,
        onClientClose: () => ac.abort(),
      })

      const stopHeartbeat = startSSEHeartbeat(res)

      try {
        const result = await runQAAgent(
          question,
          schema,
          executor,
          (step) => writeSSEEvent(res, 'step', { step }),
          (text) => writeSSEEvent(res, 'thinking', { text }),
          project.llmConfig,
          ac.signal,
          conversationHistory,
        )

        writeSSEEvent(res, 'result', {
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
      } catch (err) {
        if (ac.signal.aborted) {
          console.log('QAAgent: cancelled by client')
        } else {
          console.error('QAAgent: failed', err)
          writeSSEEvent(res, 'error', { error: getErrorMessage(err, 'Failed to answer question') })
        }
      } finally {
        stopHeartbeat()
      }
      if (!res.writableEnded) res.end()
    }),
  )
}

export function registerChartChatRoute(router: Router, deps: AgentRouteDeps): void {
  const { tokenUsageService, conversationService, chartService } = deps

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

      initializeSSE(res)
      writeSSEEvent(res, 'conversation', { conversationId: convId })

      const executor = createQueryExecutor(project.dbEngine, project.dbConfig)
      const ac = new AbortController()
      attachSSELifecycle(res, {
        label: 'ChartChatAgent',
        context: `user=${userId} project=${project.id} conversation=${convId}`,
        onClientClose: () => ac.abort(),
      })

      const stopHeartbeat = startSSEHeartbeat(res)

      try {
        const result = await runChartChatAgent(
          message,
          chartContext,
          schema,
          executor,
          (step) => writeSSEEvent(res, 'step', { step }),
          (text) => writeSSEEvent(res, 'thinking', { text }),
          project.llmConfig,
          ac.signal,
          conversationHistory,
        )

        writeSSEEvent(res, 'result', {
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
      } catch (err) {
        if (ac.signal.aborted) {
          console.log('ChartChatAgent: cancelled by client')
        } else {
          console.error('ChartChatAgent: failed', err)
          writeSSEEvent(res, 'error', { error: getErrorMessage(err, 'Chart chat failed') })
        }
      } finally {
        stopHeartbeat()
      }
      if (!res.writableEnded) res.end()
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
