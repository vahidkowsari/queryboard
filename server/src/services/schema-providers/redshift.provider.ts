import pg from 'pg'
import type { Schema, SchemaProvider, RedshiftDbConfig } from '../../types.js'

export function createRedshiftSchemaProvider(dbConfig: RedshiftDbConfig): SchemaProvider {
  const pool = new pg.Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: dbConfig.ssl ? { rejectUnauthorized: dbConfig.rejectUnauthorized ?? false } : false,
  })

  return {
    name: 'redshift',

    async detectSchema(): Promise<Schema> {
      console.log(`Schema: Detecting from Redshift database "${dbConfig.database}"...`)

      const tableResult = await pool.query(`
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY table_name
      `)
      const tableInfos = tableResult.rows as { table_name: string; table_type: string }[]
      const tableNames = tableInfos.map((r) => r.table_name)
      const viewSet = new Set(tableInfos.filter((r) => r.table_type === 'VIEW').map((r) => r.table_name))
      console.log(`Schema: Found ${tableNames.length} tables/views (${viewSet.size} views)`)

      if (tableNames.length === 0) {
        return { database: dbConfig.database, engine: 'redshift', detectedAt: new Date().toISOString(), tables: {} }
      }

      // Row counts via Redshift system table
      const rowCountMap = new Map<string, number>()
      try {
        const rcResult = await pool.query(`SELECT "table" AS table_name, tbl_rows FROM svv_table_info WHERE schema = 'public'`)
        for (const r of rcResult.rows) rowCountMap.set(r.table_name as string, Number(r.tbl_rows) || 0)
      } catch { console.log('Schema: Row count stats not available') }

      // Batch columns
      const colResult = await pool.query(`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1)
        ORDER BY table_name, ordinal_position
      `, [tableNames])
      const colsByTable = new Map<string, Array<{ column_name: string; data_type: string; is_nullable: string }>>()
      for (const r of colResult.rows) {
        if (!colsByTable.has(r.table_name)) colsByTable.set(r.table_name, [])
        colsByTable.get(r.table_name)!.push(r)
      }

      // Batch PKs
      const pkSet = new Set<string>()
      try {
        const pkResult = await pool.query(`
          SELECT kcu.table_name, kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = ANY($1)
        `, [tableNames])
        for (const r of pkResult.rows) pkSet.add(`${r.table_name}.${r.column_name}`)
      } catch { console.log('Schema: PK detection not available') }

      // Batch FKs
      const fkMap = new Map<string, { table: string; column: string }>()
      try {
        const fkResult = await pool.query(`
          SELECT kcu.table_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND kcu.table_name = ANY($1)
        `, [tableNames])
        for (const r of fkResult.rows) fkMap.set(`${r.table_name}.${r.column_name}`, { table: r.ref_table, column: r.ref_column })
      } catch { console.log('Schema: FK detection not available') }

      const tables: Schema['tables'] = {}
      for (const tableName of tableNames) {
        const rawCols = colsByTable.get(tableName) || []
        const rowCount = rowCountMap.get(tableName)
        const columns = rawCols.map((r) => ({
          name: r.column_name,
          type: r.data_type,
          nullable: r.is_nullable === 'YES',
          isPrimaryKey: pkSet.has(`${tableName}.${r.column_name}`) || undefined,
          references: fkMap.get(`${tableName}.${r.column_name}`),
        }))
        tables[tableName] = { columns, rowCount, isView: viewSet.has(tableName) || undefined }
        console.log(`Schema:   ${tableName}: ${columns.length} columns${rowCount ? `, ~${rowCount} rows` : ''}${viewSet.has(tableName) ? ' [view]' : ''}`)
      }

      return { database: dbConfig.database, engine: 'redshift', detectedAt: new Date().toISOString(), tables }
    },
  }
}
