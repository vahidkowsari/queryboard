import { api } from './api'
import type { AppRole } from '../composables/useRole'

export interface UserGroup {
  id: string
  name: string
  projectId: string
  projectName: string
}

export interface UserWithRole {
  id: string
  email: string | null
  roles: AppRole[]
  groups: UserGroup[]
  createdAt: number
}

export interface AvailableGroup {
  id: string
  name: string
  projectId: string
  projectName: string
}

export const adminApi = {
  /**
   * Fetches all users with their roles and group memberships
   */
  async listUsers(): Promise<UserWithRole[]> {
    const { data } = await api.get<UserWithRole[]>('/admin/users')
    return data
  },

  /**
   * Updates a user's application role
   */
  async setUserRole(userId: string, role: AppRole): Promise<void> {
    await api.put(`/admin/users/${userId}/role`, { role })
  },

  /**
   * Fetches all available groups across all projects
   */
  async getAllGroups(): Promise<AvailableGroup[]> {
    const { data } = await api.get<AvailableGroup[]>('/admin/groups')
    return data
  },

  /**
   * Adds a user to a specific group
   */
  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    await api.post(`/admin/users/${userId}/groups/${groupId}`)
  },

  /**
   * Removes a user from a specific group
   */
  async removeUserFromGroup(userId: string, groupId: string): Promise<void> {
    await api.delete(`/admin/users/${userId}/groups/${groupId}`)
  },
}
