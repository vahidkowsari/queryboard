import pg from 'pg'
import type { QueryExecutor, PostgresDbConfig } from '../../types.js'

const POSTGRES_RULES = `POSTGRESQL SQL RULES:
- PostgreSQL supports standard SQL with rich type system.
- Use ::type for casting (e.g., col::integer, col::date) or CAST(col AS type).
- String aggregation: use string_agg(col, ', ') instead of GROUP_CONCAT.
- Date functions: DATE_TRUNC('month', col), EXTRACT(YEAR FROM col), AGE(), NOW().
- Use LIMIT to restrict result size.
- PostgreSQL supports window functions: ROW_NUMBER(), RANK(), DENSE_RANK(), etc.
- Use double quotes for case-sensitive identifiers, single quotes for strings.
- Use ILIKE for case-insensitive pattern matching.
- Arrays: use ANY(), array_agg(), unnest().
- JSON: use ->, ->>, jsonb_extract_path_text().`

/**
 * Creates a query executor for PostgreSQL with connection pooling
 * Includes SQL rules for PostgreSQL-specific syntax and features
 */
export function createPostgresExecutor(dbConfig: PostgresDbConfig): QueryExecutor {
  const pool = new pg.Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: dbConfig.ssl ? { rejectUnauthorized: dbConfig.rejectUnauthorized ?? true } : false,
    connectionTimeoutMillis: 10000,
  })

  return {
    sqlRules: POSTGRES_RULES,
    async execute(sql: string) {
      console.log('PostgreSQL: Running query:', sql)
      const result = await pool.query(sql)
      const columns = result.fields.map((f) => f.name)
      const rows = result.rows.map((row) => columns.map((col) => (row[col] != null ? String(row[col]) : '')))
      console.log(`PostgreSQL: Got ${columns.length} columns, ${rows.length} rows`)
      return { columns, rows }
    },
    async cleanup() {
      await pool.end()
    },
  }
}
