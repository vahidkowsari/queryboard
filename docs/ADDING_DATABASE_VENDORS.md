# Adding a Database Vendor

QueryBoard uses a factory pattern to support multiple database engines. Each engine plugs in via two interfaces — **QueryExecutor** (runs SQL) and **SchemaProvider** (discovers tables/columns). This guide walks through adding a new one.

## Interfaces

Both interfaces are defined in `server/src/types.ts`:

```ts
interface QueryExecutor {
  execute(sql: string): Promise<QueryResult>
  sqlRules: string
}

interface SchemaProvider {
  name: string
  detectSchema(): Promise<Schema>
}

interface QueryResult {
  columns: string[]
  rows: string[][]
  executionId?: string
}
```

## Current Engines

| Engine     | Value in `DbEngine` | Client Library            |
|------------|----------------------|---------------------------|
| Athena     | `athena`             | `@aws-sdk/client-athena`  |
| PostgreSQL | `postgres`           | `pg`                      |
| MySQL      | `mysql`              | `mysql2/promise`          |
| BigQuery   | `bigquery`           | `@google-cloud/bigquery`  |
| Redshift   | `redshift`           | `pg` (PostgreSQL-compatible) |

## Steps

The examples below use **Snowflake** as the new engine. Replace with your actual vendor.

### 1. Install the client library

```bash
cd queryboard
npm install snowflake-sdk
```

### 2. Add types (`server/src/types.ts`)

Add a config interface and extend the union types:

```ts
// Config interface
export interface SnowflakeDbConfig {
  account: string
  username: string
  password: string
  warehouse: string
  database: string
  schema: string
}

// Add to the DbEngine union
export type DbEngine = 'athena' | 'postgres' | 'mysql' | 'bigquery' | 'snowflake'

// Add to the DbConfig union
export type DbConfig = AthenaDbConfig | PostgresDbConfig | MySQLDbConfig | BigQueryDbConfig | SnowflakeDbConfig
```

### 3. Create the query executor (`server/src/services/query-executors/snowflake.executor.ts`)

The executor runs SQL and returns uniform `{ columns, rows }` results. Include engine-specific SQL rules that guide the LLM to write correct SQL.

```ts
import snowflake from 'snowflake-sdk'
import type { QueryExecutor, SnowflakeDbConfig } from '../../types.js'

const SNOWFLAKE_RULES = `SNOWFLAKE SQL RULES:
- Use double quotes for case-sensitive identifiers, single quotes for strings.
- Use :: for casting (e.g., col::NUMBER, col::DATE).
- Date functions: DATE_TRUNC('MONTH', col), EXTRACT(YEAR FROM col), CURRENT_DATE().
- String functions: CONCAT(), SUBSTR(), LENGTH(), TRIM(), REGEXP_LIKE().
- Use LISTAGG() for string aggregation.
- Use LIMIT to restrict result size.
- Snowflake supports window functions: ROW_NUMBER(), RANK(), DENSE_RANK(), etc.
- Use ILIKE for case-insensitive pattern matching.
- Use FLATTEN() to unnest semi-structured data (VARIANT, ARRAY, OBJECT).
- JSON access: col:key or GET_PATH(col, 'key').`

export function createSnowflakeExecutor(dbConfig: SnowflakeDbConfig): QueryExecutor {
  // Create connection (adapt to your client library)
  const connection = snowflake.createConnection({
    account: dbConfig.account,
    username: dbConfig.username,
    password: dbConfig.password,
    warehouse: dbConfig.warehouse,
    database: dbConfig.database,
    schema: dbConfig.schema,
  })

  return {
    sqlRules: SNOWFLAKE_RULES,
    async execute(sql: string) {
      console.log('Snowflake: Running query:', sql)
      // Implement query execution using your client library
      // Must return { columns: string[], rows: string[][] }
      const result = await runQuery(connection, sql)
      console.log(`Snowflake: Got ${result.columns.length} columns, ${result.rows.length} rows`)
      return result
    },
  }
}
```

**Key requirements:**
- `columns` must be a `string[]` of column names.
- `rows` must be a `string[][]` — every cell stringified (use `String(val)`, with `''` for nulls).
- `sqlRules` should describe dialect-specific syntax so the LLM generates valid SQL.

### 4. Create the schema provider (`server/src/services/schema-providers/snowflake.provider.ts`)

The provider discovers tables and their columns. Use the engine's metadata mechanisms.

```ts
import snowflake from 'snowflake-sdk'
import type { Schema, SchemaProvider, SnowflakeDbConfig } from '../../types.js'

export function createSnowflakeSchemaProvider(dbConfig: SnowflakeDbConfig): SchemaProvider {
  return {
    name: 'snowflake',

    async detectSchema(): Promise<Schema> {
      console.log(`Schema: Detecting from Snowflake database "${dbConfig.database}"...`)

      // 1. List tables (e.g., SHOW TABLES or INFORMATION_SCHEMA.TABLES)
      // 2. For each table, list columns (e.g., SHOW COLUMNS or INFORMATION_SCHEMA.COLUMNS)
      // 3. Optionally get approximate row counts

      const tables: Schema['tables'] = {}

      // ... populate tables[tableName] = { columns: [...], rowCount }

      return {
        database: dbConfig.database,
        engine: 'snowflake',
        detectedAt: new Date().toISOString(),
        tables,
      }
    },
  }
}
```

**Key requirements:**
- Each column needs `{ name: string, type: string }`.
- `rowCount` is optional but improves the LLM's understanding of data size.
- Set `engine` to match the `DbEngine` value.

### 5. Register in the factory files

**Query executor** — `server/src/services/query-executors/index.ts`:

```ts
import { createSnowflakeExecutor } from './snowflake.executor.js'
import type { SnowflakeDbConfig } from '../../types.js'

// Add to the switch:
case 'snowflake':
  return createSnowflakeExecutor(config as SnowflakeDbConfig)
```

**Schema provider** — `server/src/services/schema-providers/index.ts`:

```ts
import { createSnowflakeSchemaProvider } from './snowflake.provider.js'
import type { SnowflakeDbConfig } from '../../types.js'

// Add to the switch:
case 'snowflake':
  return createSnowflakeSchemaProvider(config as SnowflakeDbConfig)
```

### 6. Update the frontend

**Add the engine option** in the project creation/settings UI so users can select it.

- `src/types/index.ts` — add `'snowflake'` to the `DbEngine` type
- `src/views/ProjectList.vue` — add to the engine dropdown options
- `src/views/ProjectSettings.vue` — add a config form for the Snowflake-specific fields (`account`, `username`, `password`, `warehouse`, `database`, `schema`)

## Checklist

- [ ] Client library installed
- [ ] Config interface added to `server/src/types.ts`
- [ ] `DbEngine` and `DbConfig` unions updated
- [ ] Query executor created in `server/src/services/query-executors/`
- [ ] Schema provider created in `server/src/services/schema-providers/`
- [ ] Both factories updated (`index.ts` files)
- [ ] Frontend types and UI updated
- [ ] Tested: schema detection works
- [ ] Tested: chart generation produces valid SQL for the new engine

## File Reference

```
server/src/types.ts                              # DbEngine, DbConfig, config interfaces
server/src/services/query-executors/index.ts     # Query executor factory
server/src/services/query-executors/*.executor.ts # Engine-specific executors
server/src/services/schema-providers/index.ts    # Schema provider factory
server/src/services/schema-providers/*.provider.ts # Engine-specific schema detection
src/types/index.ts                               # Frontend types
src/views/ProjectList.vue                        # Project creation UI
src/views/ProjectSettings.vue                    # Project settings UI
```
