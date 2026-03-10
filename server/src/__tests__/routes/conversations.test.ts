import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { setupTestDb, cleanupTestDb, clearAllTables } from '../helpers/test-db.js'
import { createTestProject } from '../helpers/test-fixtures.js'
import { createTestApp } from '../helpers/test-app.js'
import { createConversationService } from '../../services/conversation.service.js'
import type { Db } from '../../db/index.js'

describe('Conversation Routes', () => {
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

  describe('GET /api/projects/:projectId/conversations', () => {
    it('should return empty array when no conversations', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/conversations`)
        .expect(200)

      expect(response.body).toEqual([])
    })

    it('should list conversations for the user', async () => {
      const service = createConversationService(db)
      await service.create(testProjectId, userId, 'Conv 1')
      await service.create(testProjectId, userId, 'Conv 2')

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/conversations`)
        .expect(200)

      expect(response.body).toHaveLength(2)
      expect(response.body[0].title).toBeDefined()
      expect(response.body[0].userId).toBe(userId)
    })

    it('should not return conversations from other users', async () => {
      const service = createConversationService(db)
      await service.create(testProjectId, 'other-user', 'Other Conv')
      await service.create(testProjectId, userId, 'My Conv')

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/conversations`)
        .expect(200)

      expect(response.body).toHaveLength(1)
      expect(response.body[0].title).toBe('My Conv')
    })
  })

  describe('POST /api/projects/:projectId/conversations', () => {
    it('should create conversation with title', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/conversations`)
        .send({ title: 'New Conversation' })
        .expect(201)

      expect(response.body.id).toBeDefined()
      expect(response.body.title).toBe('New Conversation')
      expect(response.body.projectId).toBe(testProjectId)
      expect(response.body.userId).toBe(userId)
    })

    it('should create conversation without title', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/conversations`)
        .send({})
        .expect(201)

      expect(response.body.title).toBe('New conversation')
    })
  })

  describe('GET /api/projects/:projectId/conversations/:conversationId', () => {
    it('should return conversation with messages', async () => {
      const service = createConversationService(db)
      const conv = await service.create(testProjectId, userId, 'Test')
      await service.addMessage(conv.id, 'user', 'Hello')
      await service.addMessage(conv.id, 'assistant', 'Hi there')

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/conversations/${conv.id}`)
        .expect(200)

      expect(response.body.id).toBe(conv.id)
      expect(response.body.messages).toHaveLength(2)
      expect(response.body.messages[0].content).toBe('Hello')
      expect(response.body.messages[1].content).toBe('Hi there')
    })

    it('should return 404 for non-existent conversation', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/conversations/00000000-0000-0000-0000-000000000000`)
        .expect(404)

      expect(response.body.error).toBe('Conversation not found')
    })

    it('should return 404 for conversation owned by different user', async () => {
      const service = createConversationService(db)
      const conv = await service.create(testProjectId, 'other-user', 'Test')

      await request(app)
        .get(`/api/projects/${testProjectId}/conversations/${conv.id}`)
        .expect(404)
    })
  })

  describe('PATCH /api/projects/:projectId/conversations/:conversationId', () => {
    it('should update conversation title', async () => {
      const service = createConversationService(db)
      const conv = await service.create(testProjectId, userId, 'Old Title')

      const response = await request(app)
        .patch(`/api/projects/${testProjectId}/conversations/${conv.id}`)
        .send({ title: 'New Title' })
        .expect(200)

      expect(response.body.title).toBe('New Title')
    })

    it('should return 404 for non-existent conversation', async () => {
      await request(app)
        .patch(`/api/projects/${testProjectId}/conversations/00000000-0000-0000-0000-000000000000`)
        .send({ title: 'New Title' })
        .expect(404)
    })

    it('should return 404 when updating conversation owned by different user', async () => {
      const service = createConversationService(db)
      const conv = await service.create(testProjectId, 'other-user', 'Test')

      await request(app)
        .patch(`/api/projects/${testProjectId}/conversations/${conv.id}`)
        .send({ title: 'New Title' })
        .expect(404)
    })
  })

  describe('DELETE /api/projects/:projectId/conversations/:conversationId', () => {
    it('should delete conversation', async () => {
      const service = createConversationService(db)
      const conv = await service.create(testProjectId, userId, 'Test')

      const response = await request(app)
        .delete(`/api/projects/${testProjectId}/conversations/${conv.id}`)
        .expect(200)

      expect(response.body.deleted).toBe(true)

      // Verify it's actually deleted
      const found = await service.getById(conv.id, userId)
      expect(found).toBeNull()
    })

    it('should return 404 for non-existent conversation', async () => {
      await request(app)
        .delete(`/api/projects/${testProjectId}/conversations/00000000-0000-0000-0000-000000000000`)
        .expect(404)
    })

    it('should return 404 when deleting conversation owned by different user', async () => {
      const service = createConversationService(db)
      const conv = await service.create(testProjectId, 'other-user', 'Test')

      await request(app)
        .delete(`/api/projects/${testProjectId}/conversations/${conv.id}`)
        .expect(404)
    })
  })
})
