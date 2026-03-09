import { api } from './api'
import type { AppRole } from '../composables/useRole'

export interface UserWithRole {
  id: string
  email: string | null
  roles: AppRole[]
  createdAt: number
}

export const adminApi = {
  async listUsers(): Promise<UserWithRole[]> {
    const { data } = await api.get<UserWithRole[]>('/admin/users')
    return data
  },

  async setUserRole(userId: string, role: AppRole): Promise<void> {
    await api.put(`/admin/users/${userId}/role`, { role })
  },
}
