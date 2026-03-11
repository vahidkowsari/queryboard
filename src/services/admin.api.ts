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
  async listUsers(): Promise<UserWithRole[]> {
    const { data } = await api.get<UserWithRole[]>('/admin/users')
    return data
  },

  async setUserRole(userId: string, role: AppRole): Promise<void> {
    await api.put(`/admin/users/${userId}/role`, { role })
  },

  async getAllGroups(): Promise<AvailableGroup[]> {
    const { data } = await api.get<AvailableGroup[]>('/admin/groups')
    return data
  },

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    await api.post(`/admin/users/${userId}/groups/${groupId}`)
  },

  async removeUserFromGroup(userId: string, groupId: string): Promise<void> {
    await api.delete(`/admin/users/${userId}/groups/${groupId}`)
  },
}
