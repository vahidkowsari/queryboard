export const config = {
  appName: 'QueryBoard',

  apiBaseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  apiDomain: import.meta.env.VITE_API_DOMAIN || 'http://localhost:3001',

  idleTimeoutMs: 15 * 60 * 1000, // 15 minutes
  copyFeedbackMs: 2000,
  dataPreviewMaxRows: 100,
} as const
