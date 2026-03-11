import { generateText, tool, jsonSchema, type ModelMessage } from 'ai'
import type { Schema, QueryExecutor, LLMConfig } from '../types.js'
import { createLLMModel } from './llm-providers/index.js'
import { rowsToObjects } from './chart-agent-handlers.js'
import { createDataTools, type ToolHandlerContext } from './agent-tools.js'
import type { TokenUsageInfo } from './chart-agent.js'

export interface QAResult {
  answer: string
  sql?: string
  data?: Record<string, string>[]
  columns?: string[]
  steps: string[]
  tokenUsage: TokenUsageInfo
}

const SYSTEM_PROMPT = `You are an expert data analyst assistant. Your job is to answer the user's question about the database schema or data.

You have access to tools that let you explore the schema and run SQL queries. Use them as needed to answer the question accurately.

Workflow:
1. If the question is about schema (tables, columns, relationships), use schema exploration tools (list_tables, get_columns, search_tables, get_table_relationships) and answer directly.
2. If the question requires querying data (counts, aggregations, lookups):
   a. First, use get_table_stats to check table size before writing queries
   b. If table shows "LARGE TABLE" warning, use LIMIT aggressively in all queries
   c. Explore the schema, then run a SQL query to get the answer
3. Call answer_question when you have enough information to provide a complete answer.

⚠️ CRITICAL — LARGE TABLE SAFETY:
This database may have tables with billions of rows. You MUST follow these rules:
1. ALWAYS call get_table_stats FIRST to check table size before querying
2. For tables marked "LARGE TABLE" (>1M rows):
   - EVERY query MUST include LIMIT (start with 50K-100K max)
   - Use approx_distinct() instead of COUNT(DISTINCT)
   - Use approx_percentile(col, 0.5) for medians/percentiles
   - Filter data BEFORE aggregating (use WHERE with date ranges, etc.)
3. NEVER join two large fact tables directly without filtering first
4. Use dimension tables (dim_*) freely — they are small
5. If a query fails with "CANCELLED" or times out:
   - Reduce LIMIT by 50% and retry
   - Add more WHERE filters to reduce data scanned
   - Use approximate functions instead of exact counts

Be concise but thorough. Include specific numbers and data when available.
After a successful run_query, call answer_question — do NOT run unnecessary extra queries.`

function createQATools(ctx: ToolHandlerContext, log: (msg: string) => void) {
  return {
    ...createDataTools(ctx, log),
    answer_question: tool({
      description:
        'Provide the final answer to the user\'s question. Call this when you have gathered enough information. This ends the conversation.',
      inputSchema: jsonSchema<{ answer: string; sql?: string }>({
        type: 'object',
        properties: {
          answer: {
            type: 'string',
            description: 'The complete answer to the user\'s question. Use markdown formatting for clarity. Include numbers, tables, or bullet points as appropriate.',
          },
          sql: {
            type: 'string',
            description: 'The SQL query used to get the data (if any was run).',
          },
        },
        required: ['answer'],
      }),
    }),
  }
}

const MAX_TURNS = 10

export interface ConversationHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function runQAAgent(
  question: string,
  schema: Schema,
  executor: QueryExecutor,
  onStep?: (step: string) => void,
  onThinking?: (text: string) => void,
  llmConfig?: LLMConfig | null,
  signal?: AbortSignal,
  conversationHistory?: ConversationHistoryMessage[],
): Promise<QAResult> {
  const steps: string[] = []
  const log = (msg: string) => {
    steps.push(msg)
    onStep?.(msg)
    console.log(`QAAgent: ${msg}`)
  }

  const { model, vendor, modelId } = createLLMModel(llmConfig)
  log(`Using ${vendor}/${modelId}`)

  const sqlRules = executor.sqlRules || ''
  const systemPrompt = `${SYSTEM_PROMPT}\n\n${sqlRules}`

  const ctx: ToolHandlerContext = { schema, executor, lastQueryResult: null, storedResults: [] }
  const agentTools = createQATools(ctx, log)
  
  const messages: ModelMessage[] = [
    ...(conversationHistory || []).map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: question }
  ]
  
  const tokenUsage: TokenUsageInfo = { promptTokens: 0, completionTokens: 0, totalTokens: 0, vendor, model: modelId }

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    console.log(`QAAgent: Turn ${turn + 1}`)

    if (turn >= MAX_TURNS - 2) {
      messages.push({
        role: 'user',
        content: 'You are running out of turns. Call answer_question NOW with whatever information you have.',
      })
    }

    const result = await generateText({
      model,
      system: systemPrompt,
      messages,
      tools: agentTools,
      maxOutputTokens: 8192,
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

    const answerCall = result.toolCalls?.find((tc) => tc.toolName === 'answer_question')
    if (answerCall) {
      const input = (answerCall as unknown as { input: { answer: string; sql?: string } }).input
      log('Answering question')

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
      // If the model responds with text only (no tool call), treat it as the answer
      return {
        answer: result.text || 'I was unable to answer the question.',
        steps,
        tokenUsage,
      }
    }

    messages.push(...result.response.messages)
  }

  throw new Error('Agent exceeded maximum turns without answering')
}
