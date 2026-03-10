// Global config that will be set after async loading from config-loader
// This is set in index.ts after loadConfig() completes
export let config: Awaited<ReturnType<typeof import('./config-loader.js').loadConfig>>

// Function to set the config (called from index.ts)
export function setConfig(loadedConfig: typeof config) {
  config = loadedConfig
}
