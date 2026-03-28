import { generateText, tool, jsonSchema, type ModelMessage } from 'ai'
import type { Schema, QueryExecutor, LLMConfig } from '../types.js'
import { createLLMModel } from './llm-providers/index.js'
import { rowsToObjects } from './chart-agent-handlers.js'
import { createDataTools, type ToolHandlerContext } from './agent-tools.js'
import type { TokenUsageInfo } from './chart-agent.js'
import { ReActOrchestrator, ReActWorkflowBuilder, type ReActState, type IntermediateStep } from './react-orchestrator.js'
import {
  assertNotAborted,
  accumulateTokenUsage,
  formatAgentCycleLog,
  getReActMeta,
  REACT_URGENCY_PROMPTS,
  setReActMeta,
  type ToolCallLike,
} from './react-agent-utils.js'

/**
 * Result from the QA agent containing answer, optional SQL/data, and token usage
 */
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

/**
 * Creates the QA-specific tools including data exploration and answer_question
 */
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

/**
 * Message format for conversation history
 */
export interface ConversationHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * QA-specific ReAct state
 */
interface QAReActState extends ReActState<QAResult> {
  question: string
  schema: Schema
  executor: QueryExecutor
  toolContext: ToolHandlerContext
  llmConfig: {
    model: any
    vendor: string
    modelId: string
    temperature: number
  }
  tokenUsage: TokenUsageInfo
  steps: string[]
  signal?: AbortSignal
  onStep?: (step: string) => void
  onThinking?: (text: string) => void
  reasoningCycles: number
  maxReasoningCycles: number
}

/**
 * Reasoning Node - LLM decides what to do next
 */
async function reasoningNode(state: QAReActState): Promise<Partial<QAReActState>> {
  // Track reasoning cycles
  const reasoningCycles = state.reasoningCycles + 1

  const newSteps = [...state.steps]
  const log = (msg: string) => {
    newSteps.push(msg)
    state.onStep?.(msg)
    console.log(formatAgentCycleLog('QAAgent(ReAct)', reasoningCycles, msg))
  }

  assertNotAborted(state.signal, 'QAAgent(ReAct)', reasoningCycles, 'reason')

  // Warn agent to answer soon if running out of cycles (80% of max)
  const warningThreshold = Math.floor(state.maxReasoningCycles * 0.8)
  let conversationHistory = [...state.conversationHistory]
  if (reasoningCycles >= warningThreshold) {
    conversationHistory = [
      ...conversationHistory,
      {
        role: 'user',
        content: REACT_URGENCY_PROMPTS.qaAnswerNow,
      },
    ]
  }

  const agentTools = createQATools(state.toolContext, log)

  // Call LLM to reason and decide next action
  const result = await generateText({
    model: state.llmConfig.model,
    temperature: state.llmConfig.temperature,
    system: SYSTEM_PROMPT,
    messages: conversationHistory,
    tools: agentTools,
    maxOutputTokens: 8192,
    abortSignal: state.signal,
  })

  const newTokenUsage = accumulateTokenUsage(state.tokenUsage, result.usage)

  const thought = result.text?.trim() || ''
  const toolCalls = result.toolCalls || []

  // Stream thinking text to UI
  if (thought) {
    state.onThinking?.(thought)
  }

  // Update conversation history
  const updatedHistory = [...conversationHistory, ...result.response.messages]

  return {
    conversationHistory: updatedHistory,
    nextAction: toolCalls.length > 0 ? toolCalls[0].toolName : null,
    steps: newSteps,
    tokenUsage: newTokenUsage,
    reasoningCycles,
    metadata: setReActMeta(state.metadata, {
      lastThought: thought,
      lastToolCalls: toolCalls,
      lastNode: 'reason',
      currentCycle: reasoningCycles,
    }),
  }
}

/**
 * Acting Node - Process the tool execution results from reasoning node
 * Note: Tools are already executed by AI SDK in generateText, we just need to
 * extract terminal actions and track intermediate steps
 */
