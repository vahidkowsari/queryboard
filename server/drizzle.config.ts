import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './migrations',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'charting',
    user: process.env.DB_USER || 'charting',
    password: process.env.DB_PASSWORD || 'charting_dev',
    ssl: false,
  },
})
