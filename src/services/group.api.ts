import { api } from './api'

export interface GroupMember {
  id: string
  groupId: string
  userId: string
  addedAt: string
}

export interface Group {
  id: string
  projectId: string
  name: string
  description: string | null
  createdAt: string
  members: GroupMember[]
}

export const groupApi = {
  async list(projectId: string): Promise<Group[]> {
    const { data } = await api.get<Group[]>(`/projects/${projectId}/groups`)
    return data
  },

  async create(projectId: string, name: string, description?: string): Promise<Group> {
    const { data } = await api.post<Group>(`/projects/${projectId}/groups`, { name, description })
    return data
  },

  async update(projectId: string, groupId: string, name: string, description?: string): Promise<Group> {
    const { data } = await api.put<Group>(`/projects/${projectId}/groups/${groupId}`, { name, description })
    return data
  },

  async remove(projectId: string, groupId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/groups/${groupId}`)
  },

  async addMember(projectId: string, groupId: string, userId: string): Promise<void> {
    await api.post(`/projects/${projectId}/groups/${groupId}/members`, { userId })
  },

  async removeMember(projectId: string, groupId: string, userId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/groups/${groupId}/members/${userId}`)
  },
}
