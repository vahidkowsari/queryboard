<template>
  <div class="min-h-screen">
    <div class="max-w-7xl mx-auto px-8 py-8">
      <div class="flex items-center justify-between mb-8">
        <h1 class="text-3xl font-bold">Projects</h1>
        <div class="flex gap-3">
          <Button variant="outline" @click="triggerImport">
            <Upload :size="20" />
            Import
          </Button>
          <Button @click="showCreateModal = true">
            <Plus :size="20" />
            New Project
          </Button>
        </div>
      </div>
      <input ref="importInput" type="file" accept=".json" class="hidden" @change="handleImport" />
      <ProjectListSkeleton v-if="projectStore.loading" />

      <div v-else-if="projectStore.projects.length === 0" class="text-center py-20">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted mb-4">
          <FolderOpen :size="32" class="text-muted-foreground" />
        </div>
        <h2 class="text-lg font-semibold mb-2">No projects yet</h2>
        <p class="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
          Create a project to connect to a database and start building charts with AI
        </p>
        <Button @click="showCreateModal = true">
          <Plus :size="16" />
          Create Project
        </Button>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card
          v-for="project in projectStore.projects"
          :key="project.id"
          class="group hover:shadow-md hover:border-primary/20 transition-all cursor-pointer overflow-hidden"
          @click="navigateToProject(project.id)"
        >
          <div class="p-5">
            <div class="flex items-start justify-between mb-3">
              <div class="flex-1 min-w-0 pr-2">
                <h3 class="font-semibold truncate">{{ project.name }}</h3>
                <p
                  v-if="project.description"
                  class="text-sm text-muted-foreground mt-0.5 line-clamp-2"
                >
                  {{ project.description }}
                </p>
              </div>
              <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  @click.stop="router.push(`/projects/${project.id}/settings`)"
                  title="Project settings"
                >
                  <Settings :size="15" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  @click.stop="handleExport(project.id)"
                  title="Export project"
                >
                  <Download :size="15" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-destructive hover:text-destructive"
                  @click.stop="deleteProject(project.id)"
                  title="Delete project"
                >
                  <Trash2 :size="15" />
                </Button>
              </div>
            </div>

            <div class="flex items-center gap-2 mt-3 pt-3 border-t">
              <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-xs font-medium">
                <Database :size="12" class="text-muted-foreground" />
                {{ project.dbEngine }}
              </span>
              <span
                v-if="project.schemaDetectedAt"
                class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-xs font-medium text-green-700"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-green-500" />
                Schema ready
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-xs font-medium text-amber-700"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500" />
                No schema
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>

    <Modal :show="showCreateModal" max-width="xl" @close="closeModal">
      <h2 class="text-xl font-semibold mb-4">Create New Project</h2>

      <!-- Tab Navigation -->
      <div class="flex border-b mb-4">
        <button
          v-for="(tab, index) in tabs"
          :key="index"
          @click="currentStep = index"
          :class="[
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            currentStep === index
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          ]"
        >
          {{ tab }}
        </button>
      </div>

      <!-- Step 1: Project Info -->
      <div v-show="currentStep === 0" class="space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1.5">Name</label>
          <Input v-model="form.name" placeholder="My Data Project" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1.5">Description (optional)</label>
          <Textarea v-model="form.description" placeholder="Project description..." :rows="3" />
        </div>
      </div>

      <!-- Step 2: Database Configuration -->
      <div v-show="currentStep === 1" class="space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1.5">Database Engine</label>
          <select v-model="form.dbEngine" class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="athena">AWS Athena</option>
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="bigquery">BigQuery</option>
            <option value="redshift">Amazon Redshift</option>
          </select>
        </div>

        <DbConfigForm
          :db-engine="form.dbEngine"
          :athena="form.athena"
          :rdbms="form.rdbms"
          :bigquery="form.bigquery"
          layout="grid"
          @update:athena="form.athena = $event"
          @update:rdbms="form.rdbms = $event"
          @update:bigquery="form.bigquery = $event"
        />
      </div>

      <!-- Step 3: AI & Visualization Settings -->
      <div v-show="currentStep === 2" class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1.5">AI Model</label>
            <select
              v-model="form.llmVendor"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT)</option>
              <option value="google">Google (Gemini)</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1.5">Chart Library</label>
            <select
              v-model="form.chartLibrary"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="vega-lite">Vega-Lite</option>
              <option value="chartjs">Chart.js</option>
              <option value="echarts">ECharts</option>
              <option value="plotly">Plotly</option>
            </select>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-between gap-3">
          <Button 
            v-if="currentStep > 0" 
            variant="outline" 
            @click="currentStep--"
          >
            Previous
          </Button>
          <div v-else></div>
          
          <div class="flex gap-3">
            <Button variant="outline" @click="closeModal">Cancel</Button>
            <Button 
              v-if="currentStep < tabs.length - 1" 
              @click="currentStep++"
              :disabled="currentStep === 0 && !form.name.trim()"
            >
              Next
            </Button>
            <Button 
              v-else
              @click="createProject" 
              :disabled="!form.name.trim()"
            >
              Create Project
            </Button>
          </div>
        </div>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Trash2, FolderOpen, Database, Settings, Download, Upload } from 'lucide-vue-next'
