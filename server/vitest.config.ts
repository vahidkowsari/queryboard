import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    // Run tests sequentially to avoid database conflicts
    fileParallelism: false,
    // Increase timeout for database operations
    testTimeout: 10000,
  },
})
