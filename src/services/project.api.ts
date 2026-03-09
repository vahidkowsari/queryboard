import { api } from './api'
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
  async list(): Promise<ProjectRow[]> {
    const { data } = await api.get('/projects')
    return data
  },

  async getById(id: string): Promise<ProjectRow> {
    const { data } = await api.get(`/projects/${id}`)
    return data
  },

  async create(payload: ProjectPayload): Promise<ProjectRow> {
    const { data } = await api.post('/projects', payload)
    return data
  },

  async update(id: string, payload: Partial<ProjectPayload>): Promise<ProjectRow> {
    const { data } = await api.put(`/projects/${id}`, payload)
    return data
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/projects/${id}`)
  },

  async detectSchema(projectId: string): Promise<unknown> {
    const { data } = await api.post(`/projects/${projectId}/schema`)
    return data
  },

  async getSchema(projectId: string): Promise<unknown> {
    const { data } = await api.get(`/projects/${projectId}/schema`)
    return data
  },

  async testConnection(id: string): Promise<{ success: boolean; error?: string }> {
    const { data } = await api.post(`/projects/${id}/test-connection`)
    return data
  },

  async exportProject(id: string): Promise<unknown> {
    const { data } = await api.get(`/projects/${id}/export`)
    return data
  },

  async importProject(payload: unknown): Promise<ProjectRow> {
    const { data } = await api.post('/projects/import', payload)
    return data
  },
}
