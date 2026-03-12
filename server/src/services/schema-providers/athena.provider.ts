import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from '@aws-sdk/client-athena'
import type { Schema, SchemaProvider, ProgressCallback } from '../../types.js'

export function createAthenaSchemaProvider(
  athenaClient: AthenaClient,
  database: string,
  workgroup: string,
): SchemaProvider {
  async function runQuery(sql: string): Promise<string[][]> {
    const start = await athenaClient.send(
      new StartQueryExecutionCommand({
        QueryString: sql,
        QueryExecutionContext: { Database: database },
        WorkGroup: workgroup,
      }),
    )
    const executionId = start.QueryExecutionId!

    const maxWait = 60_000
    const t0 = Date.now()
    while (true) {
      if (Date.now() - t0 >= maxWait) {
        throw new Error(`Athena query timed out after ${maxWait}ms (executionId: ${executionId})`)
      }
      const status = await athenaClient.send(new GetQueryExecutionCommand({ QueryExecutionId: executionId }))
      const state = status.QueryExecution?.Status?.State
      if (state === 'SUCCEEDED') break
      if (state === 'FAILED' || state === 'CANCELLED') {
        throw new Error(`Athena query ${state}: ${status.QueryExecution?.Status?.StateChangeReason}`)
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    const results = await athenaClient.send(new GetQueryResultsCommand({ QueryExecutionId: executionId }))
    const rows = results.ResultSet?.Rows || []
    return rows.slice(1).map((row) => row.Data?.map((cell) => cell.VarCharValue || '') || [])
  }

  return {
    name: 'athena',

    async detectSchema(onProgress?: ProgressCallback): Promise<Schema> {
      console.log(`Schema: Detecting from Athena database "${database}"...`)
      onProgress?.({ phase: 'detecting', message: 'Discovering tables and views...' })

      const tableRows = await runQuery(`SHOW TABLES IN \`${database}\``)
      const allTableNames = tableRows.map((row) => row[0]).filter(Boolean)

      // Detect views
      let viewSet = new Set<string>()
      try {
        const viewRows = await runQuery(`SHOW VIEWS IN \`${database}\``)
        viewSet = new Set(viewRows.map((row) => row[0]).filter(Boolean))
      } catch { /* views not supported in this Athena setup */ }

      console.log(`Schema: Found ${allTableNames.length} tables/views (${viewSet.size} views)`)
      onProgress?.({ phase: 'detecting', message: `Found ${allTableNames.length} tables/views — reading metadata...` })

      const tables: Schema['tables'] = {}
      for (let i = 0; i < allTableNames.length; i++) {
        const table = allTableNames[i]
        onProgress?.({ phase: 'sampling', message: `Processing table: ${table}`, current: i + 1, total: allTableNames.length })
        try {
          const colRows = await runQuery(
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = '${database}' AND table_name = '${table}' ORDER BY ordinal_position`,
          )
          const columns = colRows.map((row) => ({
            name: row[0].trim(),
            type: row[1]?.trim() || 'string',
            nullable: true, // Athena columns are nullable by default
          }))

          // Row count
          let rowCount: number | undefined
          try {
            const propRows = await runQuery(`SHOW TBLPROPERTIES \`${database}\`.\`${table}\`('numRows')`)
            const val = propRows[0]?.[0]?.trim()
            if (val && !isNaN(Number(val)) && Number(val) > 0) rowCount = Number(val)
          } catch { /* numRows not available */ }

          // Partition key detection via SHOW CREATE TABLE
          let partitionKeys: string[] | undefined
          if (!viewSet.has(table)) {
            try {
              const createRows = await runQuery(`SHOW CREATE TABLE \`${database}\`.\`${table}\``)
              const ddl = createRows.map((r) => r[0]).join('\n')
              const partMatch = ddl.match(/PARTITIONED BY\s*\(([^)]+)\)/i)
              if (partMatch) {
                partitionKeys = partMatch[1]
                  .split(',')
                  .map((s) => s.trim().split(/\s+/)[0].replace(/`/g, '').toLowerCase())
                  .filter(Boolean)
                // Mark partition columns
                for (const col of columns) {
                  if (partitionKeys!.includes(col.name.toLowerCase())) {
                    (col as any).isPartitionKey = true
                  }
                }
              }
            } catch { /* DDL not available */ }
          }

          tables[table] = { columns, rowCount, isView: viewSet.has(table) || undefined, partitionKeys }
          console.log(`Schema:   ${table}: ${columns.length} columns${rowCount ? `, ~${rowCount} rows` : ''}${viewSet.has(table) ? ' [view]' : ''}${partitionKeys ? ` [partitioned by: ${partitionKeys.join(', ')}]` : ''}`)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`Schema:   ${table}: FAILED - ${msg}`)
        }
      }

      return {
        database,
        engine: 'athena',
        detectedAt: new Date().toISOString(),
        tables,
      }
    },
  }
}
