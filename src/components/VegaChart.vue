<template>
  <div class="vega-chart-container">
    <div v-if="isKpi" class="flex flex-col items-center justify-center h-48 bg-muted/30 rounded-lg border">
      <div class="text-5xl font-bold text-primary">{{ kpiValue }}</div>
      <div v-if="kpiLabel" class="text-sm text-muted-foreground mt-2">{{ kpiLabel }}</div>
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
import { applyProjectColors } from '../utils/applyColors'

interface Props {
  spec: VegaSpec
  colorConfig?: ColorConfig
  options?: EmbedOptions
  chartHeight?: number
}

const props = defineProps<Props>()

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

const specAsVega = computed(() => props.spec)

const isKpi = computed(() => {
  const s = specAsVega.value
  if (!s) return false
  const mark = typeof s.mark === 'string' ? s.mark : s.mark?.type
  const dataLen = s.data?.values?.length ?? 0
  if (mark === 'text' && dataLen <= 2) return true
  return false
})

const kpiValue = computed(() => {
  const values = specAsVega.value?.data?.values
  if (!values?.length) return ''
  const row = values[0]
  if (!row) return ''
  const vals = Object.values(row)
  const numVal = vals.find((v) => !isNaN(Number(v)))
  return numVal ? Number(numVal).toLocaleString() : vals[0]
})

const kpiLabel = computed(() => {
  return specAsVega.value?.title || ''
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

    let base = props.spec
    if (props.colorConfig?.palette?.length) {
      base = applyProjectColors(base, props.colorConfig)
    }

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
