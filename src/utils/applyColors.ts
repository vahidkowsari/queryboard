import type { VegaSpec, ColorConfig } from '../types'

/**
 * Apply a project's color config to a Vega-Lite spec.
 * Returns a new spec with the colors injected (does not mutate the original).
 */
export function applyProjectColors(spec: VegaSpec, colors: ColorConfig): VegaSpec {
  const clone: VegaSpec = JSON.parse(JSON.stringify(spec))
  const existingConfig = (clone.config as Record<string, unknown>) || {}

  if (colors.palette?.length) {
    // Always set config-level range for multi-series charts
    clone.config = {
      ...existingConfig,
      range: { category: colors.palette },
    }

    if (clone.encoding?.color) {
      // Multi-series: override the color scale range
      clone.encoding.color = {
        ...clone.encoding.color,
        scale: { range: colors.palette },
      }
    }

    // Always set color on the mark for single-series / solid color
    if (typeof clone.mark === 'string') {
      clone.mark = { type: clone.mark, color: colors.palette[0] }
    } else if (clone.mark && typeof clone.mark === 'object') {
      clone.mark = { ...clone.mark, color: colors.palette[0] }
    }
  }

  if (colors.background) {
    clone.background = colors.background
  }

  if (colors.textColor) {
    const cfg = (clone.config as Record<string, unknown>) || {}
    clone.config = {
      ...cfg,
      axis: { labelColor: colors.textColor, titleColor: colors.textColor },
      legend: { labelColor: colors.textColor, titleColor: colors.textColor },
      title: { color: colors.textColor },
    }
  }

  return clone
}
