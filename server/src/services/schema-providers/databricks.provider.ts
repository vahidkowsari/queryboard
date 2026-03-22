import { DBSQLClient } from '@databricks/sql'
import type { Schema, SchemaProvider, DatabricksDbConfig, Column, ProgressCallback } from '../../types.js'

const SAMPLE_VALUE_LIMIT = 10
const MAX_ROWS_FOR_SAMPLING = 2_000_000

async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<void> {
  let i = 0
  async function run() {
    while (i < tasks.length) {
      const task = tasks[i++]
      try { 
        await task() 
      } catch (err) { 
        // Log but don't fail entire process for individual column sampling failures
        console.log('Schema: Column sampling error:', err instanceof Error ? err.message : String(err))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, run))
}

/**
 * Execute a query using an existing session
 */
async function executeQuery(session: any, sql: string): Promise<any[]> {
  console.log('Databricks: Executing query:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''))
  
  const queryOperation = await session.executeStatement(sql, {
    runAsync: false,
    maxRows: 10000,
  })

  const result = await queryOperation.fetchAll()
  await queryOperation.close()

  console.log(`Databricks: Query returned ${result.length} rows`)
  return result
}

/**
 * Escape SQL identifiers by replacing backticks with double backticks
 */
function escapeIdentifier(identifier: string): string {
  return identifier.replace(/`/g, '``')
}

/**
 * Escape string literals by replacing single quotes with double single quotes
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "''")
}

export function createDatabricksSchemaProvider(dbConfig: DatabricksDbConfig): SchemaProvider {
  return {
    name: 'databricks',

    async detectSchema(onProgress?: ProgressCallback): Promise<Schema> {
      console.log(`Schema: Detecting from Databricks catalog "${dbConfig.catalog}.${dbConfig.schema}"...`)
      onProgress?.({ phase: 'detecting', message: 'Discovering tables and views...' })

      const client = new DBSQLClient()
      let connection: any = null
      let session: any = null

      try {
        const connectionOptions: any = {
          host: dbConfig.host,
          path: dbConfig.httpPath,
          token: dbConfig.token,
        }
        
        if (dbConfig.port && dbConfig.port !== 443) {
          connectionOptions.port = dbConfig.port
        }

        connection = await client.connect(connectionOptions)
        session = await connection.openSession({
          initialCatalog: dbConfig.catalog,
          initialSchema: dbConfig.schema,
        })

        const escapedCatalog = escapeIdentifier(dbConfig.catalog)
        const escapedSchema = escapeString(dbConfig.schema)

        const tableRows = await executeQuery(
          session,
          `SELECT table_name, table_type FROM \`${escapedCatalog}\`.information_schema.tables WHERE table_schema = '${escapedSchema}' AND table_type IN ('BASE TABLE', 'VIEW') ORDER BY table_name`
        )

        const tableInfos = tableRows.map((r: any) => ({
          table_name: r.table_name,
          table_type: r.table_type,
        }))
        const tableNames = tableInfos.map((r: any) => r.table_name)
        const viewSet = new Set(tableInfos.filter((r: any) => r.table_type === 'VIEW').map((r: any) => r.table_name))

        console.log(`Schema: Found ${tableNames.length} tables/views (${viewSet.size} views)`)
        onProgress?.({ phase: 'detecting', message: `Found ${tableNames.length} tables/views — fetching metadata...` })

        if (tableNames.length === 0) {
          return {
            database: `${dbConfig.catalog}.${dbConfig.schema}`,
            engine: 'databricks',
            detectedAt: new Date().toISOString(),
            tables: {},
          }
        }

        const rowCountMap = new Map<string, number>()
        try {
          const rcRows = await executeQuery(
            session,
            `SELECT table_name, CAST(num_rows AS BIGINT) as row_count FROM \`${escapedCatalog}\`.information_schema.tables WHERE table_schema = '${escapedSchema}' AND table_type = 'BASE TABLE'`
          )
          for (const r of rcRows) {
            rowCountMap.set(r.table_name, Number(r.row_count) || 0)
          }
        } catch { console.log('Schema: Row count stats not available') }

        const tableNamesStr = tableNames.map((t: string) => `'${escapeString(t)}'`).join(',')
        const colRows = await executeQuery(
          session,
          `SELECT table_name, column_name, data_type, is_nullable FROM \`${escapedCatalog}\`.information_schema.columns WHERE table_schema = '${escapedSchema}' AND table_name IN (${tableNamesStr}) ORDER BY table_name, ordinal_position`
        )

        const colsByTable = new Map<string, any[]>()
        for (const r of colRows) {
          const tableName = r.table_name
          if (!colsByTable.has(tableName)) colsByTable.set(tableName, [])
          colsByTable.get(tableName)!.push(r)
        }

        const pkSet = new Set<string>()
        try {
          const pkRows = await executeQuery(
            session,
            `SELECT tc.table_name, kcu.column_name FROM \`${escapedCatalog}\`.information_schema.table_constraints tc JOIN \`${escapedCatalog}\`.information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = '${escapedSchema}' AND tc.table_name IN (${tableNamesStr})`
          )
          for (const r of pkRows) {
            pkSet.add(`${r.table_name}.${r.column_name}`)
          }
        } catch { console.log('Schema: PK detection not available') }

        const fkMap = new Map<string, { table: string; column: string }>()
        try {
          const fkRows = await executeQuery(
            session,
            `SELECT rc.table_name, kcu.column_name, rc.unique_table_name AS ref_table, rc.unique_column_name AS ref_column FROM \`${escapedCatalog}\`.information_schema.referential_constraints rc JOIN \`${escapedCatalog}\`.information_schema.key_column_usage kcu ON rc.constraint_name = kcu.constraint_name AND rc.constraint_schema = kcu.table_schema WHERE rc.constraint_schema = '${escapedSchema}' AND rc.table_name IN (${tableNamesStr})`
          )
          for (const r of fkRows) {
            fkMap.set(`${r.table_name}.${r.column_name}`, { table: r.ref_table, column: r.ref_column })
          }
        } catch { console.log('Schema: FK detection not available') }

        const STRING_TYPES = new Set(['STRING', 'VARCHAR', 'CHAR', 'TEXT'])

        const tables: Schema['tables'] = {}
        for (let i = 0; i < tableNames.length; i++) {
          const tableName = tableNames[i]
          const rawCols = colsByTable.get(tableName) || []
          const rowCount = rowCountMap.get(tableName)

          const columns: Column[] = rawCols.map((r: any) => ({
            name: r.column_name,
            type: r.data_type,
            nullable: r.is_nullable === 'YES',
            isPrimaryKey: pkSet.has(`${tableName}.${r.column_name}`) || undefined,
            references: fkMap.get(`${tableName}.${r.column_name}`),
          }))

          onProgress?.({ phase: 'sampling', message: `Processing table: ${tableName}`, current: i + 1, total: tableNames.length })
          const shouldSample = !rowCount || rowCount < MAX_ROWS_FOR_SAMPLING
          if (shouldSample) {
            const sampleTasks = columns
              .filter((c) => STRING_TYPES.has(c.type))
              .map((col) => async () => {
                const escapedColName = escapeIdentifier(col.name)
                const escapedTableName = escapeIdentifier(tableName)
                const rows = await executeQuery(
                  session,
                  `SELECT DISTINCT \`${escapedColName}\` FROM \`${escapedCatalog}\`.\`${escapeIdentifier(dbConfig.schema)}\`.\`${escapedTableName}\` WHERE \`${escapedColName}\` IS NOT NULL LIMIT ${SAMPLE_VALUE_LIMIT + 1}`
                )
                const vals = rows.map((r: any) => String(r[col.name])).filter(Boolean)
                if (vals.length <= SAMPLE_VALUE_LIMIT) col.sampleValues = vals
              })
            await withConcurrency(sampleTasks, 5)
          }

          tables[tableName] = { columns, rowCount, isView: viewSet.has(tableName) || undefined }
          console.log(`Schema:   ${tableName}: ${columns.length} columns${rowCount ? `, ~${rowCount} rows` : ''}${viewSet.has(tableName) ? ' [view]' : ''}`)
        }

        return {
          database: `${dbConfig.catalog}.${dbConfig.schema}`,
          engine: 'databricks',
          detectedAt: new Date().toISOString(),
          tables,
        }
      } catch (err) {
        console.error('Databricks: Schema detection error:', err instanceof Error ? err.message : String(err))
        console.error('Databricks: Full error:', err)
        throw err
      } finally {
        // Clean up resources in reverse order
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
