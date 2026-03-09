export interface Column {
  name: string
  type: string
  description?: string
}

export interface TableInfo {
  description?: string
  columns: Column[]
  rowCount?: number
}

export interface Schema {
  database: string
  engine: string
  detectedAt: string
  tables: Record<string, TableInfo>
}

export interface SchemaProvider {
  name: string
  detectSchema(): Promise<Schema>
}

export type ChartFilterType = 'date' | 'select' | 'multi-select' | 'text' | 'number' | 'boolean'

export interface ChartFilter {
  placeholder: string
  label: string
  type: ChartFilterType
  column: string
  defaultValue: string
  options?: string[]
  min?: number
  max?: number
}

export interface ChartData {
  name: string
  userQuery?: string
  description?: string
  query: string
  chartType?: string
  chartSpec?: object
  data?: unknown[]
  colorConfig?: { palette: string[]; background?: string; textColor?: string }
  filters?: ChartFilter[]
}

export interface QueryResult {
  columns: string[]
  rows: string[][]
  executionId?: string
}

export interface QueryExecutor {
  execute(sql: string): Promise<QueryResult>
  cleanup?(): Promise<void>
  sqlRules: string
}

// Keep for backward compat
export type AthenaQueryResult = QueryResult

// LLM vendor types
export type LLMVendor = 'anthropic' | 'openai' | 'google'

export interface LLMConfig {
  vendor: LLMVendor
  model?: string
  apiKey?: string
}

// Chart library types
export type ChartLibrary = 'vega-lite' | 'chartjs' | 'echarts' | 'plotly'

// Color config for charts
export interface ColorConfig {
  palette: string[] // ordered list of hex colors for data series
  background?: string // chart background color
  textColor?: string // axis/label text color
}

export type DbEngine = 'athena' | 'postgres' | 'mysql' | 'bigquery' | 'redshift'

export interface AthenaDbConfig {
  database: string
  workgroup: string
  region: string
  profile: string
}

export interface PostgresDbConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl?: boolean
  rejectUnauthorized?: boolean
}

export interface MySQLDbConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl?: boolean
  rejectUnauthorized?: boolean
}

export interface BigQueryDbConfig {
  projectId: string
  dataset: string
  keyFilePath?: string
}

export interface RedshiftDbConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl?: boolean
  rejectUnauthorized?: boolean
}

export type DbConfig = AthenaDbConfig | PostgresDbConfig | MySQLDbConfig | BigQueryDbConfig | RedshiftDbConfig

export type TokenUsageOperation = 'chart-generate' | 'schema-enrich' | 'llm-generate' | 'qa-ask'

export interface TokenUsageRecord {
  projectId: string
  chartId?: string | null
  vendor: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost?: string | null
  operation: TokenUsageOperation
}

export interface TokenUsageSummary {
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  totalEstimatedCost: number
  byModel: { model: string; vendor: string; totalTokens: number; estimatedCost: number }[]
  byOperation: { operation: string; totalTokens: number; count: number }[]
}

export interface ProjectRow {
  id: string
  name: string
  description: string | null
  dbEngine: DbEngine
  dbConfig: DbConfig
  llmConfig: LLMConfig | null
  chartLibrary: ChartLibrary | null
  colorConfig: ColorConfig | null
  schemaCache: Schema | null
  schemaDetectedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
