<template>
  <Card>
    <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <h3 class="text-xl font-semibold">{{ editChart ? 'Edit Chart' : 'Generate Chart with AI' }}</h3>
        <InfoTooltip v-if="explanation" :text="explanation" />
      </div>

      <!-- View Only Banner -->
      <div v-if="isViewOnly" class="flex items-center gap-2 p-3 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-sm font-medium">
        <Eye :size="16" />
        You have view-only access. Chart creation and editing is restricted to editors and admins.
      </div>

      <!-- Query Input -->
      <div>
        <label class="block text-sm font-medium mb-2">Ask for a chart</label>
        <Textarea
          v-model="userQuery"
          placeholder="e.g., Show residents by gender as a bar chart, Count facilities by state, Total number of residents as a KPI"
          :rows="3"
        />
      </div>

      <!-- Chart Type + Actions row -->
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div class="flex-1 min-w-0">
          <label class="block text-sm font-medium mb-2">Chart Type</label>
          <div class="flex gap-1.5 sm:gap-2 flex-wrap">
            <button
              v-for="opt in chartTypeOptions"
              :key="opt.value"
              @click="selectedChartType = opt.value"
              :class="[
                'px-3 py-1.5 rounded-full text-sm border transition-colors',
                selectedChartType === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:bg-accent',
              ]"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="flex gap-2 sm:gap-3 flex-wrap sm:flex-nowrap w-full sm:w-auto">
          <Button v-if="loading" @click="cancelGeneration" variant="destructive">
            <X :size="20" />
            Cancel
          </Button>
          <Button v-else @click="generateChart" :disabled="!userQuery.trim() || isViewOnly">
            <Sparkles :size="20" />
            {{ generatedChart ? 'Regenerate Chart' : 'Generate Chart' }}
          </Button>
          <Button v-if="generatedChart" @click="saveChart" variant="secondary" :disabled="saving || isViewOnly">
            <Save :size="20" />
            {{ saving ? 'Saving...' : editChart ? 'Update Chart' : 'Save Chart' }}
          </Button>
        </div>
      </div>

      <!-- Agent Progress -->
      <div v-if="agentSteps.length > 0" class="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-1.5">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-medium text-primary">Agent Progress</span>
          <button
            v-if="thinkingTexts.length > 0"
            @click="showReasoning = !showReasoning"
            class="text-xs text-primary/80 hover:text-primary font-medium transition-colors"
          >
            {{ showReasoning ? 'Hide reasoning' : 'Show reasoning' }}
          </button>
        </div>
        <template v-for="(step, i) in agentSteps" :key="i">
          <div class="flex items-start gap-2 text-sm">
            <Check v-if="!loading || i < agentSteps.length - 1" :size="16" class="text-green-600 mt-0.5 shrink-0" />
            <Loader2 v-else :size="16" class="animate-spin text-primary mt-0.5 shrink-0" />
            <span
              :class="loading && i === agentSteps.length - 1 ? 'text-primary font-medium' : 'text-muted-foreground'"
              >{{ step }}</span
            >
          </div>
          <div
            v-if="showReasoning && stepToThinkingMap[i] !== undefined && thinkingTexts[stepToThinkingMap[i]]"
            class="ml-6 p-2 bg-primary/10 rounded text-xs text-primary italic whitespace-pre-wrap"
          >
            {{ thinkingTexts[stepToThinkingMap[i]!] }}
          </div>
        </template>
        <div
          v-if="showReasoning && thinkingTexts[totalStepsReceived]"
          class="ml-6 p-2 bg-primary/10 rounded text-xs text-primary italic whitespace-pre-wrap"
        >
          {{ thinkingTexts[totalStepsReceived] }}
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
        <p class="text-destructive text-sm">{{ error }}</p>
      </div>

      <!-- Preview Section -->
      <div v-if="generatedChart">
        <div class="border-t pt-6">
          <div class="flex items-center justify-between mb-4">
            <h4 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Preview</h4>
            <div class="flex items-center gap-2">
              <button
                @click="showColorPicker = !showColorPicker"
                :class="[
                  'px-2 py-0.5 rounded text-xs border transition-colors flex items-center gap-1',
                  activeColorPalette.length
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:bg-accent',
                ]"
              >
                <Palette :size="12" />
                Colors
              </button>
              <button
                v-if="activeColorPalette.length"
                @click="clearColors"
                class="px-2 py-0.5 rounded text-xs border border-border text-muted-foreground hover:bg-accent transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          <div v-if="showColorPicker" class="mb-4 p-3 border rounded-lg bg-muted/30 space-y-3">
            <div>
              <label class="block text-xs font-medium mb-1.5">Presets</label>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="preset in COLOR_PRESETS"
                  :key="preset.name"
                  @click="applyPreset(preset.palette)"
                  class="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted transition-colors"
                  :title="preset.name"
                >
                  <span class="flex gap-0.5">
                    <span
                      v-for="(c, i) in preset.palette.slice(0, 4)"
                      :key="i"
                      class="w-2.5 h-2.5 rounded-full"
                      :style="{ backgroundColor: c }"
                    />
                  </span>
                  {{ preset.name }}
                </button>
                <button
                  v-if="colorConfig?.palette?.length"
                  @click="applyPreset(colorConfig!.palette)"
                  class="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted transition-colors"
                  title="Project colors"
                >
                  <span class="flex gap-0.5">
                    <span
                      v-for="(c, i) in colorConfig!.palette.slice(0, 4)"
                      :key="i"
                      class="w-2.5 h-2.5 rounded-full"
                      :style="{ backgroundColor: c }"
                    />
                  </span>
                  Project
                </button>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1.5">Custom</label>
              <div class="flex items-center gap-2">
                <input type="color" v-model="customColor" class="w-7 h-7 rounded cursor-pointer border-0 p-0" />
                <span class="text-xs font-mono text-muted-foreground">{{ customColor }}</span>
                <Button variant="outline" size="sm" class="h-7 text-xs" @click="applyPreset([customColor])">
                  Apply Single
                </Button>
              </div>
            </div>
          </div>

          <div v-if="hasRenderableSpec" class="rounded-lg border bg-background p-2">
            <ChartRenderer :spec="generatedChart!" :chartLibrary="chartLibrary" :colorConfig="activeColorConfig" />
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
          <div v-if="summary" class="mt-4 pt-4 border-t">
            <div class="flex items-center gap-2 mb-2">
              <MessageSquare :size="16" class="text-primary" />
              <h5 class="text-sm font-semibold text-foreground">AI Summary</h5>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ summary }}</p>
          </div>

          <!-- SQL Toggle -->
          <div v-if="sqlQuery" class="mt-4 pt-4 border-t">
            <button
              @click="showSql = !showSql"
              class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <ChevronDown :size="16" :class="['transition-transform', showSql ? 'rotate-180' : '']" />
              {{ showSql ? 'Hide SQL' : 'Show SQL' }}
            </button>
            <pre v-if="showSql" class="mt-2 p-4 bg-muted rounded-lg text-xs overflow-x-auto border">{{ sqlQuery }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Sparkles, Save, ChevronDown, Check, Loader2, Palette, X, Eye, MessageSquare } from 'lucide-vue-next'
