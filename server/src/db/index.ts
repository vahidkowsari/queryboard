import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

export function createDb(pool: import('pg').Pool) {
  return drizzle(pool, { schema })
}

export type Db = ReturnType<typeof createDb>
