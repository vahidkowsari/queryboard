import type { Schema, QueryExecutor, QueryResult } from '../types.js'

/**
 * Converts query result rows to array of objects with column names as keys
 */
export function rowsToObjects(columns: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((row) => {
    const obj: Record<string, string> = {}
    columns.forEach((col, idx) => {
      obj[col] = row[idx] ?? ''
    })
    return obj
  })
}

/**
 * Formats row counts in human-readable format (K, M, B)
 */
function formatRowCount(n?: number): string {
  if (!n) return ''
  if (n >= 1_000_000_000) return `~${(n / 1_000_000_000).toFixed(1)}B rows`
  if (n >= 1_000_000) return `~${(n / 1_000_000).toFixed(1)}M rows`
  if (n >= 1_000) return `~${(n / 1_000).toFixed(1)}K rows`
  return `~${n} rows`
}

/**
 * Lists all tables with descriptions and column counts
 */
export function handleListTables(schema: Schema): string {
  const lines = Object.entries(schema.tables).map(([name, info]) => {
    const desc = info.description ? ` — ${info.description}` : ''
    const rc = formatRowCount(info.rowCount)
    return `${name}${desc} (${info.columns.length} columns${rc ? `, ${rc}` : ''})`
  })
  return lines.join('\n')
}

/**
 * Returns column information for a specific table
 */
export function handleGetColumns(schema: Schema, tableName: string): string {
  const table = schema.tables[tableName]
  if (!table) return `Error: Table "${tableName}" not found. Use list_tables to see available tables.`
  const lines = table.columns.map((c) => {
    const desc = c.description ? ` — ${c.description}` : ''
    return `  ${c.name} (${c.type})${desc}`
  })
  const tableDesc = table.description ? ` — ${table.description}` : ''
  const rc = formatRowCount(table.rowCount)
  const header = `${tableName}${tableDesc}${rc ? ` (${rc})` : ''}`
  return `${header}\n${lines.join('\n')}`
}

/**
 * Executes a query to get sample rows from a table
 */
export async function handleGetSampleData(executor: QueryExecutor, tableName: string, limit: number): Promise<string> {
  const sql = `SELECT * FROM ${tableName} LIMIT ${limit}`
  const result = await executor.execute(sql)
  const data = rowsToObjects(result.columns, result.rows)
  let text = `Sample data from ${tableName} (${data.length} rows, ${result.columns.length} columns):\n`
  text += `Columns: ${result.columns.join(', ')}\n`
  text += JSON.stringify(data, null, 2)
  return text
}

/**
 * Gets table row count and column statistics (distinct count, min, max)
 * Uses approximate functions for large tables to avoid expensive scans
 */
export async function handleGetTableStats(executor: QueryExecutor, tableName: string, columns: string[]): Promise<string> {
  // First, get a quick approximate row count using a small LIMIT to avoid full table scan
  const quickCountSql = `SELECT COUNT(*) as approx_count FROM (SELECT 1 FROM ${tableName} LIMIT 10000) t`
  let rowCount = 'unknown'
  let isApproximate = false
  
  try {
    const quickResult = await executor.execute(quickCountSql)
    const count = Number(quickResult.rows[0]?.[0] ?? 0)
    if (count >= 10000) {
      rowCount = '10K+ (large table)'
      isApproximate = true
    } else if (count > 0) {
      // For smaller tables, get exact count
      const exactCountSql = `SELECT COUNT(*) as row_count FROM ${tableName}`
      const exactResult = await executor.execute(exactCountSql)
      rowCount = exactResult.rows[0]?.[0] ?? 'unknown'
    }
  } catch {
    rowCount = 'unknown'
  }

  // Use approximate functions for large tables to avoid expensive scans
  const statParts = columns.slice(0, 6).map((col) => {
    if (isApproximate) {
      return `approx_distinct(${col}) as ${col}_distinct, MIN(${col}) as ${col}_min, MAX(${col}) as ${col}_max`
    }
    return `COUNT(DISTINCT ${col}) as ${col}_distinct, MIN(${col}) as ${col}_min, MAX(${col}) as ${col}_max`
  })
  
  const statsSql = `SELECT ${statParts.join(', ')} FROM ${tableName}`

  let text = `Table: ${tableName}\nTotal rows: ${rowCount}${isApproximate ? ' (⚠️ LARGE TABLE - use LIMIT in queries!)' : ''}\n`
  try {
    const statsResult = await executor.execute(statsSql)
    const row = statsResult.rows[0]
    if (row) {
      text += `Column stats${isApproximate ? ' (approximate)' : ''}:\n`
      columns.slice(0, 6).forEach((col, i) => {
        const distinct = row[i * 3] ?? '?'
        const min = row[i * 3 + 1] ?? '?'
        const max = row[i * 3 + 2] ?? '?'
        text += `  ${col}: ${distinct} distinct values, min=${min}, max=${max}\n`
      })
    }
  } catch {
    text += `(Could not compute column stats — some columns may not support MIN/MAX.)\n`
  }
  return text
}

