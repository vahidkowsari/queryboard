<template>
  <Card class="shadow-sm">
    <div :class="compact ? 'p-3' : 'p-6'">
      <div v-if="!compact" class="mb-4">
        <h3 class="text-lg font-semibold">{{ chart.name }}</h3>
        <p v-if="chart.description" class="text-sm text-muted-foreground mt-1">{{ chart.description }}</p>
      </div>

      <div v-if="compact" class="mb-2">
        <p class="text-xs font-medium text-muted-foreground truncate">{{ chart.name }}</p>
      </div>

      <div v-if="hasRenderableSpec">
        <ChartRenderer :spec="chart.chartSpec!" :colorConfig="effectiveColorConfig" />
      </div>
      <div v-else-if="tableData.length > 0" class="overflow-auto max-h-80 border rounded-lg">
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
      <div v-else class="flex items-center justify-center h-64 bg-muted rounded-lg">
        <p class="text-muted-foreground">No chart data available</p>
      </div>

      <!-- Summary Section -->
      <div v-if="chart.summary && !compact" class="mt-4 pt-4 border-t">
        <button
          @click="showSummary = !showSummary"
          class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors mb-2"
        >
          <MessageSquare :size="16" />
          <span>AI Summary</span>
          <ChevronDown :size="14" :class="['transition-transform ml-auto', showSummary ? 'rotate-180' : '']" />
        </button>
        <p v-if="showSummary" class="text-sm text-muted-foreground leading-relaxed">{{ chart.summary }}</p>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { MessageSquare, ChevronDown } from 'lucide-vue-next'
import ChartRenderer from './ChartRenderer.vue'
import Card from './ui/card.vue'
import type { ChartRow } from '../services/dashboard.api'
import type { ChartDataRow, ColorConfig } from '../types'

interface Props {
  chart: ChartRow
  compact?: boolean
  colorConfig?: ColorConfig
}

const props = defineProps<Props>()
const showSummary = ref(true)

const hasRenderableSpec = computed(() => {
  const spec = props.chart.chartSpec as Record<string, unknown> | undefined
  if (!spec) return false
  if ((spec as any).error) return false
  const keys = Object.keys(spec).filter(k => k !== 'data')
  return keys.length > 0
})

const hasRenderableSpec = computed(() => {
  const spec = props.chart.chartSpec as Record<string, unknown> | undefined
  if (!spec) return false
  if ((spec as any).error) return false
  const keys = Object.keys(spec).filter(k => k !== 'data')
  return keys.length > 0
})

const effectiveColorConfig = computed<ColorConfig | undefined>(() => {
  if (props.chart.colorConfig?.palette?.length) return props.chart.colorConfig
  return undefined
})

const tableData = computed<ChartDataRow[]>(() => {
  if (!props.chart.data?.length && !props.chart.chartSpec) return []
  if (props.chart.data?.length) return props.chart.data as ChartDataRow[]
  const spec = props.chart.chartSpec as { data?: { values?: ChartDataRow[] } } | undefined
  if (spec?.data?.values) return spec.data.values
  return []
})

const tableColumns = computed<string[]>(() => {
  const first = tableData.value[0]
  if (!first) return []
  return Object.keys(first)
})
</script>
