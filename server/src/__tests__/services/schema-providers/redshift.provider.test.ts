import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRedshiftSchemaProvider } from '../../../services/schema-providers/redshift.provider.js'
import type { RedshiftDbConfig } from '../../../types.js'

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }))

vi.mock('pg', () => ({
  default: {
    Pool: function MockPool() {
      return { query: mockQuery, end: () => undefined }
    },
  },
}))

const config: RedshiftDbConfig = {
  host: 'localhost',
  port: 5439,
  database: 'testdb',
  user: 'u',
  password: 'p',
}

function routeQuery(rowsByKind: Record<string, unknown[]>) {
  return async (sql: string) => {
    if (sql.includes('attsortkeyord')) return { rows: rowsByKind.sortKeys ?? [] }
    if (sql.includes('svv_table_info')) return { rows: rowsByKind.rowCounts ?? [] }
    if (sql.includes("'PRIMARY KEY'")) return { rows: rowsByKind.pks ?? [] }
    if (sql.includes("'FOREIGN KEY'")) return { rows: rowsByKind.fks ?? [] }
    if (sql.includes('information_schema.columns')) return { rows: rowsByKind.columns ?? [] }
    if (sql.includes('information_schema.tables')) return { rows: rowsByKind.tables ?? [] }
    return { rows: [] }
  }
}

describe('RedshiftSchemaProvider', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockQuery.mockImplementation(
      routeQuery({
        tables: [
          { table_name: 'sales', table_type: 'BASE TABLE' },
          { table_name: 'regions', table_type: 'BASE TABLE' },
        ],
        rowCounts: [{ table_name: 'sales', tbl_rows: 5000 }],
        columns: [
          { table_name: 'sales', column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
          { table_name: 'sales', column_name: 'sold_at', data_type: 'timestamp', is_nullable: 'NO' },
          { table_name: 'sales', column_name: 'region_id', data_type: 'integer', is_nullable: 'YES' },
          { table_name: 'regions', column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
        ],
        pks: [{ table_name: 'sales', column_name: 'id' }],
        fks: [{ table_name: 'sales', column_name: 'region_id', ref_table: 'regions', ref_column: 'id' }],
        // Compound sort key: sold_at then region_id
        sortKeys: [
          { table_name: 'sales', column_name: 'sold_at' },
          { table_name: 'sales', column_name: 'region_id' },
        ],
      }),
    )
  })

  it('detects tables, columns, row counts, PKs and FKs', async () => {
    const schema = await createRedshiftSchemaProvider(config).detectSchema()
    expect(schema.engine).toBe('redshift')
    expect(Object.keys(schema.tables).sort()).toEqual(['regions', 'sales'])
    expect(schema.tables.sales.rowCount).toBe(5000)
    expect(schema.tables.sales.columns.find((c) => c.name === 'id')!.isPrimaryKey).toBe(true)
    expect(schema.tables.sales.columns.find((c) => c.name === 'region_id')!.references).toEqual({
      table: 'regions',
      column: 'id',
    })
  })

  it('detects sort keys as cluster keys (ordered)', async () => {
    const schema = await createRedshiftSchemaProvider(config).detectSchema()
    const sales = schema.tables.sales
    expect(sales.clusterKeys).toEqual(['sold_at', 'region_id'])
    expect(sales.columns.find((c) => c.name === 'sold_at')!.isClusterKey).toBe(true)
    expect(sales.columns.find((c) => c.name === 'region_id')!.isClusterKey).toBe(true)
    expect(sales.columns.find((c) => c.name === 'id')!.isClusterKey).toBeUndefined()
  })

  it('does not mark cluster keys as partition keys', async () => {
    const schema = await createRedshiftSchemaProvider(config).detectSchema()
    expect(schema.tables.sales.partitionKeys).toBeUndefined()
    expect(schema.tables.sales.columns.every((c) => !c.isPartitionKey)).toBe(true)
  })

  it('leaves tables without sort keys without cluster keys', async () => {
    const schema = await createRedshiftSchemaProvider(config).detectSchema()
    expect(schema.tables.regions.clusterKeys).toBeUndefined()
  })

  it('degrades gracefully when sort key detection fails', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('attsortkeyord')) throw new Error('no permission on pg_attribute')
      return routeQuery({
        tables: [{ table_name: 'sales', table_type: 'BASE TABLE' }],
        columns: [{ table_name: 'sales', column_name: 'sold_at', data_type: 'timestamp', is_nullable: 'NO' }],
      })(sql)
    })
    const schema = await createRedshiftSchemaProvider(config).detectSchema()
    expect(schema.tables.sales.clusterKeys).toBeUndefined()
    expect(schema.tables.sales.columns[0].isClusterKey).toBeUndefined()
  })
})
