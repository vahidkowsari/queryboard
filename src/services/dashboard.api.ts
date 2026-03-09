import { api } from './api'
import type { ChartDataRow, ColorConfig, ChartFilter } from '../types'

export interface DashboardRow {
  id: string
  name: string
  description: string | null
  shareToken: string | null
  thumbnail: { type: 'Buffer'; data: number[] } | null
  createdAt: string
  updatedAt: string
  chartCount?: number
  charts?: ChartRow[]
}

export interface ChartRow {
  id: string
  dashboardId: string
  name: string
  userQuery: string | null
  description: string | null
  query: string
  chartType: string | null
  chartSpec: Record<string, unknown> | null
  data: ChartDataRow[] | null
  colorConfig: ColorConfig | null
  filters: ChartFilter[] | null
  createdAt: string
  updatedAt: string
}

export interface ChartPayload {
  name: string
  userQuery?: string
  description?: string
  query: string
  chartType?: string
  chartSpec?: Record<string, unknown>
  data?: ChartDataRow[]
  colorConfig?: ColorConfig
  filters?: ChartFilter[]
}

function basePath(projectId: string) {
  return `/projects/${projectId}/dashboards`
}

export const dashboardApi = {
  async list(projectId: string): Promise<DashboardRow[]> {
    const { data } = await api.get(basePath(projectId))
    return data
  },

  async getById(projectId: string, id: string): Promise<DashboardRow> {
    const { data } = await api.get(`${basePath(projectId)}/${id}`)
    return data
  },

  async create(projectId: string, name: string, description?: string): Promise<DashboardRow> {
    const { data } = await api.post(basePath(projectId), { name, description })
    return data
  },

  async update(projectId: string, id: string, name: string, description?: string): Promise<DashboardRow> {
    const { data } = await api.put(`${basePath(projectId)}/${id}`, { name, description })
    return data
  },

  async remove(projectId: string, id: string): Promise<void> {
    await api.delete(`${basePath(projectId)}/${id}`)
  },

  async addChart(projectId: string, dashboardId: string, chart: ChartPayload): Promise<ChartRow> {
    const { data } = await api.post(`${basePath(projectId)}/${dashboardId}/charts`, chart)
    return data
  },

  async updateChart(projectId: string, dashboardId: string, chartId: string, chart: ChartPayload): Promise<ChartRow> {
    const { data } = await api.put(`${basePath(projectId)}/${dashboardId}/charts/${chartId}`, chart)
    return data
  },

  async reorderCharts(projectId: string, dashboardId: string, chartIds: string[]): Promise<void> {
    await api.put(`${basePath(projectId)}/${dashboardId}/charts/reorder`, { chartIds })
  },

  async refreshChart(projectId: string, dashboardId: string, chartId: string): Promise<ChartRow> {
    const { data } = await api.post(`${basePath(projectId)}/${dashboardId}/charts/${chartId}/refresh`)
    return data
  },

  async moveChart(projectId: string, dashboardId: string, chartId: string, targetDashboardId: string): Promise<ChartRow> {
    const { data } = await api.put(`${basePath(projectId)}/${dashboardId}/charts/${chartId}/move`, { targetDashboardId })
    return data
  },

  async removeChart(projectId: string, dashboardId: string, chartId: string): Promise<void> {
    await api.delete(`${basePath(projectId)}/${dashboardId}/charts/${chartId}`)
  },

  async createShareLink(projectId: string, dashboardId: string): Promise<{ shareToken: string }> {
    const { data } = await api.post(`${basePath(projectId)}/${dashboardId}/share`)
    return data
  },

  async revokeShareLink(projectId: string, dashboardId: string): Promise<void> {
    await api.delete(`${basePath(projectId)}/${dashboardId}/share`)
  },

  async getRefreshSchedule(projectId: string, dashboardId: string): Promise<{ refreshCron: string | null; lastRefreshedAt: string | null }> {
    const { data } = await api.get(`${basePath(projectId)}/${dashboardId}/refresh-schedule`)
    return data
  },

  async setRefreshSchedule(projectId: string, dashboardId: string, refreshCron: string): Promise<{ refreshCron: string; lastRefreshedAt: string | null }> {
    const { data } = await api.put(`${basePath(projectId)}/${dashboardId}/refresh-schedule`, { refreshCron })
    return data
  },

  async clearRefreshSchedule(projectId: string, dashboardId: string): Promise<void> {
    await api.delete(`${basePath(projectId)}/${dashboardId}/refresh-schedule`)
  },

  async getShared(token: string): Promise<DashboardRow> {
    const { data } = await api.get(`/shared/${token}`)
    return data
  },

  async refreshFiltered(projectId: string, dashboardId: string, filterValues: Record<string, string>): Promise<{ charts: ChartRow[] }> {
    const { data } = await api.post(`${basePath(projectId)}/${dashboardId}/refresh-filtered`, { filterValues })
    return data
  },

  async refreshChartFiltered(projectId: string, dashboardId: string, chartId: string, filterValues: Record<string, string>): Promise<ChartRow> {
    const { data } = await api.post(`${basePath(projectId)}/${dashboardId}/charts/${chartId}/refresh`, { filterValues })
    return data
  },

  async uploadThumbnail(projectId: string, dashboardId: string, thumbnail: string): Promise<void> {
    await api.post(`${basePath(projectId)}/${dashboardId}/thumbnail`, { thumbnail })
  },
}
