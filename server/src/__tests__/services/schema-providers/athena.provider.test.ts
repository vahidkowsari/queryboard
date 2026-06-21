import { describe, it, expect, vi } from 'vitest'
import type { AthenaClient } from '@aws-sdk/client-athena'
import { createAthenaSchemaProvider } from '../../../services/schema-providers/athena.provider.js'

// Build an Athena ResultSet: row 0 is the header (the provider slices it off).
function athenaRows(dataRows: string[][]) {
  const header = { Data: [{ VarCharValue: 'header' }] }
  return [header, ...dataRows.map((r) => ({ Data: r.map((v) => ({ VarCharValue: v })) }))]
}

type RowsFor = (sql: string) => string[][]

function makeClient(rowsFor: RowsFor): AthenaClient {
  let lastSql = ''
  return {
    send: vi.fn(async (command: { constructor: { name: string }; input?: { QueryString?: string } }) => {
      const name = command.constructor.name
      if (name === 'StartQueryExecutionCommand') {
        lastSql = command.input?.QueryString ?? ''
        return { QueryExecutionId: 'exec-1' }
      }
      if (name === 'GetQueryExecutionCommand') {
        return { QueryExecution: { Status: { State: 'SUCCEEDED' } } }
      }
      if (name === 'GetQueryResultsCommand') {
        return { ResultSet: { Rows: athenaRows(rowsFor(lastSql)) } }
      }
      return {}
    }),
  } as unknown as AthenaClient
}

const COLUMNS: Record<string, string[][]> = {
  events: [
    ['id', 'integer'],
    ['name', 'varchar'],
    ['dt', 'varchar'],
  ],
  lookup: [['code', 'varchar']],
  daily_view: [
    ['id', 'integer'],
    ['cnt', 'bigint'],
  ],
}

const DDL: Record<string, string[]> = {
  events: ['CREATE EXTERNAL TABLE `events`(', '  `id` int,', '  `name` string)', 'PARTITIONED BY (', '  `dt` string)'],
  lookup: ['CREATE EXTERNAL TABLE `lookup`(', '  `code` string)'],
}

function defaultRowsFor(sql: string): string[][] {
  if (sql.includes('SHOW TABLES')) return [['events'], ['lookup'], ['daily_view']]
  if (sql.includes('SHOW VIEWS')) return [['daily_view']]
  if (sql.includes('information_schema.columns')) {
    const table = sql.match(/table_name = '(\w+)'/)![1]
    return COLUMNS[table] ?? []
  }
  if (sql.includes('SHOW TBLPROPERTIES')) {
    return sql.includes('`events`') ? [['500']] : []
  }
  if (sql.includes('SHOW CREATE TABLE')) {
    const table = sql.match(/`[^`]+`\.`([^`]+)`/)![1]
    return (DDL[table] ?? []).map((line) => [line])
  }
  return []
}

describe('AthenaSchemaProvider', () => {
  it('detects tables and views', async () => {
    const provider = createAthenaSchemaProvider(makeClient(defaultRowsFor), 'mydb', 'wg')
    const schema = await provider.detectSchema()
    expect(schema.engine).toBe('athena')
    expect(Object.keys(schema.tables).sort()).toEqual(['daily_view', 'events', 'lookup'])
    expect(schema.tables.daily_view.isView).toBe(true)
  })

  it('maps columns (nullable by default) and row counts', async () => {
    const provider = createAthenaSchemaProvider(makeClient(defaultRowsFor), 'mydb', 'wg')
    const schema = await provider.detectSchema()
    const events = schema.tables.events
    expect(events.rowCount).toBe(500)
    expect(events.columns.map((c) => c.name)).toEqual(['id', 'name', 'dt'])
    expect(events.columns.every((c) => c.nullable)).toBe(true)
  })

  it('detects partition keys from SHOW CREATE TABLE', async () => {
    const provider = createAthenaSchemaProvider(makeClient(defaultRowsFor), 'mydb', 'wg')
    const schema = await provider.detectSchema()
    const events = schema.tables.events
    expect(events.partitionKeys).toEqual(['dt'])
    expect(events.columns.find((c) => c.name === 'dt')!.isPartitionKey).toBe(true)
    expect(events.columns.find((c) => c.name === 'id')!.isPartitionKey).toBeUndefined()
  })

  it('leaves non-partitioned tables and views without partition keys', async () => {
    const provider = createAthenaSchemaProvider(makeClient(defaultRowsFor), 'mydb', 'wg')
    const schema = await provider.detectSchema()
    expect(schema.tables.lookup.partitionKeys).toBeUndefined()
    expect(schema.tables.daily_view.partitionKeys).toBeUndefined()
  })

  it('degrades gracefully when SHOW CREATE TABLE is unavailable', async () => {
    const rowsFor: RowsFor = (sql) => {
      if (sql.includes('SHOW CREATE TABLE')) throw new Error('DDL not available')
      return defaultRowsFor(sql)
    }
    const provider = createAthenaSchemaProvider(makeClient(rowsFor), 'mydb', 'wg')
    const schema = await provider.detectSchema()
    expect(schema.tables.events.partitionKeys).toBeUndefined()
    expect(schema.tables.events.columns.find((c) => c.name === 'dt')!.isPartitionKey).toBeUndefined()
  })
})
