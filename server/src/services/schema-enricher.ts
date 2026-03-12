import { askLLM } from './claude.service.js'
import type { Schema, LLMConfig, ProgressCallback } from '../types.js'

const BATCH_SIZE = 10
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000
const MAX_COLS_FOR_DESCRIPTION = 100

export interface EnrichmentResult {
  schema: Schema
  totalUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  vendor: string
  model: string
}

export async function enrichSchemaWithDescriptions(
  schema: Schema,
  llmConfig?: LLMConfig | null,
  onProgress?: ProgressCallback,
): Promise<EnrichmentResult> {
  const tableNames = Object.keys(schema.tables)
  const totalBatches = Math.ceil(tableNames.length / BATCH_SIZE)
  console.log(`Schema enrichment: Generating descriptions for ${tableNames.length} tables...`)

  const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  let vendor = ''
  let model = ''

  for (let i = 0; i < tableNames.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const batch = tableNames.slice(i, i + BATCH_SIZE)
    onProgress?.({ phase: 'enriching', message: `Enriching descriptions: batch ${batchNum}/${totalBatches}`, current: batchNum, total: totalBatches })
    const batchInfo = batch
      .map((t) => {
        const cols = schema.tables[t].columns
        if (cols.length > MAX_COLS_FOR_DESCRIPTION) {
          return `${t}: [${cols.length} columns — too many to list, provide table description only]`
        }
        return `${t}: ${cols.map((c) => `${c.name} (${c.type})`).join(', ')}`
      })
      .join('\n')

    const prompt = `You are a data expert. For each table below, provide:
1. A one-line table description
2. A short description for each column (skip columns section for tables marked as "too many to list")

Tables:
${batchInfo}

Return JSON in this exact format (no markdown, no backticks):
{
  "table_name": {
    "description": "one-line table description",
    "columns": {
      "column_name": "short column description"
    }
  }
}

Be concise. Each description should be under 15 words.
Return ONLY valid JSON.`

    let lastErr: unknown
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          onProgress?.({ phase: 'enriching', message: `Enriching descriptions: batch ${batchNum}/${totalBatches} (retry ${attempt - 1})`, current: batchNum, total: totalBatches })
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt - 1)))
        }

        const result = await askLLM(prompt, 4096, llmConfig)
        vendor = result.vendor
        model = result.model
        totalUsage.promptTokens += result.usage.promptTokens
        totalUsage.completionTokens += result.usage.completionTokens
        totalUsage.totalTokens += result.usage.totalTokens

        const rawText = result.text.trim()
        const json = rawText
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim()

        let descriptions: Record<string, { description?: string; columns?: Record<string, string> }>
        try {
          descriptions = JSON.parse(json)
        } catch (parseErr) {
          const preview = json.length > 500 ? `${json.slice(0, 500)}...[truncated, total ${json.length} chars]` : json
          console.error(`Schema enrichment: Batch ${batchNum} JSON parse failed. Raw response preview:\n${preview}`)
          throw parseErr
        }

        for (const table of batch) {
          const tableDesc = descriptions[table]
          if (!tableDesc) continue

          if (tableDesc.description) {
            schema.tables[table].description = tableDesc.description
          }
          if (tableDesc.columns) {
            for (const col of schema.tables[table].columns) {
              if (tableDesc.columns[col.name]) {
                col.description = tableDesc.columns[col.name]
              }
            }
          }
        }
        console.log(`Schema enrichment: Batch ${batchNum}/${totalBatches} done`)
        break
      } catch (err) {
        lastErr = err
        const msg = err instanceof Error ? err.message : String(err)
        const tables = batch.join(', ')
        if (attempt < MAX_RETRIES) {
          console.warn(`Schema enrichment: Batch ${batchNum} attempt ${attempt} failed [tables: ${tables}] - ${msg}, retrying...`)
        } else {
          console.warn(`Schema enrichment: Batch ${batchNum} failed after ${MAX_RETRIES} attempts [tables: ${tables}] - ${msg}`)
        }
      }
    }
  }

  return { schema, totalUsage, vendor, model }
}
