import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import { setupTestDb, cleanupTestDb, clearAllTables } from '../helpers/test-db.js'
import { createTestApp } from '../helpers/test-app.js'
import { createProjectService } from '../../services/project.service.js'
import type { Db } from '../../db/index.js'

describe('Project Routes', () => {
  let db: Db
  let app: any
  const userId = 'test-user-123'

  beforeEach(async () => {
    db = await setupTestDb()
    await clearAllTables(db)
    app = createTestApp(db, userId)
  })

  afterAll(async () => {
    await cleanupTestDb()
  })

  describe('GET /api/projects', () => {
    it('should list all projects', async () => {
      const service = createProjectService(db)
      await service.create('Project 1', 'postgres', { host: 'localhost', port: 5432, database: 'db1', user: 'user', password: 'pass' })
      await service.create('Project 2', 'mysql', { host: 'localhost', port: 3306, database: 'db2', user: 'user', password: 'pass' })

      const response = await request(app)
        .get('/api/projects')
        .expect(200)

      expect(response.body).toHaveLength(2)
      expect(response.body[0].name).toBeDefined()
      expect(response.body[0].dbEngine).toBeDefined()
    })
  })

  describe('GET /api/projects/:id', () => {
    it('should return project by id', async () => {
      const service = createProjectService(db)
      const project = await service.create('Test Project', 'postgres', { host: 'localhost', port: 5432, database: 'test', user: 'user', password: 'pass' })

      const response = await request(app)
        .get(`/api/projects/${project.id}`)
        .expect(200)

      expect(response.body.id).toBe(project.id)
      expect(response.body.name).toBe('Test Project')
      expect(response.body.dbEngine).toBe('postgres')
    })

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000')
        .expect(404)

      expect(response.body.error).toBe('Project not found')
    })
  })

  describe('POST /api/projects', () => {
    it('should create project with required fields', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({
          name: 'New Project',
          dbEngine: 'postgres',
          dbConfig: { host: 'localhost', port: 5432, database: 'test', user: 'user', password: 'pass' }
        })
        .expect(201)

      expect(response.body.id).toBeDefined()
      expect(response.body.name).toBe('New Project')
      expect(response.body.dbEngine).toBe('postgres')
    })

    it('should create project with optional fields', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({
          name: 'New Project',
          description: 'Test description',
          dbEngine: 'postgres',
          dbConfig: { host: 'localhost', port: 5432, database: 'test', user: 'user', password: 'pass' },
          chartLibrary: 'recharts'
        })
        .expect(201)

      expect(response.body.description).toBe('Test description')
      expect(response.body.chartLibrary).toBe('recharts')
    })

    it('should return 400 if name is missing', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({
          dbEngine: 'postgres',
          dbConfig: { host: 'localhost', port: 5432, database: 'test', user: 'user', password: 'pass' }
        })
        .expect(400)

      expect(response.body.error).toContain('required')
    })

    it('should return 400 if dbEngine is missing', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({
          name: 'Test',
          dbConfig: { host: 'localhost', port: 5432, database: 'test', user: 'user', password: 'pass' }
        })
        .expect(400)

      expect(response.body.error).toContain('required')
    })

    it('should return 400 if dbConfig is missing', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({
          name: 'Test',
          dbEngine: 'postgres'
        })
        .expect(400)

      expect(response.body.error).toContain('required')
    })
  })

  describe('PUT /api/projects/:id', () => {
    it('should update project', async () => {
      const service = createProjectService(db)
      const project = await service.create('Old Name', 'postgres', { host: 'localhost', port: 5432, database: 'test', user: 'user', password: 'pass' })

      const response = await request(app)
        .put(`/api/projects/${project.id}`)
        .send({ name: 'New Name', description: 'Updated' })
        .expect(200)

      expect(response.body.name).toBe('New Name')
      expect(response.body.description).toBe('Updated')
    })

    it('should return 404 for non-existent project', async () => {
      await request(app)
        .put('/api/projects/00000000-0000-0000-0000-000000000000')
        .send({ name: 'New Name' })
        .expect(404)
    })
  })

  describe('DELETE /api/projects/:id', () => {
    it('should delete project', async () => {
      const service = createProjectService(db)
      const project = await service.create('Test', 'postgres', { host: 'localhost', port: 5432, database: 'test', user: 'user', password: 'pass' })

      const response = await request(app)
        .delete(`/api/projects/${project.id}`)
        .expect(200)

      expect(response.body.deleted).toBe(true)

      const found = await service.getById(project.id)
      expect(found).toBeNull()
    })

    it('should return 404 for non-existent project', async () => {
      await request(app)
        .delete('/api/projects/00000000-0000-0000-0000-000000000000')
        .expect(404)
    })
  })

  describe('GET /api/projects/:id/export', () => {
    it('should export project', async () => {
      const service = createProjectService(db)
      const project = await service.create('Export Test', 'postgres', { host: 'localhost', port: 5432, database: 'test', user: 'user', password: 'pass' })

      const response = await request(app)
        .get(`/api/projects/${project.id}/export`)
        .expect(200)

      expect(response.body.version).toBeDefined()
      expect(response.body.project).toBeDefined()
      expect(response.body.project.name).toBe('Export Test')
      expect(response.headers['content-disposition']).toContain('attachment')
    })

    it('should return 404 for non-existent project', async () => {
      await request(app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/export')
        .expect(404)
    })
  })
})
