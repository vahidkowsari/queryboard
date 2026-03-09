<template>
  <component
    :is="rendererComponent"
    ref="chartRef"
    :spec="spec"
    :colorConfig="colorConfig"
    :options="options"
    :chartHeight="chartHeight"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ColorConfig, ChartLibrary } from '../types'
import VegaChart from './VegaChart.vue'

export interface ChartRendererApi {
  exportPng: () => Promise<void>
}

interface Props {
  spec: Record<string, unknown>
  chartLibrary?: ChartLibrary
  colorConfig?: ColorConfig
  options?: Record<string, unknown>
  chartHeight?: number
}

const props = defineProps<Props>()

const rendererComponent = computed(() => {
  switch (props.chartLibrary) {
    // Future: case 'chartjs': return ChartJsChart
    // Future: case 'echarts': return EChartsChart
    // Future: case 'plotly': return PlotlyChart
    default:
      return VegaChart
  }
})

const chartRef = ref<InstanceType<typeof VegaChart> | null>(null)

async function exportPng() {
  if (chartRef.value?.exportPng) {
    await chartRef.value.exportPng()
  }
}

defineExpose({ exportPng })
</script>
