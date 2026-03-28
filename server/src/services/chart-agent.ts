import { generateText, tool, jsonSchema, type ModelMessage } from 'ai'
import type { Schema, QueryExecutor, LLMConfig, ChartLibrary, ColorConfig, ChartFilter } from '../types.js'
import { createLLMModel } from './llm-providers/index.js'
import { getChartLibraryConfig } from './chart-libraries/index.js'
import { rowsToObjects } from './chart-agent-handlers.js'
import { buildSystemPrompt } from './chart-agent-prompts.js'
import { createDataTools, type ToolHandlerContext, type LogFn } from './agent-tools.js'
import { ReActOrchestrator, ReActWorkflowBuilder, type ReActState, type IntermediateStep } from './react-orchestrator.js'
import {
  assertNotAborted,
  accumulateTokenUsage,
  getReActMeta,
  formatAgentCycleLog,
  REACT_URGENCY_PROMPTS,
  setReActMeta,
  sanitizeTrailingAssistantToolCalls,
  type ToolCallLike,
} from './react-agent-utils.js'

/**
 * Token usage information returned from LLM calls
 */
export interface TokenUsageInfo {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  vendor: string
  model: string
}

export interface ChartAgentResult {
  title: string
  chartType: string
  sql: string
  description: string
  summary: string
  chartSpec: object
  data: Record<string, string>[]
  columns: string[]
  steps: string[]
  tokenUsage: TokenUsageInfo
  filters: ChartFilter[]
}

/**
 * Existing chart data that can be used to modify or regenerate a chart
 */
export interface ExistingChart {
  sql?: string
  chartSpec?: object
  data?: Record<string, string>[]
  description?: string
  userQuery?: string
}

/**
 * Chart-specific ReAct state
 */
interface ChartReActState extends ReActState<ChartAgentResult> {
  userQuery: string
  schema: Schema
  executor: QueryExecutor
  toolContext: ToolHandlerContext
  chartType: string
  existingChart?: ExistingChart
  llmConfig: {
    model: any
    vendor: string
    modelId: string
    temperature: number
  }
  chartLibConfig: {
    name: string
    specDescription: string
    promptRules: string
  }
  systemPrompt: string
  colorConfig?: ColorConfig | null
  tokenUsage: TokenUsageInfo
  steps: string[]
  signal?: AbortSignal
  onStep?: (step: string) => void
  onThinking?: (text: string) => void
  reasoningCycles: number
  maxReasoningCycles: number
}

/**
 * Creates the chart-specific tools including data exploration tools and create_chart
 */
function createChartTools(ctx: ToolHandlerContext, log: LogFn, chartSpecDescription: string) {
  return {
    ...createDataTools(ctx, log),
    create_chart: tool({
      description:
        'Create the final chart. Call this when you have query results and are ready to produce the visualization. This ends the conversation.',
      inputSchema: jsonSchema<{
        title: string
        chart_type?: string
        sql: string
        description: string
        summary: string
        chart_spec: string
        filters?: string
      }>({
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A short, professional chart title (e.g. "Monthly Revenue by Region", "Top 20 Prescribed Medications"). Do NOT repeat the user query verbatim. Use title case.' },
          chart_type: { type: 'string', description: 'Chart type: bar, line, area, pie, scatter, kpi, table, map' },
          sql: { type: 'string', description: 'The final SQL query used. If the user asked for filters, use {{placeholder_name}} syntax for filter values in the SQL.' },
          description: { type: 'string', description: 'Brief explanation of the chart' },
          summary: { type: 'string', description: 'A concise 2-3 sentence AI-generated summary that highlights key trends, patterns, outliers, or insights from the data. Mention the most significant data points and provide actionable insights when relevant. Use clear, non-technical language.' },
          chart_spec: { type: 'string', description: `${chartSpecDescription} Return as a JSON string.` },
          filters: { type: 'string', description: 'Optional JSON array of filter definitions when the user requests filtering. Each filter: {"placeholder":"name","label":"Display Name","type":"date|select|multi-select|text|number|boolean","column":"db_column","defaultValue":"value","options":["a","b"]}. The placeholder must match a {{placeholder}} in the SQL.' },
        },
        required: ['title', 'sql', 'description', 'summary', 'chart_spec'],
      }),
    }),
  }
}

