import { BigQuery } from '@google-cloud/bigquery'
import type { Schema, SchemaProvider, BigQueryDbConfig } from '../../types.js'

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
      const [tables] = await dataset.getTables()
      const tableNames = tables.map((t: { id?: string }) => t.id!).sort()
      console.log(`Schema: Found ${tableNames.length} tables`)

      const schemaTables: Schema['tables'] = {}
      for (const tableName of tableNames) {
        try {
          const [metadata] = await dataset.table(tableName).getMetadata()
          const fields = metadata.schema?.fields || []
          const columns = fields.map((f: { name: string; type: string }) => ({
            name: f.name,
            type: f.type.toLowerCase(),
          }))
          const rowCount = metadata.numRows ? Number(metadata.numRows) : undefined
          schemaTables[tableName] = { columns, rowCount }
          console.log(`Schema:   ${tableName}: ${columns.length} columns${rowCount ? `, ~${rowCount} rows` : ''}`)
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
