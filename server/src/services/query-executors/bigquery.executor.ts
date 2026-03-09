import { BigQuery } from '@google-cloud/bigquery'
import type { QueryExecutor, BigQueryDbConfig } from '../../types.js'

const BIGQUERY_RULES = `BIGQUERY SQL RULES:
- Use backticks for table references: \`project.dataset.table\`.
- BigQuery uses Standard SQL by default.
- Use CAST(col AS INT64), CAST(col AS FLOAT64), CAST(col AS STRING), CAST(col AS DATE).
- Date functions: DATE_TRUNC(date, MONTH), EXTRACT(YEAR FROM date), CURRENT_DATE(), DATE_DIFF().
- String functions: CONCAT(), SUBSTR(), LENGTH(), TRIM(), REGEXP_CONTAINS().
- Use IFNULL() or COALESCE() for null handling.
- String aggregation: STRING_AGG(col, ', ').
- BigQuery supports window functions: ROW_NUMBER(), RANK(), DENSE_RANK(), etc.
- Use LIMIT to restrict result size.
- BigQuery uses STRUCT and ARRAY types — UNNEST() to flatten arrays.
- Avoid SELECT * on large tables — always specify columns.
- Use SAFE_CAST() for safe type conversions that return NULL instead of errors.`

export function createBigQueryExecutor(dbConfig: BigQueryDbConfig): QueryExecutor {
  const bq = new BigQuery({
    projectId: dbConfig.projectId,
    ...(dbConfig.keyFilePath ? { keyFilename: dbConfig.keyFilePath } : {}),
  })

  return {
    sqlRules: BIGQUERY_RULES,
    async execute(sql: string) {
      console.log('BigQuery: Running query:', sql)
      const [rows] = await bq.query({ query: sql, location: 'US' })
      if (!rows.length) return { columns: [], rows: [] }

      const columns = Object.keys(rows[0])
      const dataRows = rows.map((row: Record<string, unknown>) =>
        columns.map((col) => (row[col] != null ? String(row[col]) : '')),
      )
      console.log(`BigQuery: Got ${columns.length} columns, ${dataRows.length} rows`)
      return { columns, rows: dataRows }
    },
  }
}
