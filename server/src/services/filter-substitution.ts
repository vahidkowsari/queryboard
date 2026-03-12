import type { ChartFilter } from '../types.js'

/**
 * Substitutes {{placeholder}} tokens in a SQL template with actual values.
 * Values are validated and escaped based on filter type.
 */
export function substituteFilters(
  sqlTemplate: string,
  filters: ChartFilter[],
  filterValues: Record<string, string>,
): string {
  let sql = sqlTemplate

  // Replace each filter placeholder with its formatted value
  for (const filter of filters) {
    // Use provided value or fall back to default
    const value = filterValues[filter.placeholder] ?? filter.defaultValue
    if (value === undefined || value === null) continue

    // Check if placeholder exists in SQL
    const token = `{{${filter.placeholder}}}`
    if (!sql.includes(token)) continue

    // Format value based on filter type and substitute
    const substituted = formatFilterValue(filter.type, value)
    sql = sql.replaceAll(token, substituted)
  }

  return sql
}

/**
 * Formats and validates a filter value based on its type
 * Handles dates, numbers, booleans, and string escaping
 */
function formatFilterValue(type: ChartFilter['type'], value: string): string {
  switch (type) {
    case 'date':
      // Validate date format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}/.test(value)) throw new Error(`Invalid date value: ${value}`)
      return escapeString(value)

    case 'select':
      return escapeString(value)

    case 'multi-select': {
      // Split comma-separated values and escape each
      const items = value.split(',').map((v) => v.trim()).filter(Boolean)
      if (items.length === 0) throw new Error('Multi-select filter requires at least one value')
      return items.map(escapeString).join(',')
    }

    case 'text':
      return escapeString(value)

    case 'number': {
      // Validate and return number without quotes
      const num = Number(value)
      if (isNaN(num)) throw new Error(`Invalid number value: ${value}`)
      return String(num)
    }

    case 'boolean':
      // Convert to SQL boolean
      return value === 'true' || value === '1' ? 'true' : 'false'

    default:
      return escapeString(value)
  }
}

/**
 * Escapes single quotes in strings and wraps in quotes for SQL safety
 */
function escapeString(value: string): string {
  const escaped = value.replace(/'/g, "''")
  return `'${escaped}'`
}

/**
 * Checks if a SQL template contains any {{placeholder}} tokens.
 */
export function hasFilterPlaceholders(sql: string): boolean {
  return /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/.test(sql)
}