/**
 * Searches for tables and columns matching a keyword
 */
export function handleSearchTables(schema: Schema, keyword: string): string {
  const lower = keyword.toLowerCase()
  const matches: string[] = []

  for (const [tableName, tableInfo] of Object.entries(schema.tables)) {
    const tableMatch = tableName.toLowerCase().includes(lower) ||
      (tableInfo.description?.toLowerCase().includes(lower) ?? false)

    const colMatches = tableInfo.columns.filter(
      (c) => c.name.toLowerCase().includes(lower) || (c.description?.toLowerCase().includes(lower) ?? false),
    )

    if (tableMatch) {
      matches.push(`TABLE: ${tableName}${tableInfo.description ? ` — ${tableInfo.description}` : ''} (${tableInfo.columns.length} columns)`)
    }
    if (colMatches.length > 0) {
      for (const c of colMatches) {
        matches.push(`  COLUMN: ${tableName}.${c.name} (${c.type})${c.description ? ` — ${c.description}` : ''}`)
      }
    }
  }

  if (matches.length === 0) return `No tables or columns matching "${keyword}" found.`
  return `Found ${matches.length} matches for "${keyword}":\n${matches.join('\n')}`
}

/**
 * Gets distinct values and their counts for a column
 */
export async function handleGetDistinctValues(
  executor: QueryExecutor,
  tableName: string,
  column: string,
  limit: number,
): Promise<string> {
  const sql = `SELECT ${column}, COUNT(*) as cnt FROM ${tableName} GROUP BY ${column} ORDER BY cnt DESC LIMIT ${limit}`
  const result = await executor.execute(sql)
  const data = rowsToObjects(result.columns, result.rows)
  const total = data.reduce((sum, r) => sum + Number(r.cnt || 0), 0)
  let text = `Distinct values for ${tableName}.${column} (top ${data.length}, total sampled rows: ${total}):\n`
  for (const row of data) {
    text += `  ${row[column] ?? 'NULL'}: ${row.cnt} rows\n`
  }
  return text
}

/**
 * Analyzes NULL vs non-NULL counts for specified columns
 */
export async function handleGetNullAnalysis(
  executor: QueryExecutor,
  tableName: string,
  columns: string[],
): Promise<string> {
  const parts = columns.slice(0, 10).flatMap((col) => [
    `COUNT(${col}) as ${col}_non_null`,
    `COUNT(*) - COUNT(${col}) as ${col}_null`,
  ])
  const sql = `SELECT COUNT(*) as total_rows, ${parts.join(', ')} FROM ${tableName}`
  const result = await executor.execute(sql)
  const row = result.rows[0]
  if (!row) return `No data in ${tableName}.`

  const totalRows = row[0] ?? '?'
  let text = `NULL analysis for ${tableName} (${totalRows} total rows):\n`
  columns.slice(0, 10).forEach((col, i) => {
    const nonNull = row[1 + i * 2] ?? '?'
    const nullCount = row[2 + i * 2] ?? '?'
    text += `  ${col}: ${nonNull} non-null, ${nullCount} null\n`
  })
  return text
}

/**
 * Gets min, max, and distinct count for a date/timestamp column
 */
