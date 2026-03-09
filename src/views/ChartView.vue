<template>
  <div class="min-h-screen">
    <div v-if="loading" class="flex items-center justify-center h-screen">
      <LoadingSpinner label="Loading chart..." />
    </div>

    <div v-else-if="!chart" class="flex items-center justify-center h-screen">
      <div class="text-center">
        <p class="text-muted-foreground">Chart not found</p>
        <Button @click="goBack" class="mt-4"> Back to Dashboard </Button>
      </div>
    </div>

    <div v-else>
      <div class="max-w-7xl mx-auto px-8 py-8">
        <div class="flex items-center justify-between mb-8">
          <div class="flex items-center gap-4">
            <Button variant="ghost" size="icon" @click="goBack">
              <ArrowLeft :size="20" />
            </Button>
            <InlineEdit :model-value="chartName || chart.name" @save="saveChartName">
              <template #default="{ value }">
                <h1 class="text-3xl font-bold">{{ value }}</h1>
              </template>
            </InlineEdit>
          </div>
        </div>

        <AIChartGenerator
          :dashboard-id="dashboardId"
          :edit-chart="chart"
          :chart-name-override="chartName"
          :color-config="colorConfig"
          :chart-library="chartLibrary"
          @chart-updated="handleChartUpdated"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { useDashboardStore } from '../stores/dashboard.store'
import AIChartGenerator from '../components/AIChartGenerator.vue'
import InlineEdit from '../components/InlineEdit.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import Button from '../components/ui/button.vue'
import { useToast } from '../composables/useToast'
import { useChartLoader } from '../composables/useChartLoader'
import { useProjectColorConfig } from '../composables/useProjectColorConfig'

const router = useRouter()
const dashboardStore = useDashboardStore()
const toast = useToast()

const { projectId, dashboardId, chartId, loading, chart } = useChartLoader()
const { colorConfig, chartLibrary } = useProjectColorConfig(projectId)
const chartName = ref('')

watch(chart, (c) => {
  if (c) chartName.value = c.name
})

async function saveChartName(newName: string) {
  try {
    await dashboardStore.updateChart(dashboardId, chartId, { name: newName })
    chartName.value = newName
    if (chart.value) chart.value.name = newName
    toast.success('Chart name updated')
  } catch {
    toast.error('Failed to update chart name')
  }
}

function goBack() {
  router.push(`/projects/${projectId}/dashboard/${dashboardId}`)
}

function handleChartUpdated() {
  router.push(`/projects/${projectId}/dashboard/${dashboardId}`)
}
</script>
