import snowflake from 'snowflake-sdk'
import type { QueryExecutor, SnowflakeDbConfig } from '../../types.js'

const SNOWFLAKE_RULES = `SNOWFLAKE SQL RULES:
- Snowflake supports ANSI SQL with extensions for cloud data warehousing.
- Use :: for casting (e.g., col::INTEGER, col::DATE, col::VARCHAR) or CAST(col AS type).
- String aggregation: use LISTAGG(col, ',') WITHIN GROUP (ORDER BY col).
- Date functions: DATE_TRUNC('month', col), EXTRACT(YEAR FROM col), DATEADD(), DATEDIFF(), CURRENT_TIMESTAMP().
- Use LIMIT to restrict result size.
- Window functions are fully supported: ROW_NUMBER(), RANK(), DENSE_RANK(), LAG(), LEAD(), etc.
- Use double quotes for case-sensitive identifiers, single quotes for strings.
- Use ILIKE for case-insensitive pattern matching.
- Arrays: use ARRAY_CONSTRUCT(), ARRAY_AGG(), FLATTEN() for unnesting.
- JSON/Variant: use object:key notation or GET_PATH() for nested access.
- Semi-structured data: Snowflake excels with VARIANT, OBJECT, and ARRAY types.
- Use QUALIFY clause for filtering window function results without subqueries.
- Table functions: LATERAL FLATTEN() for array/object expansion.
- Time travel: use AT or BEFORE clause for historical queries (e.g., SELECT * FROM table AT(TIMESTAMP => '2024-01-01'::TIMESTAMP)).`

/**
 * Creates a query executor for Snowflake
 * Includes SQL rules for Snowflake-specific syntax and features
 */
export function createSnowflakeExecutor(dbConfig: SnowflakeDbConfig): QueryExecutor {
  return {
    sqlRules: SNOWFLAKE_RULES,
    async execute(sql: string) {
      console.log('Snowflake: Running query:', sql)
      
      return new Promise((resolve, reject) => {
        const connection = snowflake.createConnection({
          account: dbConfig.account,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          schema: dbConfig.schema,
          warehouse: dbConfig.warehouse,
          role: dbConfig.role,
        })

        connection.connect(async (err) => {
          if (err) {
            console.error('Snowflake: Connection error:', err.message)
            return reject(err)
          }

          // Set session context
          const setupCommands: string[] = []
          if (dbConfig.warehouse) {
            setupCommands.push(`USE WAREHOUSE ${dbConfig.warehouse}`)
          }
          setupCommands.push(`USE DATABASE ${dbConfig.database}`)
          setupCommands.push(`USE SCHEMA ${dbConfig.schema}`)

          // Execute setup commands sequentially
          const executeSetup = (index: number) => {
            if (index >= setupCommands.length) {
              // All setup done, execute the actual query
              connection.execute({
                sqlText: sql,
                complete: (err, stmt, rows) => {
                  executeQueryCallback(err, stmt, rows)
                },
              })
              return
            }

            connection.execute({
              sqlText: setupCommands[index],
              complete: (err) => {
                if (err) {
                  console.error(`Snowflake: Error executing ${setupCommands[index]}:`, err.message)
                  connection.destroy((destroyErr) => {
                    if (destroyErr) console.error('Snowflake: Error destroying connection:', destroyErr.message)
                  })
                  return reject(err)
                }
                executeSetup(index + 1)
              },
            })
          }

          const executeQueryCallback = (err: any, stmt: any, rows: any) => {
            if (err) {
              console.error('Snowflake: Query error:', err.message)
              connection.destroy((destroyErr: any) => {
                if (destroyErr) {
                  console.error('Snowflake: Error destroying connection:', destroyErr.message)
                }
              })
              return reject(err)
            }

            const columns = stmt.getColumns().map((col: any) => col.getName())
            const formattedRows = (rows || []).map((row: any) =>
              columns.map((col: any) => (row[col] != null ? String(row[col]) : ''))
            )

            console.log(`Snowflake: Got ${columns.length} columns, ${formattedRows.length} rows`)

            connection.destroy((destroyErr: any) => {
              if (destroyErr) {
                console.error('Snowflake: Error destroying connection:', destroyErr.message)
              }
            })

            resolve({ columns, rows: formattedRows })
          }

          // Start the setup sequence
          executeSetup(0)
        })
      })
    },
  }
}
