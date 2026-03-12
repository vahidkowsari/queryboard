import { BigQuery } from '@google-cloud/bigquery'
import type { Schema, SchemaProvider, BigQueryDbConfig } from '../../types.js'

function inferReference(colName: string, tableNames: Set<string>): { table: string; column: string } | undefined {
  if (!colName.endsWith('_id')) return undefined
  const candidate = colName.slice(0, -3) // strip '_id'
  // Try plural and singular
  if (tableNames.has(candidate + 's')) return { table: candidate + 's', column: 'id' }
  if (tableNames.has(candidate)) return { table: candidate, column: 'id' }
  return undefined
}

export function createBigQuerySchemaProvider(dbConfig: BigQueryDbConfig): SchemaProvider {
  const bq = new BigQuery({
    projectId: dbConfig.projectId,
    ...(dbConfig.keyFilePath ? { keyFilename: dbConfig.keyFilePath } : {}),
  })

  return {
    name: 'bigquery',

    async detectSchema(): Promise<Schema> {
      console.log(`Schema: Detecting from BigQuery dataset "${dbConfig.dataset}"...`)

      const dataset = bq.dataset(dbConfig.dataset)
      const [tableList] = await dataset.getTables()
      const tableNames = tableList.map((t: { id?: string }) => t.id!).sort()
      const tableNameSet = new Set(tableNames)
      console.log(`Schema: Found ${tableNames.length} tables/views`)

      const schemaTables: Schema['tables'] = {}
      for (const tableName of tableNames) {
        try {
          const [metadata] = await dataset.table(tableName).getMetadata()
          const isView = metadata.type === 'VIEW'
          const fields: Array<{ name: string; type: string; mode?: string }> = metadata.schema?.fields || []
          const rowCount = metadata.numRows ? Number(metadata.numRows) : undefined

          const columns = fields.map((f) => ({
            name: f.name,
            type: f.type.toLowerCase(),
            nullable: f.mode !== 'REQUIRED',
            references: inferReference(f.name, tableNameSet),
          }))

          schemaTables[tableName] = { columns, rowCount, isView: isView || undefined }
          console.log(`Schema:   ${tableName}: ${columns.length} columns${rowCount ? `, ~${rowCount} rows` : ''}${isView ? ' [view]' : ''}`)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`Schema:   ${tableName}: FAILED - ${msg}`)
        }
      }

      return {
        database: `${dbConfig.projectId}.${dbConfig.dataset}`,
        engine: 'bigquery',
        detectedAt: new Date().toISOString(),
        tables: schemaTables,
      }
    },
  }
}
