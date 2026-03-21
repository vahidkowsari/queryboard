<template>
  <div class="fixed inset-0 z-50 bg-background flex flex-col">
    <div v-if="loading" class="flex items-center justify-center h-screen">
      <LoadingSpinner label="Loading chart..." />
    </div>

    <template v-else-if="chart">
      <div class="flex items-center justify-between px-6 py-4 border-b">
        <div class="flex items-center gap-2">
          <h2 class="text-xl font-semibold">{{ chart.name }}</h2>
          <InfoTooltip v-if="chart.description" :text="chart.description" />
        </div>
        <Button variant="ghost" size="icon" @click="goBack" title="Close">
          <X :size="20" />
        </Button>
      </div>
      <div ref="contentArea" class="flex-1 p-6 overflow-auto">
        <div v-if="hasRenderableSpec" class="h-full">
          <ChartRenderer :spec="chart.chartSpec!" :chart-height="chartHeight" />
        </div>
        <div v-else-if="tableData.length > 0" class="overflow-auto border rounded-lg">
          <table class="w-full text-xs">
            <thead class="bg-muted sticky top-0">
              <tr>
                <th
                  v-for="col in tableColumns"
                  :key="col"
                  class="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                >
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in tableData" :key="i" class="border-t hover:bg-muted/50">
                <td v-for="col in tableColumns" :key="col" class="px-2 py-1 whitespace-nowrap">
                  {{ row[col] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="flex items-center justify-center h-full">
          <p class="text-muted-foreground">No chart data available</p>
        </div>
      </div>
    </template>

    <div v-else class="flex items-center justify-center h-screen">
      <div class="text-center">
        <p class="text-muted-foreground">Chart not found</p>
        <Button @click="goBack" class="mt-4">Go Back</Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { X } from 'lucide-vue-next'
import ChartRenderer from '../components/ChartRenderer.vue'
import InfoTooltip from '../components/InfoTooltip.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import Button from '../components/ui/button.vue'
import { useChartLoader } from '../composables/useChartLoader'
import type { ChartDataRow } from '../types'

const router = useRouter()
const { projectId, dashboardId, loading, chart } = useChartLoader()

const chartHeight = ref(500)
const contentArea = ref<HTMLElement | null>(null)

const hasRenderableSpec = computed(() => {
  const spec = chart.value?.chartSpec as Record<string, unknown> | undefined
  if (!spec) return false
  if (spec.error) return false
  const keys = Object.keys(spec).filter(k => k !== 'data')
  return keys.length > 0
})

const tableData = computed<ChartDataRow[]>(() => {
  if (!chart.value?.data?.length && !chart.value?.chartSpec) return []
  if (chart.value?.data?.length) return chart.value.data
  const spec = chart.value?.chartSpec as { data?: { values?: ChartDataRow[] } } | undefined
  if (spec?.data?.values) return spec.data.values
  return []
})

const tableColumns = computed<string[]>(() => {
  const first = tableData.value[0]
  if (!first) return []
  return Object.keys(first)
})

function goBack() {
  router.push({ name: 'dashboard', params: { projectId, id: dashboardId } })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') goBack()
}

function updateHeight() {
  if (contentArea.value) {
    chartHeight.value = contentArea.value.clientHeight - 48
  }
}

watch(loading, (isLoading) => {
  if (!isLoading) nextTick(updateHeight)
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updateHeight)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updateHeight)
})
</script>