interface CreateChartToolInput {
  title?: string
  chart_type?: string
  sql?: string
  description?: string
  summary?: string
  chart_spec?: string
  filters?: string
}

function getCreateChartInput(toolCall: ToolCallLike): CreateChartToolInput | undefined {
  const input = toolCall.input
  if (!input || typeof input !== 'object') {
    return undefined
  }
  return input as CreateChartToolInput
}

function getMissingCreateChartFields(input: CreateChartToolInput): string[] {
  const missingFields: string[] = []
  if (!input.title) missingFields.push('title')
  if (!input.sql) missingFields.push('sql')
  if (!input.description) missingFields.push('description')
  if (!input.summary) missingFields.push('summary')
  if (!input.chart_spec) missingFields.push('chart_spec')
  return missingFields
}

function parseChartFilters(filtersRaw: string | undefined, newSteps: string[], onStep?: (step: string) => void): ChartFilter[] {
  if (!filtersRaw) {
    return []
  }

  try {
    const filters = JSON.parse(filtersRaw) as ChartFilter[]
    const msg = `Parsed ${filters.length} filter(s): ${filters.map((f) => f.placeholder).join(', ')}`
    newSteps.push(msg)
    onStep?.(msg)
    return filters
  } catch {
    const msg = 'Warning: failed to parse filters JSON, ignoring'
    newSteps.push(msg)
    onStep?.(msg)
    return []
  }
}

/**
 * Converts string numbers to actual numbers in chart spec data values
 * This fixes issues where LLMs return numeric data as strings
 */
function coerceNumbersInSpec(spec: Record<string, unknown>): void {
  const layers = Array.isArray(spec.layer) ? (spec.layer as Record<string, unknown>[]) : [spec]
  for (const layer of layers) {
    const transforms = layer.transform as Record<string, unknown>[] | undefined
    if (!Array.isArray(transforms)) continue
    for (const t of transforms) {
      const from = t.from as Record<string, unknown> | undefined
      const data = from?.data as Record<string, unknown> | undefined
      const values = data?.values as Record<string, unknown>[] | undefined
      if (!Array.isArray(values)) continue
      for (const row of values) {
        for (const key of Object.keys(row)) {
          const v = row[key]
          if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) {
            row[key] = Number(v)
          }
        }
      }
    }
  }
}

/**
 * Reasoning Node - LLM decides what to do next
 */
