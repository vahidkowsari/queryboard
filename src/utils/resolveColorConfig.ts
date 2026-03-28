import type { ColorConfig } from '../types'

function hasColorValues(config?: ColorConfig | null): boolean {
  return !!(config && (config.palette?.length || config.background || config.textColor))
}

function normalizeColorConfig(config?: ColorConfig | null): ColorConfig | undefined {
  if (!hasColorValues(config)) return undefined

  return {
    palette: config?.palette || [],
    ...(config?.background ? { background: config.background } : {}),
    ...(config?.textColor ? { textColor: config.textColor } : {}),
  }
}

interface ResolveColorConfigParams {
  chartColorConfig?: ColorConfig | null
  projectColorConfig?: ColorConfig | null
  paletteOverride?: string[]
}

export function resolveEffectiveColorConfig({
  chartColorConfig,
  projectColorConfig,
  paletteOverride,
}: ResolveColorConfigParams): ColorConfig | undefined {
  const base = normalizeColorConfig(chartColorConfig) || normalizeColorConfig(projectColorConfig)

  if (!base && !(paletteOverride?.length)) return undefined

  if (paletteOverride?.length) {
    return {
      palette: [...paletteOverride],
      ...(base?.background ? { background: base.background } : {}),
      ...(base?.textColor ? { textColor: base.textColor } : {}),
    }
  }

  return base
}
