import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSnowflakeSchemaProvider } from '../../../services/schema-providers/snowflake.provider.js'
import type { SnowflakeDbConfig } from '../../../types.js'

const { router } = vi.hoisted(() => ({ router: { fn: (_sql: string) => [] as unknown[] } }))

vi.mock('snowflake-sdk', () => ({
  default: {
    createConnection: () => ({
      connect: (cb: (err: unknown) => void) => cb(null),
      execute: ({ sqlText, complete }: { sqlText: string; complete: (e: unknown, s: unknown, r: unknown) => void }) =>
        complete(null, {}, router.fn(sqlText)),
      destroy: (cb: (err: unknown) => void) => cb(null),
    }),
  },
}))

const config: SnowflakeDbConfig = {
  account: 'acct',
  username: 'u',
  password: 'p',
  database: 'DB',
  schema: 'PUBLIC',
  warehouse: 'WH',
}

// Snowflake returns UPPERCASE column keys.
function makeRouter(rowsByKind: Record<string, unknown[]>) {
  return (sql: string): unknown[] => {
    if (sql.startsWith('USE ')) return []
    if (sql.includes('CLUSTERING_KEY')) return rowsByKind.rowCounts ?? []
    if (sql.includes('TABLE_CATALOG')) return rowsByKind.allTables ?? []
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return rowsByKind.columns ?? []
    if (sql.includes('PRIMARY KEY')) return rowsByKind.pks ?? []
    if (sql.includes('REFERENTIAL_CONSTRAINTS')) return rowsByKind.fks ?? []
    if (sql.includes('SELECT DISTINCT "NAME"')) return [{ NAME: 'alpha' }, { NAME: 'beta' }]
    if (sql.includes('SELECT DISTINCT')) return []
    if (sql.includes('INFORMATION_SCHEMA.TABLES')) return rowsByKind.tables ?? []
    return []
  }
}

describe('SnowflakeSchemaProvider', () => {
  beforeEach(() => {
    router.fn = makeRouter({
      tables: [
        { TABLE_NAME: 'EVENTS', TABLE_TYPE: 'BASE TABLE' },
        { TABLE_NAME: 'EVENT_VIEW', TABLE_TYPE: 'VIEW' },
      ],
      rowCounts: [{ TABLE_NAME: 'EVENTS', ROW_COUNT: 2000, CLUSTERING_KEY: 'LINEAR(EVENT_DATE, USER_ID)' }],
      columns: [
        { TABLE_NAME: 'EVENTS', COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER', IS_NULLABLE: 'NO' },
        { TABLE_NAME: 'EVENTS', COLUMN_NAME: 'EVENT_DATE', DATA_TYPE: 'DATE', IS_NULLABLE: 'YES' },
        { TABLE_NAME: 'EVENTS', COLUMN_NAME: 'USER_ID', DATA_TYPE: 'NUMBER', IS_NULLABLE: 'YES' },
        { TABLE_NAME: 'EVENTS', COLUMN_NAME: 'NAME', DATA_TYPE: 'VARCHAR', IS_NULLABLE: 'YES' },
        { TABLE_NAME: 'EVENT_VIEW', COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER', IS_NULLABLE: 'YES' },
      ],
      pks: [{ TABLE_NAME: 'EVENTS', COLUMN_NAME: 'ID' }],
      fks: [{ TABLE_NAME: 'EVENTS', COLUMN_NAME: 'USER_ID', REF_TABLE: 'USERS', REF_COLUMN: 'ID' }],
    })
  })

  it('detects tables, views, columns, row counts, PKs and FKs', async () => {
    const schema = await createSnowflakeSchemaProvider(config).detectSchema()
    expect(schema.engine).toBe('snowflake')
    expect(schema.tables.EVENT_VIEW.isView).toBe(true)
    const events = schema.tables.EVENTS
    expect(events.rowCount).toBe(2000)
    expect(events.columns.find((c) => c.name === 'ID')!.isPrimaryKey).toBe(true)
    expect(events.columns.find((c) => c.name === 'USER_ID')!.references).toEqual({ table: 'USERS', column: 'ID' })
  })

  it('samples distinct values for string columns', async () => {
    const schema = await createSnowflakeSchemaProvider(config).detectSchema()
    expect(schema.tables.EVENTS.columns.find((c) => c.name === 'NAME')!.sampleValues).toEqual(['alpha', 'beta'])
  })

  it('resolves clustering keys against real columns, dropping function wrappers', async () => {
    router.fn = makeRouter({
      tables: [{ TABLE_NAME: 'EVENTS', TABLE_TYPE: 'BASE TABLE' }],
      rowCounts: [{ TABLE_NAME: 'EVENTS', ROW_COUNT: 10, CLUSTERING_KEY: 'LINEAR(TO_DATE(EVENT_DATE), USER_ID)' }],
      columns: [
        { TABLE_NAME: 'EVENTS', COLUMN_NAME: 'EVENT_DATE', DATA_TYPE: 'DATE', IS_NULLABLE: 'YES' },
        { TABLE_NAME: 'EVENTS', COLUMN_NAME: 'USER_ID', DATA_TYPE: 'NUMBER', IS_NULLABLE: 'YES' },
      ],
    })
    const schema = await createSnowflakeSchemaProvider(config).detectSchema()
    const events = schema.tables.EVENTS
    expect(events.clusterKeys).toEqual(['EVENT_DATE', 'USER_ID'])
    expect(events.columns.find((c) => c.name === 'EVENT_DATE')!.isClusterKey).toBe(true)
    expect(events.columns.find((c) => c.name === 'USER_ID')!.isClusterKey).toBe(true)
  })

  it('marks cluster keys as cluster keys, not partition keys', async () => {
    const schema = await createSnowflakeSchemaProvider(config).detectSchema()
    const events = schema.tables.EVENTS
    expect(events.clusterKeys).toEqual(['EVENT_DATE', 'USER_ID'])
    expect(events.partitionKeys).toBeUndefined()
    expect(events.columns.every((c) => !c.isPartitionKey)).toBe(true)
  })

  it('leaves non-clustered tables without cluster keys', async () => {
    router.fn = makeRouter({
      tables: [{ TABLE_NAME: 'PLAIN', TABLE_TYPE: 'BASE TABLE' }],
      rowCounts: [{ TABLE_NAME: 'PLAIN', ROW_COUNT: 5, CLUSTERING_KEY: null }],
      columns: [{ TABLE_NAME: 'PLAIN', COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER', IS_NULLABLE: 'YES' }],
    })
    const schema = await createSnowflakeSchemaProvider(config).detectSchema()
    expect(schema.tables.PLAIN.clusterKeys).toBeUndefined()
  })
})
