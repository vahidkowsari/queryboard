import { Router } from 'express'
import { askLLM } from '../services/claude.service.js'
import { runChartAgent } from '../services/chart-agent.js'
import { runQAAgent } from '../services/qa-agent.js'
import { createQueryExecutor } from '../services/query-executors/index.js'
import { asyncHandler } from '../middleware/error.js'
import { loadProject } from '../middleware/project.js'
import { requireRole } from '../middleware/roles.js'
import { ROLES } from '../auth.js'
import { createTokenUsageService } from '../services/token-usage.service.js'
import { createConversationService } from '../services/conversation.service.js'
import { createPermissionService } from '../services/permission.service.js'
import type { Db } from '../db/index.js'
import type { Schema } from '../types.js'
import type { SessionRequest } from 'supertokens-node/framework/express/index.js'

export function createAgentRoutes(db: Db): Router {
  const router = Router({ mergeParams: true })
  const tokenUsageService = createTokenUsageService(db)
  const conversationService = createConversationService(db)
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
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      const executor = createQueryExecutor(project.dbEngine, project.dbConfig)
      const ac = new AbortController()
      req.on('close', () => ac.abort())

      try {
        const result = await runChartAgent(
          userQuery,
          schema,
          executor,
          chartType,
          (step) => {
            if (!res.writableEnded) res.write(`event: step\ndata: ${JSON.stringify({ step })}\n\n`)
          },
          (text) => {
            if (!res.writableEnded) res.write(`event: thinking\ndata: ${JSON.stringify({ text })}\n\n`)
          },
          existingChart || undefined,
          project.llmConfig,
          project.chartLibrary,
          project.colorConfig,
          ac.signal,
        )

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

        res.write(
          `event: result\ndata: ${JSON.stringify({
            title: result.title,
            chartType: result.chartType,
            sql: result.sql,
            description: result.description,
            chartSpec: result.chartSpec,
            data: result.data,
            columns: result.columns,
            steps: result.steps,
            filters: result.filters,
          })}\n\n`,
        )
      } catch (err) {
        if (ac.signal.aborted) {
          console.log('ChartAgent: generation cancelled by client')
        } else {
          const msg = err instanceof Error ? err.message : 'Chart generation failed'
          if (!res.writableEnded) res.write(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`)
        }
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

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      // Send conversationId so frontend can track it
      res.write(`event: conversation\ndata: ${JSON.stringify({ conversationId: convId })}\n\n`)

      const executor = createQueryExecutor(project.dbEngine, project.dbConfig)
      const ac = new AbortController()
      req.on('close', () => ac.abort())

      try {
        const result = await runQAAgent(
          question,
          schema,
          executor,
          (step) => {
            if (!res.writableEnded) res.write(`event: step\ndata: ${JSON.stringify({ step })}\n\n`)
          },
          (text) => {
            if (!res.writableEnded) res.write(`event: thinking\ndata: ${JSON.stringify({ text })}\n\n`)
          },
          project.llmConfig,
          ac.signal,
          conversationHistory,
        )

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

        res.write(
          `event: result\ndata: ${JSON.stringify({
            answer: result.answer,
            sql: result.sql,
            data: result.data,
            columns: result.columns,
            steps: result.steps,
          })}\n\n`,
        )
      } catch (err) {
        if (ac.signal.aborted) {
          console.log('QAAgent: cancelled by client')
        } else {
          const msg = err instanceof Error ? err.message : 'Failed to answer question'
          if (!res.writableEnded) res.write(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`)
        }
      }
      if (!res.writableEnded) res.end()
    }),
  )

  return router
}
