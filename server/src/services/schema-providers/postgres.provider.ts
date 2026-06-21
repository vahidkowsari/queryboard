import pg from 'pg'
import type { Schema, SchemaProvider, PostgresDbConfig, Column, ProgressCallback } from '../../types.js'

const SAMPLE_VALUE_LIMIT = 10
const MAX_ROWS_FOR_SAMPLING = 2_000_000

async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = []
  let i = 0
  async function run() {
    while (i < tasks.length) {
      const idx = i++
      try {
        results[idx] = { status: 'fulfilled', value: await tasks[idx]() }
      } catch (e) {
        results[idx] = { status: 'rejected', reason: e }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, run))
  return results
}

export function createPostgresSchemaProvider(dbConfig: PostgresDbConfig): SchemaProvider {
  const pool = new pg.Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: dbConfig.ssl ? { rejectUnauthorized: dbConfig.rejectUnauthorized ?? true } : false,
  })

  return {
    name: 'postgres',

    async detectSchema(onProgress?: ProgressCallback): Promise<Schema> {
      console.log(`Schema: Detecting from PostgreSQL database "${dbConfig.database}"...`)
      onProgress?.({ phase: 'detecting', message: 'Discovering tables and views...' })

      // Detect tables and views
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
      onProgress?.({ phase: 'detecting', message: `Found ${tableNames.length} tables/views — fetching metadata...` })

      if (tableNames.length === 0) {
        return { database: dbConfig.database, engine: 'postgres', detectedAt: new Date().toISOString(), tables: {} }
      }

      // Batch: row counts
      const rowCountMap = new Map<string, number>()
      try {
        const rcResult = await pool.query(`SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'public'`)
        for (const r of rcResult.rows) rowCountMap.set(r.relname as string, Number(r.n_live_tup) || 0)
      } catch { console.log('Schema: Row count stats not available') }

      // Batch: all columns in one query
      const colResult = await pool.query(`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1)
        ORDER BY table_name, ordinal_position
      `, [tableNames])

      const colsByTable = new Map<string, Array<{ column_name: string; data_type: string; is_nullable: string }>>()
      for (const r of colResult.rows) {
        if (!colsByTable.has(r.table_name)) colsByTable.set(r.table_name, [])
        colsByTable.get(r.table_name)!.push(r)
      }

      // Batch: primary keys
      const pkSet = new Set<string>()
      try {
        const pkResult = await pool.query(`
          SELECT kcu.table_name, kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = 'public'
            AND tc.table_name = ANY($1)
        `, [tableNames])
        for (const r of pkResult.rows) pkSet.add(`${r.table_name}.${r.column_name}`)
      } catch { console.log('Schema: PK detection not available') }

      // Batch: foreign keys
      const fkMap = new Map<string, { table: string; column: string }>()
      try {
        const fkResult = await pool.query(`
          SELECT kcu.table_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
            AND kcu.table_name = ANY($1)
        `, [tableNames])
        for (const r of fkResult.rows) fkMap.set(`${r.table_name}.${r.column_name}`, { table: r.ref_table, column: r.ref_column })
      } catch { console.log('Schema: FK detection not available') }

      // Batch: declarative partition keys (PG 10+). partattrs is an int2vector of attnums
      // (0 entries are expression keys and are naturally skipped since they match no column).
      const partKeysByTable = new Map<string, string[]>()
      try {
        const partResult = await pool.query(`
          SELECT c.relname AS table_name, a.attname AS column_name, k.col_order
          FROM pg_partitioned_table pt
          JOIN pg_class c ON c.oid = pt.partrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          CROSS JOIN LATERAL unnest(string_to_array(pt.partattrs::text, ' ')::int[]) WITH ORDINALITY AS k(attnum, col_order)
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
          WHERE n.nspname = 'public' AND c.relname = ANY($1)
          ORDER BY c.relname, k.col_order
        `, [tableNames])
        for (const r of partResult.rows) {
          if (!partKeysByTable.has(r.table_name)) partKeysByTable.set(r.table_name, [])
          partKeysByTable.get(r.table_name)!.push(r.column_name as string)
        }
      } catch { console.log('Schema: Partition detection not available') }

      const STRING_TYPES = new Set(['character varying', 'varchar', 'text', 'char', 'character', 'bpchar', 'name', 'citext'])

      const tables: Schema['tables'] = {}
      for (let i = 0; i < tableNames.length; i++) {
        const tableName = tableNames[i]
        const rawCols = colsByTable.get(tableName) || []
        const rowCount = rowCountMap.get(tableName)

        const partitionKeys = partKeysByTable.get(tableName)
        const partitionKeySet = new Set((partitionKeys || []).map((k) => k.toLowerCase()))

        const columns: Column[] = rawCols.map((r) => ({
          name: r.column_name,
          type: r.data_type,
          nullable: r.is_nullable === 'YES',
          isPrimaryKey: pkSet.has(`${tableName}.${r.column_name}`) || undefined,
          references: fkMap.get(`${tableName}.${r.column_name}`),
          isPartitionKey: partitionKeySet.has(r.column_name.toLowerCase()) || undefined,
        }))

        // Sample values for string columns in reasonably-sized tables
        onProgress?.({ phase: 'sampling', message: `Processing table: ${tableName}`, current: i + 1, total: tableNames.length })
        const shouldSample = !rowCount || rowCount < MAX_ROWS_FOR_SAMPLING
        if (shouldSample) {
          const sampleTasks = columns
            .filter((c) => STRING_TYPES.has(c.type))
            .map((col) => async () => {
              const res = await pool.query(`SELECT DISTINCT "${col.name}" FROM "${tableName}" WHERE "${col.name}" IS NOT NULL LIMIT ${SAMPLE_VALUE_LIMIT + 1}`)
              const vals = res.rows.map((r) => String(r[col.name])).filter(Boolean)
              if (vals.length <= SAMPLE_VALUE_LIMIT) col.sampleValues = vals
            })
          await withConcurrency(sampleTasks, 5)
        }

        tables[tableName] = {
          columns,
          rowCount,
          isView: viewSet.has(tableName) || undefined,
          ...(partitionKeys && partitionKeys.length > 0 ? { partitionKeys } : {}),
        }
        console.log(`Schema:   ${tableName}: ${columns.length} columns${rowCount ? `, ~${rowCount} rows` : ''}${viewSet.has(tableName) ? ' [view]' : ''}${partitionKeys && partitionKeys.length > 0 ? ` [partitioned by: ${partitionKeys.join(', ')}]` : ''}`)
      }

      return { database: dbConfig.database, engine: 'postgres', detectedAt: new Date().toISOString(), tables }
    },
  }
}
