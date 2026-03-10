import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '../../db/schema.js'
import type { Db } from '../../db/index.js'

const { Pool } = pg

let testDb: Db | null = null
let testPool: pg.Pool | null = null

export async function setupTestDb(): Promise<Db> {
  if (testDb) return testDb

  const connectionString = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/queryboard_test'
  
  testPool = new Pool({ connectionString })
  testDb = drizzle(testPool, { schema })
  
  return testDb
}

export async function cleanupTestDb(): Promise<void> {
  if (testPool) {
    await testPool.end()
    testPool = null
    testDb = null
  }
}

export async function clearAllTables(db: Db): Promise<void> {
  // Clear tables in correct order to respect foreign key constraints
  await db.delete(schema.conversationMessages)
  await db.delete(schema.conversations)
  await db.delete(schema.tokenUsage)
  await db.delete(schema.groupMembers)
  await db.delete(schema.dashboardPermissions)
  await db.delete(schema.groups)
  await db.delete(schema.charts)
  await db.delete(schema.dashboards)
  await db.delete(schema.projects)
}
