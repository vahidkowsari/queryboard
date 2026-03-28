import type { Schema, QueryExecutor, LLMConfig, ChartLibrary, ColorConfig } from '../types.js'
import { createLLMModel } from './llm-providers/index.js'
import { getChartLibraryConfig } from './chart-libraries/index.js'
import { buildSystemPrompt } from './chart-agent-prompts.js'
import { ReActOrchestrator, ReActWorkflowBuilder } from './react-orchestrator.js'
import { REACT_TERMINAL_ERRORS } from './react-agent-utils.js'
import { reasoningNode, actingNode, chartRouter } from './chart-agent-nodes.js'
import type { ChartReActState, ExistingChart, ChartAgentResult, TokenUsageInfo } from './chart-agent-types.js'
import type { ToolHandlerContext } from './agent-tools.js'

export type { TokenUsageInfo, ChartAgentResult, ExistingChart } from './chart-agent-types.js'

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
    throw new Error(REACT_TERMINAL_ERRORS.chartNoResult)
  }

  return finalState.result
}
