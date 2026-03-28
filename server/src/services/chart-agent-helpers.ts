import { tool, jsonSchema } from 'ai'
import type { ChartFilter } from '../types.js'
import { createDataTools, type ToolHandlerContext, type LogFn } from './agent-tools.js'
import type { ToolCallLike } from './react-agent-utils.js'
import type { CreateChartToolInput } from './chart-agent-types.js'

export function createChartTools(ctx: ToolHandlerContext, log: LogFn, chartSpecDescription: string) {
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

export function getCreateChartInput(toolCall: ToolCallLike): CreateChartToolInput | undefined {
  const input = toolCall.input
  if (!input || typeof input !== 'object') {
    return undefined
  }
  return input as CreateChartToolInput
}

export function getMissingCreateChartFields(input: CreateChartToolInput): string[] {
  const missingFields: string[] = []
  if (!input.title) missingFields.push('title')
  if (!input.sql) missingFields.push('sql')
  if (!input.description) missingFields.push('description')
  if (!input.summary) missingFields.push('summary')
  if (!input.chart_spec) missingFields.push('chart_spec')
  return missingFields
}

export function parseChartFilters(filtersRaw: string | undefined, newSteps: string[], onStep?: (step: string) => void): ChartFilter[] {
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

export function coerceNumbersInSpec(spec: Record<string, unknown>): void {
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