export async function handleGetDateRange(
  executor: QueryExecutor,
  tableName: string,
  column: string,
): Promise<string> {
  const sql = `SELECT MIN(${column}) as min_date, MAX(${column}) as max_date, COUNT(DISTINCT ${column}) as distinct_dates FROM ${tableName}`
  const result = await executor.execute(sql)
  const row = result.rows[0]
  if (!row) return `No data in ${tableName}.`
  return `Date range for ${tableName}.${column}: min=${row[0] ?? '?'}, max=${row[1] ?? '?'}, ${row[2] ?? '?'} distinct values`
}

/**
 * Detects likely foreign key relationships based on column naming patterns
 */
export function handleGetTableRelationships(schema: Schema): string {
  const tables = Object.entries(schema.tables)
  const tableNames = new Set(Object.keys(schema.tables))
  const relationships: string[] = []

  for (const [tableName, tableInfo] of tables) {
    for (const col of tableInfo.columns) {
      const colLower = col.name.toLowerCase()
      if (!colLower.endsWith('_id') && colLower !== 'id') continue

      if (colLower === 'id') continue

      const refName = colLower.replace(/_id$/, '')
      for (const candidate of tableNames) {
        if (candidate === tableName) continue
        const candidateLower = candidate.toLowerCase()
        const candidateSingular = candidateLower.replace(/s$/, '')
        if (candidateLower === refName || candidateSingular === refName || candidateLower.endsWith(refName)) {
          relationships.push(`  ${tableName}.${col.name} → ${candidate} (likely FK)`)
        }
      }
    }
  }

  if (relationships.length === 0) {
    return 'No obvious table relationships detected from column naming patterns. Check column names manually with get_columns.'
  }
  return `Detected ${relationships.length} likely relationships:\n${relationships.join('\n')}`
}

export interface StoredQueryResult {
  name: string
  result: QueryResult
}

export type MergeStrategy = 'concat' | 'join' | 'label'

/**
 * Merges multiple stored query results using different strategies
 * Strategies: concat (union with _source), join (left join on key), label (stack with _source)
 */
export function handleMergeResults(
  storedResults: StoredQueryResult[],
  names: string[],
  strategy: MergeStrategy,
  joinKey?: string,
): { result: QueryResult; text: string } {
  const selected = names.map((n) => storedResults.find((s) => s.name === n))
  const missing = names.filter((_, i) => !selected[i])
  if (missing.length > 0) {
    return {
      result: { columns: [], rows: [] },
      text: `Error: Query results not found: ${missing.join(', ')}. Available: ${storedResults.map((s) => s.name).join(', ')}`,
    }
  }

  const results = selected as StoredQueryResult[]

  if (strategy === 'concat') {
    const allCols = new Set<string>()
    for (const r of results) r.result.columns.forEach((c) => allCols.add(c))
    const columns = ['_source', ...allCols]
    const rows: string[][] = []
    for (const r of results) {
      for (const row of r.result.rows) {
        const newRow = [r.name]
        for (const col of [...allCols]) {
          const idx = r.result.columns.indexOf(col)
          newRow.push(idx >= 0 ? row[idx] : '')
        }
        rows.push(newRow)
      }
    }
    const merged: QueryResult = { columns, rows }
    const data = rowsToObjects(columns, rows)
    let text = `Merged ${results.length} results (concat). ${columns.length} columns, ${rows.length} rows.\n`
    text += `Columns: ${columns.join(', ')}\n`
    text += `Sample (first 5):\n${JSON.stringify(data.slice(0, 5), null, 2)}`
    return { result: merged, text }
  }

  if (strategy === 'join' && joinKey) {
    const [left, right] = results
    const rightMap = new Map<string, string[]>()
    const rightKeyIdx = right.result.columns.indexOf(joinKey)
    const leftKeyIdx = left.result.columns.indexOf(joinKey)
    if (leftKeyIdx < 0 || rightKeyIdx < 0) {
      return {
        result: { columns: [], rows: [] },
        text: `Error: Join key "${joinKey}" not found in both results. Left columns: ${left.result.columns.join(', ')}. Right columns: ${right.result.columns.join(', ')}`,
      }
    }
    for (const row of right.result.rows) {
      rightMap.set(row[rightKeyIdx], row)
    }
    const rightExtraCols = right.result.columns.filter((c) => c !== joinKey)
    const columns = [...left.result.columns, ...rightExtraCols]
    const rows: string[][] = []
    for (const leftRow of left.result.rows) {
      const key = leftRow[leftKeyIdx]
      const rightRow = rightMap.get(key)
      const extra = rightExtraCols.map((col) => {
        if (!rightRow) return ''
        const idx = right.result.columns.indexOf(col)
        return idx >= 0 ? rightRow[idx] : ''
      })
      rows.push([...leftRow, ...extra])
    }
    const merged: QueryResult = { columns, rows }
    const data = rowsToObjects(columns, rows)
    let text = `Merged 2 results (join on "${joinKey}"). ${columns.length} columns, ${rows.length} rows.\n`
    text += `Columns: ${columns.join(', ')}\n`
    text += `Sample (first 5):\n${JSON.stringify(data.slice(0, 5), null, 2)}`
    return { result: merged, text }
  }

  if (strategy === 'label') {
    const first = results[0]
    const columns = ['_source', ...first.result.columns]
    const rows: string[][] = []
    for (const r of results) {
      for (const row of r.result.rows) {
        rows.push([r.name, ...row])
      }
    }
    const merged: QueryResult = { columns, rows }
    const data = rowsToObjects(columns, rows)
    let text = `Merged ${results.length} results (labeled). ${columns.length} columns, ${rows.length} rows.\n`
    text += `Columns: ${columns.join(', ')}\n`
    text += `Sample (first 5):\n${JSON.stringify(data.slice(0, 5), null, 2)}`
    return { result: merged, text }
  }

  return {
    result: { columns: [], rows: [] },
    text: `Error: Invalid strategy "${strategy}". Use "concat", "join", or "label".`,
  }
}

