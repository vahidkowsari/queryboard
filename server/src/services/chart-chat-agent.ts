import { generateText, tool, jsonSchema, type ModelMessage } from 'ai'
import type { Schema, QueryExecutor, LLMConfig, ChartFilter } from '../types.js'
import { createLLMModel } from './llm-providers/index.js'
import { rowsToObjects } from './chart-agent-handlers.js'
import { createDataTools, type ToolHandlerContext, type LogFn } from './agent-tools.js'
import type { TokenUsageInfo } from './chart-agent.js'
import type { ConversationHistoryMessage } from './qa-agent.js'

/**
 * Context about the chart being discussed
 */
export interface ChartContext {
  chartId: string
  name: string
  sql: string
  chartSpec?: object
  chartType?: string
  data?: Record<string, string>[]
  description?: string
  summary?: string
  userQuery?: string
  filters?: ChartFilter[]
}

/**
 * Result from chart chat — a text answer about the chart data
 */
export interface ChartChatResult {
  answer: string
  sql?: string
  data?: Record<string, string>[]
  columns?: string[]
  steps: string[]
  tokenUsage: TokenUsageInfo
}

/**
 * Builds a system prompt for chart-aware conversations
 */
function buildChartChatSystemPrompt(
  chartContext: ChartContext,
  sqlRules: string,
): string {
  return `You are an expert data analyst having a conversation about a specific chart. The user wants to ask questions about the chart's data, get insights, explanations, or deeper analysis.

CURRENT CHART CONTEXT:
- Chart name: "${chartContext.name}"
- Original request: "${chartContext.userQuery || ''}"
- SQL query: ${chartContext.sql}
- Chart type: ${chartContext.chartType || 'auto'}
- Description: ${chartContext.description || 'none'}
- Summary: ${chartContext.summary || 'none'}
- Data sample (first 5 rows): ${chartContext.data?.length ? JSON.stringify(chartContext.data.slice(0, 5)) : 'none'}
- Total data rows: ${chartContext.data?.length ?? 0}
${chartContext.filters?.length ? `- Active filters: ${JSON.stringify(chartContext.filters)}` : ''}

WORKFLOW:
1. Understand what the user is asking about the chart's data.
2. If you can answer from the chart's existing data/summary, do so directly.
3. If you need more data, use the data exploration tools (get_columns, run_query, etc.).
4. Call answer_question with your complete answer.

GUIDELINES:
- Reference the chart's existing data when possible to avoid unnecessary queries.
- Be specific with numbers and percentages.
- When running queries, base them on the chart's existing SQL when relevant.
- Provide actionable insights, not just raw numbers.

${sqlRules}

CRITICAL: After a successful run_query, call answer_question on the NEXT turn. Do not run extra queries.
Keep responses concise. Use markdown formatting for answers.`
}

/**
 * Creates chart chat tools: data exploration + answer_question
 */
function createChartChatTools(ctx: ToolHandlerContext, log: LogFn) {
  return {
    ...createDataTools(ctx, log),
    answer_question: tool({
      description:
        'Provide a text answer to the user\'s question about the chart data. Use this when the user asks for insights, explanations, or analysis. This ends the conversation turn.',
      inputSchema: jsonSchema<{ answer: string; sql?: string }>({
        type: 'object',
        properties: {
          answer: {
            type: 'string',
            description: 'The complete answer in markdown. Include specific numbers, percentages, and data points.',
          },
          sql: {
            type: 'string',
            description: 'SQL query used to investigate (if any was run).',
          },
        },
        required: ['answer'],
      }),
    }),
  }
}

const MAX_TURNS = 15

/**
 * Runs the chart chat agent that answers questions about a chart's data
 * Supports multi-turn conversations via conversation history
 */
export async function runChartChatAgent(
  message: string,
  chartContext: ChartContext,
  schema: Schema,
  executor: QueryExecutor,
  onStep?: (step: string) => void,
  onThinking?: (text: string) => void,
  llmConfig?: LLMConfig | null,
  signal?: AbortSignal,
  conversationHistory?: ConversationHistoryMessage[],
): Promise<ChartChatResult> {
  const steps: string[] = []
  const log = (msg: string) => {
    steps.push(msg)
    onStep?.(msg)
    console.log(`ChartChatAgent: ${msg}`)
  }

  const { model, vendor, modelId } = createLLMModel(llmConfig)
  const temperature = llmConfig?.temperature ?? 0.3
  log(`Using ${vendor}/${modelId}`)

  const systemPrompt = buildChartChatSystemPrompt(chartContext, executor.sqlRules)

  const ctx: ToolHandlerContext = { schema, executor, lastQueryResult: null, storedResults: [] }
  const agentTools = createChartChatTools(ctx, log)
  const messages: ModelMessage[] = [{ role: 'user', content: message }]

  // Prepend conversation history
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      messages.unshift({ role: msg.role, content: msg.content })
    }
  }

  const tokenUsage: TokenUsageInfo = { promptTokens: 0, completionTokens: 0, totalTokens: 0, vendor, model: modelId }

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    console.log(`ChartChatAgent: Turn ${turn + 1}`)

    if (turn >= MAX_TURNS - 2) {
      messages.push({
        role: 'user',
        content: 'You are running out of turns. Call answer_question RIGHT NOW with whatever information you have.',
      })
    }

    const result = await generateText({
      model,
      temperature,
      system: systemPrompt,
      messages,
      tools: agentTools,
      maxOutputTokens: 16384,
      abortSignal: signal,
    })

    const turnInput = result.usage?.inputTokens ?? 0
    const turnOutput = result.usage?.outputTokens ?? 0
    tokenUsage.promptTokens += turnInput
    tokenUsage.completionTokens += turnOutput
    tokenUsage.totalTokens += turnInput + turnOutput

    if (result.text?.trim()) {
      onThinking?.(result.text)
    }

    // Check for answer_question terminal tool
    const answerCall = result.toolCalls?.find((tc) => tc.toolName === 'answer_question')
    if (answerCall) {
      const input = (answerCall as unknown as { input: { answer: string; sql?: string } }).input
      log('Answering question about chart')

      let data: Record<string, string>[] | undefined
      let columns: string[] | undefined
      if (ctx.lastQueryResult) {
        columns = ctx.lastQueryResult.columns
        data = rowsToObjects(columns, ctx.lastQueryResult.rows)
      }

      return {
        answer: input.answer,
        sql: input.sql,
        data,
        columns,
        steps,
        tokenUsage,
      }
    }

    if (!result.toolCalls || result.toolCalls.length === 0) {
      throw new Error(`Agent finished without responding: ${result.text || 'No response'}`)
    }

    messages.push(...result.response.messages)
  }

  throw new Error('Agent exceeded maximum turns without responding')
}
