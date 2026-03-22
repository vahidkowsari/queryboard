import { DBSQLClient } from '@databricks/sql'
import type { QueryExecutor, DatabricksDbConfig } from '../../types.js'

const DATABRICKS_RULES = `DATABRICKS SQL RULES:
- Databricks SQL is based on Spark SQL with ANSI SQL compliance.
- Use backticks \` for identifiers, single quotes ' for strings.
- Three-part naming with Unity Catalog: catalog.schema.table (e.g., \`catalog\`.\`schema\`.\`table\`).
- Casting: use CAST(col AS type) or col::type syntax.
- Date/time functions: DATE_TRUNC('MONTH', col), EXTRACT(YEAR FROM col), CURRENT_DATE(), CURRENT_TIMESTAMP(), DATE_ADD(), DATEDIFF().
- String functions: CONCAT(), SUBSTRING(), LENGTH(), TRIM(), UPPER(), LOWER(), REGEXP_LIKE(), LIKE, ILIKE (case-insensitive).
- Use LIMIT to restrict result size.
- Window functions fully supported: ROW_NUMBER(), RANK(), DENSE_RANK(), LAG(), LEAD(), NTILE(), FIRST_VALUE(), LAST_VALUE().
- Aggregation: GROUP BY supports column positions (e.g., GROUP BY 1, 2) and expressions.
- Array functions: ARRAY(), ARRAY_CONTAINS(), EXPLODE(), FLATTEN(), SIZE(), ARRAY_AGG().
- Map/Struct functions: MAP(), STRUCT(), element_at(), map_keys(), map_values().
- JSON functions: get_json_object(), from_json(), to_json(), json_tuple().
- Type inspection: TYPEOF(col) returns the data type.
- Safe casting: TRY_CAST(col AS type) returns NULL on failure instead of error.
- Use QUALIFY clause for filtering window function results without subqueries.
- Delta Lake features: supports time travel with VERSION AS OF or TIMESTAMP AS OF.
- Common table expressions (CTEs) are fully supported with WITH clause.
- Use TABLESAMPLE for sampling data: SELECT * FROM table TABLESAMPLE (10 PERCENT).
- NULL handling: COALESCE(), IFNULL(), NULLIF(), NVL() are supported.`

/**
 * Creates a query executor for Databricks SQL Warehouse
 * Uses the official @databricks/sql Node.js connector
 */
export function createDatabricksExecutor(dbConfig: DatabricksDbConfig): QueryExecutor {
  return {
    sqlRules: DATABRICKS_RULES,

    async execute(sql: string) {
      console.log('Databricks: Running query:', sql)

      const client = new DBSQLClient()
      let connection: any = null
      let session: any = null
      let queryOperation: any = null

      try {
        const connectionOptions: any = {
          host: dbConfig.host,
          path: dbConfig.httpPath,
          token: dbConfig.token,
        }
        
        // Add port if it's not the default HTTPS port
        if (dbConfig.port && dbConfig.port !== 443) {
          connectionOptions.port = dbConfig.port
        }

        connection = await client.connect(connectionOptions)

        session = await connection.openSession({
          initialCatalog: dbConfig.catalog,
          initialSchema: dbConfig.schema,
        })

        queryOperation = await session.executeStatement(sql, {
          runAsync: false,
          maxRows: 10000,
        })

        const result = await queryOperation.fetchAll()
        
        const schema = await queryOperation.getSchema()
        const columns = schema?.columns ? schema.columns.map((col: any) => col.name || String(col.columnName)) : []

        const rows = result.map((row: any) =>
          columns.map((col: string) => {
            const val = row[col]
            return val != null ? String(val) : ''
          })
        )

        console.log(`Databricks: Got ${columns.length} columns, ${rows.length} rows`)

        return { columns, rows }
      } catch (error) {
        console.error('Databricks: Query error:', error)
        throw error
      } finally {
        // Clean up resources in reverse order
        if (queryOperation) {
          try { await queryOperation.close() } catch (e) { console.error('Error closing query operation:', e) }
        }
        if (session) {
          try { await session.close() } catch (e) { console.error('Error closing session:', e) }
        }
        if (connection) {
          try { await connection.close() } catch (e) { console.error('Error closing connection:', e) }
        }
        try { await client.close() } catch (e) { console.error('Error closing client:', e) }
      }
    },
  }
}