import ChartRenderer from './ChartRenderer.vue'
import InfoTooltip from './InfoTooltip.vue'
import Card from './ui/card.vue'
import Button from './ui/button.vue'
import Textarea from './ui/textarea.vue'
import { useDashboardStore } from '../stores/dashboard.store'
import { useToast } from '../composables/useToast'
import { useRole } from '../composables/useRole'
import { useResumableSSE, type SSECallbacks } from '../composables/useResumableSSE'
import type { Chart, ChartType, ChartLibrary, ChartDataRow, ColorConfig, ChartFilter } from '../types'
import { CHART_TYPE_OPTIONS } from '../utils/chartTransform'
import { COLOR_PRESETS } from '../utils/colorPresets'
import { resolveEffectiveColorConfig } from '../utils/resolveColorConfig'

interface Props {
  dashboardId: string
  editChart?: Chart | null
  chartNameOverride?: string
  colorConfig?: ColorConfig
  chartLibrary?: ChartLibrary
  showLlmDetails?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  chartCreated: [chart: Chart]
  chartUpdated: []
}>()

const dashboardStore = useDashboardStore()
const toast = useToast()
const route = useRoute()
const { isEditor } = useRole()
const isViewOnly = computed(() => !isEditor())
const { startSession, reconnectSession, findLatestSession, finishSession } = useResumableSSE()

