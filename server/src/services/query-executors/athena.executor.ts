import { createAthenaClient, executeAthenaQuery } from '../athena.service.js'
import type { QueryExecutor, AthenaDbConfig } from '../../types.js'

const ATHENA_RULES = `ATHENA SQL RULES:
- Most columns are STRING type. Use CAST() for numeric operations (e.g., CAST(col AS BIGINT)).
- Columns ending in _date_time may be TIMESTAMP. Columns ending in _date (without _time) are VARCHAR.
- When comparing date/timestamp columns from different tables, CAST both to the same type.
- Athena (Presto/Trino) does NOT allow referencing column aliases in WHERE, HAVING, or GROUP BY. Use a subquery or CTE.
- Always verify column references against the actual table structure from get_columns.
- Always use LIMIT to avoid scanning too much data.
- Prefer simple flat queries over complex CTEs.
- JOIN KEYS: fact tables join to dimension tables via matching column names.
- Dimension tables with only ID columns have no descriptive name columns — group by the ID directly.

APPROXIMATE FUNCTIONS (use for large tables >1M rows):
- approx_distinct(col) — approximate distinct count (faster than COUNT(DISTINCT))
- approx_percentile(col, 0.5) — approximate median (NOT percentile_approx!)
- approx_percentile(col, array[0.25, 0.5, 0.75]) — multiple percentiles
- These functions are much faster on large datasets and should be preferred when exact precision is not critical.`

/**
 * Creates a query executor for AWS Athena (Presto/Trino SQL)
 * Includes SQL rules for handling Athena-specific syntax and limitations
 */
export function createAthenaExecutor(dbConfig: AthenaDbConfig): QueryExecutor {
  const client = createAthenaClient(dbConfig)
  return {
    sqlRules: ATHENA_RULES,
    async execute(sql: string) {
      return executeAthenaQuery(client, dbConfig, sql)
    },
  }
}
