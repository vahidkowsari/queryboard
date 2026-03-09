import { eq, desc } from 'drizzle-orm'
import { projects } from '../db/schema.js'
import type { Db } from '../db/index.js'
import type { DbEngine, DbConfig, LLMConfig, ChartLibrary, ColorConfig, Schema } from '../types.js'

export function createProjectService(db: Db) {
  return {
    async list() {
      return db.select().from(projects).orderBy(desc(projects.updatedAt))
    },

    async getById(id: string) {
      const rows = await db.select().from(projects).where(eq(projects.id, id))
      return rows[0] || null
    },

    async create(
      name: string,
      dbEngine: DbEngine,
      dbConfig: DbConfig,
      description?: string,
      llmConfig?: LLMConfig,
      chartLibrary?: ChartLibrary,
      colorConfig?: ColorConfig,
    ) {
      const rows = await db
        .insert(projects)
        .values({
          name,
          description: description || null,
          dbEngine: dbEngine,
          dbConfig: dbConfig,
          llmConfig: llmConfig || null,
          chartLibrary: chartLibrary || 'vega-lite',
          colorConfig: colorConfig || null,
        })
        .returning()
      return rows[0]
    },

    async update(
      id: string,
      data: {
        name?: string
        description?: string
        dbEngine?: DbEngine
        dbConfig?: DbConfig
        llmConfig?: LLMConfig
        chartLibrary?: ChartLibrary
        colorConfig?: ColorConfig
      },
    ) {
      const set: Record<string, unknown> = { updatedAt: new Date() }

      if (data.name !== undefined) set.name = data.name
      if (data.description !== undefined) set.description = data.description || null
      if (data.dbEngine !== undefined) set.dbEngine = data.dbEngine
      if (data.dbConfig !== undefined) set.dbConfig = data.dbConfig
      if (data.llmConfig !== undefined) set.llmConfig = data.llmConfig
      if (data.chartLibrary !== undefined) set.chartLibrary = data.chartLibrary
      if (data.colorConfig !== undefined) set.colorConfig = data.colorConfig

      if (Object.keys(set).length === 1) return this.getById(id)

      const rows = await db.update(projects).set(set).where(eq(projects.id, id)).returning()
      return rows[0] || null
    },

    async updateSchemaCache(id: string, schema: Schema) {
      await db
        .update(projects)
        .set({
          schemaCache: schema,
          schemaDetectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
    },

    async remove(id: string) {
      const rows = await db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id })
      return rows.length > 0
    },
  }
}
