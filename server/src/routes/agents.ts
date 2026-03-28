import { Router } from 'express'
import { askLLM } from '../services/claude.service.js'
import { runChartAgent } from '../services/chart-agent.js'
import { runQAAgent } from '../services/qa-agent.js'
import { runChartChatAgent, type ChartContext } from '../services/chart-chat-agent.js'
import { createQueryExecutor } from '../services/query-executors/index.js'
import { createChartService } from '../services/chart.service.js'
import { asyncHandler } from '../middleware/error.js'
import { loadProject } from '../middleware/project.js'
import { requireRole } from '../middleware/roles.js'
import { ROLES } from '../auth.js'
import { createTokenUsageService } from '../services/token-usage.service.js'
import { createConversationService } from '../services/conversation.service.js'
import { createPermissionService } from '../services/permission.service.js'
import { createAuditLogService } from '../services/audit-log.service.js'
import { initializeSSE, writeSSEEvent, startSSEHeartbeat, attachSSELifecycle } from './sse-utils.js'
import type { Db } from '../db/index.js'
import type { Schema } from '../types.js'
import type { SessionRequest } from 'supertokens-node/framework/express/index.js'

export function createAgentRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const tokenUsageService = createTokenUsageService(db)
  const conversationService = createConversationService(db)
  const chartService = createChartService(db)
  const auditLog = createAuditLogService(db)
  router.use(loadProject(db))
  router.use(requireRole(ROLES.ADMIN, ROLES.EDITOR))

  router.post(
    '/generate',
    asyncHandler(async (req, res) => {
      const { prompt, maxTokens = 2048 } = req.body
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

  router.post(
    '/generate-chart',
    asyncHandler(async (req: SessionRequest, res) => {
      const { userQuery, chartType = 'auto', existingChart } = req.body
      const project = req.project!
      const schema = project.schemaCache as Schema | null
      const userId = req.session?.getUserId() ?? 'unknown'

      if (!schema) {
        return void res.status(400).json({ error: 'No schema available. Please detect schema first.' })
      }

      console.log(`ChartAgent: user=${userId} project=${project.id} query="${userQuery.substring(0, 80)}"`)

      // SSE streaming for step-by-step updates
      initializeSSE(res)

      const executor = createQueryExecutor(project.dbEngine, project.dbConfig)
      const ac = new AbortController()
      attachSSELifecycle(res, {
        label: 'ChartAgent',
        context: `user=${userId} project=${project.id}`,
        onClientClose: () => ac.abort(),
      })

      // Send periodic heartbeats to keep CloudFront from timing out
      const stopHeartbeat = startSSEHeartbeat(res)

      try {
        const result = await runChartAgent(
          userQuery,
          schema,
          executor,
          chartType,
          (step) => {
            writeSSEEvent(res, 'step', { step })
          },
          (text) => {
            writeSSEEvent(res, 'thinking', { text })
          },
          existingChart || undefined,
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

        try {
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
          await auditLog.log({ projectId: project.id, userId, action: 'generated', entityType: 'chart', entityName: result.title, details: { userQuery: userQuery?.substring(0, 200), chartType: result.chartType } })
        } catch (logErr) {
          console.error('Failed to record token usage or audit log:', logErr)
        }
      } catch (err) {
        if (ac.signal.aborted) {
          console.log('ChartAgent: generation cancelled by client')
        } else {
          console.error('ChartAgent: generation failed', err)
          const msg = err instanceof Error ? err.message : 'Chart generation failed'
          writeSSEEvent(res, 'error', { error: msg })
        }
      } finally {
        stopHeartbeat()
      }
      if (!res.writableEnded) res.end()
    }),
  )

  router.post(
    '/ask',
    asyncHandler(async (req: SessionRequest, res) => {
      const { question, conversationId } = req.body
      const project = req.project!
      const schema = project.schemaCache as Schema | null
      const userId = req.session!.getUserId()

      if (!schema) {
        return void res.status(400).json({ error: 'No schema available. Please detect schema first.' })
      }

      console.log(`QAAgent: user=${userId} project=${project.id} question="${question.substring(0, 80)}"`)

      // Create or validate conversation
      let convId = conversationId as string | undefined
      if (convId) {
        // Validate conversation exists and belongs to project
        const conv = await conversationService.getById(convId)
        if (!conv || conv.projectId !== project.id) {
          return void res.status(404).json({ error: 'Conversation not found' })
        }
        
        // Check permissions - admins bypass, others need explicit permission
        const roles: string[] = req.session?.getAccessTokenPayload()?.roles ?? []
        if (!roles.includes('admin')) {
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

      // Fetch conversation history BEFORE saving current message to avoid duplication
      const previousMessages = await conversationService.getMessages(convId)
      const conversationHistory = previousMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }))

      // Save user message AFTER fetching history
      await conversationService.addMessage(convId, 'user', question)

      initializeSSE(res)

      // Send conversationId so frontend can track it
      writeSSEEvent(res, 'conversation', { conversationId: convId })

      const executor = createQueryExecutor(project.dbEngine, project.dbConfig)
      const ac = new AbortController()
      attachSSELifecycle(res, {
        label: 'QAAgent',
        context: `user=${userId} project=${project.id}`,
        onClientClose: () => ac.abort(),
      })

      // Send periodic heartbeats to keep CloudFront from timing out
      const stopHeartbeat = startSSEHeartbeat(res)

      try {
        const result = await runQAAgent(
          question,
          schema,
          executor,
          (step) => {
            writeSSEEvent(res, 'step', { step })
          },
          (text) => {
            writeSSEEvent(res, 'thinking', { text })
          },
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

        try {
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
          // Save assistant message
          await conversationService.addMessage(convId, 'assistant', result.answer, {
            sql: result.sql,
            data: result.data,
            columns: result.columns,
            steps: result.steps,
          })
        } catch (logErr) {
          console.error('Failed to record token usage or save conversation:', logErr)
        }
      } catch (err) {
        if (ac.signal.aborted) {
          console.log('QAAgent: cancelled by client')
        } else {
          console.error('QAAgent: failed', err)
          const msg = err instanceof Error ? err.message : 'Failed to answer question'
          writeSSEEvent(res, 'error', { error: msg })
        }
      } finally {
        stopHeartbeat()
      }
      if (!res.writableEnded) res.end()
    }),
  )

  router.post(
    '/chart-chat',
    asyncHandler(async (req: SessionRequest, res) => {
      const { message, dashboardId, chartId, conversationId } = req.body
      const project = req.project!
      const schema = project.schemaCache as Schema | null
      const userId = req.session?.getUserId() ?? 'unknown'

      if (!schema) {
        return void res.status(400).json({ error: 'No schema available. Please detect schema first.' })
      }
      if (!dashboardId || !chartId || !message) {
        return void res.status(400).json({ error: 'dashboardId, chartId, and message are required' })
      }

      // Load chart from DB
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
        filters: (chart.filters as import('../types.js').ChartFilter[] | null) ?? undefined,
      }

      console.log(`ChartChatAgent: user=${userId} project=${project.id} chart="${chart.name}" message="${message.substring(0, 80)}"`)

      // Create or validate conversation
      let convId = conversationId as string | undefined
      if (convId) {
        const conv = await conversationService.getById(convId)
        if (!conv || conv.projectId !== project.id) {
          return void res.status(404).json({ error: 'Conversation not found' })
        }
      } else {
        // Try to resume existing conversation for this chart
        const existing = await conversationService.getByChartId(project.id, chartId, userId)
        if (existing) {
          convId = existing.id
        } else {
          const conv = await conversationService.create(project.id, userId, `Chat: ${chart.name}`, chartId)
          convId = conv.id
        }
      }

      // Fetch conversation history BEFORE saving current message
      const previousMessages = await conversationService.getMessages(convId)
      const conversationHistory = previousMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }))

      // Save user message AFTER fetching history
      await conversationService.addMessage(convId, 'user', message)

      // SSE streaming
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
          (step) => {
            writeSSEEvent(res, 'step', { step })
          },
          (text) => {
            writeSSEEvent(res, 'thinking', { text })
          },
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

        try {
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
          // Save assistant message
          await conversationService.addMessage(convId, 'assistant', result.answer, {
            sql: result.sql,
            data: result.data,
            columns: result.columns,
            steps: result.steps,
          })
        } catch (logErr) {
          console.error('Failed to record token usage or save conversation:', logErr)
        }
      } catch (err) {
        if (ac.signal.aborted) {
          console.log('ChartChatAgent: cancelled by client')
        } else {
          console.error('ChartChatAgent: failed', err)
          const msg = err instanceof Error ? err.message : 'Chart chat failed'
          writeSSEEvent(res, 'error', { error: msg })
        }
      } finally {
        stopHeartbeat()
      }
      if (!res.writableEnded) res.end()
    }),
  )

  // GET /api/projects/:projectId/agents/chart-chat/history
  router.get(
    '/chart-chat/history',
    asyncHandler(async (req: SessionRequest, res) => {
      const project = req.project!
      const chartId = req.query.chartId as string
      if (!chartId) {
        return void res.status(400).json({ error: 'chartId query parameter is required' })
      }

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

  return router
}
