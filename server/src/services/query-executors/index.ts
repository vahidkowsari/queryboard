import { createAthenaExecutor } from './athena.executor.js'
import { createPostgresExecutor } from './postgres.executor.js'
import { createMySQLExecutor } from './mysql.executor.js'
import { createBigQueryExecutor } from './bigquery.executor.js'
import { createRedshiftExecutor } from './redshift.executor.js'
import type {
  DbEngine,
  DbConfig,
  QueryExecutor,
  AthenaDbConfig,
  PostgresDbConfig,
  MySQLDbConfig,
  BigQueryDbConfig,
  RedshiftDbConfig,
} from '../../types.js'

/**
 * Factory function that creates the appropriate query executor based on database engine
 * Each executor handles database-specific SQL syntax and connection management
 */
export function createQueryExecutor(engine: DbEngine, config: DbConfig): QueryExecutor {
  switch (engine) {
    case 'athena':
      return createAthenaExecutor(config as AthenaDbConfig)
    case 'postgres':
      return createPostgresExecutor(config as PostgresDbConfig)
    case 'mysql':
      return createMySQLExecutor(config as MySQLDbConfig)
    case 'bigquery':
      return createBigQueryExecutor(config as BigQueryDbConfig)
    case 'redshift':
      return createRedshiftExecutor(config as RedshiftDbConfig)
    default:
      throw new Error(`Query executor not yet supported for engine: ${engine}`)
  }
}
