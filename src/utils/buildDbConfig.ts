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
  ssl?: boolean
  rejectUnauthorized?: boolean
}

export interface BigQueryFormData {
  projectId: string
  dataset: string
}

export interface SnowflakeFormData {
  account: string
  username: string
  password: string
  database: string
  schema: string
  warehouse: string
  role?: string
}

export interface DatabricksFormData {
  host: string
  port: string
  httpPath: string
  token: string
  catalog: string
  schema: string
}

export function buildDbConfig(
  dbEngine: DbEngine,
  athena: AthenaFormData,
  rdbms: RdbmsFormData,
  bigquery: BigQueryFormData,
  snowflake: SnowflakeFormData,
  databricks?: DatabricksFormData,
): DbConfig {
  switch (dbEngine) {
    case 'athena':
      return { ...athena }
    case 'postgres':
      return { 
        host: rdbms.host,
        port: parseInt(rdbms.port, 10) || 5432,
        database: rdbms.database,
        user: rdbms.user,
        password: rdbms.password,
        ssl: rdbms.ssl,
        rejectUnauthorized: rdbms.rejectUnauthorized,
      }
    case 'mysql':
      return { 
        host: rdbms.host,
        port: parseInt(rdbms.port, 10) || 3306,
        database: rdbms.database,
        user: rdbms.user,
        password: rdbms.password,
        ssl: rdbms.ssl,
        rejectUnauthorized: rdbms.rejectUnauthorized,
      }
    case 'redshift':
      return { 
        host: rdbms.host,
        port: parseInt(rdbms.port, 10) || 5439,
        database: rdbms.database,
        user: rdbms.user,
        password: rdbms.password,
        ssl: rdbms.ssl,
        rejectUnauthorized: rdbms.rejectUnauthorized,
      }
    case 'bigquery':
      return { ...bigquery }
    case 'snowflake':
      return { ...snowflake }
    case 'databricks':
      return {
        host: databricks!.host,
        port: parseInt(databricks!.port, 10) || 443,
        httpPath: databricks!.httpPath,
        token: databricks!.token,
        catalog: databricks!.catalog,
        schema: databricks!.schema,
      }
  }
}
