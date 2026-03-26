import { api, API_BASE_URL } from './api'
import type { DbEngine, DbConfig, LLMConfig, ChartLibrary, ColorConfig, SchemaJob } from '../types'

export interface ProjectRow {
  id: string
  name: string
  description: string | null
  dbEngine: DbEngine
  dbConfig: DbConfig
  llmConfig: LLMConfig | null
  chartLibrary: ChartLibrary | null
  colorConfig: ColorConfig | null
  showLlmDetails: boolean | null
  schemaDetectedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectPayload {
  name: string
  description?: string
  dbEngine: DbEngine
  dbConfig: DbConfig
  llmConfig?: LLMConfig
  chartLibrary?: ChartLibrary
  colorConfig?: ColorConfig
  showLlmDetails?: boolean
}

export const projectApi = {
  /**
   * Fetches all projects accessible to the current user
   */
  async list(): Promise<ProjectRow[]> {
    const { data } = await api.get('/projects')
    return data
  },

  /**
   * Fetches a specific project by ID
   */
  async getById(id: string): Promise<ProjectRow> {
    const { data } = await api.get(`/projects/${id}`)
    return data
  },

  /**
   * Creates a new project with database and LLM configuration
   */
  async create(payload: ProjectPayload): Promise<ProjectRow> {
    const { data } = await api.post('/projects', payload)
    return data
  },

  /**
   * Updates project configuration
   */
  async update(id: string, payload: Partial<ProjectPayload>): Promise<ProjectRow> {
    const { data } = await api.put(`/projects/${id}`, payload)
    return data
  },

  /**
   * Deletes a project and all its associated data
   */
  async remove(id: string): Promise<void> {
    await api.delete(`/projects/${id}`)
  },

  /**
   * Starts schema detection as a background job. Returns the job ID immediately.
   */
  async startSchemaDetection(projectId: string): Promise<{ jobId: string }> {
    const { data } = await api.post(`/projects/${projectId}/schema/detect`)
    return data
  },

  /**
   * Fetches the latest schema detection job for a project.
   */
  async getSchemaJob(projectId: string): Promise<SchemaJob | null> {
    const { data } = await api.get(`/projects/${projectId}/schema/job`)
    return data
  },

  /**
   * Streams live schema detection progress via SSE.
   * Sends current job state immediately, then streams updates until complete/error.
   * Returns a cancel function to close the connection early.
   */
  detectSchemaWithProgress(
    projectId: string,
    onProgress: (event: { phase: string; message: string; current?: number; total?: number }) => void,
    onComplete: () => void,
    onError: (message: string) => void,
  ): () => void {
    const es = new EventSource(`${API_BASE_URL}/api/projects/${projectId}/schema/detect`, {
      withCredentials: true,
    })

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.phase === 'complete') {
          onComplete()
          es.close()
        } else if (event.phase === 'error') {
          onError(event.message)
          es.close()
        } else {
          onProgress(event)
        }
      } catch {
        // ignore malformed events
      }
    }

    es.onerror = () => {
      // readyState 2 = CLOSED: connection permanently failed (not a transient reconnect)
      if (es.readyState === EventSource.CLOSED) {
        onError('Connection lost during schema detection')
        es.close()
      }
    }

    return () => es.close()
  },

  /**
   * Fetches the detected database schema
   */
  async getSchema(projectId: string): Promise<unknown> {
    const { data } = await api.get(`/projects/${projectId}/schema`)
    return data
  },

  /**
   * Tests the database connection for a project
   */
  async testConnection(id: string): Promise<{ success: boolean; error?: string }> {
    const project = await this.getById(id)
    const { data } = await api.post('/projects/test-connection', {
      dbEngine: project.dbEngine,
      dbConfig: project.dbConfig,
    })
    return data
  },

  /**
   * Exports a project with all its dashboards and charts
   */
  async exportProject(id: string): Promise<unknown> {
    const { data } = await api.get(`/projects/${id}/export`)
    return data
  },

  /**
   * Imports a previously exported project
   */
  async importProject(payload: unknown): Promise<ProjectRow> {
    const { data } = await api.post('/projects/import', payload)
    return data
  },

  /**
   * Returns {id, email}[] for all users who own conversations or created charts in this project.
   */
  async listUsers(projectId: string): Promise<{ id: string; email: string | null }[]> {
    const { data } = await api.get(`/projects/${projectId}/users`)
    return data
  },

  /**
   * Fetches the audit log for a project with optional filters
   */
  async getAuditLog(
    projectId: string,
    filter?: { action?: string; entityType?: string; userId?: string; from?: string; to?: string; limit?: number; offset?: number },
  ): Promise<{ rows: AuditLogRow[]; total: number }> {
    const { data } = await api.get(`/projects/${projectId}/audit-log`, { params: filter })
    return data
  },
}

export interface AuditLogRow {
  id: string
  projectId: string
  userId: string | null
  action: string
  entityType: string
  entityId: string | null
  entityName: string | null
  details: Record<string, unknown> | null
  createdAt: string
}