async function actingNode(state: QAReActState): Promise<Partial<QAReActState>> {
  // Get current cycle from metadata (set by reasoning node)
  const meta = getReActMeta(state.metadata)
  const currentCycle = meta.currentCycle || state.reasoningCycles

  assertNotAborted(state.signal, 'QAAgent(ReAct)', currentCycle, 'act')

  const toolCalls = (meta.lastToolCalls as ToolCallLike[]) || []
  
  if (toolCalls.length === 0) {
    throw new Error('Acting node called but no tool calls available')
  }

  const thought = meta.lastThought || ''
  const toolCall = toolCalls[0]
  const newSteps = [...state.steps]

  // Check if this is the terminal answer_question action
  if (toolCall.toolName === 'answer_question') {
    const input = toolCall.input as { answer: string; sql?: string }

    const msg = 'Answering question'
    newSteps.push(msg)
    state.onStep?.(msg)

    // Include query data if agent ran a query
    let data: Record<string, string>[] | undefined
    let columns: string[] | undefined
    let sql: string | undefined
    if (state.toolContext.lastQueryResult) {
      columns = state.toolContext.lastQueryResult.columns
      data = rowsToObjects(columns, state.toolContext.lastQueryResult.rows)
      sql = 'See steps for SQL query'
    }

    const result: QAResult = {
      answer: input.answer,
      sql: input.sql,
      data,
      columns,
      steps: newSteps,
      tokenUsage: state.tokenUsage,
    }

    // Create intermediate step for the final action
    const step: IntermediateStep = {
      stepNumber: state.intermediateSteps.length + 1,
      thought,
      action: 'answer_question',
      actionInput: { answer: input.answer.substring(0, 100) },
      observation: 'Answer provided',
      timestamp: new Date(),
    }

    return {
      intermediateSteps: [...state.intermediateSteps, step],
      steps: newSteps,
      isComplete: true,
      result,
      metadata: setReActMeta(state.metadata, {
        lastNode: 'act',
      }),
    }
  }

  // For other tools, they were already executed by AI SDK in the reasoning node
  // The tool results are already in the conversation history
  // We just need to track this as an intermediate step
  const step: IntermediateStep = {
    stepNumber: state.intermediateSteps.length + 1,
    thought,
    action: toolCall.toolName,
    actionInput: (toolCall.input as Record<string, unknown>) || {},
    observation: 'Tool executed by AI SDK (see conversation history)',
    timestamp: new Date(),
  }

  return {
    intermediateSteps: [...state.intermediateSteps, step],
    steps: newSteps,
    metadata: setReActMeta(state.metadata, {
      lastNode: 'act',
    }),
  }
}

/**
 * Router - Decides which node to execute next
 */
function qaRouter(state: QAReActState): string | 'END' {
  const meta = getReActMeta(state.metadata)

  if (state.isComplete) {
    return 'END'
  }

  if (state.nextAction === null) {
    throw new Error(`Agent finished without answering: ${meta.lastThought || 'No response'}`)
  }

  // After reasoning, go to acting. After acting, go back to reasoning.
  const lastNode = meta.lastNode
  if (lastNode === 'reason') {
    return 'act'
  } else if (lastNode === 'act') {
    return 'reason'
  }

  // Initial state - start with reasoning
  return 'reason'
}

/**
 * Runs the Q&A agent using ReAct architecture
 * Agent answers questions about data using schema exploration and SQL queries
 * Supports conversation history for multi-turn conversations
 * @returns Answer with optional SQL query, data, and token usage
 */
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
    console.log(`QAAgent(ReAct): ${msg}`)
  }

  const { model, vendor, modelId } = createLLMModel(llmConfig)
  const temperature = llmConfig?.temperature ?? 0.3
  log(`Using ${vendor}/${modelId}`)

  const ctx: ToolHandlerContext = { schema, executor, lastQueryResult: null, storedResults: [] }
  const tokenUsage: TokenUsageInfo = { promptTokens: 0, completionTokens: 0, totalTokens: 0, vendor, model: modelId }

  // Build conversation messages with history
  const messages: ModelMessage[] = [{ role: 'user', content: question }]
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      messages.unshift({ role: msg.role, content: msg.content })
    }
  }

  // Build ReAct workflow
  const workflow = new ReActWorkflowBuilder<QAReActState>()
    .addNode('reason', reasoningNode)
    .addNode('act', actingNode)
    .setRouter(qaRouter)
    .setEntryPoint('reason')
    .setMaxSteps(10) // Maximum reasoning cycles before forcing completion
    .setReasoningNodeName('reason')
    .build()

  // Create orchestrator with callbacks
  const orchestrator = new ReActOrchestrator(workflow, {
    onStep: (step) => {
      log(`Step ${step.stepNumber}: ${step.action}`)
    },
  })

  // Initial state
  const initialState: QAReActState = {
    input: question,
    question,
    schema,
    executor,
    toolContext: ctx,
    llmConfig: { model, vendor, modelId, temperature },
    tokenUsage,
    steps,
    signal,
    onStep,
    onThinking,
    intermediateSteps: [],
    conversationHistory: messages,
    nextAction: null,
    isComplete: false,
    result: null,
    metadata: {},
    reasoningCycles: 0,
    maxReasoningCycles: 10,
  }

  // Execute workflow
  const finalState = await orchestrator.execute(initialState)

  if (!finalState.result) {
    throw new Error('ReAct workflow completed but no result was produced')
  }

  return finalState.result
}
