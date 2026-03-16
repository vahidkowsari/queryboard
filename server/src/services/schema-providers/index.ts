import { createAthenaSchemaProvider } from './athena.provider.js'
import { createPostgresSchemaProvider } from './postgres.provider.js'
import { createMySQLSchemaProvider } from './mysql.provider.js'
import { createBigQuerySchemaProvider } from './bigquery.provider.js'
import { createRedshiftSchemaProvider } from './redshift.provider.js'
import { createSnowflakeSchemaProvider } from './snowflake.provider.js'
import { createAthenaClient } from '../athena.service.js'
import type {
  DbEngine,
  DbConfig,
  SchemaProvider,
  AthenaDbConfig,
  PostgresDbConfig,
  MySQLDbConfig,
  BigQueryDbConfig,
  RedshiftDbConfig,
  SnowflakeDbConfig,
} from '../../types.js'

export function createSchemaProvider(engine: DbEngine, config: DbConfig): SchemaProvider {
  switch (engine) {
    case 'athena': {
      const cfg = config as AthenaDbConfig
      const client = createAthenaClient(cfg)
      return createAthenaSchemaProvider(client, cfg.database, cfg.workgroup)
    }
    case 'postgres':
      return createPostgresSchemaProvider(config as PostgresDbConfig)
    case 'mysql':
      return createMySQLSchemaProvider(config as MySQLDbConfig)
    case 'bigquery':
      return createBigQuerySchemaProvider(config as BigQueryDbConfig)
    case 'redshift':
      return createRedshiftSchemaProvider(config as RedshiftDbConfig)
    case 'snowflake':
      return createSnowflakeSchemaProvider(config as SnowflakeDbConfig)
    default:
      throw new Error(`Schema detection not yet supported for engine: ${engine}`)
  }
}
