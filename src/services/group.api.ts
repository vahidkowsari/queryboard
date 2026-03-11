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
  /**
   * Fetches all groups for a project with their members
   */
  async list(projectId: string): Promise<Group[]> {
    const { data } = await api.get<Group[]>(`/projects/${projectId}/groups`)
    return data
  },

  /**
   * Creates a new group in a project
   */
  async create(projectId: string, name: string, description?: string): Promise<Group> {
    const { data } = await api.post<Group>(`/projects/${projectId}/groups`, { name, description })
    return data
  },

  /**
   * Updates group name and description
   */
  async update(projectId: string, groupId: string, name: string, description?: string): Promise<Group> {
    const { data } = await api.put<Group>(`/projects/${projectId}/groups/${groupId}`, { name, description })
    return data
  },

  /**
   * Deletes a group and all its memberships
   */
  async remove(projectId: string, groupId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/groups/${groupId}`)
  },

  /**
   * Adds a user to a group
   */
  async addMember(projectId: string, groupId: string, userId: string): Promise<void> {
    await api.post(`/projects/${projectId}/groups/${groupId}/members`, { userId })
  },

  /**
   * Removes a user from a group
   */
  async removeMember(projectId: string, groupId: string, userId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/groups/${groupId}/members/${userId}`)
  },
}
