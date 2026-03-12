import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { projectApi } from '../services/project.api'
import type { SchemaJob } from '../types'

export const useSchemaJobStore = defineStore('schema-job', () => {
  // Per-project job state
  const jobs = ref<Record<string, SchemaJob | null>>({})
  // Active SSE close functions
  const sseClosers = new Map<string, () => void>()

  function getJob(projectId: string): SchemaJob | null {
    return jobs.value[projectId] ?? null
  }

  const hasRunningJob = computed(() => {
    return Object.values(jobs.value).some((j) => j?.status === 'running')
  })

  function isRunning(projectId: string): boolean {
    return jobs.value[projectId]?.status === 'running'
  }

  async function fetchJob(projectId: string): Promise<SchemaJob | null> {
    const job = await projectApi.getSchemaJob(projectId)
    jobs.value[projectId] = job
    return job
  }

  async function startDetection(projectId: string): Promise<void> {
    const { jobId } = await projectApi.startSchemaDetection(projectId)

    jobs.value[projectId] = {
      id: jobId,
      projectId,
      status: 'running',
      phase: null,
      message: 'Starting...',
      current: null,
      total: null,
      errorMessage: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      createdAt: new Date().toISOString(),
    }

    connectSSE(projectId)
  }

  function connectSSE(projectId: string) {
    sseClosers.get(projectId)?.()

    const cancel = projectApi.detectSchemaWithProgress(
      projectId,
      (event) => {
        const existing = jobs.value[projectId]
        if (existing) {
          jobs.value[projectId] = {
            ...existing,
            phase: event.phase ?? null,
            message: event.message ?? null,
            current: event.current ?? null,
            total: event.total ?? null,
          }
        }
      },
      () => {
        const existing = jobs.value[projectId]
        if (existing) {
          jobs.value[projectId] = { ...existing, status: 'complete', message: 'Schema detection complete!' }
        }
        sseClosers.delete(projectId)
      },
      (message) => {
        const existing = jobs.value[projectId]
        if (existing) {
          jobs.value[projectId] = { ...existing, status: 'error', errorMessage: message }
        }
        sseClosers.delete(projectId)
      },
    )

    sseClosers.set(projectId, cancel)
  }

  function disconnectSSE(projectId: string) {
    sseClosers.get(projectId)?.()
    sseClosers.delete(projectId)
  }

  return { jobs, hasRunningJob, getJob, isRunning, fetchJob, startDetection, connectSSE, disconnectSSE }
})
