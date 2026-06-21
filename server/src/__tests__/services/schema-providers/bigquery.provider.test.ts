import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBigQuerySchemaProvider } from '../../../services/schema-providers/bigquery.provider.js'
import type { BigQueryDbConfig } from '../../../types.js'

// Mutable fixture the mock reads from; each test resets it in beforeEach.
const state = vi.hoisted(() => ({
  tableIds: [] as string[],
  metadata: {} as Record<string, unknown>,
}))

vi.mock('@google-cloud/bigquery', () => ({
  BigQuery: function MockBigQuery() {
    return {
      dataset: () => ({
        getTables: async () => [state.tableIds.map((id) => ({ id }))],
        table: (name: string) => ({ getMetadata: async () => [state.metadata[name]] }),
      }),
    }
  },
}))

const config: BigQueryDbConfig = { projectId: 'proj', dataset: 'ds' }

describe('BigQuerySchemaProvider', () => {
  beforeEach(() => {
    state.tableIds = ['events', 'users']
    state.metadata = {
      events: {
        type: 'TABLE',
        numRows: '1000',
        schema: {
          fields: [
            { name: 'id', type: 'INTEGER', mode: 'REQUIRED' },
            { name: 'event_date', type: 'DATE', mode: 'NULLABLE' },
            { name: 'user_id', type: 'INTEGER', mode: 'NULLABLE' },
          ],
        },
        timePartitioning: { type: 'DAY', field: 'event_date' },
        clustering: { fields: ['user_id'] },
      },
      users: {
        type: 'TABLE',
        numRows: '50',
        schema: { fields: [{ name: 'id', type: 'INTEGER', mode: 'REQUIRED' }] },
      },
    }
  })

  it('maps columns, types, nullability and row counts', async () => {
    const schema = await createBigQuerySchemaProvider(config).detectSchema()
    expect(schema.engine).toBe('bigquery')
    const events = schema.tables.events
    expect(events.rowCount).toBe(1000)
    const id = events.columns.find((c) => c.name === 'id')!
    expect(id.type).toBe('integer')
    expect(id.nullable).toBe(false)
    expect(events.columns.find((c) => c.name === 'event_date')!.nullable).toBe(true)
  })

  it('infers references from *_id naming', async () => {
    const schema = await createBigQuerySchemaProvider(config).detectSchema()
    expect(schema.tables.events.columns.find((c) => c.name === 'user_id')!.references).toEqual({
      table: 'users',
      column: 'id',
    })
  })

  it('detects column time-partitioning and clustering', async () => {
    const schema = await createBigQuerySchemaProvider(config).detectSchema()
    const events = schema.tables.events
    expect(events.partitionKeys).toEqual(['event_date'])
    expect(events.clusterKeys).toEqual(['user_id'])
    expect(events.columns.find((c) => c.name === 'event_date')!.isPartitionKey).toBe(true)
    expect(events.columns.find((c) => c.name === 'user_id')!.isClusterKey).toBe(true)
  })

  it('exposes _PARTITIONTIME as a synthetic column for ingestion-time partitioning', async () => {
    state.tableIds = ['logs']
    state.metadata = {
      logs: {
        type: 'TABLE',
        schema: { fields: [{ name: 'message', type: 'STRING', mode: 'NULLABLE' }] },
        timePartitioning: { type: 'DAY' }, // no field => ingestion-time
      },
    }
    const schema = await createBigQuerySchemaProvider(config).detectSchema()
    const logs = schema.tables.logs
    expect(logs.partitionKeys).toEqual(['_PARTITIONTIME'])
    const pseudo = logs.columns.find((c) => c.name === '_PARTITIONTIME')!
    expect(pseudo).toBeDefined()
    expect(pseudo.isPartitionKey).toBe(true)
    expect(pseudo.type).toBe('timestamp')
  })

  it('detects integer range partitioning', async () => {
    state.tableIds = ['shards']
    state.metadata = {
      shards: {
        type: 'TABLE',
        schema: { fields: [{ name: 'customer_id', type: 'INTEGER', mode: 'REQUIRED' }] },
        rangePartitioning: { field: 'customer_id', range: { start: '0', end: '1000', interval: '10' } },
      },
    }
    const schema = await createBigQuerySchemaProvider(config).detectSchema()
    expect(schema.tables.shards.partitionKeys).toEqual(['customer_id'])
    expect(schema.tables.shards.columns[0].isPartitionKey).toBe(true)
  })

  it('does not double-count a column that is both partition and cluster field', async () => {
    state.tableIds = ['t']
    state.metadata = {
      t: {
        type: 'TABLE',
        schema: {
          fields: [
            { name: 'd', type: 'DATE', mode: 'NULLABLE' },
            { name: 'x', type: 'STRING', mode: 'NULLABLE' },
          ],
        },
        timePartitioning: { type: 'DAY', field: 'd' },
        clustering: { fields: ['d', 'x'] },
      },
    }
    const schema = await createBigQuerySchemaProvider(config).detectSchema()
    expect(schema.tables.t.partitionKeys).toEqual(['d'])
    expect(schema.tables.t.clusterKeys).toEqual(['x'])
    const d = schema.tables.t.columns.find((c) => c.name === 'd')!
    expect(d.isPartitionKey).toBe(true)
    expect(d.isClusterKey).toBeUndefined()
  })

  it('marks views and leaves non-partitioned tables clean', async () => {
    state.tableIds = ['my_view', 'plain']
    state.metadata = {
      my_view: { type: 'VIEW', schema: { fields: [{ name: 'id', type: 'INTEGER' }] } },
      plain: { type: 'TABLE', schema: { fields: [{ name: 'id', type: 'INTEGER' }] } },
    }
    const schema = await createBigQuerySchemaProvider(config).detectSchema()
    expect(schema.tables.my_view.isView).toBe(true)
    expect(schema.tables.plain.partitionKeys).toBeUndefined()
    expect(schema.tables.plain.clusterKeys).toBeUndefined()
  })
})
