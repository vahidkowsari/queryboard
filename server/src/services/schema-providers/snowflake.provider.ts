import snowflake from 'snowflake-sdk'
import type { Schema, SchemaProvider, SnowflakeDbConfig, Column, ProgressCallback } from '../../types.js'

const SAMPLE_VALUE_LIMIT = 10
const MAX_ROWS_FOR_SAMPLING = 2_000_000

async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<void> {
  let i = 0
  async function run() {
    while (i < tasks.length) {
      const task = tasks[i++]
      try { await task() } catch { /* ignore per-column failures */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, run))
}

function executeQuery(connection: any, sql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    console.log('Snowflake: Executing query:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''))
    connection.execute({
      sqlText: sql,
      complete: (err: any, stmt: any, rows: any) => {
        if (err) {
          console.error('Snowflake: Query error:', err.message || err)
          reject(err)
        } else {
          console.log(`Snowflake: Query returned ${rows?.length || 0} rows`)
          resolve(rows || [])
        }
      },
    })
  })
}

export function createSnowflakeSchemaProvider(dbConfig: SnowflakeDbConfig): SchemaProvider {
  return {
    name: 'snowflake',

    async detectSchema(onProgress?: ProgressCallback): Promise<Schema> {
      console.log(`Schema: Detecting from Snowflake database "${dbConfig.database}.${dbConfig.schema}"...`)
      onProgress?.({ phase: 'detecting', message: 'Discovering tables and views...' })

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

        connection.connect(async (err: any) => {
          if (err) {
            console.error('Snowflake: Connection error:', err.message)
            return reject(err)
          }

          try {
            // Set the database and warehouse context for the session
            if (dbConfig.warehouse) {
              console.log(`Snowflake: Setting warehouse to ${dbConfig.warehouse}`)
              await executeQuery(connection, `USE WAREHOUSE ${dbConfig.warehouse}`)
            }
            console.log(`Snowflake: Setting database to ${dbConfig.database}`)
            await executeQuery(connection, `USE DATABASE ${dbConfig.database}`)
            console.log(`Snowflake: Setting schema to ${dbConfig.schema}`)
            await executeQuery(connection, `USE SCHEMA ${dbConfig.schema}`)
            
            // Detect tables and views
            // First, let's see what schemas exist and have tables
            const allTablesRows = await executeQuery(
              connection,
              `SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_CATALOG = '${dbConfig.database.toUpperCase()}' AND TABLE_TYPE IN ('BASE TABLE', 'VIEW') ORDER BY TABLE_SCHEMA, TABLE_NAME LIMIT 100`
            )
            console.log(`Snowflake: Found ${allTablesRows.length} total tables across all schemas:`, allTablesRows.slice(0, 5).map((r: any) => `${r.TABLE_SCHEMA}.${r.TABLE_NAME}`))
            
            const tableRows = await executeQuery(
              connection,
              `SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${dbConfig.schema.toUpperCase()}' AND TABLE_TYPE IN ('BASE TABLE', 'VIEW') ORDER BY TABLE_NAME`
            )
            
            const tableInfos = tableRows.map((r: any) => ({
              table_name: r.TABLE_NAME,
              table_type: r.TABLE_TYPE,
            }))
            const tableNames = tableInfos.map((r: any) => r.table_name)
            const viewSet = new Set(tableInfos.filter((r: any) => r.table_type === 'VIEW').map((r: any) => r.table_name))
            
            console.log(`Schema: Found ${tableNames.length} tables/views (${viewSet.size} views)`)
            onProgress?.({ phase: 'detecting', message: `Found ${tableNames.length} tables/views — fetching metadata...` })

            if (tableNames.length === 0) {
              connection.destroy((destroyErr: any) => {
                if (destroyErr) console.error('Snowflake: Error destroying connection:', destroyErr.message)
              })
              return resolve({
                database: `${dbConfig.database}.${dbConfig.schema}`,
                engine: 'snowflake',
                detectedAt: new Date().toISOString(),
                tables: {},
              })
            }

            // Row counts and clustering keys (Snowflake has no partitions; clustering keys
            // drive micro-partition pruning). CLUSTERING_KEY is an expression like "LINEAR(C1, C2)".
            const rowCountMap = new Map<string, number>()
            const clusteringExprMap = new Map<string, string>()
            try {
              const rcRows = await executeQuery(
                connection,
                `SELECT TABLE_NAME, ROW_COUNT, CLUSTERING_KEY FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${dbConfig.schema.toUpperCase()}' AND TABLE_TYPE = 'BASE TABLE'`
              )
              for (const r of rcRows) {
                rowCountMap.set(r.TABLE_NAME, Number(r.ROW_COUNT) || 0)
                if (r.CLUSTERING_KEY) clusteringExprMap.set(r.TABLE_NAME, String(r.CLUSTERING_KEY))
              }
            } catch { console.log('Schema: Row count stats not available') }

            // Batch columns
            const tableNamesStr = tableNames.map((t: string) => `'${t}'`).join(',')
            const colRows = await executeQuery(
              connection,
              `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '${dbConfig.schema.toUpperCase()}' AND TABLE_NAME IN (${tableNamesStr}) ORDER BY TABLE_NAME, ORDINAL_POSITION`
            )

            const colsByTable = new Map<string, any[]>()
            for (const r of colRows) {
              const tableName = r.TABLE_NAME
              if (!colsByTable.has(tableName)) colsByTable.set(tableName, [])
              colsByTable.get(tableName)!.push(r)
            }

            // Batch primary keys
            const pkSet = new Set<string>()
            try {
              const pkRows = await executeQuery(
                connection,
                `SELECT TC.TABLE_NAME, KCU.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS TC JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE KCU ON TC.CONSTRAINT_NAME = KCU.CONSTRAINT_NAME AND TC.TABLE_SCHEMA = KCU.TABLE_SCHEMA WHERE TC.CONSTRAINT_TYPE = 'PRIMARY KEY' AND TC.TABLE_SCHEMA = '${dbConfig.schema.toUpperCase()}' AND TC.TABLE_NAME IN (${tableNamesStr})`
              )
              for (const r of pkRows) {
                pkSet.add(`${r.TABLE_NAME}.${r.COLUMN_NAME}`)
              }
            } catch { console.log('Schema: PK detection not available') }

            // Batch foreign keys
            const fkMap = new Map<string, { table: string; column: string }>()
            try {
              const fkRows = await executeQuery(
                connection,
                `SELECT RC.TABLE_NAME, KCU.COLUMN_NAME, RC.UNIQUE_TABLE_NAME AS REF_TABLE, RC.UNIQUE_COLUMN_NAME AS REF_COLUMN FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS RC JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE KCU ON RC.CONSTRAINT_NAME = KCU.CONSTRAINT_NAME AND RC.CONSTRAINT_SCHEMA = KCU.TABLE_SCHEMA WHERE RC.CONSTRAINT_SCHEMA = '${dbConfig.schema.toUpperCase()}' AND RC.TABLE_NAME IN (${tableNamesStr})`
              )
              for (const r of fkRows) {
                fkMap.set(`${r.TABLE_NAME}.${r.COLUMN_NAME}`, { table: r.REF_TABLE, column: r.REF_COLUMN })
              }
            } catch { console.log('Schema: FK detection not available') }

            const STRING_TYPES = new Set(['VARCHAR', 'TEXT', 'CHAR', 'CHARACTER', 'STRING'])

            const tables: Schema['tables'] = {}
            for (let i = 0; i < tableNames.length; i++) {
              const tableName = tableNames[i]
              const rawCols = colsByTable.get(tableName) || []
              const rowCount = rowCountMap.get(tableName)

              // Resolve clustering-key columns by intersecting the identifiers in the
              // CLUSTERING_KEY expression with this table's actual column names — this
              // naturally drops wrapping functions like LINEAR(...) / TO_DATE(...).
              const clusteringExpr = clusteringExprMap.get(tableName)
              const clusterKeys: string[] = []
              if (clusteringExpr) {
                const colNamesByLower = new Map<string, string>(
                  rawCols.map((r) => [String(r.COLUMN_NAME).toLowerCase(), r.COLUMN_NAME as string]),
                )
                const candidates = [...clusteringExpr.matchAll(/"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*)/g)].map(
                  (m) => (m[1] ?? m[2]) as string,
                )
                for (const cand of candidates) {
                  const match = colNamesByLower.get(cand.toLowerCase())
                  if (match && !clusterKeys.includes(match)) clusterKeys.push(match)
                }
              }
              const clusterKeySet = new Set(clusterKeys.map((k) => k.toLowerCase()))

              const columns: Column[] = rawCols.map((r: any) => ({
                name: r.COLUMN_NAME,
                type: r.DATA_TYPE,
                nullable: r.IS_NULLABLE === 'YES',
                isPrimaryKey: pkSet.has(`${tableName}.${r.COLUMN_NAME}`) || undefined,
                references: fkMap.get(`${tableName}.${r.COLUMN_NAME}`),
                isClusterKey: clusterKeySet.has(String(r.COLUMN_NAME).toLowerCase()) || undefined,
              }))

              // Sample values for string columns in reasonably-sized tables
              onProgress?.({ phase: 'sampling', message: `Processing table: ${tableName}`, current: i + 1, total: tableNames.length })
              const shouldSample = !rowCount || rowCount < MAX_ROWS_FOR_SAMPLING
              if (shouldSample) {
                const sampleTasks = columns
                  .filter((c) => STRING_TYPES.has(c.type))
                  .map((col) => async () => {
                    const rows = await executeQuery(
                      connection,
                      `SELECT DISTINCT "${col.name}" FROM "${tableName}" WHERE "${col.name}" IS NOT NULL LIMIT ${SAMPLE_VALUE_LIMIT + 1}`
                    )
                    const vals = rows.map((r: any) => String(r[col.name])).filter(Boolean)
                    if (vals.length <= SAMPLE_VALUE_LIMIT) col.sampleValues = vals
                  })
                await withConcurrency(sampleTasks, 5)
              }

              tables[tableName] = {
                columns,
                rowCount,
                isView: viewSet.has(tableName) || undefined,
                ...(clusterKeys.length > 0 ? { clusterKeys } : {}),
              }
              console.log(`Schema:   ${tableName}: ${columns.length} columns${rowCount ? `, ~${rowCount} rows` : ''}${viewSet.has(tableName) ? ' [view]' : ''}${clusterKeys.length > 0 ? ` [clustered by: ${clusterKeys.join(', ')}]` : ''}`)
            }

            connection.destroy((destroyErr: any) => {
              if (destroyErr) console.error('Snowflake: Error destroying connection:', destroyErr.message)
            })

            resolve({
              database: `${dbConfig.database}.${dbConfig.schema}`,
              engine: 'snowflake',
              detectedAt: new Date().toISOString(),
              tables,
            })
          } catch (err) {
            console.error('Snowflake: Schema detection error:', err instanceof Error ? err.message : String(err))
            console.error('Snowflake: Full error:', err)
            connection.destroy((destroyErr: any) => {
              if (destroyErr) console.error('Snowflake: Error destroying connection:', destroyErr.message)
            })
            reject(err)
          }
        })
      })
    },
  }
}
