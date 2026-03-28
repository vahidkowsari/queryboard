import type { LanguageModel, ModelMessage } from 'ai'
import type { Schema, QueryExecutor, ColorConfig, ChartFilter } from '../types.js'
import type { ToolHandlerContext } from './agent-tools.js'
import type { ReActState } from './react-orchestrator.js'

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

export interface ExistingChart {
  sql?: string
  chartSpec?: object
  data?: Record<string, string>[]
  description?: string
  userQuery?: string
}

export interface CreateChartToolInput {
  title?: string
  chart_type?: string
  sql?: string
  description?: string
  summary?: string
  chart_spec?: string
  filters?: string
}

export interface ChartReActState extends ReActState<ChartAgentResult> {
  userQuery: string
  schema: Schema
  executor: QueryExecutor
  toolContext: ToolHandlerContext
  chartType: string
  existingChart?: ExistingChart
  llmConfig: {
    model: LanguageModel
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
  conversationHistory: ModelMessage[]
}
