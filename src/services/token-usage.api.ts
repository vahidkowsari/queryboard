import { api } from './api'

export interface TokenUsageRow {
  id: string
  projectId: string
  chartId: string | null
  vendor: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: string | null
  operation: string
  createdAt: string
}

export interface TokenUsageSummary {
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  totalEstimatedCost: number
  byModel: { model: string; vendor: string; totalTokens: number; estimatedCost: number }[]
  byOperation: { operation: string; totalTokens: number; count: number }[]
}

export const tokenUsageApi = {
  /**
   * Fetches paginated token usage records for a project
   */
  async getByProject(projectId: string, limit = 50, offset = 0): Promise<TokenUsageRow[]> {
    const { data } = await api.get(`/projects/${projectId}/token-usage`, { params: { limit, offset } })
    return data
  },

  /**
   * Fetches aggregated token usage summary with breakdowns by model and operation
   */
  async getSummary(projectId: string, days?: number): Promise<TokenUsageSummary> {
    const params: Record<string, number> = {}
    if (days) params.days = days
    const { data } = await api.get(`/projects/${projectId}/token-usage/summary`, { params })
    return data
  },
}
