<template>
  <Card>
    <div class="p-6 space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <h3 class="text-xl font-semibold">{{ editChart ? 'Edit Chart' : 'Generate Chart with AI' }}</h3>
        <InfoTooltip v-if="explanation" :text="explanation" />
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
      <div class="flex items-end justify-between gap-4 flex-wrap">
        <div class="flex-1 min-w-0">
          <label class="block text-sm font-medium mb-2">Chart Type</label>
          <div class="flex gap-2 flex-wrap">
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
        <div class="flex gap-3 shrink-0">
          <Button v-if="loading" @click="cancelGeneration" variant="destructive">
            <X :size="20" />
            Cancel
          </Button>
          <Button v-else @click="generateChart" :disabled="!userQuery.trim()">
            <Sparkles :size="20" />
            {{ generatedChart ? 'Regenerate Chart' : 'Generate Chart' }}
          </Button>
          <Button v-if="generatedChart" @click="saveChart" variant="secondary" :disabled="saving">
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
          <div
            v-if="showReasoning && thinkingTexts[i]"
            class="ml-6 p-2 bg-primary/10 rounded text-xs text-primary italic whitespace-pre-wrap"
          >
            {{ thinkingTexts[i] }}
          </div>
          <div class="flex items-start gap-2 text-sm">
            <Check v-if="!loading || i < agentSteps.length - 1" :size="16" class="text-green-600 mt-0.5 shrink-0" />
            <Loader2 v-else :size="16" class="animate-spin text-primary mt-0.5 shrink-0" />
            <span
              :class="loading && i === agentSteps.length - 1 ? 'text-primary font-medium' : 'text-muted-foreground'"
              >{{ step }}</span
            >
          </div>
        </template>
        <div
          v-if="showReasoning && thinkingTexts[agentSteps.length]"
          class="ml-6 p-2 bg-primary/10 rounded text-xs text-primary italic whitespace-pre-wrap"
        >
          {{ thinkingTexts[agentSteps.length] }}
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

          <div class="rounded-lg border bg-background p-2">
            <ChartRenderer :spec="generatedChart!" :chartLibrary="chartLibrary" :colorConfig="activeColorConfig" />
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
import { ref, computed } from 'vue'
import { Sparkles, Save, ChevronDown, Check, Loader2, Palette, X } from 'lucide-vue-next'
import ChartRenderer from './ChartRenderer.vue'
import InfoTooltip from './InfoTooltip.vue'
import Card from './ui/card.vue'
import Button from './ui/button.vue'
import Textarea from './ui/textarea.vue'
import { useDashboardStore } from '../stores/dashboard.store'
import { useToast } from '../composables/useToast'
import { API_BASE_URL } from '../services/api'
import type { Chart, ChartType, ChartLibrary, ChartDataRow, ColorConfig, ChartFilter } from '../types'
import { CHART_TYPE_OPTIONS } from '../utils/chartTransform'
import { COLOR_PRESETS } from '../utils/colorPresets'

interface Props {
  dashboardId: string
  editChart?: Chart | null
  chartNameOverride?: string
  colorConfig?: ColorConfig
  chartLibrary?: ChartLibrary
}

const props = defineProps<Props>()
const emit = defineEmits<{
  chartCreated: [chart: Chart]
  chartUpdated: []
}>()

const dashboardStore = useDashboardStore()
const toast = useToast()

const userQuery = ref(props.editChart?.userQuery || props.editChart?.name || '')
const loading = ref(false)
const saving = ref(false)
const status = ref('')
const error = ref<string | null>(null)
const sqlQuery = ref<string | null>(props.editChart?.query || null)
const explanation = ref<string | null>(props.editChart?.description || null)
const generatedChart = ref<Record<string, unknown> | null>(props.editChart?.chartSpec || null)
const chartData = ref<ChartDataRow[] | null>(props.editChart?.data || null)
const selectedChartType = ref<ChartType>(props.editChart?.chartType || 'auto')
const showSql = ref(false)
const agentSteps = ref<string[]>([])
const thinkingTexts = ref<string[]>([])
const showReasoning = ref(false)
const generatedTitle = ref<string | null>(null)
const lastQuery = ref<string | null>(props.editChart?.userQuery || null)
const showColorPicker = ref(false)
const activeColorPalette = ref<string[]>(props.editChart?.colorConfig?.palette || [])
const customColor = ref('#4e79a7')
const abortController = ref<AbortController | null>(null)
const chartFilters = ref<ChartFilter[] | null>(props.editChart?.filters || null)

function cancelGeneration() {
  abortController.value?.abort()
}

function applyPreset(palette: string[]) {
  activeColorPalette.value = [...palette]
}

function clearColors() {
  activeColorPalette.value = []
}

const activeColorConfig = computed<ColorConfig | undefined>(() => {
  if (!activeColorPalette.value.length) return undefined
  return { palette: activeColorPalette.value }
})

function hasExistingChart(): boolean {
  return !!(sqlQuery.value || props.editChart?.query)
}

const chartTypeOptions = [{ value: 'auto' as ChartType, label: 'Auto' }, ...CHART_TYPE_OPTIONS]

async function generateChart() {
  if (!userQuery.value.trim()) return

  loading.value = true
  error.value = null
  status.value = ''
  agentSteps.value = []
  thinkingTexts.value = []

  const controller = new AbortController()
  abortController.value = controller
  const pid = dashboardStore.projectId

  try {
    const response = await fetch(`${API_BASE_URL}/api/projects/${pid}/claude/generate-chart`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
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
      }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response stream')

    const decoder = new TextDecoder()
    let buffer = ''
    let eventType = ''

    function processLines(lines: string[]) {
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7)
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6))
          if (eventType === 'step') {
            agentSteps.value.push(data.step)
            status.value = data.step
          } else if (eventType === 'thinking') {
            // Store thinking text at the current step index (before the next step)
            const idx = agentSteps.value.length
            thinkingTexts.value[idx] = (thinkingTexts.value[idx] || '') + data.text
          } else if (eventType === 'result') {
            generatedTitle.value = data.title || null
            sqlQuery.value = data.sql
            explanation.value = data.description
            generatedChart.value = data.chartSpec
            chartData.value = data.data || null
            chartFilters.value = data.filters?.length ? data.filters : null
          } else if (eventType === 'error') {
            throw new Error(data.error)
          }
          eventType = ''
        }
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      processLines(lines)
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      processLines(buffer.split('\n'))
    }

    status.value = ''
    lastQuery.value = userQuery.value
    await saveChart()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      status.value = 'Cancelled'
    } else {
      error.value = err instanceof Error ? err.message : 'Failed to generate chart'
    }
    status.value = ''
  } finally {
    abortController.value = null
    loading.value = false
  }
}

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
      await dashboardStore.addChartToDashboard(props.dashboardId, chart)
      toast.success('Chart saved')
      emit('chartCreated', chart)
    }

    userQuery.value = ''
    generatedChart.value = null
    sqlQuery.value = null
    explanation.value = null
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
