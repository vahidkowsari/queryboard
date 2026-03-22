export type ChartType = 'auto' | 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'kpi' | 'table'

export type ChartDataRow = Record<string, string>

export interface VegaFieldDef {
  field?: string
  type?: 'quantitative' | 'temporal' | 'ordinal' | 'nominal'
  aggregate?: string
  [key: string]: unknown
}

export interface VegaSpec {
  $schema?: string
  data?: { values?: ChartDataRow[] }
  mark?: string | { type?: string; fontSize?: number; fontWeight?: string; [key: string]: unknown }
  encoding?: {
    x?: VegaFieldDef
    y?: VegaFieldDef
    theta?: VegaFieldDef
    color?: VegaFieldDef
    text?: VegaFieldDef
    [key: string]: VegaFieldDef | undefined
  }
  title?: string
  width?: number | string
  height?: number
  [key: string]: unknown
}

export interface Dashboard {
  id: string
  name: string
  description?: string
  shareToken?: string | null
  thumbnail: { type: 'Buffer'; data: number[] } | null
  charts: Chart[]
  chartCount?: number
  createdAt: Date
  updatedAt: Date
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

export interface Chart {
  id: string
  dashboardId: string
  name: string
  userQuery: string
  description?: string
  summary?: string
  query: string
  chartType?: ChartType
  chartSpec?: Record<string, unknown>
  data?: ChartDataRow[]
  colorConfig?: ColorConfig
  filters?: ChartFilter[]
  createdBy?: string | null
  lastRefreshedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

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
  palette: string[]
  background?: string
  textColor?: string
}

// Project types
export type DbEngine = 'athena' | 'postgres' | 'mysql' | 'bigquery' | 'redshift' | 'snowflake' | 'databricks'

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

export interface SnowflakeDbConfig {
  account: string
  username: string
  password: string
  database: string
  schema: string
  warehouse: string
  role?: string
}

export interface DatabricksDbConfig {
  host: string
  port: number
  httpPath: string
  token: string
  catalog: string
  schema: string
}

export type DbConfig = AthenaDbConfig | PostgresDbConfig | MySQLDbConfig | BigQueryDbConfig | RedshiftDbConfig | SnowflakeDbConfig | DatabricksDbConfig

export interface Project {
  id: string
  name: string
  description?: string
  dbEngine: DbEngine
  dbConfig: DbConfig
  llmConfig?: LLMConfig
  chartLibrary?: ChartLibrary
  colorConfig?: ColorConfig
  schemaDetectedAt?: Date
  createdAt: Date
  updatedAt: Date
}

// Schema types (shared with SchemaExplorer)
export interface SchemaColumn {
  name: string
  type: string
  description?: string
  nullable?: boolean
  isPrimaryKey?: boolean
  isPartitionKey?: boolean
  references?: { table: string; column: string }
  sampleValues?: string[]
}

export interface SchemaTable {
  description?: string
  columns: SchemaColumn[]
  rowCount?: number
  isView?: boolean
  partitionKeys?: string[]
}

export interface Schema {
  database: string
  engine: string
  detectedAt: string
  tables: Record<string, SchemaTable>
}

export interface SchemaJob {
  id: string
  projectId: string
  status: 'pending' | 'running' | 'complete' | 'error'
  phase: string | null
  message: string | null
  current: number | null
  total: number | null
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export type RefreshTriggerType = 'manual' | 'scheduled' | 'filter'
export type RefreshStatus = 'success' | 'error'

export interface RefreshHistory {
  id: string
  chartId: string
  dashboardId: string
  triggeredBy?: string
  triggerType: RefreshTriggerType
  status: RefreshStatus
  executionTimeMs?: number
  rowCount?: number
  errorMessage?: string
  createdAt: Date
}
