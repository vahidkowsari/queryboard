<template>
  <div class="vega-chart-container">
    <div v-if="isKpi" class="flex flex-col items-center justify-center h-48 rounded-lg border" :style="kpiContainerStyle">
      <div class="text-5xl font-bold" :style="kpiValueStyle">{{ kpiValue }}</div>
      <div v-if="kpiChange !== null" class="flex items-center gap-1.5 mt-2">
        <span
          :class="[
            'inline-flex items-center gap-0.5 text-sm font-semibold px-2 py-0.5 rounded-full',
            kpiChange.direction === 'up' ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950' :
            kpiChange.direction === 'down' ? 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-950' :
            'text-muted-foreground bg-muted'
          ]"
        >
          <span v-if="kpiChange.direction === 'up'">&#9650;</span>
          <span v-else-if="kpiChange.direction === 'down'">&#9660;</span>
          <span v-else>&mdash;</span>
          {{ kpiChange.label }}
        </span>
        <span v-if="kpiChange.periodLabel" class="text-xs" :style="kpiMetaStyle">{{ kpiChange.periodLabel }}</span>
      </div>
      <div v-if="kpiLabel" class="text-sm mt-2" :style="kpiMetaStyle">{{ kpiLabel }}</div>
    </div>
    <template v-else>
      <div v-if="error" class="flex items-center justify-center h-64">
        <div class="text-red-500 text-sm">{{ error }}</div>
      </div>
      <div ref="chartContainer" class="w-full"></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import embed from 'vega-embed'
import type { TopLevelSpec } from 'vega-lite'
import type { EmbedOptions, Result } from 'vega-embed'
import type { VegaSpec, ColorConfig } from '../types'
import { applyChartColors } from '../utils/applyColors'

interface Props {
  spec: VegaSpec
  colorConfig?: ColorConfig
  options?: EmbedOptions
  chartHeight?: number
}

const props = defineProps<Props>()

const coloredChart = computed(() => applyChartColors(props.spec, props.colorConfig))

const chartContainer = ref<HTMLElement | null>(null)
const error = ref<string | null>(null)
let vegaView: Result | null = null

async function exportPng() {
  if (!vegaView) return
  const url = await vegaView.view.toImageURL('png', 2)
  const link = document.createElement('a')
  link.download = 'chart.png'
  link.href = url
  link.click()
}

defineExpose({ exportPng })

const specAsVega = computed(() => coloredChart.value.spec)

const isKpi = computed(() => {
  const s = specAsVega.value
  if (!s) return false
  const mark = typeof s.mark === 'string' ? s.mark : s.mark?.type
  const dataLen = s.data?.values?.length ?? 0
  if (mark === 'text' && dataLen <= 2) return true
  return false
})

const CHANGE_PCT_KEYS = ['change_pct', 'change_percent', 'pct_change', 'percent_change', 'growth', 'growth_pct', 'growth_rate', 'yoy', 'mom', 'wow', 'qoq', 'delta_pct']
const PREVIOUS_KEYS = ['previous', 'previous_value', 'prev', 'prior', 'last_period', 'comparison', 'baseline', 'prior_value', 'prev_value']
const CHANGE_ABS_KEYS = ['change', 'delta', 'diff', 'difference', 'absolute_change']
const PERIOD_KEYS = ['period', 'period_label', 'comparison_period', 'vs', 'compared_to']

function findField(row: Record<string, unknown>, candidates: string[]): { key: string; value: unknown } | null {
  const lowerMap = new Map(Object.entries(row).map(([k, v]) => [k.toLowerCase(), { key: k, value: v }]))
  for (const c of candidates) {
    const match = lowerMap.get(c)
    if (match !== undefined) return match
  }
  for (const [lower, entry] of lowerMap) {
    for (const c of candidates) {
      if (lower.includes(c)) return entry
    }
  }
  return null
}

const kpiValue = computed(() => {
  const values = specAsVega.value?.data?.values
  if (!values?.length) return ''
  const row = values[0] as Record<string, unknown> | undefined
  if (!row) return ''
  const excludeKeys = [...CHANGE_PCT_KEYS, ...PREVIOUS_KEYS, ...CHANGE_ABS_KEYS, ...PERIOD_KEYS]
  const entries = Object.entries(row).filter(([k]) => {
    const lower = k.toLowerCase()
    return !excludeKeys.some((ex: string) => lower.includes(ex))
  })
  const numEntry = entries.find(([, v]) => !isNaN(Number(v)) && String(v).trim() !== '')
  return numEntry ? Number(numEntry[1]).toLocaleString() : entries[0]?.[1] ?? ''
})

interface KpiChangeInfo {
  direction: 'up' | 'down' | 'neutral'
  label: string
  periodLabel?: string
}

