import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMySQLSchemaProvider } from '../../../services/schema-providers/mysql.provider.js'
import type { MySQLDbConfig } from '../../../types.js'

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }))

vi.mock('mysql2/promise', () => ({
  default: { createPool: () => ({ query: mockQuery, end: () => undefined }) },
}))

const config: MySQLDbConfig = {
  host: 'localhost',
  port: 3306,
  database: 'testdb',
  user: 'u',
  password: 'p',
}

// mysql2 query() resolves to a [rows, fields] tuple, so each canned result is wrapped in [ ].
function routeQuery(rowsByKind: Record<string, unknown[]>) {
  return async (sql: string) => {
    if (sql.includes('information_schema.partitions')) return [rowsByKind.partitions ?? []]
    if (sql.includes('information_schema.key_column_usage')) return [rowsByKind.fks ?? []]
    if (sql.includes('information_schema.columns')) return [rowsByKind.columns ?? []]
    if (sql.includes('table_rows')) return [rowsByKind.rowCounts ?? []]
    if (sql.includes('information_schema.tables')) return [rowsByKind.tables ?? []]
    if (sql.includes('SELECT DISTINCT `name`')) return [[{ name: 'widget' }, { name: 'gadget' }]]
    if (sql.includes('SELECT DISTINCT')) return [[]]
    return [[]]
  }
}

describe('MySQLSchemaProvider', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockQuery.mockImplementation(
      routeQuery({
        tables: [
          { table_name: 'orders', table_type: 'BASE TABLE' },
          { table_name: 'products', table_type: 'BASE TABLE' },
          { table_name: 'order_view', table_type: 'VIEW' },
        ],
        rowCounts: [
          { table_name: 'orders', table_rows: 1200 },
          { table_name: 'products', table_rows: 80 },
        ],
        columns: [
          { table_name: 'orders', column_name: 'id', data_type: 'int', is_nullable: 'NO', column_key: 'PRI' },
          { table_name: 'orders', column_name: 'created_at', data_type: 'datetime', is_nullable: 'NO', column_key: '' },
          { table_name: 'orders', column_name: 'product_id', data_type: 'int', is_nullable: 'YES', column_key: 'MUL' },
          { table_name: 'products', column_name: 'id', data_type: 'int', is_nullable: 'NO', column_key: 'PRI' },
          { table_name: 'products', column_name: 'name', data_type: 'varchar', is_nullable: 'YES', column_key: '' },
          { table_name: 'order_view', column_name: 'id', data_type: 'int', is_nullable: 'YES', column_key: '' },
        ],
        fks: [
          {
            table_name: 'orders',
            column_name: 'product_id',
            referenced_table_name: 'products',
            referenced_column_name: 'id',
          },
        ],
        // Range partitioning by an expression wrapping the column in backticks.
        partitions: [{ table_name: 'orders', partition_expression: 'YEAR(`created_at`)', subpartition_expression: null }],
      }),
    )
  })

  it('detects tables, views, columns, row counts and primary keys', async () => {
    const schema = await createMySQLSchemaProvider(config).detectSchema()
    expect(schema.engine).toBe('mysql')
    expect(schema.tables.order_view.isView).toBe(true)
    expect(schema.tables.orders.rowCount).toBe(1200)
    expect(schema.tables.orders.columns.find((c) => c.name === 'id')!.isPrimaryKey).toBe(true)
    expect(schema.tables.products.columns.find((c) => c.name === 'name')!.nullable).toBe(true)
  })

  it('resolves foreign key references', async () => {
    const schema = await createMySQLSchemaProvider(config).detectSchema()
    expect(schema.tables.orders.columns.find((c) => c.name === 'product_id')!.references).toEqual({
      table: 'products',
      column: 'id',
    })
  })

  it('samples distinct values for string columns', async () => {
    const schema = await createMySQLSchemaProvider(config).detectSchema()
    expect(schema.tables.products.columns.find((c) => c.name === 'name')!.sampleValues).toEqual(['widget', 'gadget'])
  })

  it('extracts partition key columns from a function-wrapped expression', async () => {
    const schema = await createMySQLSchemaProvider(config).detectSchema()
    const orders = schema.tables.orders
    expect(orders.partitionKeys).toEqual(['created_at'])
    expect(orders.columns.find((c) => c.name === 'created_at')!.isPartitionKey).toBe(true)
  })

  it('extracts multiple columns from a COLUMNS partition expression', async () => {
    mockQuery.mockImplementation(
      routeQuery({
        tables: [{ table_name: 'logs', table_type: 'BASE TABLE' }],
        columns: [
          { table_name: 'logs', column_name: 'region', data_type: 'varchar', is_nullable: 'NO', column_key: '' },
          { table_name: 'logs', column_name: 'tenant', data_type: 'varchar', is_nullable: 'NO', column_key: '' },
        ],
        partitions: [
          { table_name: 'logs', partition_expression: '`region`,`tenant`', subpartition_expression: null },
        ],
      }),
    )
    const schema = await createMySQLSchemaProvider(config).detectSchema()
    expect(schema.tables.logs.partitionKeys).toEqual(['region', 'tenant'])
  })

  it('degrades gracefully when partition detection fails', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.partitions')) throw new Error('no access')
      return routeQuery({
        tables: [{ table_name: 'orders', table_type: 'BASE TABLE' }],
        columns: [{ table_name: 'orders', column_name: 'created_at', data_type: 'datetime', is_nullable: 'NO', column_key: '' }],
      })(sql)
    })
    const schema = await createMySQLSchemaProvider(config).detectSchema()
    expect(schema.tables.orders.partitionKeys).toBeUndefined()
    expect(schema.tables.orders.columns[0].isPartitionKey).toBeUndefined()
  })
})
