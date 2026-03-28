import type { VegaSpec, ColorConfig } from '../types'

export interface ChartColorTheme {
  backgroundColor: string
  valueColor: string
  metaColor: string
}

export interface ColoredChartResult {
  spec: VegaSpec
  theme: ChartColorTheme
}

function getChartColorTheme(colors?: ColorConfig): ChartColorTheme {
  return {
    backgroundColor: colors?.background || 'hsl(var(--muted) / 0.3)',
    valueColor: colors?.textColor || colors?.palette?.[0] || 'hsl(var(--primary))',
    metaColor: colors?.textColor || 'hsl(var(--muted-foreground))',
  }
}

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

    const applyPaletteToNode = (node: unknown): void => {
      if (!node || typeof node !== 'object') return

      const obj = node as Record<string, unknown>

      const encoding = obj.encoding as Record<string, unknown> | undefined
      const mark = obj.mark
      const markType = typeof mark === 'string'
        ? mark
        : ((mark as Record<string, unknown> | undefined)?.type as string | undefined)

      const applyChannel = (channelName: 'color' | 'fill') => {
        if (!encoding) return
        const channel = encoding[channelName] as Record<string, unknown> | undefined
        if (!channel || typeof channel !== 'object') return

        const hasFieldBasedColor =
          typeof channel.field === 'string' ||
          typeof channel.datum === 'string' ||
          typeof channel.value === 'undefined'

        if (hasFieldBasedColor) {
          const existingScale = (channel.scale as Record<string, unknown> | undefined) || {}
          encoding[channelName] = {
            ...channel,
            scale: { ...existingScale, range: colors.palette },
          }
          return
        }

        encoding[channelName] = {
          ...channel,
          value: colors.palette[0],
        }
      }

      applyChannel('color')
      applyChannel('fill')

      const hasColorChannel = !!(encoding && (encoding.color || encoding.fill))

      const findCategoricalEncoding = () => {
        if (!encoding) return null

        const candidateChannels =
          markType === 'line' || markType === 'area'
            ? ['detail', 'stroke', 'shape', 'column', 'row']
            : ['x', 'y', 'theta', 'detail', 'column', 'row']

        for (const channelName of candidateChannels) {
          const channel = encoding[channelName] as Record<string, unknown> | undefined
          if (!channel) continue
          const channelField = channel.field
          const channelType = channel.type
          const isCategorical = channelType === 'nominal' || channelType === 'ordinal'
          if (typeof channelField === 'string' && isCategorical) {
            return { field: channelField, type: channelType }
          }
        }

        return null
      }

      if (!hasColorChannel && encoding) {
        const categoricalEncoding = findCategoricalEncoding()
        if (categoricalEncoding) {
          encoding.color = {
            field: categoricalEncoding.field,
            type: categoricalEncoding.type,
            scale: { range: colors.palette },
            legend: null,
          }
        }
      }

      const hasInferredColorChannel = !!(encoding && (encoding.color || encoding.fill))
      if (!hasInferredColorChannel) {
        if (typeof mark === 'string') {
          obj.mark = { type: mark, color: colors.palette[0] }
        } else if (mark && typeof mark === 'object') {
          obj.mark = { ...(mark as Record<string, unknown>), color: colors.palette[0] }
        }
      }

      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          for (const item of value) applyPaletteToNode(item)
        } else if (value && typeof value === 'object') {
          applyPaletteToNode(value)
        }
      }
    }

    applyPaletteToNode(clone)
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

export function applyChartColors(spec: VegaSpec, colors?: ColorConfig): ColoredChartResult {
  return {
    spec: colors ? applyProjectColors(spec, colors) : spec,
    theme: getChartColorTheme(colors),
  }
}
