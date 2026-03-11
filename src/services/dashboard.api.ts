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
  /**
   * Fetches all dashboards for a project
   */
  async list(projectId: string): Promise<DashboardRow[]> {
    const { data } = await api.get(basePath(projectId))
    return data
  },

  /**
   * Fetches a specific dashboard with its charts
   */
  async getById(projectId: string, id: string): Promise<DashboardRow> {
    const { data } = await api.get(`${basePath(projectId)}/${id}`)
    return data
  },

  /**
   * Creates a new dashboard in a project
   */
  async create(projectId: string, name: string, description?: string): Promise<DashboardRow> {
    const { data } = await api.post(basePath(projectId), { name, description })
    return data
  },

  /**
   * Updates dashboard name and description
   */
  async update(projectId: string, id: string, name: string, description?: string): Promise<DashboardRow> {
    const { data } = await api.put(`${basePath(projectId)}/${id}`, { name, description })
    return data
  },

  /**
   * Deletes a dashboard and all its charts
   */
  async remove(projectId: string, id: string): Promise<void> {
    await api.delete(`${basePath(projectId)}/${id}`)
  },

  /**
   * Adds a new chart to a dashboard
   */
  async addChart(projectId: string, dashboardId: string, chart: ChartPayload): Promise<ChartRow> {
    const { data } = await api.post(`${basePath(projectId)}/${dashboardId}/charts`, chart)
    return data
  },

  /**
   * Updates an existing chart's configuration
   */
  async updateChart(projectId: string, dashboardId: string, chartId: string, chart: ChartPayload): Promise<ChartRow> {
    const { data } = await api.put(`${basePath(projectId)}/${dashboardId}/charts/${chartId}`, chart)
    return data
  },

  /**
   * Reorders charts within a dashboard
   */
  async reorderCharts(projectId: string, dashboardId: string, chartIds: string[]): Promise<void> {
    await api.put(`${basePath(projectId)}/${dashboardId}/charts/reorder`, { chartIds })
  },

  /**
   * Re-executes a chart's query to fetch fresh data
   */
  async refreshChart(projectId: string, dashboardId: string, chartId: string): Promise<ChartRow> {
    const { data } = await api.post(`${basePath(projectId)}/${dashboardId}/charts/${chartId}/refresh`)
    return data
  },

  /**
   * Moves a chart from one dashboard to another
   */
  async moveChart(projectId: string, dashboardId: string, chartId: string, targetDashboardId: string): Promise<ChartRow> {
    const { data } = await api.put(`${basePath(projectId)}/${dashboardId}/charts/${chartId}/move`, { targetDashboardId })
    return data
  },

  /**
   * Deletes a chart from a dashboard
   */
  async removeChart(projectId: string, dashboardId: string, chartId: string): Promise<void> {
    await api.delete(`${basePath(projectId)}/${dashboardId}/charts/${chartId}`)
  },

  /**
   * Generates a public share link for a dashboard
   */
  async createShareLink(projectId: string, dashboardId: string): Promise<{ shareToken: string }> {
    const { data } = await api.post(`${basePath(projectId)}/${dashboardId}/share`)
    return data
  },

  /**
   * Revokes the public share link for a dashboard
   */
  async revokeShareLink(projectId: string, dashboardId: string): Promise<void> {
    await api.delete(`${basePath(projectId)}/${dashboardId}/share`)
  },

  /**
   * Fetches the automatic refresh schedule for a dashboard
   */
  async getRefreshSchedule(projectId: string, dashboardId: string): Promise<{ refreshCron: string | null; lastRefreshedAt: string | null }> {
    const { data } = await api.get(`${basePath(projectId)}/${dashboardId}/refresh-schedule`)
    return data
  },

  /**
   * Sets a cron schedule for automatic dashboard refresh
   */
  async setRefreshSchedule(projectId: string, dashboardId: string, refreshCron: string): Promise<{ refreshCron: string; lastRefreshedAt: string | null }> {
    const { data } = await api.put(`${basePath(projectId)}/${dashboardId}/refresh-schedule`, { refreshCron })
    return data
  },

  /**
   * Removes the automatic refresh schedule
   */
  async clearRefreshSchedule(projectId: string, dashboardId: string): Promise<void> {
    await api.delete(`${basePath(projectId)}/${dashboardId}/refresh-schedule`)
  },

  /**
   * Fetches a publicly shared dashboard using its share token
   */
  async getShared(token: string): Promise<DashboardRow> {
    const { data } = await api.get(`/shared/${token}`)
    return data
  },

  /**
   * Refreshes all charts in a dashboard with applied filter values
   */
  async refreshFiltered(projectId: string, dashboardId: string, filterValues: Record<string, string>): Promise<{ charts: ChartRow[] }> {
    const { data } = await api.post(`${basePath(projectId)}/${dashboardId}/refresh-filtered`, { filterValues })
    return data
  },

  /**
   * Refreshes a single chart with applied filter values
   */
  async refreshChartFiltered(projectId: string, dashboardId: string, chartId: string, filterValues: Record<string, string>): Promise<ChartRow> {
    const { data } = await api.post(`${basePath(projectId)}/${dashboardId}/charts/${chartId}/refresh`, { filterValues })
    return data
  },

  /**
   * Uploads a thumbnail image for a dashboard
   */
  async uploadThumbnail(projectId: string, dashboardId: string, thumbnail: string): Promise<void> {
    await api.post(`${basePath(projectId)}/${dashboardId}/thumbnail`, { thumbnail })
  },
}
