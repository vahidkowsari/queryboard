import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Schema, SchemaProvider, Column } from '../types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(__dirname, '..', '..', 'schema.json')

let cachedSchema: Schema | null = null

/**
 * Detects database schema using the provided schema provider
 * Caches schema to disk and memory for faster subsequent loads
 */
export async function detectSchema(provider: SchemaProvider, { force = false } = {}): Promise<Schema> {
  // Return cached schema if available and not forcing refresh
  if (cachedSchema && !force) return cachedSchema

  // Try to load from disk cache first
  if (!force && existsSync(SCHEMA_PATH)) {
    try {
      const raw = readFileSync(SCHEMA_PATH, 'utf-8')
      cachedSchema = JSON.parse(raw)
      console.log(`Schema: Loaded from ${SCHEMA_PATH} (detected ${cachedSchema!.detectedAt})`)
      return cachedSchema!
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`Schema: Failed to read ${SCHEMA_PATH}: ${msg}`)
    }
  }

  // Auto-detect schema from database
  console.log(`Schema: Auto-detecting via ${provider.name} provider...`)
  const schema = await provider.detectSchema()
  cachedSchema = schema

  // Save to disk for future loads
  try {
    writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2))
    console.log(`Schema: Saved to ${SCHEMA_PATH}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`Schema: Failed to save ${SCHEMA_PATH}: ${msg}`)
  }

  return schema
}

/**
 * Returns the currently cached schema without re-detection
 */
export function getSchema(): Schema | null {
  return cachedSchema
}

function formatColumnLine(c: Column, tableName: string): string {
  let line = `  ${c.name} (${c.type})`
  if (c.isPrimaryKey) line += ' PK'
  if (c.nullable === false) line += ' NOT NULL'
  if (c.isPartitionKey) line += ' [partition key — always filter on this column]'
  if (c.references) line += ` → ${c.references.table}.${c.references.column}`
  if (c.sampleValues && c.sampleValues.length > 0) line += ` — sample: ${c.sampleValues.join(', ')}`
  if (c.description) line += ` — ${c.description}`
  return line
}

/**
 * Converts schema to a formatted prompt string for LLM agents
 * Includes table/column descriptions and SQL safety rules
 */
export function schemaToPrompt(schema: Schema | null, rules = ''): string {
  if (!schema) return 'No schema available.'

  // Build formatted schema description for LLM
  let prompt = `Database: ${schema.database} (${schema.engine || 'unknown'})\n\nAvailable tables and columns:\n\n`

  // Collect all FK relationships across all tables
  const relationships: string[] = []

  for (const [table, info] of Object.entries(schema.tables)) {
    const tableDesc = info.description ? ` — ${info.description}` : ''
    const viewTag = info.isView ? ' [view]' : ''
    prompt += `${table}${tableDesc}${viewTag}\n`
    for (const c of info.columns) {
      prompt += formatColumnLine(c, table) + '\n'
      if (c.references) {
        relationships.push(`  ${table}.${c.name} → ${c.references.table}.${c.references.column}`)
      }
    }
    prompt += '\n'
  }

  if (relationships.length > 0) {
    prompt += `Relationships:\n${relationships.join('\n')}\n\n`
  }

  // Add safety rules to prevent LLM hallucination
  prompt += `IMPORTANT RULES:
- ONLY use the tables and columns listed above. Do NOT invent or guess column names.
- If a column you need does not exist, use the closest available column or explain the limitation.
- When joining, double-check that the column you reference actually belongs to the table alias you use. Verify against the column lists above.
- Always use LIMIT to avoid scanning too much data.`

  // Append database-specific SQL rules if provided
  if (rules) prompt += '\n' + rules

  return prompt
}

/**
 * Returns a list of table names with their descriptions
 */
export function tableNamesWithDescriptions(schema: Schema): string {
  return Object.entries(schema.tables)
    .map(([name, info]) => (info.description ? `${name} — ${info.description}` : name))
    .join('\n')
}

/**
 * Converts a subset of tables to a formatted prompt string for LLM agents
 * Used when only specific tables are relevant to a query
 */
export function selectedTablesToPrompt(schema: Schema, tables: string[], rules = ''): string {
  let prompt = `Database: ${schema.database} (${schema.engine})\n\nRelevant tables and columns:\n\n`

  // Collect FK relationships for the selected tables
  const relationships: string[] = []

  for (const table of tables) {
    const info = schema.tables[table]
    if (!info) continue
    const tableDesc = info.description ? ` — ${info.description}` : ''
    const viewTag = info.isView ? ' [view]' : ''
    prompt += `${table}${tableDesc}${viewTag}\n`
    for (const c of info.columns) {
      prompt += formatColumnLine(c, table) + '\n'
      if (c.references) {
        relationships.push(`  ${table}.${c.name} → ${c.references.table}.${c.references.column}`)
      }
    }
    prompt += '\n'
  }

  if (relationships.length > 0) {
    prompt += `Relationships:\n${relationships.join('\n')}\n\n`
  }

  prompt += `IMPORTANT RULES:\n- ONLY use the tables and columns listed above. Do NOT invent or guess column names.\n- When joining, double-check that the column you reference actually belongs to the table alias you use.\n- Always use LIMIT to avoid scanning too much data.`
  if (rules) prompt += '\n' + rules
  return prompt
}
