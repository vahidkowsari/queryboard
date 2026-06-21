import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPostgresSchemaProvider } from '../../../services/schema-providers/postgres.provider.js'
import type { PostgresDbConfig } from '../../../types.js'

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }))

vi.mock('pg', () => ({
  default: {
    Pool: function MockPool() {
      return { query: mockQuery, end: () => undefined }
    },
  },
}))

const config: PostgresDbConfig = {
  host: 'localhost',
  port: 5432,
  database: 'testdb',
  user: 'u',
  password: 'p',
}

// Route each query to canned result rows based on a distinctive SQL substring.
function routeQuery(rowsByKind: Record<string, unknown[]>) {
  return async (sql: string) => {
    if (sql.includes('pg_partitioned_table')) return { rows: rowsByKind.partitions ?? [] }
    if (sql.includes('pg_stat_user_tables')) return { rows: rowsByKind.rowCounts ?? [] }
    if (sql.includes("'PRIMARY KEY'")) return { rows: rowsByKind.pks ?? [] }
    if (sql.includes("'FOREIGN KEY'")) return { rows: rowsByKind.fks ?? [] }
    if (sql.includes('information_schema.columns')) return { rows: rowsByKind.columns ?? [] }
    if (sql.includes('information_schema.tables')) return { rows: rowsByKind.tables ?? [] }
    if (sql.includes('SELECT DISTINCT "status"')) return { rows: [{ status: 'active' }, { status: 'inactive' }] }
    if (sql.includes('SELECT DISTINCT')) return { rows: [] }
    return { rows: [] }
  }
}

describe('PostgresSchemaProvider', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockQuery.mockImplementation(
      routeQuery({
        tables: [
          { table_name: 'events', table_type: 'BASE TABLE' },
          { table_name: 'users', table_type: 'BASE TABLE' },
          { table_name: 'user_summary', table_type: 'VIEW' },
        ],
        rowCounts: [
          { relname: 'events', n_live_tup: 1000 },
          { relname: 'users', n_live_tup: 50 },
        ],
        columns: [
          { table_name: 'events', column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
          { table_name: 'events', column_name: 'created_at', data_type: 'timestamp without time zone', is_nullable: 'NO' },
          { table_name: 'events', column_name: 'status', data_type: 'text', is_nullable: 'YES' },
          { table_name: 'users', column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
          { table_name: 'users', column_name: 'team_id', data_type: 'integer', is_nullable: 'YES' },
          { table_name: 'user_summary', column_name: 'id', data_type: 'integer', is_nullable: 'YES' },
          { table_name: 'user_summary', column_name: 'total', data_type: 'bigint', is_nullable: 'YES' },
        ],
        pks: [
          { table_name: 'events', column_name: 'id' },
          { table_name: 'users', column_name: 'id' },
        ],
        fks: [{ table_name: 'users', column_name: 'team_id', ref_table: 'teams', ref_column: 'id' }],
        partitions: [{ table_name: 'events', column_name: 'created_at', col_order: 1 }],
      }),
    )
  })

  it('detects tables and views', async () => {
    const schema = await createPostgresSchemaProvider(config).detectSchema()
    expect(schema.engine).toBe('postgres')
    expect(Object.keys(schema.tables).sort()).toEqual(['events', 'user_summary', 'users'])
    expect(schema.tables.user_summary.isView).toBe(true)
    expect(schema.tables.events.isView).toBeUndefined()
  })

  it('maps columns, nullability, row counts, and primary keys', async () => {
    const schema = await createPostgresSchemaProvider(config).detectSchema()
    const events = schema.tables.events
    expect(events.rowCount).toBe(1000)
    const id = events.columns.find((c) => c.name === 'id')!
    expect(id.type).toBe('integer')
    expect(id.nullable).toBe(false)
    expect(id.isPrimaryKey).toBe(true)
    expect(events.columns.find((c) => c.name === 'status')!.nullable).toBe(true)
  })

  it('resolves foreign key references', async () => {
    const schema = await createPostgresSchemaProvider(config).detectSchema()
    const teamId = schema.tables.users.columns.find((c) => c.name === 'team_id')!
    expect(teamId.references).toEqual({ table: 'teams', column: 'id' })
  })

  it('samples distinct values for string columns', async () => {
    const schema = await createPostgresSchemaProvider(config).detectSchema()
    const status = schema.tables.events.columns.find((c) => c.name === 'status')!
    expect(status.sampleValues).toEqual(['active', 'inactive'])
  })

  it('detects declarative partition keys', async () => {
    const schema = await createPostgresSchemaProvider(config).detectSchema()
    const events = schema.tables.events
    expect(events.partitionKeys).toEqual(['created_at'])
    expect(events.columns.find((c) => c.name === 'created_at')!.isPartitionKey).toBe(true)
    expect(events.columns.find((c) => c.name === 'id')!.isPartitionKey).toBeUndefined()
  })

  it('leaves non-partitioned tables without partition keys', async () => {
    const schema = await createPostgresSchemaProvider(config).detectSchema()
    expect(schema.tables.users.partitionKeys).toBeUndefined()
    expect(schema.tables.users.columns.every((c) => !c.isPartitionKey)).toBe(true)
  })

  it('degrades gracefully when partition detection fails', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_partitioned_table')) throw new Error('permission denied for pg_partitioned_table')
      return routeQuery({
        tables: [{ table_name: 'events', table_type: 'BASE TABLE' }],
        columns: [{ table_name: 'events', column_name: 'created_at', data_type: 'timestamp', is_nullable: 'NO' }],
      })(sql)
    })
    const schema = await createPostgresSchemaProvider(config).detectSchema()
    expect(schema.tables.events.partitionKeys).toBeUndefined()
    expect(schema.tables.events.columns[0].isPartitionKey).toBeUndefined()
  })

  it('returns empty schema when there are no tables', async () => {
    mockQuery.mockImplementation(routeQuery({ tables: [] }))
    const schema = await createPostgresSchemaProvider(config).detectSchema()
    expect(schema.tables).toEqual({})
  })
})
