import { api } from './api'

export interface Conversation {
  id: string
  projectId: string
  userId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ConversationMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  sql?: string | null
  data?: Record<string, string>[] | null
  columns?: string[] | null
  steps?: string[] | null
  thinkingTexts?: string[] | null
  createdAt: string
}

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[]
}

export interface ConversationPermission {
  id: string
  conversationId: string
  userId?: string | null
  groupId?: string | null
  permission: 'view' | 'edit'
  createdAt: string
}

export const conversationApi = {
  async list(projectId: string): Promise<Conversation[]> {
    const { data } = await api.get(`/projects/${projectId}/conversations`)
    return data
  },

  async get(projectId: string, conversationId: string): Promise<ConversationWithMessages> {
    const { data } = await api.get(`/projects/${projectId}/conversations/${conversationId}`)
    return data
  },

  async create(projectId: string, title?: string): Promise<Conversation> {
    const { data } = await api.post(`/projects/${projectId}/conversations`, { title })
    return data
  },

  async updateTitle(projectId: string, conversationId: string, title: string): Promise<Conversation> {
    const { data } = await api.patch(`/projects/${projectId}/conversations/${conversationId}`, { title })
    return data
  },

  async remove(projectId: string, conversationId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/conversations/${conversationId}`)
  },

  async listPermissions(projectId: string, conversationId: string): Promise<ConversationPermission[]> {
    const { data } = await api.get(`/projects/${projectId}/conversations/${conversationId}/permissions`)
    return data
  },

  async setPermission(
    projectId: string,
    conversationId: string,
    permission: 'view' | 'edit',
    userId?: string,
    groupId?: string
  ): Promise<ConversationPermission> {
    const { data } = await api.post(`/projects/${projectId}/conversations/${conversationId}/permissions`, {
      userId,
      groupId,
      permission,
    })
    return data
  },

  async removePermission(projectId: string, conversationId: string, permissionId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/conversations/${conversationId}/permissions/${permissionId}`)
  },
}
