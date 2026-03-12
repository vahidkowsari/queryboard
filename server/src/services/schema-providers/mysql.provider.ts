import mysql from 'mysql2/promise'
import type { Schema, SchemaProvider, MySQLDbConfig, Column } from '../../types.js'

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

export function createMySQLSchemaProvider(dbConfig: MySQLDbConfig): SchemaProvider {
  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: dbConfig.ssl ? { rejectUnauthorized: dbConfig.rejectUnauthorized ?? true } : undefined,
    waitForConnections: true,
    connectionLimit: 5,
  })

  return {
    name: 'mysql',

    async detectSchema(): Promise<Schema> {
      console.log(`Schema: Detecting from MySQL database "${dbConfig.database}"...`)

      const [tableRows] = await pool.query(
        `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? AND table_type IN ('BASE TABLE','VIEW') ORDER BY table_name`,
        [dbConfig.database],
      )
      const tableInfos = tableRows as mysql.RowDataPacket[]
      const tableNames = tableInfos.map((r) => (r.table_name || r.TABLE_NAME) as string)
      const viewSet = new Set(tableInfos.filter((r) => (r.table_type || r.TABLE_TYPE) === 'VIEW').map((r) => (r.table_name || r.TABLE_NAME) as string))
      console.log(`Schema: Found ${tableNames.length} tables/views (${viewSet.size} views)`)

      if (tableNames.length === 0) {
        return { database: dbConfig.database, engine: 'mysql', detectedAt: new Date().toISOString(), tables: {} }
      }

      // Row counts
      const rowCountMap = new Map<string, number>()
      try {
        const [rcRows] = await pool.query(
          `SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
          [dbConfig.database],
        )
        for (const r of rcRows as mysql.RowDataPacket[]) {
          const name = (r.table_name || r.TABLE_NAME) as string
          rowCountMap.set(name, Number(r.table_rows || r.TABLE_ROWS) || 0)
        }
      } catch { console.log('Schema: Row count stats not available') }

      // Batch columns
      const placeholders = tableNames.map(() => '?').join(',')
      const [colRows] = await pool.query(
        `SELECT table_name, column_name, data_type, is_nullable, column_key FROM information_schema.columns WHERE table_schema = ? AND table_name IN (${placeholders}) ORDER BY table_name, ordinal_position`,
        [dbConfig.database, ...tableNames],
      )
      const colsByTable = new Map<string, mysql.RowDataPacket[]>()
      for (const r of colRows as mysql.RowDataPacket[]) {
        const t = (r.table_name || r.TABLE_NAME) as string
        if (!colsByTable.has(t)) colsByTable.set(t, [])
        colsByTable.get(t)!.push(r)
      }

      // Batch FKs
      const fkMap = new Map<string, { table: string; column: string }>()
      try {
        const [fkRows] = await pool.query(
          `SELECT table_name, column_name, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage WHERE table_schema = ? AND table_name IN (${placeholders}) AND referenced_table_name IS NOT NULL`,
          [dbConfig.database, ...tableNames],
        )
        for (const r of fkRows as mysql.RowDataPacket[]) {
          const tbl = (r.table_name || r.TABLE_NAME) as string
          const col = (r.column_name || r.COLUMN_NAME) as string
          fkMap.set(`${tbl}.${col}`, {
            table: (r.referenced_table_name || r.REFERENCED_TABLE_NAME) as string,
            column: (r.referenced_column_name || r.REFERENCED_COLUMN_NAME) as string,
          })
        }
      } catch { console.log('Schema: FK detection not available') }

      const STRING_TYPES = new Set(['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext', 'enum', 'set'])

      const tables: Schema['tables'] = {}
      for (const tableName of tableNames) {
        const rawCols = colsByTable.get(tableName) || []
        const rowCount = rowCountMap.get(tableName)

        const columns: Column[] = rawCols.map((r) => {
          const colName = (r.column_name || r.COLUMN_NAME) as string
          const colType = (r.data_type || r.DATA_TYPE) as string
          const nullable = (r.is_nullable || r.IS_NULLABLE) === 'YES'
          const isPK = (r.column_key || r.COLUMN_KEY) === 'PRI' || undefined
          return {
            name: colName,
            type: colType,
            nullable,
            isPrimaryKey: isPK,
            references: fkMap.get(`${tableName}.${colName}`),
          }
        })

        const shouldSample = !rowCount || rowCount < MAX_ROWS_FOR_SAMPLING
        if (shouldSample) {
          const sampleTasks = columns
            .filter((c) => STRING_TYPES.has(c.type))
            .map((col) => async () => {
              const [rows] = await pool.query(`SELECT DISTINCT \`${col.name}\` FROM \`${tableName}\` WHERE \`${col.name}\` IS NOT NULL LIMIT ${SAMPLE_VALUE_LIMIT + 1}`)
              const vals = (rows as mysql.RowDataPacket[]).map((r) => String(r[col.name])).filter(Boolean)
              if (vals.length <= SAMPLE_VALUE_LIMIT) col.sampleValues = vals
            })
          await withConcurrency(sampleTasks, 5)
        }

        tables[tableName] = { columns, rowCount, isView: viewSet.has(tableName) || undefined }
        console.log(`Schema:   ${tableName}: ${columns.length} columns${rowCount ? `, ~${rowCount} rows` : ''}${viewSet.has(tableName) ? ' [view]' : ''}`)
      }

      return { database: dbConfig.database, engine: 'mysql', detectedAt: new Date().toISOString(), tables }
    },
  }
}
