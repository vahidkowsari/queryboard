import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Dashboard, Chart } from '../types'
import { dashboardApi } from '../services/dashboard.api'
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
  const projectId = ref<string>('')

  const getDashboardById = computed(() => {
    return (id: string) => dashboards.value.find((d) => d.id === id)
  })

  function setProjectId(id: string): void {
    projectId.value = id
  }

  async function fetchDashboards(): Promise<void> {
    loading.value = true
    try {
      const rows = await dashboardApi.list(projectId.value)
      dashboards.value = rows.map(rowToDashboard)
    } catch (err) {
      console.warn('Failed to fetch dashboards from API, using local state')
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
    const index = dashboards.value.findIndex((d) => d.id === id)
    if (index !== -1) {
      const updated = rowToDashboard(row)
      updated.charts = dashboards.value[index]!.charts
      dashboards.value[index] = updated
    }
  }

  async function deleteDashboard(id: string): Promise<void> {
    await dashboardApi.remove(projectId.value, id)
    const index = dashboards.value.findIndex((d) => d.id === id)
    if (index !== -1) dashboards.value.splice(index, 1)
    if (currentDashboard.value?.id === id) currentDashboard.value = null
  }

  function setCurrentDashboard(id: string): void {
    const dashboard = dashboards.value.find((d) => d.id === id)
    if (dashboard) currentDashboard.value = dashboard
  }

  async function loadDashboard(id: string): Promise<Dashboard | null> {
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
    } catch {
      return null
    }
  }

  async function addChartToDashboard(dashboardId: string, chart: Chart): Promise<void> {
    const row = await dashboardApi.addChart(projectId.value, dashboardId, {
      name: chart.name,
      userQuery: chart.userQuery,
      description: chart.description,
      query: chart.query,
      chartSpec: chart.chartSpec,
      data: chart.data,
      colorConfig: chart.colorConfig,
      filters: chart.filters,
    })
    const dashboard = dashboards.value.find((d) => d.id === dashboardId)
    if (dashboard) {
      dashboard.charts.push(rowToChart(row))
      dashboard.updatedAt = new Date()
    }
  }

  async function updateChart(dashboardId: string, chartId: string, chart: Partial<Chart>): Promise<void> {
    const dashboard = dashboards.value.find((d) => d.id === dashboardId)
    if (!dashboard) return
    const existing = dashboard.charts.find((c) => c.id === chartId)
    if (!existing) return

    const row = await dashboardApi.updateChart(projectId.value, dashboardId, chartId, {
      name: chart.name || existing.name,
      userQuery: chart.userQuery || existing.userQuery,
      description: chart.description || existing.description,
      query: chart.query || existing.query,
      chartType: chart.chartType || existing.chartType,
      chartSpec: chart.chartSpec || existing.chartSpec,
      data: chart.data || existing.data,
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
    const dashboard = dashboards.value.find((d) => d.id === dashboardId)
    if (!dashboard) return
    dashboard.charts = charts
    await dashboardApi.reorderCharts(
      projectId.value,
      dashboardId,
      charts.map((c) => c.id),
    )
  }

  async function refreshChart(dashboardId: string, chartId: string): Promise<void> {
    const row = await dashboardApi.refreshChart(projectId.value, dashboardId, chartId)
    const dashboard = dashboards.value.find((d) => d.id === dashboardId)
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
    const dashboard = dashboards.value.find((d) => d.id === dashboardId)
    if (dashboard) {
      dashboard.charts = dashboard.charts.filter((c) => c.id !== chartId)
      dashboard.updatedAt = new Date()
    }
  }

  async function createShareLink(dashboardId: string): Promise<string> {
    const { shareToken } = await dashboardApi.createShareLink(projectId.value, dashboardId)
    const dashboard = dashboards.value.find((d) => d.id === dashboardId)
    if (dashboard) dashboard.shareToken = shareToken
    if (currentDashboard.value?.id === dashboardId) currentDashboard.value.shareToken = shareToken
    return shareToken
  }

  async function revokeShareLink(dashboardId: string): Promise<void> {
    await dashboardApi.revokeShareLink(projectId.value, dashboardId)
    const dashboard = dashboards.value.find((d) => d.id === dashboardId)
    if (dashboard) dashboard.shareToken = null
    if (currentDashboard.value?.id === dashboardId) currentDashboard.value.shareToken = null
  }

  async function refreshFiltered(dashboardId: string, filterValues: Record<string, string>): Promise<void> {
    const { charts: updatedRows } = await dashboardApi.refreshFiltered(projectId.value, dashboardId, filterValues)
    const dashboard = dashboards.value.find((d) => d.id === dashboardId)
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
    projectId,
    getDashboardById,
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
