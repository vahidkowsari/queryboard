import type { ChartDataRow } from '../types'

function getChartData(chart: { data?: ChartDataRow[]; chartSpec?: Record<string, unknown> }): ChartDataRow[] {
  if (chart.data?.length) return chart.data
  const spec = chart.chartSpec as { data?: { values?: ChartDataRow[] } } | undefined
  if (spec?.data?.values) return spec.data.values
  return []
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50)
}

export function exportCsv(chart: { name: string; data?: ChartDataRow[]; chartSpec?: Record<string, unknown> }) {
  const rows = getChartData(chart)
  if (!rows.length) return

  const columns = Object.keys(rows[0]!)
  const header = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')
  const body = rows.map((row) =>
    columns
      .map((c) => {
        const val = row[c] ?? ''
        return `"${String(val).replace(/"/g, '""')}"`
      })
      .join(','),
  )

  const csv = [header, ...body].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `${sanitizeName(chart.name)}.csv`)
}

export async function exportExcel(chart: { name: string; data?: ChartDataRow[]; chartSpec?: Record<string, unknown> }) {
  const rows = getChartData(chart)
  if (!rows.length) return

  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  downloadBlob(blob, `${sanitizeName(chart.name)}.xlsx`)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
