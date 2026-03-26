<template>
  <Card class="hover:shadow-lg transition-shadow">
    <div :class="compact ? 'p-2 sm:p-3' : 'p-4 sm:p-6'">
      <div v-if="!compact" class="flex items-start justify-between mb-4">
        <div class="flex-1 flex items-start gap-2">
          <GripVertical
            :size="18"
            class="drag-handle text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 mt-1"
          />
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-semibold">{{ chart.name }}</h3>
              <InfoTooltip v-if="chart.description" :text="chart.description" />
            </div>
            <p v-if="ownerEmail" class="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <User :size="11" />{{ ownerEmail }}
            </p>
            <p v-if="chart.lastRefreshedAt" class="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock :size="11" />Last refreshed {{ formatRelativeTime(chart.lastRefreshedAt) }}
            </p>
          </div>
        </div>
        <div class="flex gap-1 ml-2 sm:ml-4">
          <Button variant="ghost" size="icon" class="h-8 w-8 sm:h-7 sm:w-7" @click="$emit('fullscreen', chart)" title="Full screen">
            <Maximize2 :size="16" class="sm:w-3.5 sm:h-3.5" />
          </Button>
          <div class="relative">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 sm:h-7 sm:w-7"
              @click="showExportMenu = !showExportMenu"
              title="Export"
            >
              <Download :size="16" class="sm:w-3.5 sm:h-3.5" />
            </Button>
            <div
              v-if="showExportMenu"
              class="absolute right-0 top-8 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[120px]"
            >
              <button
                class="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                @click="handleExport('png')"
              >
                <Image :size="14" /> PNG
              </button>
              <button
                class="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                @click="handleExport('csv')"
              >
                <FileText :size="14" /> CSV
              </button>
              <button
                class="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                @click="handleExport('excel')"
              >
                <Sheet :size="14" class="text-green-600" /> Excel
              </button>
            </div>
          </div>
          <Button variant="ghost" size="icon" class="h-7 w-7" @click="$emit('refresh', chart)" title="Refresh data">
            <RefreshCw :size="14" />
          </Button>
          <Button variant="ghost" size="icon" class="h-7 w-7" @click="$emit('chat', chart)" title="Chat with chart">
            <MessageSquare :size="14" />
          </Button>
          <Button v-if="isEditor()" variant="ghost" size="icon" class="h-7 w-7" @click="$emit('edit', chart)" title="Edit chart">
            <Edit2 :size="14" />
          </Button>
          <Button v-if="isEditor()" variant="ghost" size="icon" class="h-7 w-7" @click="$emit('move', chart)" title="Move to another dashboard">
            <ArrowRightLeft :size="14" />
          </Button>
          <Button v-if="isEditor()" variant="ghost" size="icon" class="h-7 w-7" @click="$emit('delete', chart)" title="Delete chart">
            <Trash2 :size="14" />
          </Button>
        </div>
      </div>

      <div v-if="compact" class="flex items-center gap-1 mb-2">
        <GripVertical
          :size="12"
          class="drag-handle text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
        />
        <p class="text-xs font-medium text-muted-foreground truncate flex-1">{{ chart.name }}</p>
        <InfoTooltip v-if="chart.description" :text="chart.description" :size="12" class="shrink-0" />
        <Maximize2
          :size="12"
          class="text-muted-foreground cursor-pointer hover:text-foreground shrink-0"
          @click="$emit('fullscreen', chart)"
        />
      </div>

      <div v-if="chart.chartSpec && hasRenderableSpec">
        <ChartRenderer
          ref="chartRendererRef"
          :spec="chart.chartSpec"
          :chartLibrary="chartLibrary"
          :colorConfig="effectiveColorConfig"
        />
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Edit2, Trash2, RefreshCw, Maximize2, GripVertical, Download, FileText, Sheet, Image, ArrowRightLeft, User, MessageSquare, ChevronDown, Clock } from 'lucide-vue-next'
import { useRole } from '../composables/useRole'
import ChartRenderer from './ChartRenderer.vue'
import InfoTooltip from './InfoTooltip.vue'
import Card from './ui/card.vue'
import Button from './ui/button.vue'
import type { Chart, ChartDataRow, ColorConfig, ChartLibrary } from '../types'
import { exportCsv, exportExcel } from '../utils/exportData'

interface Props {
  chart: Chart
  compact?: boolean
  chartLibrary?: ChartLibrary
  colorConfig?: ColorConfig
  ownerEmail?: string | null
}

const { isEditor } = useRole()
const chartRendererRef = ref<InstanceType<typeof ChartRenderer> | null>(null)
const showSummary = ref(true)
const showExportMenu = ref(false)

const formatRelativeTime = (date: Date | string | null | undefined) => {
  if (!date) return 'never'
  const now = new Date()
  const then = new Date(date)
  if (isNaN(then.getTime())) return 'never'
  const diffMs = now.getTime() - then.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return then.toLocaleDateString()
}

function handleExport(type: 'png' | 'csv' | 'excel') {
  showExportMenu.value = false
  if (type === 'png') chartRendererRef.value?.exportPng()
  else if (type === 'csv') exportCsv(props.chart)
  else exportExcel(props.chart)
}

function closeExportMenu(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.relative')) showExportMenu.value = false
}

onMounted(() => document.addEventListener('click', closeExportMenu))
onUnmounted(() => document.removeEventListener('click', closeExportMenu))

const props = defineProps<Props>()
defineEmits<{
  edit: [chart: Chart]
  delete: [chart: Chart]
  refresh: [chart: Chart]
  fullscreen: [chart: Chart]
  move: [chart: Chart]
  chat: [chart: Chart]
}>()

const hasRenderableSpec = computed(() => {
  const spec = props.chart.chartSpec as Record<string, unknown> | undefined
  if (!spec) return false
  if (spec.error) return false
  const keys = Object.keys(spec).filter(k => k !== 'data')
  return keys.length > 0
})

const effectiveColorConfig = computed<ColorConfig | undefined>(() => {
  if (props.chart.colorConfig?.palette?.length) return props.chart.colorConfig
  if (props.colorConfig?.palette?.length) return props.colorConfig
  return undefined
})

const tableData = computed<ChartDataRow[]>(() => {
  if (!props.chart.data?.length && !props.chart.chartSpec) return []
  if (props.chart.data?.length) return props.chart.data
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
