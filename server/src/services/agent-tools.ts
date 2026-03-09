import { tool, jsonSchema } from 'ai'
import type { Schema, QueryExecutor, QueryResult } from '../types.js'
import {
  handleListTables,
  handleGetColumns,
  handleGetSampleData,
  handleGetTableStats,
  handleSearchTables,
  handleGetDistinctValues,
  handleGetNullAnalysis,
  handleGetDateRange,
  handleGetTableRelationships,
  handleValidateSql,
  handleRunQuery,
  handleMergeResults,
  getColumnHintFromSql,
  type StoredQueryResult,
  type MergeStrategy,
} from './chart-agent-handlers.js'

export interface ToolHandlerContext {
  schema: Schema
  executor: QueryExecutor
  lastQueryResult: QueryResult | null
  storedResults: StoredQueryResult[]
}

export type LogFn = (msg: string) => void

export function createDataTools(ctx: ToolHandlerContext, log: LogFn) {
  return {
    list_tables: tool({
      description:
        'List all available database tables with their descriptions. Call this first to understand what data is available.',
      inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
        required: [],
      }),
      execute: async () => {
        log('Listing tables...')
        return handleListTables(ctx.schema)
      },
    }),
    get_columns: tool({
      description:
        'Get column names, types, and descriptions for a specific table. Use this to understand table structure before writing SQL.',
      inputSchema: jsonSchema<{ table_name: string }>({
        type: 'object',
        properties: {
          table_name: { type: 'string', description: 'The table name to inspect' },
        },
        required: ['table_name'],
      }),
      execute: async ({ table_name }) => {
        log(`Inspecting columns: ${table_name}`)
        return handleGetColumns(ctx.schema, table_name)
      },
    }),
    get_sample_data: tool({
      description:
        'Preview a few rows from a table without writing SQL. Use this to understand what the data looks like (value formats, NULLs, string patterns) before writing your query.',
      inputSchema: jsonSchema<{ table_name: string; limit?: number }>({
        type: 'object',
        properties: {
          table_name: { type: 'string', description: 'The table to sample from' },
          limit: { type: 'number', description: 'Number of rows to return (default 5, max 10)' },
        },
        required: ['table_name'],
      }),
      execute: async ({ table_name, limit }) => {
        const n = Math.min(limit || 5, 10)
        log(`Sampling ${n} rows from ${table_name}`)
        try {
          return await handleGetSampleData(ctx.executor, table_name, n)
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          log(`Sample error: ${errMsg}`)
          return `Error: ${errMsg}`
        }
      },
    }),
    get_table_stats: tool({
      description:
        'Get row count and column statistics (distinct count, min, max) for a table. Use this to understand data distribution before choosing aggregations or filters.',
      inputSchema: jsonSchema<{ table_name: string; columns: string[] }>({
        type: 'object',
        properties: {
          table_name: { type: 'string', description: 'The table to analyze' },
          columns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Up to 6 column names to compute stats for',
          },
        },
        required: ['table_name', 'columns'],
      }),
      execute: async ({ table_name, columns }) => {
        log(`Getting stats for ${table_name}: ${columns.join(', ')}`)
        try {
          return await handleGetTableStats(ctx.executor, table_name, columns)
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          log(`Stats error: ${errMsg}`)
          return `Error: ${errMsg}`
        }
      },
    }),
    search_tables: tool({
      description:
        'Search for tables and columns by keyword. Use this when you have many tables and need to find the right one quickly, instead of listing all tables and inspecting each.',
      inputSchema: jsonSchema<{ keyword: string }>({
        type: 'object',
        properties: {
          keyword: { type: 'string', description: 'Keyword to search for in table names, column names, and descriptions' },
        },
        required: ['keyword'],
      }),
      execute: async ({ keyword }) => {
        log(`Searching tables for: ${keyword}`)
        return handleSearchTables(ctx.schema, keyword)
      },
    }),
    get_distinct_values: tool({
      description:
        'Get distinct values and their row counts for a column. Use this to discover valid filter values (e.g., status codes, categories, regions) before writing WHERE clauses.',
      inputSchema: jsonSchema<{ table_name: string; column: string; limit?: number }>({
        type: 'object',
        properties: {
          table_name: { type: 'string', description: 'The table to query' },
          column: { type: 'string', description: 'The column to get distinct values for' },
          limit: { type: 'number', description: 'Max distinct values to return (default 50)' },
        },
        required: ['table_name', 'column'],
      }),
      execute: async ({ table_name, column, limit }) => {
        const n = Math.min(limit || 50, 200)
        log(`Getting distinct values: ${table_name}.${column} (top ${n})`)
        try {
          return await handleGetDistinctValues(ctx.executor, table_name, column, n)
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          log(`Distinct values error: ${errMsg}`)
          return `Error: ${errMsg}`
        }
      },
    }),
    get_null_analysis: tool({
      description:
        'Get NULL vs non-NULL counts for columns in a table. Use this to check data completeness before using columns in aggregations or filters.',
      inputSchema: jsonSchema<{ table_name: string; columns: string[] }>({
        type: 'object',
        properties: {
          table_name: { type: 'string', description: 'The table to analyze' },
          columns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Up to 10 column names to check for NULLs',
          },
        },
        required: ['table_name', 'columns'],
      }),
      execute: async ({ table_name, columns }) => {
        log(`NULL analysis: ${table_name} (${columns.join(', ')})`)
        try {
          return await handleGetNullAnalysis(ctx.executor, table_name, columns)
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          log(`NULL analysis error: ${errMsg}`)
          return `Error: ${errMsg}`
        }
      },
    }),
    get_date_range: tool({
      description:
        'Get the MIN and MAX values plus distinct count for a date/timestamp column. Use this before building time-series queries to understand the data range.',
      inputSchema: jsonSchema<{ table_name: string; column: string }>({
        type: 'object',
        properties: {
          table_name: { type: 'string', description: 'The table to query' },
          column: { type: 'string', description: 'The date or timestamp column' },
        },
        required: ['table_name', 'column'],
      }),
      execute: async ({ table_name, column }) => {
        log(`Date range: ${table_name}.${column}`)
        try {
          return await handleGetDateRange(ctx.executor, table_name, column)
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          log(`Date range error: ${errMsg}`)
          return `Error: ${errMsg}`
        }
      },
    }),
    get_table_relationships: tool({
      description:
        'Detect likely foreign key relationships between tables based on column naming patterns (e.g., patient_id → patients). Use this before writing JOINs to find correct join keys.',
      inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
        required: [],
      }),
      execute: async () => {
        log('Detecting table relationships...')
        return handleGetTableRelationships(ctx.schema)
      },
    }),
    validate_sql: tool({
      description:
        'Validate a SQL query without executing it (runs EXPLAIN). Use this to check for syntax errors before running an expensive query.',
      inputSchema: jsonSchema<{ sql: string }>({
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'The SQL query to validate' },
        },
        required: ['sql'],
      }),
      execute: async ({ sql }) => {
        log(`Validating SQL: ${sql.substring(0, 100)}...`)
        try {
          return await handleValidateSql(ctx.executor, sql)
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          log(`Validation error: ${errMsg}`)
          return `SQL is invalid: ${errMsg}`
        }
      },
    }),
    run_query: tool({
      description:
        'Execute a SQL query and return the results. If the query fails, you will get an error message — fix the SQL and try again. A default row limit of 10000 is applied to prevent runaway queries; pass a different limit if needed. Pass a "name" to store the result for later use with merge_results.',
      inputSchema: jsonSchema<{ sql: string; limit?: number; name?: string }>({
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'The SQL query to execute' },
          limit: { type: 'number', description: 'Maximum number of rows to return (default 10000)' },
          name: { type: 'string', description: 'Optional name to store this result for later use with merge_results (e.g. "before", "cohort_a")' },
        },
        required: ['sql'],
      }),
      execute: async ({ sql, limit, name }) => {
        const rowLimit = limit ?? 10000
        log(`Running query${name ? ` "${name}"` : ''} (limit ${rowLimit}): ${sql.substring(0, 100)}...`)
        try {
          const { result, text } = await handleRunQuery(ctx.executor, sql, rowLimit)
          ctx.lastQueryResult = result
          if (name) {
            const existing = ctx.storedResults.findIndex((s) => s.name === name)
            if (existing >= 0) ctx.storedResults[existing] = { name, result }
            else ctx.storedResults.push({ name, result })
          }
          return text
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          log(`Query error: ${errMsg}`)
          const isColumnError = /column.*not found|cannot be resolved|unknown column|does not exist/i.test(errMsg)
          if (isColumnError) {
            const hint = getColumnHintFromSql(sql, ctx.schema)
            if (hint) return `Error: ${errMsg}\n\n${hint}`
          }
          return `Error: ${errMsg}`
        }
      },
    }),
    merge_results: tool({
      description:
        'Merge two or more previously named query results into one dataset. Use this for before/after comparisons, cohort analysis, or combining data from different tables. Strategies: "concat" unions all rows with a _source column, "join" does a left join on a shared key column, "label" stacks results with a _source label (same columns required).',
      inputSchema: jsonSchema<{ names: string[]; strategy: string; join_key?: string }>({
        type: 'object',
        properties: {
          names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Names of stored query results to merge (from run_query name param)',
          },
          strategy: {
            type: 'string',
            description: 'Merge strategy: "concat" (union rows + _source column), "join" (left join on key), "label" (stack with _source, same columns)',
          },
          join_key: {
            type: 'string',
            description: 'Column to join on (required for "join" strategy)',
          },
        },
        required: ['names', 'strategy'],
      }),
      execute: async ({ names, strategy, join_key }) => {
        log(`Merging results: ${names.join(' + ')} (${strategy}${join_key ? `, key=${join_key}` : ''})`)
        const { result, text } = handleMergeResults(ctx.storedResults, names, strategy as MergeStrategy, join_key)
        if (result.columns.length > 0) {
          ctx.lastQueryResult = result
        }
        return text
      },
    }),
  }
}
