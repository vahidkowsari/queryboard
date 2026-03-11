import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createConversationService } from '../../services/conversation.service.js'
import { setupTestDb, cleanupTestDb, clearAllTables } from '../helpers/test-db.js'
import { createTestProject } from '../helpers/test-fixtures.js'
import type { Db } from '../../db/index.js'

describe('ConversationService', () => {
  let db: Db
  let service: ReturnType<typeof createConversationService>
  let testProjectId: string
  const userId1 = 'user-1'
  const userId2 = 'user-2'

  beforeEach(async () => {
    db = await setupTestDb()
    service = createConversationService(db)
    await clearAllTables(db)
    const project = await createTestProject(db)
    testProjectId = project.id
  })

  afterAll(async () => {
    await cleanupTestDb()
  })

  describe('create', () => {
    it('should create conversation with title', async () => {
      const conv = await service.create(testProjectId, userId1, 'My Conversation')
      
      expect(conv).toBeDefined()
      expect(conv.projectId).toBe(testProjectId)
      expect(conv.userId).toBe(userId1)
      expect(conv.title).toBe('My Conversation')
      expect(conv.id).toBeDefined()
      expect(conv.createdAt).toBeInstanceOf(Date)
      expect(conv.updatedAt).toBeInstanceOf(Date)
    })

    it('should create conversation with default title', async () => {
      const conv = await service.create(testProjectId, userId1)
      
      expect(conv.title).toBe('New conversation')
    })
  })

  describe('listByProject', () => {
    it('should list all conversations for project', async () => {
      await service.create(testProjectId, userId1, 'Conv 1')
      await service.create(testProjectId, userId1, 'Conv 2')
      await service.create(testProjectId, userId2, 'Conv 3')
      
      const list = await service.listByProject(testProjectId)
      
      expect(list).toHaveLength(3)
    })

    it('should order by updatedAt descending', async () => {
      const conv1 = await service.create(testProjectId, userId1, 'Conv 1')
      await new Promise(resolve => setTimeout(resolve, 10))
      const conv2 = await service.create(testProjectId, userId1, 'Conv 2')
      
      const list = await service.listByProject(testProjectId)
      
      expect(list[0].id).toBe(conv2.id)
      expect(list[1].id).toBe(conv1.id)
    })

    it('should return empty array if no conversations', async () => {
      const list = await service.listByProject(testProjectId)
      
      expect(list).toEqual([])
    })
  })

  describe('getById', () => {
    it('should return conversation by id', async () => {
      const created = await service.create(testProjectId, userId1, 'Test')
      const found = await service.getById(created.id)
      
      expect(found).toBeDefined()
      expect(found?.id).toBe(created.id)
    })

    it('should return conversation regardless of user', async () => {
      const created = await service.create(testProjectId, userId1, 'Test')
      const found = await service.getById(created.id)
      
      expect(found).toBeDefined()
      expect(found?.id).toBe(created.id)
    })

    it('should return null if conversation not found', async () => {
      const found = await service.getById('00000000-0000-0000-0000-000000000000')
      
      expect(found).toBeNull()
    })
  })

  describe('updateTitle', () => {
    it('should update conversation title', async () => {
      const conv = await service.create(testProjectId, userId1, 'Old Title')
      const updated = await service.updateTitle(conv.id, 'New Title')
      
      expect(updated).toBeDefined()
      expect(updated?.title).toBe('New Title')
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(conv.updatedAt.getTime())
    })

    it('should update conversation regardless of user', async () => {
      const conv = await service.create(testProjectId, userId1, 'Test')
      const updated = await service.updateTitle(conv.id, 'New Title')
      
      expect(updated).toBeDefined()
      expect(updated?.title).toBe('New Title')
    })
  })

  describe('remove', () => {
    it('should delete conversation', async () => {
      const conv = await service.create(testProjectId, userId1, 'Test')
      const deleted = await service.remove(conv.id)
      
      expect(deleted).toBe(true)
      
      const found = await service.getById(conv.id)
      expect(found).toBeNull()
    })

    it('should delete conversation regardless of user', async () => {
      const conv = await service.create(testProjectId, userId1, 'Test')
      const deleted = await service.remove(conv.id)
      
      expect(deleted).toBe(true)
    })
  })

  describe('addMessage', () => {
    it('should add user message', async () => {
      const conv = await service.create(testProjectId, userId1, 'Test')
      const message = await service.addMessage(conv.id, 'user', 'Hello')
      
      expect(message).toBeDefined()
      expect(message.conversationId).toBe(conv.id)
      expect(message.role).toBe('user')
      expect(message.content).toBe('Hello')
      expect(message.sql).toBeNull()
      expect(message.data).toBeNull()
    })

    it('should add assistant message with metadata', async () => {
      const conv = await service.create(testProjectId, userId1, 'Test')
      const message = await service.addMessage(conv.id, 'assistant', 'Response', {
        sql: 'SELECT 1',
        data: [{ value: 1 }],
        columns: ['value'],
        steps: ['step1'],
      })
      
      expect(message.role).toBe('assistant')
      expect(message.sql).toBe('SELECT 1')
      expect(message.data).toEqual([{ value: 1 }])
      expect(message.columns).toEqual(['value'])
      expect(message.steps).toEqual(['step1'])
    })

    it('should update conversation updatedAt', async () => {
      const conv = await service.create(testProjectId, userId1, 'Test')
      await new Promise(resolve => setTimeout(resolve, 10))
      await service.addMessage(conv.id, 'user', 'Hello')
      
      const updated = await service.getById(conv.id)
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(conv.updatedAt.getTime())
    })
  })

  describe('getMessages', () => {
    it('should return messages ordered by createdAt', async () => {
      const conv = await service.create(testProjectId, userId1, 'Test')
      await service.addMessage(conv.id, 'user', 'First')
      await service.addMessage(conv.id, 'assistant', 'Second')
      await service.addMessage(conv.id, 'user', 'Third')
      
      const messages = await service.getMessages(conv.id)
      
      expect(messages).toHaveLength(3)
      expect(messages[0].content).toBe('First')
      expect(messages[1].content).toBe('Second')
      expect(messages[2].content).toBe('Third')
    })

    it('should return empty array if no messages', async () => {
      const conv = await service.create(testProjectId, userId1, 'Test')
      const messages = await service.getMessages(conv.id)
      
      expect(messages).toEqual([])
    })

    it('should return empty array if conversation not found', async () => {
      const messages = await service.getMessages('00000000-0000-0000-0000-000000000000')
      expect(messages).toEqual([])
    })
  })
})
