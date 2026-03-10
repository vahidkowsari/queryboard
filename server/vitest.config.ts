import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Run tests sequentially to avoid database conflicts
    fileParallelism: false,
    // Increase timeout for database operations
    testTimeout: 10000,
  },
})
