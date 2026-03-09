import type { DbEngine, DbConfig } from '../types'

export interface AthenaFormData {
  database: string
  workgroup: string
  region: string
  profile: string
}

export interface RdbmsFormData {
  host: string
  port: string
  database: string
  user: string
  password: string
}

export interface BigQueryFormData {
  projectId: string
  dataset: string
}

export function buildDbConfig(
  dbEngine: DbEngine,
  athena: AthenaFormData,
  rdbms: RdbmsFormData,
  bigquery: BigQueryFormData,
): DbConfig {
  switch (dbEngine) {
    case 'athena':
      return { ...athena }
    case 'postgres':
    case 'mysql':
      return { ...rdbms, port: parseInt(rdbms.port) || 5432 }
    case 'redshift':
      return { ...rdbms, port: parseInt(rdbms.port) || 5439 }
    case 'bigquery':
      return { ...bigquery }
  }
}
