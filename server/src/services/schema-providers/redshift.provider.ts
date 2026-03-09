import pg from 'pg'
import type { Schema, SchemaProvider, RedshiftDbConfig } from '../../types.js'

export function createRedshiftSchemaProvider(dbConfig: RedshiftDbConfig): SchemaProvider {
  const pool = new pg.Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: { rejectUnauthorized: false },
  })

  return {
    name: 'redshift',

    async detectSchema(): Promise<Schema> {
      console.log(`Schema: Detecting from Redshift database "${dbConfig.database}"...`)

      const tableResult = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `)
      const tableNames = tableResult.rows.map((r) => r.table_name as string)
      console.log(`Schema: Found ${tableNames.length} tables`)

      const rowCountMap = new Map<string, number>()
      try {
        const rcResult = await pool.query(
          `SELECT "table" AS table_name, tbl_rows
           FROM svv_table_info
           WHERE schema = 'public'`,
        )
        for (const r of rcResult.rows) {
          rowCountMap.set(r.table_name as string, Number(r.tbl_rows) || 0)
        }
      } catch {
        console.log('Schema: Row count stats not available')
      }

      const tables: Schema['tables'] = {}
      for (const table of tableNames) {
        try {
          const colResult = await pool.query(
            `
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
            ORDER BY ordinal_position
          `,
            [table],
          )

          const columns = colResult.rows.map((r) => ({
            name: r.column_name as string,
            type: r.data_type as string,
          }))
          const rowCount = rowCountMap.get(table)
          tables[table] = { columns, rowCount }
          console.log(`Schema:   ${table}: ${columns.length} columns${rowCount ? `, ~${rowCount} rows` : ''}`)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`Schema:   ${table}: FAILED - ${msg}`)
        }
      }

      return {
        database: dbConfig.database,
        engine: 'redshift',
        detectedAt: new Date().toISOString(),
        tables,
      }
    },
  }
}
