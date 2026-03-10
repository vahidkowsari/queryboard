import type { Db } from '../../db/index.js'
import { projects, dashboards, charts, conversations } from '../../db/schema.js'

export async function createTestProject(db: Db, overrides?: Partial<typeof projects.$inferInsert>) {
  const [project] = await db.insert(projects).values({
    name: 'Test Project',
    dbEngine: 'postgres',
    dbConfig: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
    ...overrides,
  }).returning()
  return project
}

export async function createTestDashboard(db: Db, projectId: string, overrides?: Partial<typeof dashboards.$inferInsert>) {
  const [dashboard] = await db.insert(dashboards).values({
    projectId,
    name: 'Test Dashboard',
    description: 'Test Description',
    ...overrides,
  }).returning()
  return dashboard
}

export async function createTestChart(db: Db, dashboardId: string, overrides?: Partial<typeof charts.$inferInsert>) {
  const [chart] = await db.insert(charts).values({
    dashboardId,
    name: 'Test Chart',
    chartType: 'bar',
    query: 'SELECT 1 as value',
    position: 0,
    ...overrides,
  }).returning()
  return chart
}

export async function createTestConversation(db: Db, projectId: string, userId: string, overrides?: Partial<typeof conversations.$inferInsert>) {
  const [conversation] = await db.insert(conversations).values({
    projectId,
    userId,
    title: 'Test Conversation',
    ...overrides,
  }).returning()
  return conversation
}
