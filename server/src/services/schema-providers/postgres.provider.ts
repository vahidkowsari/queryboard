import pg from 'pg'
import type { Schema, SchemaProvider, PostgresDbConfig } from '../../types.js'

export function createPostgresSchemaProvider(dbConfig: PostgresDbConfig): SchemaProvider {
  const pool = new pg.Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
  })

  return {
    name: 'postgres',

    async detectSchema(): Promise<Schema> {
      console.log(`Schema: Detecting from PostgreSQL database "${dbConfig.database}"...`)

      const tableResult = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `)
      const tableNames = tableResult.rows.map((r) => r.table_name as string)
      console.log(`Schema: Found ${tableNames.length} tables`)

      // Fetch approximate row counts from pg stats (free, no table scan)
      const rowCountMap = new Map<string, number>()
      try {
        const rcResult = await pool.query(
          `SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'public'`,
        )
        for (const r of rcResult.rows) {
          rowCountMap.set(r.relname as string, Number(r.n_live_tup) || 0)
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
        engine: 'postgres',
        detectedAt: new Date().toISOString(),
        tables,
      }
    },
  }
}
