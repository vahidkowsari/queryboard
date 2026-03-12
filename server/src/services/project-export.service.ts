import { eq, asc } from 'drizzle-orm'
import { projects, dashboards, charts } from '../db/schema.js'
import type { Db } from '../db/index.js'

export interface ExportedChart {
  name: string
  userQuery: string | null
  description: string | null
  query: string
  chartType: string | null
  chartSpec: unknown
  data: unknown
  colorConfig: unknown
  filters: unknown
  position: number
}

export interface ExportedDashboard {
  name: string
  description: string | null
  charts: ExportedChart[]
}

export interface ProjectExport {
  version: 1
  exportedAt: string
  project: {
    name: string
    description: string | null
    dbEngine: string
    dbConfig: unknown
    llmConfig: unknown
    chartLibrary: string | null
    colorConfig: unknown
    schemaCache: unknown
  }
  dashboards: ExportedDashboard[]
}

export function createProjectExportService(db: Db) {
  return {
    /**
     * Exports a complete project including all dashboards and charts
     */
    async exportProject(projectId: string): Promise<ProjectExport | null> {
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
      if (!project) return null

      const dashboardRows = await db
        .select()
        .from(dashboards)
        .where(eq(dashboards.projectId, projectId))
        .orderBy(asc(dashboards.createdAt))

      const exportedDashboards: ExportedDashboard[] = []

      for (const dash of dashboardRows) {
        const chartRows = await db
          .select()
          .from(charts)
          .where(eq(charts.dashboardId, dash.id))
          .orderBy(asc(charts.position), asc(charts.createdAt))

        exportedDashboards.push({
          name: dash.name,
          description: dash.description,
          charts: chartRows.map((c) => ({
            name: c.name,
            userQuery: c.userQuery,
            description: c.description,
            query: c.query,
            chartType: c.chartType,
            chartSpec: c.chartSpec,
            data: c.data,
            colorConfig: c.colorConfig,
            filters: c.filters,
            position: c.position,
          })),
        })
      }

      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        project: {
          name: project.name,
          description: project.description,
          dbEngine: project.dbEngine,
          dbConfig: project.dbConfig,
          llmConfig: project.llmConfig,
          chartLibrary: project.chartLibrary,
          colorConfig: project.colorConfig,
          schemaCache: project.schemaCache,
        },
        dashboards: exportedDashboards,
      }
    },

    /**
     * Imports a previously exported project with all its dashboards and charts
     * Returns the new project ID
     */
    async importProject(data: ProjectExport): Promise<string> {
      return db.transaction(async (tx) => {
        const [project] = await tx
          .insert(projects)
          .values({
            name: data.project.name,
            description: data.project.description,
            dbEngine: data.project.dbEngine,
            dbConfig: data.project.dbConfig ?? {},
            llmConfig: data.project.llmConfig ?? null,
            chartLibrary: data.project.chartLibrary ?? 'vega-lite',
            colorConfig: data.project.colorConfig ?? null,
            schemaCache: data.project.schemaCache ?? null,
            schemaDetectedAt: data.project.schemaCache ? new Date() : null,
          })
          .returning()

        for (const dash of data.dashboards) {
          const [dashboard] = await tx
            .insert(dashboards)
            .values({
              projectId: project.id,
              name: dash.name,
              description: dash.description,
            })
            .returning()

          for (const chart of dash.charts) {
            await tx.insert(charts).values({
              dashboardId: dashboard.id,
              name: chart.name,
              userQuery: chart.userQuery,
              description: chart.description,
              query: chart.query,
              chartType: chart.chartType ?? 'auto',
              chartSpec: chart.chartSpec ?? null,
              data: chart.data ?? null,
              colorConfig: chart.colorConfig ?? null,
              filters: chart.filters ?? null,
              position: chart.position,
            })
          }
        }

        return project.id
      })
    },
  }
}