async function reasoningNode(state: ChartReActState): Promise<Partial<ChartReActState>> {
  // Track reasoning cycles
  const reasoningCycles = state.reasoningCycles + 1

  const newSteps = [...state.steps]
  const log = (msg: string) => {
    newSteps.push(msg)
    state.onStep?.(msg)
    console.log(formatAgentCycleLog('ChartAgent(ReAct)', reasoningCycles, msg))
  }

  assertNotAborted(state.signal, 'ChartAgent(ReAct)', reasoningCycles, 'reason')

  // Force chart creation if running out of cycles (90% of max)
  const warningThreshold = Math.floor(state.maxReasoningCycles * 0.9)
  let conversationHistory = [...state.conversationHistory]
  if (reasoningCycles >= warningThreshold && state.toolContext.lastQueryResult) {
    conversationHistory = [
      ...conversationHistory,
      {
        role: 'user',
        content: REACT_URGENCY_PROMPTS.chartCreateNow,
      },
    ]
  }

  const agentTools = createChartTools(state.toolContext, log, state.chartLibConfig.specDescription)

  // Call LLM to reason and decide next action
  const result = await generateText({
    model: state.llmConfig.model,
    temperature: state.llmConfig.temperature,
    system: state.systemPrompt,
    messages: conversationHistory,
    tools: agentTools,
    maxOutputTokens: 16384,
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
async function actingNode(state: ChartReActState): Promise<Partial<ChartReActState>> {
  // Get current cycle from metadata (set by reasoning node)
  const meta = getReActMeta(state.metadata)
  const currentCycle = meta.currentCycle || state.reasoningCycles

  assertNotAborted(state.signal, 'ChartAgent(ReAct)', currentCycle, 'act')

  const toolCalls = (meta.lastToolCalls as ToolCallLike[]) || []
  
  if (toolCalls.length === 0) {
    throw new Error('Acting node called but no tool calls available')
  }

  const thought = meta.lastThought || ''
  const toolCall = toolCalls[0]
  const newSteps = [...state.steps]

  const recoverInvalidCreateChart = (reason: string): Partial<ChartReActState> => {
    const msg = `create_chart call was invalid (${reason}). Asking model to retry with required fields.`
    newSteps.push(msg)
    state.onStep?.(msg)

    const sanitizedHistory = sanitizeTrailingAssistantToolCalls(state.conversationHistory)

    const correctionPrompt =
      'Your previous create_chart tool call was invalid because required arguments were missing. ' +
      'Call create_chart again now and include ALL required fields: title, sql, description, summary, chart_spec. ' +
      'Do not call any other tool. Use this exact JSON shape for arguments: ' +
      '{"title":"...","chart_type":"bar|line|area|pie|scatter|kpi|table|map","sql":"...","description":"...","summary":"...","chart_spec":"{...json string...}"}'

    const step: IntermediateStep = {
      stepNumber: state.intermediateSteps.length + 1,
      thought,
      action: 'create_chart',
      actionInput: (toolCall.input as Record<string, unknown>) || {},
      observation: `Invalid create_chart tool call: ${reason}`,
      timestamp: new Date(),
    }

    return {
      intermediateSteps: [...state.intermediateSteps, step],
      conversationHistory: [
        ...sanitizedHistory,
        {
          role: 'user',
          content: correctionPrompt,
        },
      ],
      nextAction: 'create_chart',
      steps: newSteps,
      metadata: setReActMeta(state.metadata, {
        lastNode: 'act',
      }),
    }
  }

  // Check if this is the terminal create_chart action
  if (toolCall.toolName === 'create_chart') {
    const input = getCreateChartInput(toolCall)

    if (!input) {
      return recoverInvalidCreateChart('missing arguments')
    }

    const missingFields = getMissingCreateChartFields(input)

    if (missingFields.length > 0) {
      return recoverInvalidCreateChart(`missing ${missingFields.join(', ')}`)
    }

    const title = input.title as string
    const sql = input.sql as string
    const description = input.description as string
    const summary = input.summary as string
    const chartSpecRaw = input.chart_spec as string

    const msg = `Creating chart: "${title}"`
    newSteps.push(msg)
    state.onStep?.(msg)

    // Parse chart spec
    let chartSpec: object
    try {
      chartSpec = JSON.parse(chartSpecRaw)
      coerceNumbersInSpec(chartSpec as Record<string, unknown>)
    } catch {
      throw new Error(`Failed to parse chart spec JSON. Raw start: ${chartSpecRaw.substring(0, 200)}...`)
    }

    const filters = parseChartFilters(input.filters, newSteps, state.onStep)

    // Get data
    let data: Record<string, string>[] = []
    let columns: string[] = []
    if (state.toolContext.lastQueryResult) {
      columns = state.toolContext.lastQueryResult.columns
      data = rowsToObjects(columns, state.toolContext.lastQueryResult.rows)
    } else if (state.existingChart?.data?.length) {
      data = state.existingChart.data
      columns = Object.keys(state.existingChart.data[0])
    }

    const result: ChartAgentResult = {
      title,
      chartType: input.chart_type || 'auto',
      sql,
      description,
      summary,
      chartSpec,
      data,
      columns,
      steps: newSteps,
      tokenUsage: state.tokenUsage,
      filters,
    }

    // Create intermediate step for the final action
    const step: IntermediateStep = {
      stepNumber: state.intermediateSteps.length + 1,
      thought,
      action: 'create_chart',
      actionInput: { title: input.title, chartType: input.chart_type },
      observation: 'Chart created successfully',
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
function chartRouter(state: ChartReActState): string | 'END' {
  const meta = getReActMeta(state.metadata)

  if (state.isComplete) {
    return 'END'
  }

  if (state.nextAction === null) {
    throw new Error(`Agent finished without creating a chart: ${meta.lastThought || 'No response'}`)
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
 * Runs the chart generation agent using ReAct architecture
 * Agent explores schema, queries data, and creates visualizations
 * @returns Chart result with title, SQL, data, chart spec, and token usage
 */
export async function runChartAgent(
  userQuery: string,
  schema: Schema,
  executor: QueryExecutor,
  chartType: string,
  onStep?: (step: string) => void,
  onThinking?: (text: string) => void,
  existingChart?: ExistingChart,
  llmConfig?: LLMConfig | null,
  chartLibrary?: ChartLibrary | null,
  colorConfig?: ColorConfig | null,
  signal?: AbortSignal,
): Promise<ChartAgentResult> {
  const steps: string[] = []
  const log = (msg: string) => {
    steps.push(msg)
    onStep?.(msg)
    console.log(`ChartAgent(ReAct): ${msg}`)
  }

  const { model, vendor, modelId } = createLLMModel(llmConfig)
  const temperature = llmConfig?.temperature ?? 0.3
  const libConfig = getChartLibraryConfig(chartLibrary)
  log(`Using ${vendor}/${modelId}, chart library: ${libConfig.name}`)

  const chartTypeHint =
    chartType && chartType !== 'auto'
      ? `\nThe user has specifically requested a ${chartType} chart. Use that type unless the data is incompatible.\n`
      : ''

  const systemPrompt = buildSystemPrompt({
    existingChart,
    sqlRules: executor.sqlRules,
    chartLibRules: libConfig.promptRules,
    chartTypeHint,
    colorConfig,
  })

  const ctx: ToolHandlerContext = { schema, executor, lastQueryResult: null, storedResults: [] }
  const tokenUsage: TokenUsageInfo = { promptTokens: 0, completionTokens: 0, totalTokens: 0, vendor, model: modelId }

  // Build ReAct workflow
  const workflow = new ReActWorkflowBuilder<ChartReActState>()
    .addNode('reason', reasoningNode)
    .addNode('act', actingNode)
    .setRouter(chartRouter)
    .setEntryPoint('reason')
    .setMaxSteps(20) // Maximum reasoning cycles before forcing completion
    .setReasoningNodeName('reason')
    .build()

  // Create orchestrator with callbacks
  const orchestrator = new ReActOrchestrator(workflow, {
    onStep: (step) => {
      log(`Step ${step.stepNumber}: ${step.action}`)
    },
  })

  // Initial state
  const initialState: ChartReActState = {
    input: userQuery,
    userQuery,
    schema,
    executor,
    toolContext: ctx,
    chartType,
    existingChart,
    llmConfig: { model, vendor, modelId, temperature },
    chartLibConfig: libConfig,
    systemPrompt,
    colorConfig,
    tokenUsage,
    steps,
    signal,
    onStep,
    onThinking,
    intermediateSteps: [],
    conversationHistory: [{ role: 'user', content: userQuery }],
    nextAction: null,
    isComplete: false,
    result: null,
    metadata: {},
    reasoningCycles: 0,
    maxReasoningCycles: 20,
  }

  // Execute workflow
  const finalState = await orchestrator.execute(initialState)

  if (!finalState.result) {
    throw new Error('ReAct workflow completed but no result was produced')
  }

  return finalState.result
}
