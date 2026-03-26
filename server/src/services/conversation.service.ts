import { eq, desc, and } from 'drizzle-orm'
import { conversations, conversationMessages } from '../db/schema.js'
import type { Db } from '../db/index.js'

export interface ConversationRow {
  id: string
  projectId: string
  userId: string
  chartId: string | null
  title: string
  createdAt: Date
  updatedAt: Date
}

export interface MessageRow {
  id: string
  conversationId: string
  role: string
  content: string
  sql: string | null
  data: unknown | null
  columns: unknown | null
  steps: unknown | null
  createdAt: Date
}

export function createConversationService(db: Db) {
  /**
   * Fetches all conversations for a project, ordered by most recently updated
   */
  async function listByProject(projectId: string): Promise<ConversationRow[]> {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.projectId, projectId))
      .orderBy(desc(conversations.updatedAt))
  }

  /**
   * Fetches a specific conversation by ID
   */
  async function getById(id: string): Promise<ConversationRow | null> {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Creates a new conversation for a user in a project
   */
  async function create(projectId: string, userId: string, title?: string, chartId?: string): Promise<ConversationRow> {
    const rows = await db
      .insert(conversations)
      .values({ projectId, userId, title: title || 'New conversation', ...(chartId ? { chartId } : {}) })
      .returning()
    return rows[0]!
  }

  /**
   * Fetches the most recent conversation for a specific chart
   */
  async function getByChartId(projectId: string, chartId: string, userId: string): Promise<ConversationRow | null> {
    const rows = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.projectId, projectId), eq(conversations.chartId, chartId), eq(conversations.userId, userId)))
      .orderBy(desc(conversations.updatedAt))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Updates a conversation's title
   */
  async function updateTitle(id: string, title: string): Promise<ConversationRow | null> {
    const rows = await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning()
    return rows[0] ?? null
  }

  /**
   * Deletes a conversation and all its messages
   */
  async function remove(id: string): Promise<boolean> {
    const rows = await db
      .delete(conversations)
      .where(eq(conversations.id, id))
      .returning()
    return rows.length > 0
  }

  /**
   * Updates the conversation's updatedAt timestamp
   */
  async function touchUpdatedAt(id: string): Promise<void> {
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id))
  }

  /**
   * Fetches all messages for a conversation in chronological order
   */
  async function getMessages(conversationId: string): Promise<MessageRow[]> {
    return db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(conversationMessages.createdAt)
  }

  /**
   * Adds a new message to a conversation with optional SQL query and result data
   */
  async function addMessage(
    conversationId: string,
    role: string,
    content: string,
    extra?: { sql?: string; data?: unknown; columns?: unknown; steps?: unknown },
  ): Promise<MessageRow> {
    const rows = await db
      .insert(conversationMessages)
      .values({
        conversationId,
        role,
        content,
        sql: extra?.sql ?? null,
        data: extra?.data ?? null,
        columns: extra?.columns ?? null,
        steps: extra?.steps ?? null,
      })
      .returning()
    await touchUpdatedAt(conversationId)
    return rows[0]!
  }

  return { listByProject, getById, getByChartId, create, updateTitle, remove, getMessages, addMessage }
}
