import mysql from 'mysql2/promise'
import type { Schema, SchemaProvider, MySQLDbConfig } from '../../types.js'

export function createMySQLSchemaProvider(dbConfig: MySQLDbConfig): SchemaProvider {
  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    waitForConnections: true,
    connectionLimit: 5,
  })

  return {
    name: 'mysql',

    async detectSchema(): Promise<Schema> {
      console.log(`Schema: Detecting from MySQL database "${dbConfig.database}"...`)

      const [tableRows] = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name`,
        [dbConfig.database],
      )
      const tableNames = (tableRows as mysql.RowDataPacket[]).map((r) => r.table_name || r.TABLE_NAME)
      console.log(`Schema: Found ${tableNames.length} tables`)

      // Fetch approximate row counts from information_schema (free, no table scan)
      const rowCountMap = new Map<string, number>()
      try {
        const [rcRows] = await pool.query(
          `SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
          [dbConfig.database],
        )
        for (const r of rcRows as mysql.RowDataPacket[]) {
          const name = (r.table_name || r.TABLE_NAME) as string
          const count = Number(r.table_rows || r.TABLE_ROWS) || 0
          rowCountMap.set(name, count)
        }
      } catch {
        console.log('Schema: Row count stats not available')
      }

      const tables: Schema['tables'] = {}
      for (const table of tableNames) {
        try {
          const [colRows] = await pool.query(
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`,
            [dbConfig.database, table],
          )
          const columns = (colRows as mysql.RowDataPacket[]).map((r) => ({
            name: (r.column_name || r.COLUMN_NAME) as string,
            type: (r.data_type || r.DATA_TYPE) as string,
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
        engine: 'mysql',
        detectedAt: new Date().toISOString(),
        tables,
      }
    },
  }
}