const userQuery = ref(props.editChart?.userQuery || props.editChart?.name || '')
const loading = ref(false)
const saving = ref(false)
const status = ref('')
const error = ref<string | null>(null)
const sqlQuery = ref<string | null>(props.editChart?.query || null)
const explanation = ref<string | null>(props.editChart?.description || null)
const summary = ref<string | null>(props.editChart?.summary || null)
const generatedChart = ref<Record<string, unknown> | null>(props.editChart?.chartSpec || null)
const chartData = ref<ChartDataRow[] | null>(props.editChart?.data || null)
const selectedChartType = ref<ChartType>(props.editChart?.chartType || 'auto')
const showSql = ref(false)
const agentSteps = ref<string[]>([])
const thinkingTexts = ref<string[]>([])
const stepToThinkingMap = ref<number[]>([])
const showReasoning = ref(false)
const totalStepsReceived = ref(0)
const generatedTitle = ref<string | null>(null)
const lastQuery = ref<string | null>(props.editChart?.userQuery || null)
const showColorPicker = ref(false)
const activeColorPalette = ref<string[]>(props.editChart?.colorConfig?.palette || props.colorConfig?.palette || [])
const customColor = ref('#4e79a7')
const chartFilters = ref<ChartFilter[] | null>(props.editChart?.filters || null)

watch(
  () => props.colorConfig?.palette,
  (palette) => {
    if (activeColorPalette.value.length > 0) return
    if (props.editChart?.colorConfig?.palette?.length) return
    if (palette?.length) {
      activeColorPalette.value = [...palette]
    }
  },
  { immediate: true },
)

const hasRenderableSpec = computed(() => {
  const spec = generatedChart.value as Record<string, unknown> | undefined
  if (!spec) return false
  if (spec.error) return false
  const keys = Object.keys(spec).filter(k => k !== 'data')
  return keys.length > 0
})

const tableData = computed<ChartDataRow[]>(() => {
  if (!chartData.value?.length && !generatedChart.value) return []
  if (chartData.value?.length) return chartData.value
  const spec = generatedChart.value as { data?: { values?: ChartDataRow[] } } | undefined
  if (spec?.data?.values) return spec.data.values
  return []
})

const tableColumns = computed<string[]>(() => {
  const first = tableData.value[0]
  if (!first) return []
  return Object.keys(first)
})

function cancelGeneration() {
  finishSession()
  loading.value = false
  status.value = 'Cancelled'
}

function applyPreset(palette: string[]) {
  activeColorPalette.value = [...palette]
}

function clearColors() {
  activeColorPalette.value = []
}

const activeColorConfig = computed<ColorConfig | undefined>(() => {
  return resolveEffectiveColorConfig({
    chartColorConfig: props.editChart?.colorConfig,
    projectColorConfig: props.colorConfig,
    paletteOverride: activeColorPalette.value.length ? activeColorPalette.value : undefined,
  })
})

function hasExistingChart(): boolean {
  return !!(sqlQuery.value || props.editChart?.query)
}

const chartTypeOptions = [{ value: 'auto' as ChartType, label: 'Auto' }, ...CHART_TYPE_OPTIONS]

let receivedResult = false

const resolvedProjectId = computed(() => {
  const fromUrl = (route.params.projectId as string | undefined)?.trim()
  return fromUrl || ''
})

function makeSSECallbacks(): SSECallbacks {
  return {
    onStep: (data) => {
      const stepText = typeof data.step === 'string' ? data.step : ''
      if (!stepText) return
      const shouldShow = props.showLlmDetails || !stepText.startsWith('Using ')
      if (shouldShow) {
        agentSteps.value.push(stepText)
        stepToThinkingMap.value.push(totalStepsReceived.value)
        status.value = stepText
      }
      totalStepsReceived.value++
    },
    onThinking: (data) => {
      const thinkingText = typeof data.text === 'string' ? data.text : ''
      if (!thinkingText) return
      const idx = totalStepsReceived.value
      thinkingTexts.value[idx] = (thinkingTexts.value[idx] || '') + thinkingText
    },
    onResult: (data) => {
      receivedResult = true
      generatedTitle.value = (data.title as string) || null
      sqlQuery.value = data.sql as string
      explanation.value = (data.description as string) || null
      summary.value = (data.summary as string) || null
      generatedChart.value = data.chartSpec as Record<string, unknown>
      chartData.value = (data.data as ChartDataRow[]) || null
      chartFilters.value = (data.filters as ChartFilter[])?.length ? (data.filters as ChartFilter[]) : null
    },
    onError: (data) => {
      const errMsg = typeof data.error === 'string' && data.error.trim() ? data.error : 'Chart generation failed'
      error.value = errMsg
    },
    onSessionEnd: () => {
      // Server confirmed session is done
    },
  }
}