import { useProjectStore } from '../stores/project.store'
import ProjectListSkeleton from '../components/skeletons/ProjectListSkeleton.vue'
import Button from '../components/ui/button.vue'
import Card from '../components/ui/card.vue'
import Input from '../components/ui/input.vue'
import Textarea from '../components/ui/textarea.vue'
import DbConfigForm from '../components/DbConfigForm.vue'
import Modal from '../components/Modal.vue'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import type { DbEngine, LLMVendor, ChartLibrary } from '../types'
import { buildDbConfig } from '../utils/buildDbConfig'

const router = useRouter()
const projectStore = useProjectStore()
const toast = useToast()
const { confirm } = useConfirm()

const showCreateModal = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const currentStep = ref(0)
const tabs = ['Project Info', 'Database Config', 'Settings']
const form = ref({
  name: '',
  description: '',
  dbEngine: 'athena' as DbEngine,
  athena: { database: '', workgroup: '', region: 'us-east-1', profile: '' },
  rdbms: { host: 'localhost', port: '5432', database: '', user: '', password: '' },
  bigquery: { projectId: '', dataset: '' },
  llmVendor: 'anthropic' as LLMVendor,
  chartLibrary: 'vega-lite' as ChartLibrary,
})

function closeModal() {
  showCreateModal.value = false
  currentStep.value = 0
}

async function createProject() {
  if (!form.value.name.trim()) return
  try {
    const project = await projectStore.createProject({
      name: form.value.name,
      description: form.value.description || undefined,
      dbEngine: form.value.dbEngine,
      dbConfig: buildDbConfig(form.value.dbEngine, form.value.athena, form.value.rdbms, form.value.bigquery),
      llmConfig: { vendor: form.value.llmVendor },
      chartLibrary: form.value.chartLibrary,
    })
    closeModal()
    form.value.name = ''
    form.value.description = ''
    toast.success('Project created')
    router.push(`/projects/${project.id}`)
  } catch {
    toast.error('Failed to create project')
  }
}

async function deleteProject(id: string) {
  const name = projectStore.projects.find((p) => p.id === id)?.name || 'this project'
  const confirmed = await confirm({
    title: 'Delete Project',
    message: `Are you sure you want to delete "${name}"? All dashboards and charts will also be deleted.`,
    confirmLabel: 'Delete',
    variant: 'danger',
  })
  if (confirmed) {
    try {
      await projectStore.deleteProject(id)
      toast.success('Project deleted')
    } catch {
      toast.error('Failed to delete project')
    }
  }
}

function navigateToProject(id: string) {
  router.push(`/projects/${id}`)
}

async function handleExport(id: string) {
  try {
    await projectStore.exportProject(id)
    toast.success('Project exported')
  } catch {
    toast.error('Failed to export project')
  }
}

function triggerImport() {
  importInput.value?.click()
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const project = await projectStore.importProject(file)
    toast.success('Project imported')
    router.push(`/projects/${project.id}`)
  } catch {
    toast.error('Failed to import project – check that the file is a valid export')
  } finally {
    input.value = ''
  }
}

onMounted(() => {
  projectStore.currentProject = null
  projectStore.fetchProjects()
})
</script>
