import { generateText } from 'ai'
import { rowsToObjects } from './chart-agent-handlers.js'
import {
  createChartTools,
  coerceNumbersInSpec,
  getCreateChartInput,
  getMissingCreateChartFields,
  parseChartFilters,
} from './chart-agent-helpers.js'
import type { ChartReActState, ChartAgentResult } from './chart-agent-types.js'
import type { IntermediateStep } from './react-orchestrator.js'
import {
  assertNotAborted,
  accumulateTokenUsage,
  formatAgentCycleLog,
  getReActMeta,
  incrementTelemetryCounter,
  REACT_RECOVERY_PROMPTS,
  REACT_URGENCY_PROMPTS,
  sanitizeTrailingAssistantToolCalls,
  setReActMeta,
  type ToolCallLike,
} from './react-agent-utils.js'

const MAX_INVALID_CREATE_CHART_RETRIES = 3

export async function reasoningNode(state: ChartReActState): Promise<Partial<ChartReActState>> {
  const reasoningCycles = state.reasoningCycles + 1

  const newSteps = [...state.steps]
  const log = (msg: string) => {
    newSteps.push(msg)
    state.onStep?.(msg)
    console.log(formatAgentCycleLog('ChartAgent(ReAct)', reasoningCycles, msg))
  }

  assertNotAborted(state.signal, 'ChartAgent(ReAct)', reasoningCycles, 'reason')

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

  if (thought) {
    state.onThinking?.(thought)
  }

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

export async function actingNode(state: ChartReActState): Promise<Partial<ChartReActState>> {
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
    const nextRetryCount = (meta.invalidCreateChartRetries || 0) + 1
    incrementTelemetryCounter('chart_agent.invalid_create_chart')

    if (nextRetryCount > MAX_INVALID_CREATE_CHART_RETRIES) {
      throw new Error(
        `create_chart tool call remained invalid after ${MAX_INVALID_CREATE_CHART_RETRIES} retries. Last error: ${reason}`
      )
    }

    const msg = `create_chart call was invalid (${reason}). Asking model to retry with required fields.`
    newSteps.push(msg)
    state.onStep?.(msg)

    const sanitizedHistory = sanitizeTrailingAssistantToolCalls(state.conversationHistory)

    const correctionPrompt = REACT_RECOVERY_PROMPTS.createChartRetry

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
        invalidCreateChartRetries: nextRetryCount,
      }),
    }
  }

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

    let chartSpec: object
    try {
      chartSpec = JSON.parse(chartSpecRaw)
      coerceNumbersInSpec(chartSpec as Record<string, unknown>)
    } catch {
      throw new Error(`Failed to parse chart spec JSON. Raw start: ${chartSpecRaw.substring(0, 200)}...`)
    }

    const filters = parseChartFilters(input.filters, newSteps, state.onStep)

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

    incrementTelemetryCounter('chart_agent.completed')

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

export function chartRouter(state: ChartReActState): string | 'END' {
  const meta = getReActMeta(state.metadata)

  if (state.isComplete) {
    return 'END'
  }

  if (state.nextAction === null) {
    throw new Error(`Agent finished without creating a chart: ${meta.lastThought || 'No response'}`)
  }

  const lastNode = meta.lastNode
  if (lastNode === 'reason') {
    return 'act'
  } else if (lastNode === 'act') {
    return 'reason'
  }

  return 'reason'
}