/**
 * Validates SQL syntax using EXPLAIN without executing the query
 */
export async function handleValidateSql(executor: QueryExecutor, sql: string): Promise<string> {
  const result = await executor.execute(`EXPLAIN ${sql}`)
  return `SQL is valid. Query plan:\n${result.rows.map((r) => r.join(' ')).join('\n')}`
}

/**
 * Extracts table names from SQL and provides column hints for error messages
 */
export function getColumnHintFromSql(sql: string, schema: Schema): string | null {
  const tableNames = Object.keys(schema.tables)
  const sqlLower = sql.toLowerCase()
  const matched = tableNames.filter((t) => sqlLower.includes(t.toLowerCase()))
  if (matched.length === 0) return null

  const lines = matched.map((t) => {
    const cols = schema.tables[t].columns.map((c) => c.name)
    return `Table "${t}" columns: ${cols.join(', ')}`
  })
  return `⚠️ Use get_columns to verify column names before retrying. Here are the actual columns for the tables in your query:\n${lines.join('\n')}`
}

/**
 * Executes a SQL query with automatic LIMIT if not specified
 * Returns both the result and a formatted text description
 */
export async function handleRunQuery(executor: QueryExecutor, sql: string, limit: number = 10000): Promise<{ result: QueryResult; text: string }> {
  const hasLimit = /\bLIMIT\s+\d+/i.test(sql)
  const finalSql = hasLimit ? sql : `${sql.replace(/;\s*$/, '')} LIMIT ${limit}`
  const result = await executor.execute(finalSql)
  const data = rowsToObjects(result.columns, result.rows)

  const truncated = !hasLimit && result.rows.length >= limit
  let text = `Query succeeded. ${result.columns.length} columns, ${result.rows.length} rows.\n`
  if (truncated) {
    text += `⚠️ Results truncated to ${limit} rows. Pass a higher limit or add an explicit LIMIT if you need more.\n`
  }
  text += `Columns: ${result.columns.join(', ')}\n`
  if (data.length > 0) {
    text += `Sample (first 5 rows):\n${JSON.stringify(data.slice(0, 5), null, 2)}`
  }
  return { result, text }
}
