import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Run tests sequentially to avoid database conflicts
    fileParallelism: false,
    // Increase timeout for database operations
    testTimeout: 10000,
    // Only run TypeScript sources under src/ — never the compiled copies in
    // dist/, which are stale build artifacts that would double-run the suite.
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
