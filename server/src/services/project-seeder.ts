import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { isNull } from 'drizzle-orm'
import { createProjectService } from './project.service.js'
import { dashboards } from '../db/schema.js'
import type { Db } from '../db/index.js'
import type { DbEngine, DbConfig } from '../types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = join(__dirname, '..', '..', 'projects.config.json')

interface ProjectSeed {
  name: string
  description?: string
  dbEngine: DbEngine
  dbConfig: DbConfig
}

/**
 * Seeds initial projects from a projects.config.json file if no projects exist
 * Useful for demo/development environments
 */
export async function seedProjectsFromConfig(db: Db): Promise<void> {
  const projectService = createProjectService(db)
  const existing = await projectService.list()

  if (existing.length > 0) {
    console.log(`Projects: ${existing.length} project(s) already exist, skipping seed`)
    return
  }

  if (!existsSync(CONFIG_PATH)) {
    console.log(`Projects: No config file at ${CONFIG_PATH}, skipping seed`)
    return
  }

  let seeds: ProjectSeed[]
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    seeds = JSON.parse(raw)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Projects: Failed to read ${CONFIG_PATH}: ${msg}`)
    return
  }

  if (!Array.isArray(seeds) || seeds.length === 0) {
    console.log('Projects: Config file is empty, skipping seed')
    return
  }

  for (const seed of seeds) {
    try {
      const project = await projectService.create(seed.name, seed.dbEngine, seed.dbConfig, seed.description)
      console.log(`Projects: Seeded "${seed.name}" (${project.id})`)

      // Assign any orphaned dashboards to the first seeded project
      await db.update(dashboards).set({ projectId: project.id }).where(isNull(dashboards.projectId))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Projects: Failed to seed "${seed.name}": ${msg}`)
    }
  }
}