const kpiChange = computed<KpiChangeInfo | null>(() => {
  const values = specAsVega.value?.data?.values
  if (!values?.length) return null
  const row = values[0] as Record<string, unknown>
  if (!row) return null

  let changePct: number | null = null
  let changeAbs: number | null = null
  let periodLabel: string | undefined

  const pctField = findField(row, CHANGE_PCT_KEYS)
  if (pctField && !isNaN(Number(pctField.value))) {
    changePct = Number(pctField.value)
  }

  const absField = findField(row, CHANGE_ABS_KEYS)
  if (absField && !isNaN(Number(absField.value))) {
    changeAbs = Number(absField.value)
  }

  if (changePct === null && changeAbs === null) {
    const prevField = findField(row, PREVIOUS_KEYS)
    if (prevField && !isNaN(Number(prevField.value))) {
      const prev = Number(prevField.value)
      const excludeKeys = [...CHANGE_PCT_KEYS, ...PREVIOUS_KEYS, ...CHANGE_ABS_KEYS, ...PERIOD_KEYS]
      const currentEntry = Object.entries(row).find(([k, v]) => {
        const lower = k.toLowerCase()
        return !excludeKeys.some((ex: string) => lower.includes(ex)) && !isNaN(Number(v)) && String(v).trim() !== ''
      })
      if (currentEntry) {
        const current = Number(currentEntry[1])
        changeAbs = current - prev
        if (prev !== 0) changePct = ((current - prev) / Math.abs(prev)) * 100
      }
    }
  }

  if (changePct === null && changeAbs === null) return null

  const periodField = findField(row, PERIOD_KEYS)
  if (periodField) periodLabel = String(periodField.value)

  const direction: 'up' | 'down' | 'neutral' =
    (changePct ?? changeAbs ?? 0) > 0 ? 'up' : (changePct ?? changeAbs ?? 0) < 0 ? 'down' : 'neutral'

  let label: string
  if (changePct !== null) {
    label = `${Math.abs(changePct).toFixed(1)}%`
  } else {
    label = Math.abs(changeAbs!).toLocaleString()
  }

  return { direction, label, periodLabel }
})

const kpiLabel = computed(() => {
  return specAsVega.value?.title || ''
})

const kpiContainerStyle = computed<Record<string, string>>(() => {
  return {
    backgroundColor: coloredChart.value.theme.backgroundColor,
  }
})

const kpiValueStyle = computed<Record<string, string>>(() => {
  return {
    color: coloredChart.value.theme.valueColor,
  }
})

const kpiMetaStyle = computed<Record<string, string>>(() => {
  return {
    color: coloredChart.value.theme.metaColor,
  }
})

async function renderChart() {
  await nextTick()
  if (isKpi.value) return
  if (!chartContainer.value || !props.spec) return

  error.value = null

  try {
    if (vegaView) {
      vegaView.finalize()
      vegaView = null
    }

    const base = specAsVega.value

    const hasProjection = !!(base as Record<string, unknown>).projection ||
      ((base as Record<string, unknown>).layer as unknown[])?.some?.(
        (l: unknown) => !!(l as Record<string, unknown>)?.projection,
      )

    const spec = JSON.parse(
      JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        ...base,
        ...(hasProjection
          ? { width: chartContainer.value?.clientWidth || 600, height: props.chartHeight || 400, autosize: 'none' }
          : { width: 'container', autosize: { type: 'fit', contains: 'padding' }, height: props.chartHeight || 250 }),
      }),
    )

    if (spec.mark?.type === 'text') {
      spec.mark = 'bar'
      if (spec.encoding?.text) delete spec.encoding.text
    }

    // Use SI-prefix (1k, 1M, 1B) instead of scientific notation for quantitative axes
    function applySIFormat(enc: Record<string, unknown>) {
      for (const ch of ['x', 'y']) {
        const e = enc[ch] as Record<string, unknown> | undefined
        if (e?.type === 'quantitative' && !e.format) {
          e.axis = { ...(e.axis as object), format: '~s' }
        }
      }
    }
    if (spec.encoding) applySIFormat(spec.encoding)
    if (Array.isArray(spec.layer)) {
      for (const layer of spec.layer) {
        if (layer.encoding) applySIFormat(layer.encoding)
      }
    }

    // Make bars thicker by reducing padding between them
    const mark = typeof spec.mark === 'string' ? spec.mark : spec.mark?.type
    if (mark === 'bar') {
      spec.encoding = spec.encoding || {}
      const bandAxis = spec.encoding.y?.type !== 'quantitative' ? 'y' : 'x'
      if (spec.encoding[bandAxis]) {
        spec.encoding[bandAxis].scale = { ...spec.encoding[bandAxis].scale, paddingInner: 0.15 }
      }
    }

    const embedPromise = embed(chartContainer.value, spec as TopLevelSpec, {
      actions: false,
      renderer: 'svg',
      ...props.options,
    })

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Chart render timed out (10s)')), 10000),
    )

    vegaView = (await Promise.race([embedPromise, timeoutPromise])) as Result
  } catch (err) {
    console.error('VegaChart render error:', err)
    error.value = err instanceof Error ? err.message : 'Failed to render chart'
  }
}

watch(() => props.spec, renderChart, { deep: true })
watch(() => props.colorConfig, renderChart, { deep: true })
watch(() => props.chartHeight, renderChart)
onMounted(() => renderChart())
onBeforeUnmount(() => {
  if (vegaView) vegaView.finalize()
})
</script>

<style scoped>
.vega-chart-container {
  width: 100%;
  overflow: hidden;
}
</style>
