import { z } from 'zod'

export const llmGenerateBodySchema = z.object({
  prompt: z.string().min(1),
  maxTokens: z.number().int().positive().max(32768).optional(),
})

export const generateChartBodySchema = z.object({
  userQuery: z.string().min(1),
  chartType: z.string().min(1).optional(),
  existingChart: z.unknown().optional(),
  dashboardId: z.string().min(1).optional(),
})

export const askBodySchema = z.object({
  question: z.string().min(1),
  conversationId: z.string().min(1).optional(),
})

export const chartChatBodySchema = z.object({
  message: z.string().min(1),
  dashboardId: z.string().min(1),
  chartId: z.string().min(1),
  conversationId: z.string().min(1).optional(),
})

export const chartChatHistoryQuerySchema = z.object({
  chartId: z.string().min(1),
})

export const sessionLatestQuerySchema = z.object({
  type: z.enum(['generate-chart', 'ask', 'chart-chat']),
  dashboardId: z.string().min(1).optional(),
  chartId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
})
