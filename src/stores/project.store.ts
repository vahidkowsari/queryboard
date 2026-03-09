import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Project } from '../types'
import { projectApi } from '../services/project.api'
import type { ProjectRow } from '../services/project.api'

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    dbEngine: row.dbEngine,
    dbConfig: row.dbConfig,
    llmConfig: row.llmConfig || undefined,
    chartLibrary: row.chartLibrary || undefined,
    colorConfig: row.colorConfig || undefined,
    schemaDetectedAt: row.schemaDetectedAt ? new Date(row.schemaDetectedAt) : undefined,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const loading = ref(false)

  async function fetchProjects(): Promise<void> {
    loading.value = true
    try {
      const rows = await projectApi.list()
      projects.value = rows.map(rowToProject)
    } catch (err) {
      console.warn('Failed to fetch projects:', err)
    } finally {
      loading.value = false
    }
  }

  async function loadProject(id: string): Promise<Project | null> {
    const row = await projectApi.getById(id)
    const project = rowToProject(row)
    const index = projects.value.findIndex((p) => p.id === id)
    if (index !== -1) {
      projects.value[index] = project
    } else {
      projects.value.push(project)
    }
    currentProject.value = project
    return project
  }

  async function createProject(payload: Parameters<typeof projectApi.create>[0]): Promise<Project> {
    const row = await projectApi.create(payload)
    const project = rowToProject(row)
    projects.value.push(project)
    return project
  }

  async function updateProject(id: string, payload: Parameters<typeof projectApi.update>[1]): Promise<void> {
    const row = await projectApi.update(id, payload)
    const project = rowToProject(row)
    const index = projects.value.findIndex((p) => p.id === id)
    if (index !== -1) projects.value[index] = project
    if (currentProject.value?.id === id) currentProject.value = project
  }

  async function deleteProject(id: string): Promise<void> {
    await projectApi.remove(id)
    const index = projects.value.findIndex((p) => p.id === id)
    if (index !== -1) projects.value.splice(index, 1)
    if (currentProject.value?.id === id) currentProject.value = null
  }

  async function detectSchema(projectId: string): Promise<void> {
    await projectApi.detectSchema(projectId)
    await loadProject(projectId)
  }

  async function exportProject(id: string): Promise<void> {
    const data = await projectApi.exportProject(id)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const project = projects.value.find((p) => p.id === id)
    a.download = `${(project?.name || 'project').replace(/[^a-zA-Z0-9-_]/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importProject(file: File): Promise<Project> {
    const text = await file.text()
    const payload = JSON.parse(text)
    const row = await projectApi.importProject(payload)
    const project = rowToProject(row)
    projects.value.push(project)
    return project
  }

  return {
    projects,
    currentProject,
    loading,
    fetchProjects,
    loadProject,
    createProject,
    updateProject,
    deleteProject,
    detectSchema,
    exportProject,
    importProject,
  }
})
