import type { ChartType, VegaSpec } from '../types'

type MarkDef = VegaSpec['mark']

const MARK_MAP: Record<Exclude<ChartType, 'auto' | 'table'>, MarkDef> = {
  bar: 'bar',
  line: { type: 'line', point: true },
  area: { type: 'area', line: true, opacity: 0.6 },
  pie: { type: 'arc' },
  scatter: { type: 'point', filled: true },
  kpi: { type: 'text', fontSize: 64, fontWeight: 'bold' },
}

export function transformChartType(spec: VegaSpec, targetType: ChartType): VegaSpec {
  if (targetType === 'auto') return spec

  const clone: VegaSpec = JSON.parse(JSON.stringify(spec))

  if (targetType === 'pie') return transformToPie(clone)
  if (targetType === 'kpi') return transformToKpi(clone)
  if (targetType === 'table') return clone

  // For bar/line/area/scatter, swap the mark and keep encodings
  // If coming from pie, restore x/y from theta/color
  const markType = typeof clone.mark === 'string' ? clone.mark : clone.mark?.type
  if (markType === 'arc' || clone.encoding?.theta) {
    return transformFromPie(clone, targetType)
  }

  clone.mark = MARK_MAP[targetType]
  return clone
}

function transformToPie(spec: VegaSpec): VegaSpec {
  const enc = spec.encoding || {}
  const yField = enc.y?.field || enc.theta?.field
  const xField = enc.x?.field || enc.color?.field

  if (!yField || !xField) {
    spec.mark = MARK_MAP.pie
    return spec
  }

  spec.mark = MARK_MAP.pie
  spec.encoding = {
    theta: { field: yField, type: 'quantitative' },
    color: { field: xField, type: 'nominal' },
  }
  delete spec.width
  spec.height = 400
  return spec
}

function transformToKpi(spec: VegaSpec): VegaSpec {
  const enc = spec.encoding || {}
  const valueField = enc.y?.field || enc.theta?.field || enc.text?.field

  if (!valueField) {
    spec.mark = MARK_MAP.kpi
    return spec
  }

  spec.mark = MARK_MAP.kpi
  spec.encoding = {
    text: { field: valueField, type: 'quantitative', aggregate: 'sum' },
  }
  spec.width = 'container'
  spec.height = 200
  return spec
}

function transformFromPie(spec: VegaSpec, targetType: Exclude<ChartType, 'auto' | 'pie' | 'kpi' | 'table'>): VegaSpec {
  const enc = spec.encoding || {}
  const valueField = enc.theta?.field
  const categoryField = enc.color?.field

  if (!valueField || !categoryField) {
    spec.mark = MARK_MAP[targetType]
    return spec
  }

  spec.mark = MARK_MAP[targetType]
  spec.encoding = {
    x: { field: categoryField, type: 'nominal' },
    y: { field: valueField, type: 'quantitative' },
  }
  spec.width = 'container'
  spec.height = 400
  return spec
}

export const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'kpi', label: 'KPI' },
  { value: 'table', label: 'Table' },
]
