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
        <div v-if="chart.chartSpec" class="h-full">
          <ChartRenderer :spec="chart.chartSpec" :chart-height="chartHeight" />
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
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { X } from 'lucide-vue-next'
import ChartRenderer from '../components/ChartRenderer.vue'
import InfoTooltip from '../components/InfoTooltip.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import Button from '../components/ui/button.vue'
import { useChartLoader } from '../composables/useChartLoader'

const router = useRouter()
const { projectId, dashboardId, loading, chart } = useChartLoader()

const chartHeight = ref(500)
const contentArea = ref<HTMLElement | null>(null)

function goBack() {
  router.push(`/projects/${projectId}/dashboard/${dashboardId}`)
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
