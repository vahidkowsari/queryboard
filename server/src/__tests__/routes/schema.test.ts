import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { setupTestDb, cleanupTestDb, clearAllTables } from '../helpers/test-db.js'
import { createTestProject } from '../helpers/test-fixtures.js'
import { createTestApp } from '../helpers/test-app.js'
import { projects } from '../../db/schema.js'
import type { Db } from '../../db/index.js'

describe('Schema Routes', () => {
  let db: Db
  let app: any
  let testProjectId: string
  const userId = 'test-user-123'

  beforeEach(async () => {
    db = await setupTestDb()
    await clearAllTables(db)
    const project = await createTestProject(db)
    testProjectId = project.id
    app = createTestApp(db, userId)
  })

  afterAll(async () => {
    await cleanupTestDb()
  })

  describe('GET /api/projects/:projectId/schema', () => {
    it('should return 503 if schema not detected', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/schema`)
        .expect(503)

      expect(response.body.error).toContain('Schema not detected')
    })

    it('should return cached schema if available', async () => {
      // Update project with schema cache
      const schema = { tables: [{ name: 'users', columns: [] }] }
      await db.update(projects)
        .set({ schemaCache: schema })
        .where(eq(projects.id, testProjectId))

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/schema`)
        .expect(200)

      expect(response.body.tables).toBeDefined()
      expect(response.body.tables).toHaveLength(1)
    })
  })
})