async function generateChart() {
  if (!userQuery.value.trim()) return

  loading.value = true
  error.value = null
  status.value = ''
  agentSteps.value = []
  thinkingTexts.value = []
  stepToThinkingMap.value = []
  totalStepsReceived.value = 0
  receivedResult = false

  const pid = resolvedProjectId.value

  try {
    if (!pid) {
      throw new Error('No project selected. Please refresh the page and try again.')
    }

    await startSession(
      `/api/projects/${pid}/agents/generate-chart`,
      {
        userQuery: userQuery.value,
        chartType: selectedChartType.value,
        ...(hasExistingChart()
          ? {
              existingChart: {
                sql: sqlQuery.value || props.editChart?.query,
                chartSpec: generatedChart.value || props.editChart?.chartSpec,
                data: (chartData.value || props.editChart?.data)?.slice(0, 10),
                description: explanation.value || props.editChart?.description,
                userQuery: lastQuery.value || props.editChart?.userQuery,
              },
            }
          : {}),
        dashboardId: props.dashboardId,
      },
      makeSSECallbacks(),
    )

    status.value = ''
    if (receivedResult) {
      lastQuery.value = userQuery.value
      await saveChart()
    }
    finishSession()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // User navigated away — session continues on server, don't show error
      return
    }
    const raw = err instanceof Error ? err.message : String(err)
    const normalized = raw.toLowerCase()
    const isNetworkErr =
      normalized.includes('network') ||
      normalized.includes('failed to fetch') ||
      normalized.includes('load failed') ||
      normalized.includes('network connection was lost')
    error.value = isNetworkErr ? 'Connection lost — please check your network and try again' : raw
    status.value = ''
    finishSession()
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const pid = resolvedProjectId.value
  if (!pid) return

  const sessionId = await findLatestSession(pid, 'generate-chart', { dashboardId: props.dashboardId })
  if (!sessionId) return

  // Found an active session — reconnect
  loading.value = true
  error.value = null
  status.value = 'Reconnecting...'
  agentSteps.value = []
  thinkingTexts.value = []
  stepToThinkingMap.value = []
  totalStepsReceived.value = 0
  receivedResult = false

  try {
    const ok = await reconnectSession(pid, sessionId, makeSSECallbacks())
    if (ok && receivedResult) {
      status.value = ''
      lastQuery.value = userQuery.value
      await saveChart()
    }
    finishSession()
  } catch {
    // Reconnection failed silently — session expired
    finishSession()
  } finally {
    loading.value = false
    status.value = ''
  }
})

async function saveChart() {
  if (!generatedChart.value || !sqlQuery.value) return

  saving.value = true
  try {
    const chart: Chart = {
      id: crypto.randomUUID(),
      dashboardId: props.dashboardId,
      name: props.chartNameOverride || generatedTitle.value || userQuery.value.substring(0, 50),
      userQuery: userQuery.value,
      description: explanation.value || undefined,
      summary: summary.value || undefined,
      query: sqlQuery.value,
      chartType: selectedChartType.value,
      chartSpec: JSON.parse(JSON.stringify(generatedChart.value)),
      data: chartData.value || undefined,
      colorConfig: activeColorConfig.value,
      filters: chartFilters.value || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    if (props.editChart) {
      await dashboardStore.updateChart(props.dashboardId, props.editChart.id, chart)
      toast.success('Chart updated')
      emit('chartUpdated')
    } else {
      const created = await dashboardStore.addChartToDashboard(props.dashboardId, chart)
      toast.success('Chart saved')
      emit('chartCreated', created)
    }

    userQuery.value = ''
    generatedChart.value = null
    sqlQuery.value = null
    explanation.value = null
    summary.value = null
    chartData.value = null
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save chart'
    error.value = msg
    toast.error(msg)
  } finally {
    saving.value = false
  }
}
</script>
