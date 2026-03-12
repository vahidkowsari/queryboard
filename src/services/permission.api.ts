import { api } from './api'

export interface DashboardPermission {
  id: string
  dashboardId: string
  userId: string | null
  groupId: string | null
  permission: 'view' | 'edit'
  createdAt: string
}

export const permissionApi = {
  /**
   * Fetches all permissions for a dashboard
   */
  async list(projectId: string, dashboardId: string): Promise<DashboardPermission[]> {
    const { data } = await api.get<DashboardPermission[]>(
      `/projects/${projectId}/dashboards/${dashboardId}/permissions`,
    )
    return data
  },

  /**
   * Grants view or edit permission to a user or group for a dashboard
   */
  async set(
    projectId: string,
    dashboardId: string,
    permission: 'view' | 'edit',
    userId?: string,
    groupId?: string,
  ): Promise<DashboardPermission> {
    const { data } = await api.post<DashboardPermission>(
      `/projects/${projectId}/dashboards/${dashboardId}/permissions`,
      { userId, groupId, permission },
    )
    return data
  },

  /**
   * Removes a specific permission from a dashboard
   */
  async remove(projectId: string, dashboardId: string, permId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/dashboards/${dashboardId}/permissions/${permId}`)
  },
}
