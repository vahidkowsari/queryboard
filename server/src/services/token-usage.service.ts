import { eq, desc, sql, and, gte } from 'drizzle-orm'
import { tokenUsage } from '../db/schema.js'
import type { Db } from '../db/index.js'
import type { TokenUsageRecord, TokenUsageSummary } from '../types.js'
import { estimateCost } from './token-costs.js'

export function createTokenUsageService(db: Db) {
  return {
    /**
     * Records LLM token usage with estimated cost
     */
    async record(data: TokenUsageRecord) {
      const cost = data.estimatedCost ?? String(estimateCost(data.model, data.promptTokens, data.completionTokens))
      await db.insert(tokenUsage).values({
        projectId: data.projectId,
        chartId: data.chartId?.trim() || null,
        vendor: data.vendor,
        model: data.model,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens: data.totalTokens,
        estimatedCost: cost,
        operation: data.operation,
      })
    },

    /**
     * Fetches paginated token usage records for a project
     */
    async getByProject(projectId: string, limit = 50, offset = 0) {
      return db
        .select()
        .from(tokenUsage)
        .where(eq(tokenUsage.projectId, projectId))
        .orderBy(desc(tokenUsage.createdAt))
        .limit(limit)
        .offset(offset)
    },

    /**
     * Generates aggregated token usage summary with breakdowns by model and operation
     */
    async getSummary(projectId: string, sinceDays?: number): Promise<TokenUsageSummary> {
      const conditions = [eq(tokenUsage.projectId, projectId)]
      if (sinceDays) {
        const since = new Date(Date.now() - sinceDays * 86400000)
        conditions.push(gte(tokenUsage.createdAt, since))
      }
      const where = and(...conditions)

      const [totals] = await db
        .select({
          totalPromptTokens: sql<number>`COALESCE(SUM(${tokenUsage.promptTokens}), 0)::int`,
          totalCompletionTokens: sql<number>`COALESCE(SUM(${tokenUsage.completionTokens}), 0)::int`,
          totalTokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)::int`,
          totalEstimatedCost: sql<number>`COALESCE(SUM(${tokenUsage.estimatedCost}::numeric), 0)::float`,
        })
        .from(tokenUsage)
        .where(where)

      const byModel = await db
        .select({
          model: tokenUsage.model,
          vendor: tokenUsage.vendor,
          totalTokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)::int`,
          estimatedCost: sql<number>`COALESCE(SUM(${tokenUsage.estimatedCost}::numeric), 0)::float`,
        })
        .from(tokenUsage)
        .where(where)
        .groupBy(tokenUsage.model, tokenUsage.vendor)

      const byOperation = await db
        .select({
          operation: tokenUsage.operation,
          totalTokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)::int`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(tokenUsage)
        .where(where)
        .groupBy(tokenUsage.operation)

      return {
        totalPromptTokens: totals?.totalPromptTokens ?? 0,
        totalCompletionTokens: totals?.totalCompletionTokens ?? 0,
        totalTokens: totals?.totalTokens ?? 0,
        totalEstimatedCost: totals?.totalEstimatedCost ?? 0,
        byModel,
        byOperation,
      }
    },
  }
}
