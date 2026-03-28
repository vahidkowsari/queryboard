import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Dashboard, Chart } from '../types'
import { dashboardApi } from '../services/dashboard.api'
import { extractApiError } from '../services/api'
import type { DashboardRow, ChartRow } from '../services/dashboard.api'

function rowToDashboard(row: DashboardRow): Dashboard {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    shareToken: row.shareToken,
    thumbnail: row.thumbnail,
    charts: (row.charts || []).map(rowToChart),
    chartCount: row.chartCount,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

function rowToChart(row: ChartRow): Chart {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    name: row.name,
    userQuery: row.userQuery || '',
    description: row.description || undefined,
    summary: row.summary || undefined,
    query: row.query,
    chartType: (row.chartType as Chart['chartType']) || 'auto',
    chartSpec: row.chartSpec ?? undefined,
    data: row.data || undefined,
    colorConfig: row.colorConfig || undefined,
    filters: row.filters || undefined,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

export const useDashboardStore = defineStore('dashboard', () => {
  const dashboards = ref<Dashboard[]>([])
  const currentDashboard = ref<Dashboard | null>(null)
  const loading = ref(false)
  const lastError = ref<string | null>(null)
  const projectId = ref<string>('')

  function findDashboard(id: string): Dashboard | undefined {
    return dashboards.value.find((d) => d.id === id)
  }

  function setProjectId(id: string): void {
    projectId.value = id
  }

  async function fetchDashboards(): Promise<void> {
    loading.value = true
    lastError.value = null
    try {
      const rows = await dashboardApi.list(projectId.value)
      dashboards.value = rows.map(rowToDashboard)
      if (currentDashboard.value) {
        currentDashboard.value = findDashboard(currentDashboard.value.id) ?? null
      }
    } catch (error) {
      lastError.value = extractApiError(error)
      console.warn(`Failed to fetch dashboards from API: ${lastError.value}`)
    } finally {
      loading.value = false
    }
  }

  async function createDashboard(name: string, description?: string): Promise<Dashboard> {
    const row = await dashboardApi.create(projectId.value, name, description)
    const dashboard = rowToDashboard(row)
    dashboards.value.push(dashboard)
    return dashboard
  }

  async function updateDashboard(id: string, name: string, description?: string): Promise<void> {
    const row = await dashboardApi.update(projectId.value, id, name, description)
    const dashboard = findDashboard(id)
    if (dashboard) {
      const updated = rowToDashboard(row)
      updated.charts = dashboard.charts
      const index = dashboards.value.indexOf(dashboard)
      dashboards.value[index] = updated
      if (currentDashboard.value?.id === id) currentDashboard.value = updated
    }
  }

  async function deleteDashboard(id: string): Promise<void> {
    await dashboardApi.remove(projectId.value, id)
    dashboards.value = dashboards.value.filter((d) => d.id !== id)
    if (currentDashboard.value?.id === id) currentDashboard.value = null
  }

  function setCurrentDashboard(id: string): void {
    const dashboard = findDashboard(id)
    if (dashboard) currentDashboard.value = dashboard
  }

  async function loadDashboard(id: string): Promise<Dashboard | null> {
    lastError.value = null
    try {
      const row = await dashboardApi.getById(projectId.value, id)
      const dashboard = rowToDashboard(row)
      const index = dashboards.value.findIndex((d) => d.id === id)
      if (index !== -1) {
        dashboards.value[index] = dashboard
      } else {
        dashboards.value.push(dashboard)
      }
      currentDashboard.value = dashboard
      return dashboard
    } catch (error) {
      lastError.value = extractApiError(error)
      return null
    }
  }

  async function addChartToDashboard(dashboardId: string, chart: Chart): Promise<Chart> {
    const row = await dashboardApi.addChart(projectId.value, dashboardId, {
      name: chart.name,
      userQuery: chart.userQuery,
      description: chart.description,
      summary: chart.summary,
      query: chart.query,
      chartSpec: chart.chartSpec,
      data: chart.data,
      colorConfig: chart.colorConfig,
      filters: chart.filters,
    })
    const created = rowToChart(row)
    const dashboard = findDashboard(dashboardId)
    if (dashboard) {
      dashboard.charts.push(created)
      dashboard.updatedAt = new Date()
    }
    return created
  }

  async function updateChart(dashboardId: string, chartId: string, chart: Partial<Chart>): Promise<void> {
    const dashboard = findDashboard(dashboardId)
    if (!dashboard) return
    const existing = dashboard.charts.find((c) => c.id === chartId)
    if (!existing) return

    const row = await dashboardApi.updateChart(projectId.value, dashboardId, chartId, {
      name: chart.name !== undefined ? chart.name : existing.name,
      userQuery: chart.userQuery !== undefined ? chart.userQuery : existing.userQuery,
      description: chart.description !== undefined ? chart.description : existing.description,
      summary: chart.summary !== undefined ? chart.summary : existing.summary,
      query: chart.query !== undefined ? chart.query : existing.query,
      chartType: chart.chartType !== undefined ? chart.chartType : existing.chartType,
      chartSpec: chart.chartSpec !== undefined ? chart.chartSpec : existing.chartSpec,
      data: chart.data !== undefined ? chart.data : existing.data,
      colorConfig: chart.colorConfig !== undefined ? chart.colorConfig : existing.colorConfig,
      filters: chart.filters !== undefined ? chart.filters : existing.filters,
    })
    const chartIndex = dashboard.charts.findIndex((c) => c.id === chartId)
    if (chartIndex !== -1) {
      dashboard.charts[chartIndex] = rowToChart(row)
      dashboard.updatedAt = new Date()
    }
  }

  async function reorderCharts(dashboardId: string, charts: Chart[]): Promise<void> {
    const dashboard = findDashboard(dashboardId)
    if (!dashboard) return
    const previousCharts = [...dashboard.charts]
    dashboard.charts = charts
    lastError.value = null
    try {
      await dashboardApi.reorderCharts(
        projectId.value,
        dashboardId,
        charts.map((c) => c.id),
      )
    } catch (error) {
      dashboard.charts = previousCharts
      lastError.value = extractApiError(error)
      throw error
    }
  }

  async function refreshChart(dashboardId: string, chartId: string): Promise<void> {
    const row = await dashboardApi.refreshChart(projectId.value, dashboardId, chartId)
    const dashboard = findDashboard(dashboardId)
    if (dashboard) {
      const chartIndex = dashboard.charts.findIndex((c) => c.id === chartId)
      if (chartIndex !== -1) {
        dashboard.charts[chartIndex] = rowToChart(row)
        dashboard.updatedAt = new Date()
      }
    }
  }

  async function deleteChart(dashboardId: string, chartId: string): Promise<void> {
    await dashboardApi.removeChart(projectId.value, dashboardId, chartId)
    const dashboard = findDashboard(dashboardId)
    if (dashboard) {
      dashboard.charts = dashboard.charts.filter((c) => c.id !== chartId)
      dashboard.updatedAt = new Date()
    }
  }

  async function createShareLink(dashboardId: string): Promise<string> {
    const { shareToken } = await dashboardApi.createShareLink(projectId.value, dashboardId)
    const dashboard = findDashboard(dashboardId)
    if (dashboard) dashboard.shareToken = shareToken
    return shareToken
  }

  async function revokeShareLink(dashboardId: string): Promise<void> {
    await dashboardApi.revokeShareLink(projectId.value, dashboardId)
    const dashboard = findDashboard(dashboardId)
    if (dashboard) dashboard.shareToken = null
  }

  async function refreshFiltered(dashboardId: string, filterValues: Record<string, string>): Promise<void> {
    const { charts: updatedRows } = await dashboardApi.refreshFiltered(projectId.value, dashboardId, filterValues)
    const dashboard = findDashboard(dashboardId)
    if (!dashboard) return
    for (const row of updatedRows) {
      if ('error' in row) continue
      const chartRow = row as ChartRow
      const idx = dashboard.charts.findIndex((c) => c.id === chartRow.id)
      if (idx !== -1) dashboard.charts[idx] = rowToChart(chartRow)
    }
    dashboard.updatedAt = new Date()
  }

  return {
    dashboards,
    currentDashboard,
    loading,
    lastError,
    projectId,
    setProjectId,
    fetchDashboards,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    setCurrentDashboard,
    loadDashboard,
    addChartToDashboard,
    updateChart,
    refreshChart,
    reorderCharts,
    deleteChart,
    createShareLink,
    revokeShareLink,
    refreshFiltered,
  }
})
