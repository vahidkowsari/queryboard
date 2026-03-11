import { generateText, tool, jsonSchema, type ModelMessage } from 'ai'
import type { Schema, QueryExecutor, LLMConfig, ChartLibrary, ColorConfig, ChartFilter } from '../types.js'
import { createLLMModel } from './llm-providers/index.js'
import { getChartLibraryConfig } from './chart-libraries/index.js'
import { rowsToObjects } from './chart-agent-handlers.js'
import { buildSystemPrompt } from './chart-agent-prompts.js'
import { createDataTools, type ToolHandlerContext, type LogFn } from './agent-tools.js'

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
        chart_spec: string
        filters?: string
      }>({
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A short, professional chart title (e.g. "Monthly Revenue by Region", "Top 20 Prescribed Medications"). Do NOT repeat the user query verbatim. Use title case.' },
          chart_type: { type: 'string', description: 'Chart type: bar, line, area, pie, scatter, kpi, table, map' },
          sql: { type: 'string', description: 'The final SQL query used. If the user asked for filters, use {{placeholder_name}} syntax for filter values in the SQL.' },
          description: { type: 'string', description: 'Brief explanation of the chart' },
          chart_spec: { type: 'string', description: `${chartSpecDescription} Return as a JSON string.` },
          filters: { type: 'string', description: 'Optional JSON array of filter definitions when the user requests filtering. Each filter: {"placeholder":"name","label":"Display Name","type":"date|select|multi-select|text|number|boolean","column":"db_column","defaultValue":"value","options":["a","b"]}. The placeholder must match a {{placeholder}} in the SQL.' },
        },
        required: ['title', 'sql', 'description', 'chart_spec'],
      }),
    }),
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

const MAX_TURNS = 20

/**
 * Runs the chart generation agent that explores schema, queries data, and creates visualizations
 * Uses an agentic loop with tools for data exploration and chart creation
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
    console.log(`ChartAgent: ${msg}`)
  }

  const { model, vendor, modelId } = createLLMModel(llmConfig)
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
  const agentTools = createChartTools(ctx, log, libConfig.specDescription)
  const messages: ModelMessage[] = [{ role: 'user', content: userQuery }]
  const tokenUsage: TokenUsageInfo = { promptTokens: 0, completionTokens: 0, totalTokens: 0, vendor, model: modelId }

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    console.log(`ChartAgent: Turn ${turn + 1}`)

    if (turn >= MAX_TURNS - 2 && ctx.lastQueryResult) {
      messages.push({
        role: 'user',
        content:
          'You are running out of turns. You MUST call create_chart RIGHT NOW with the data you already have. Do not call any other tool.',
      })
    }

    const result = await generateText({
      model,
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

    const createChartCall = result.toolCalls?.find((tc) => tc.toolName === 'create_chart')
    if (createChartCall) {
      const input = (
        createChartCall as unknown as {
          input: { title: string; chart_type?: string; sql: string; description: string; chart_spec: string; filters?: string }
        }
      ).input
      log(`Creating chart: "${input.title}"`)

      let chartSpec: object
      try {
        chartSpec = JSON.parse(input.chart_spec)
        coerceNumbersInSpec(chartSpec as Record<string, unknown>)
      } catch {
        throw new Error(`Failed to parse chart spec JSON. The LLM returned invalid JSON (possibly truncated). Raw start: ${input.chart_spec?.substring(0, 200)}...`)
      }

      let filters: ChartFilter[] = []
      if (input.filters) {
        try {
          filters = JSON.parse(input.filters) as ChartFilter[]
          log(`Parsed ${filters.length} filter(s): ${filters.map((f) => f.placeholder).join(', ')}`)
        } catch {
          log('Warning: failed to parse filters JSON, ignoring')
        }
      }

      let data: Record<string, string>[] = []
      let columns: string[] = []
      if (ctx.lastQueryResult) {
        columns = ctx.lastQueryResult.columns
        data = rowsToObjects(columns, ctx.lastQueryResult.rows)
      } else if (existingChart?.data?.length) {
        data = existingChart.data
        columns = Object.keys(existingChart.data[0])
      }

      return {
        title: input.title,
        chartType: input.chart_type || 'auto',
        sql: input.sql,
        description: input.description,
        chartSpec,
        data,
        columns,
        steps,
        tokenUsage,
        filters,
      }
    }

    if (!result.toolCalls || result.toolCalls.length === 0) {
      throw new Error(`Agent finished without creating a chart: ${result.text || 'No response'}`)
    }

    messages.push(...result.response.messages)
  }

  throw new Error('Agent exceeded maximum turns without creating a chart')
}
