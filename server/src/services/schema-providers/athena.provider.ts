import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from '@aws-sdk/client-athena'
import type { Schema, SchemaProvider } from '../../types.js'

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

    const maxWait = 30_000
    const t0 = Date.now()
    while (Date.now() - t0 < maxWait) {
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

    async detectSchema(): Promise<Schema> {
      console.log(`Schema: Detecting from Athena database "${database}"...`)

      const tableRows = await runQuery(`SHOW TABLES IN ${database}`)
      const tableNames = tableRows.map((row) => row[0]).filter(Boolean)
      console.log(`Schema: Found ${tableNames.length} tables`)

      const tables: Schema['tables'] = {}
      for (const table of tableNames) {
        try {
          const colRows = await runQuery(
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = '${database}' AND table_name = '${table}' ORDER BY ordinal_position`,
          )
          const columns = colRows.map((row) => ({
            name: row[0].trim(),
            type: row[1]?.trim() || 'string',
          }))

          let rowCount: number | undefined
          try {
            const propRows = await runQuery(`SHOW TBLPROPERTIES \`${database}\`.\`${table}\`('numRows')`)
            const val = propRows[0]?.[0]?.trim()
            if (val && !isNaN(Number(val)) && Number(val) > 0) rowCount = Number(val)
          } catch {
            // numRows property not available for this table
          }

          tables[table] = { columns, rowCount }
          console.log(`Schema:   ${table}: ${columns.length} columns${rowCount ? `, ~${rowCount} rows` : ''}`)
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
