import { BigQuery } from '@google-cloud/bigquery'
import type { Schema, SchemaProvider, BigQueryDbConfig, ProgressCallback } from '../../types.js'

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

    async detectSchema(onProgress?: ProgressCallback): Promise<Schema> {
      console.log(`Schema: Detecting from BigQuery dataset "${dbConfig.dataset}"...`)
      onProgress?.({ phase: 'detecting', message: 'Discovering tables and views...' })

      const dataset = bq.dataset(dbConfig.dataset)
      const [tableList] = await dataset.getTables()
      const tableNames = tableList.map((t: { id?: string }) => t.id!).sort()
      const tableNameSet = new Set(tableNames)
      console.log(`Schema: Found ${tableNames.length} tables/views`)
      onProgress?.({ phase: 'detecting', message: `Found ${tableNames.length} tables/views — reading metadata...` })

      const schemaTables: Schema['tables'] = {}
      for (let i = 0; i < tableNames.length; i++) {
        const tableName = tableNames[i]
        onProgress?.({ phase: 'sampling', message: `Processing table: ${tableName}`, current: i + 1, total: tableNames.length })
        try {
          const [metadata] = await dataset.table(tableName).getMetadata()
          const isView = metadata.type === 'VIEW'
          const fields: Array<{ name: string; type: string; mode?: string }> = metadata.schema?.fields || []
          const rowCount = metadata.numRows ? Number(metadata.numRows) : undefined

          // Partition detection from the raw Table resource (no extra API call).
          // - timePartitioning.field: column the table is time-partitioned on
          // - timePartitioning without a field: ingestion-time partitioning, exposed via
          //   the _PARTITIONTIME / _PARTITIONDATE pseudo-columns (not in schema.fields)
          // - rangePartitioning.field: column the table is integer-range-partitioned on
          const partitionKeys: string[] = []
          const timePart = metadata.timePartitioning as { field?: string } | undefined
          const rangePart = metadata.rangePartitioning as { field?: string } | undefined
          if (timePart) {
            partitionKeys.push(timePart.field || '_PARTITIONTIME')
          }
          if (rangePart?.field) {
            partitionKeys.push(rangePart.field)
          }
          const partitionKeySet = new Set(partitionKeys.map((k) => k.toLowerCase()))

          // Clustering keys (not partitions, but they drive block pruning when filtered on).
          const clustering = metadata.clustering as { fields?: string[] } | undefined
          const clusterKeys = (clustering?.fields || []).filter((k) => !partitionKeySet.has(k.toLowerCase()))
          const clusterKeySet = new Set(clusterKeys.map((k) => k.toLowerCase()))

          const columns = fields.map((f) => ({
            name: f.name,
            type: f.type.toLowerCase(),
            nullable: f.mode !== 'REQUIRED',
            references: inferReference(f.name, tableNameSet),
            ...(partitionKeySet.has(f.name.toLowerCase()) ? { isPartitionKey: true } : {}),
            ...(clusterKeySet.has(f.name.toLowerCase()) ? { isClusterKey: true } : {}),
          }))

          // Ingestion-time partitioning exposes a pseudo-column not present in schema.fields.
          // Surface it as a synthetic column so the agent knows to filter on it.
          if (timePart && !timePart.field) {
            columns.push({
              name: '_PARTITIONTIME',
              type: 'timestamp',
              nullable: true,
              references: undefined,
              isPartitionKey: true,
            })
          }

          schemaTables[tableName] = {
            columns,
            rowCount,
            isView: isView || undefined,
            ...(partitionKeys.length > 0 ? { partitionKeys } : {}),
            ...(clusterKeys.length > 0 ? { clusterKeys } : {}),
          }
          console.log(`Schema:   ${tableName}: ${columns.length} columns${rowCount ? `, ~${rowCount} rows` : ''}${isView ? ' [view]' : ''}${partitionKeys.length > 0 ? ` [partitioned by: ${partitionKeys.join(', ')}]` : ''}${clusterKeys.length > 0 ? ` [clustered by: ${clusterKeys.join(', ')}]` : ''}`)
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
