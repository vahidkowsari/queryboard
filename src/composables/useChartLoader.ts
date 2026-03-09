import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDashboardStore } from '../stores/dashboard.store'
import type { Chart } from '../types'

export function useChartLoader() {
  const route = useRoute()
  const dashboardStore = useDashboardStore()

  const projectId = route.params.projectId as string
  const dashboardId = route.params.dashboardId as string
  const chartId = route.params.chartId as string
  const loading = ref(true)
  const chart = ref<Chart | null>(null)

  onMounted(async () => {
    dashboardStore.setProjectId(projectId)
    await dashboardStore.loadDashboard(dashboardId)
    const dashboard = dashboardStore.dashboards.find((d) => d.id === dashboardId)
    if (dashboard) {
      chart.value = dashboard.charts.find((c) => c.id === chartId) || null
    }
    loading.value = false
  })

  return { projectId, dashboardId, chartId, loading, chart }
}
