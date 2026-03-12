import { api, API_BASE_URL } from './api'
import type { DbEngine, DbConfig, LLMConfig, ChartLibrary, ColorConfig } from '../types'

export interface ProjectRow {
  id: string
  name: string
  description: string | null
  dbEngine: DbEngine
  dbConfig: DbConfig
  llmConfig: LLMConfig | null
  chartLibrary: ChartLibrary | null
  colorConfig: ColorConfig | null
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
   * Triggers database schema detection for the project (non-streaming)
   */
  async detectSchema(projectId: string): Promise<unknown> {
    const { data } = await api.post(`/projects/${projectId}/schema`)
    return data
  },

  /**
   * Triggers schema detection and streams progress events via SSE.
   * Calls onProgress for each event, onComplete on success, onError on failure/timeout.
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
    const { data } = await api.post(`/projects/${id}/test-connection`)
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
}
