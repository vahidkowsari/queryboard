import pg from 'pg'
import type { QueryExecutor, RedshiftDbConfig } from '../../types.js'

const REDSHIFT_RULES = `REDSHIFT SQL RULES:
- Redshift is based on PostgreSQL 8.0 — most PostgreSQL syntax works but with key differences.
- Use ::type for casting (e.g., col::integer, col::date) or CAST(col AS type).
- Use LISTAGG(col, ',') WITHIN GROUP (ORDER BY col) for string aggregation (no string_agg).
- Date functions: DATE_TRUNC('month', col), EXTRACT(YEAR FROM col), GETDATE(), DATEADD(), DATEDIFF().
- Use LIMIT to restrict result size.
- Window functions are supported: ROW_NUMBER(), RANK(), DENSE_RANK(), etc.
- Use double quotes for case-sensitive identifiers, single quotes for strings.
- ILIKE for case-insensitive pattern matching.
- No array types — avoid array_agg(), unnest(), ANY().
- No recursive CTEs — use iterative approaches instead.
- JSON: use JSON_EXTRACT_PATH_TEXT(col, 'key') instead of ->>.
- Use APPROXIMATE COUNT(DISTINCT col) for large cardinality counts.
- Prefer sort key columns in WHERE and ORDER BY for performance.`

/**
 * Creates a query executor for Amazon Redshift (PostgreSQL 8.0 based)
 * Includes SQL rules for Redshift-specific syntax and limitations
 */
export function createRedshiftExecutor(dbConfig: RedshiftDbConfig): QueryExecutor {
  const pool = new pg.Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: dbConfig.ssl ? { rejectUnauthorized: dbConfig.rejectUnauthorized ?? false } : false,
    connectionTimeoutMillis: 10000,
  })

  return {
    sqlRules: REDSHIFT_RULES,
    async execute(sql: string) {
      console.log('Redshift: Running query:', sql)
      const result = await pool.query(sql)
      const columns = result.fields.map((f) => f.name)
      const rows = result.rows.map((row) => columns.map((col) => (row[col] != null ? String(row[col]) : '')))
      console.log(`Redshift: Got ${columns.length} columns, ${rows.length} rows`)
      return { columns, rows }
    },
    async cleanup() {
      await pool.end()
    },
  }
}
