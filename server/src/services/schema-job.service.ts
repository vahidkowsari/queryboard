import { eq, desc } from 'drizzle-orm'
import { schemaJobs } from '../db/schema.js'
import type { Db } from '../db/index.js'
import type { SchemaProgressEvent } from '../types.js'

export type JobStatus = 'pending' | 'running' | 'complete' | 'error'

export interface SchemaJob {
  id: string
  projectId: string
  status: JobStatus
  phase: string | null
  message: string | null
  current: number | null
  total: number | null
  errorMessage: string | null
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
}

export function createSchemaJobService(db: Db) {
  async function create(projectId: string): Promise<SchemaJob> {
    const [job] = await db
      .insert(schemaJobs)
      .values({ projectId, status: 'running', startedAt: new Date() })
      .returning()
    return job as SchemaJob
  }

  async function updateProgress(id: string, event: SchemaProgressEvent): Promise<void> {
    if (event.phase === 'complete') {
      await db
        .update(schemaJobs)
        .set({ status: 'complete', phase: event.phase, message: event.message, completedAt: new Date() })
        .where(eq(schemaJobs.id, id))
    } else if (event.phase === 'error') {
      await db
        .update(schemaJobs)
        .set({ status: 'error', phase: event.phase, errorMessage: event.message, completedAt: new Date() })
        .where(eq(schemaJobs.id, id))
    } else {
      await db
        .update(schemaJobs)
        .set({
          phase: event.phase,
          message: event.message,
          current: event.current ?? null,
          total: event.total ?? null,
        })
        .where(eq(schemaJobs.id, id))
    }
  }

  async function getLatestForProject(projectId: string): Promise<SchemaJob | null> {
    const [job] = await db
      .select()
      .from(schemaJobs)
      .where(eq(schemaJobs.projectId, projectId))
      .orderBy(desc(schemaJobs.createdAt))
      .limit(1)
    return (job as SchemaJob) ?? null
  }

  async function hasRunningJob(projectId: string): Promise<boolean> {
    const job = await getLatestForProject(projectId)
    return job?.status === 'running'
  }

  return { create, updateProgress, getLatestForProject, hasRunningJob }
}
