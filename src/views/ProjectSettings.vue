<template>
  <div class="min-h-screen">
    <div class="max-w-7xl mx-auto px-8 py-8">
      <div class="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="icon" @click="router.push(`/projects/${projectId}`)">
          <ArrowLeft :size="20" />
        </Button>
        <h1 class="text-3xl font-bold">Project Settings</h1>
      </div>

      <ProjectSettingsSkeleton v-if="loading" />

      <div v-else-if="error" class="text-center py-16">
        <p class="text-destructive">{{ error }}</p>
        <Button @click="router.push('/')" class="mt-4">Back to Projects</Button>
      </div>

      <template v-else-if="project">
        <Tabs v-model="activeTab" :tabs="tabOptions">
          <div v-if="activeTab === 'general'" class="space-y-6">
            <Card>
              <div class="p-6 space-y-4">
                <h2 class="text-lg font-semibold">General</h2>
                <div>
                  <label class="block text-sm font-medium mb-2">Name</label>
                  <Input v-model="form.name" />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Description</label>
                  <Textarea v-model="form.description" :rows="2" />
                </div>
                <Button @click="saveGeneral" :disabled="!form.name.trim()">Save</Button>
              </div>
            </Card>
          </div>

          <div v-if="activeTab === 'database'" class="space-y-6">
            <Card>
            <div class="p-6 space-y-4">
              <h2 class="text-lg font-semibold">Database Connection</h2>
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <Database :size="16" />
                <span class="font-medium">{{ project.dbEngine }}</span>
              </div>

              <DbConfigForm
                :db-engine="project.dbEngine"
                :athena="dbForm"
                :rdbms="rdbmsForm"
                :bigquery="bqForm"
                layout="grid"
                :show-test-button="false"
                @update:athena="dbForm = $event"
                @update:rdbms="rdbmsForm = $event"
                @update:bigquery="bqForm = $event"
              />

              <div class="flex gap-2">
                <Button @click="saveDbConfig">Save Connection</Button>
                <Button variant="outline" @click="testConnection" :disabled="testingConnection">
                  <Plug :size="16" :class="{ 'animate-pulse': testingConnection }" />
                  {{ testingConnection ? 'Testing...' : 'Test Connection' }}
                </Button>
              </div>
              <p v-if="connectionStatus === 'success'" class="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 :size="14" />
                Connection successful
              </p>
              <p v-else-if="connectionStatus === 'error'" class="text-xs text-destructive flex items-center gap-1">
                <XCircle :size="14" />
                {{ connectionError }}
              </p>

              <div class="border-t pt-4 mt-4">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-sm font-semibold">Schema Detection</h3>
                    <p v-if="project.schemaDetectedAt" class="text-xs text-muted-foreground">
                      Last detected: {{ new Date(project.schemaDetectedAt).toLocaleString() }}
                    </p>
                    <p v-else class="text-xs text-amber-600">Schema not yet detected</p>
                  </div>
                  <div class="flex gap-2">
                    <Button
                      v-if="project.schemaDetectedAt"
                      variant="outline"
                      @click="$router.push(`/projects/${projectId}/schema`)"
                    >
                      <Database :size="16" />
                      View Schema
                    </Button>
                    <Button
                      @click="detectSchema"
                      :disabled="detectingSchema || !schemaEnabled"
                      :title="schemaEnabled ? '' : 'Test the connection first'"
                    >
                      <RefreshCw :size="16" :class="{ 'animate-spin': detectingSchema }" />
                      {{ detectingSchema ? 'Detecting...' : 'Detect Schema' }}
                    </Button>
                  </div>
                </div>

                <!-- Progress UI -->
                <div v-if="detectingSchema || schemaError" class="mt-3 space-y-2">
                  <div v-if="schemaError" class="flex items-start gap-2 text-xs text-destructive">
                    <XCircle :size="14" class="mt-0.5 shrink-0" />
                    <span>{{ schemaError }}</span>
                  </div>
                  <template v-else>
                    <div class="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 :size="13" class="animate-spin shrink-0" />
                      <span>{{ schemaProgress.message || 'Starting...' }}</span>
                    </div>
                    <div v-if="schemaProgress.total" class="w-full bg-muted rounded-full h-1.5">
                      <div
                        class="bg-primary h-1.5 rounded-full transition-all duration-300"
                        :style="{ width: `${Math.round(((schemaProgress.current ?? 0) / schemaProgress.total) * 100)}%` }"
                      />
                    </div>
                    <p v-if="schemaProgress.total" class="text-xs text-muted-foreground">
                      {{ schemaProgress.current ?? 0 }} / {{ schemaProgress.total }}
                    </p>
                  </template>
                </div>
              </div>
            </div>
          </Card>
          </div>

          <div v-if="activeTab === 'ai'" class="space-y-6">
            <Card>
            <div class="p-6 space-y-4">
              <h2 class="text-lg font-semibold">AI Model</h2>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium mb-2">LLM Vendor</label>
                  <select
                    v-model="llmForm.vendor"
                    class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="openai">OpenAI (GPT)</option>
                    <option value="google">Google (Gemini)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Model</label>
                  <Input v-model="llmForm.model" :placeholder="defaultModels[llmForm.vendor]" />
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium mb-2">API Key Override</label>
                <Input v-model="llmForm.apiKey" type="password" placeholder="Uses server env var if empty" />
                <p class="text-xs text-muted-foreground mt-1">
                  Leave blank to use the server-level API key from environment variables.
                </p>
              </div>
              <Button @click="saveLLMConfig">Save AI Model</Button>
            </div>
          </Card>

          <Card>
            <div class="p-6 space-y-4">
              <h2 class="text-lg font-semibold">Chart Library</h2>
              <div>
                <select
                  v-model="chartLibForm.library"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="vega-lite">Vega-Lite</option>
                  <option value="chartjs">Chart.js</option>
                  <option value="echarts">ECharts</option>
                  <option value="plotly">Plotly</option>
                </select>
                <p class="text-xs text-muted-foreground mt-1">
                  Determines the chart specification format the AI generates.
                </p>
              </div>
              <Button @click="saveChartLibrary">Save Chart Library</Button>
            </div>
          </Card>
          </div>

          <div v-if="activeTab === 'appearance'" class="space-y-6">
            <Card>
            <div class="p-6 space-y-4">
              <div class="flex items-center gap-2">
                <Palette :size="18" class="text-muted-foreground" />
                <h2 class="text-lg font-semibold">Chart Colors</h2>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">Color Presets</label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="preset in COLOR_PRESETS"
                    :key="preset.name"
                    @click="applyPreset(preset)"
                    class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md hover:bg-muted transition-colors"
                  >
                    <span class="flex gap-0.5">
                      <span
                        v-for="(color, i) in preset.palette.slice(0, 5)"
                        :key="i"
                        class="w-3 h-3 rounded-full"
                        :style="{ backgroundColor: color }"
                      />
                    </span>
                    {{ preset.name }}
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">Palette Colors</label>
                <div v-if="colorForm.palette.length > 0" class="flex flex-wrap gap-2 mb-2">
                  <div
                    v-for="(color, i) in colorForm.palette"
                    :key="i"
                    class="flex items-center gap-1 border rounded-md px-1.5 py-1"
                  >
                    <input
                      type="color"
                      :value="color"
                      @input="(e: Event) => (colorForm.palette[i] = (e.target as HTMLInputElement).value)"
                      class="w-6 h-6 rounded cursor-pointer border-0 p-0"
                    />
                    <span class="text-xs font-mono">{{ color }}</span>
                    <button @click="removeColor(i)" class="text-muted-foreground hover:text-destructive">
                      <X :size="14" />
                    </button>
                  </div>
                </div>
                <p v-else class="text-sm text-muted-foreground mb-2">
                  No custom colors set. Charts will use library defaults.
                </p>
                <Button variant="outline" size="sm" @click="addColor">
                  <Plus :size="14" />
                  Add Color
                </Button>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium mb-2">Background Color</label>
                  <div class="flex items-center gap-2">
                    <input
                      type="color"
                      :value="colorForm.background || '#ffffff'"
                      @input="(e: Event) => (colorForm.background = (e.target as HTMLInputElement).value)"
                      class="w-8 h-8 rounded cursor-pointer border p-0"
                    />
                    <Input v-model="colorForm.background" placeholder="#ffffff" class="flex-1" />
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">Text Color</label>
                  <div class="flex items-center gap-2">
                    <input
                      type="color"
                      :value="colorForm.textColor || '#333333'"
                      @input="(e: Event) => (colorForm.textColor = (e.target as HTMLInputElement).value)"
                      class="w-8 h-8 rounded cursor-pointer border p-0"
                    />
                    <Input v-model="colorForm.textColor" placeholder="#333333" class="flex-1" />
                  </div>
                </div>
              </div>

              <Button @click="saveColorConfig">Save Colors</Button>
            </div>
          </Card>
          </div>

          <div v-if="activeTab === 'access'">
            <GroupsManager :projectId="projectId" />
          </div>
        </Tabs>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Database, RefreshCw, Palette, Plus, X, Plug, CheckCircle2, XCircle, Loader2 } from 'lucide-vue-next'
import Tabs from '../components/ui/tabs.vue'
import { useProjectStore } from '../stores/project.store'
import { projectApi } from '../services/project.api'
import ProjectSettingsSkeleton from '../components/skeletons/ProjectSettingsSkeleton.vue'
import Button from '../components/ui/button.vue'
import Card from '../components/ui/card.vue'
import Input from '../components/ui/input.vue'
import Textarea from '../components/ui/textarea.vue'
import DbConfigForm from '../components/DbConfigForm.vue'
import { useToast } from '../composables/useToast'
import type {
  Project,
  AthenaDbConfig,
  PostgresDbConfig,
  MySQLDbConfig,
  BigQueryDbConfig,
  DbEngine,
  DbConfig,
  LLMVendor,
  ChartLibrary,
  ColorConfig,
} from '../types'
import { COLOR_PRESETS } from '../utils/colorPresets'
import GroupsManager from '../components/GroupsManager.vue'
import { buildDbConfig } from '../utils/buildDbConfig'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const toast = useToast()

const projectId = route.params.projectId as string
const project = ref<Project | null>(null)
const loading = ref(true)
const detectingSchema = ref(false)
const schemaProgress = ref<{ phase?: string; message?: string; current?: number; total?: number }>({})
const schemaError = ref('')
let cancelDetection: (() => void) | null = null
const testingConnection = ref(false)
const connectionStatus = ref<'idle' | 'success' | 'error'>('idle')
const connectionError = ref('')

const error = ref('')
const form = ref({ name: '', description: '' })
const dbForm = ref({ database: '', workgroup: '', region: '', profile: '' })
const rdbmsForm = ref({ host: 'localhost', port: '5432', database: '', user: '', password: '' })
const bqForm = ref({ projectId: '', dataset: '' })
const llmForm = ref({ vendor: 'anthropic' as LLMVendor, model: '', apiKey: '' })
const chartLibForm = ref({ library: 'vega-lite' as ChartLibrary })
const colorForm = ref({ palette: [] as string[], background: '', textColor: '' })
const activeTab = ref('general')

const tabOptions = [
  { value: 'general', label: 'General' },
  { value: 'database', label: 'Database' },
  { value: 'ai', label: 'AI & Charts' },
  { value: 'appearance', label: 'Appearance' },
  { value: 'access', label: 'Access' },
]

function applyPreset(preset: { palette: string[] }) {
  colorForm.value.palette = [...preset.palette]
}

function addColor() {
  colorForm.value.palette.push('#4e79a7')
}

function removeColor(index: number) {
  colorForm.value.palette.splice(index, 1)
}

const defaultModels: Record<LLMVendor, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
}

onMounted(async () => {
  try {
    const row = await projectApi.getById(projectId)
    const p: Project = {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      dbEngine: row.dbEngine as DbEngine,
      dbConfig: row.dbConfig as DbConfig,
      llmConfig: row.llmConfig || undefined,
      chartLibrary: row.chartLibrary || undefined,
      colorConfig: row.colorConfig || undefined,
      schemaDetectedAt: row.schemaDetectedAt ? new Date(row.schemaDetectedAt) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
    project.value = p
    form.value = { name: p.name, description: p.description || '' }
    if (p.llmConfig) {
      llmForm.value = { vendor: p.llmConfig.vendor, model: p.llmConfig.model || '', apiKey: p.llmConfig.apiKey || '' }
    }
    if (p.chartLibrary) {
      chartLibForm.value = { library: p.chartLibrary }
    }
    if (p.colorConfig) {
      colorForm.value = {
        palette: p.colorConfig.palette ? [...p.colorConfig.palette] : [],
        background: p.colorConfig.background || '',
        textColor: p.colorConfig.textColor || '',
      }
    }
    if (p.dbEngine === 'athena') {
      const cfg = p.dbConfig as AthenaDbConfig
      dbForm.value = { database: cfg.database, workgroup: cfg.workgroup, region: cfg.region, profile: cfg.profile }
    } else if (p.dbEngine === 'postgres' || p.dbEngine === 'mysql' || p.dbEngine === 'redshift') {
      const cfg = p.dbConfig as PostgresDbConfig | MySQLDbConfig
      rdbmsForm.value = {
        host: cfg.host,
        port: String(cfg.port),
        database: cfg.database,
        user: cfg.user,
        password: cfg.password,
      }
    } else if (p.dbEngine === 'bigquery') {
      const cfg = p.dbConfig as BigQueryDbConfig
      bqForm.value = { projectId: cfg.projectId, dataset: cfg.dataset }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load project'
  } finally {
    loading.value = false
  }
})

async function saveGeneral() {
  try {
    await projectStore.updateProject(projectId, {
      name: form.value.name,
      description: form.value.description || undefined,
    })
    toast.success('Project updated')
  } catch {
    toast.error('Failed to update project')
  }
}

async function saveDbConfig() {
  try {
    await projectStore.updateProject(projectId, {
      dbConfig: project.value
        ? buildDbConfig(project.value.dbEngine, dbForm.value, rdbmsForm.value, bqForm.value)
        : ({} as DbConfig),
    })
    toast.success('Connection updated')
  } catch {
    toast.error('Failed to update connection')
  }
}

async function saveLLMConfig() {
  try {
    await projectStore.updateProject(projectId, {
      llmConfig: {
        vendor: llmForm.value.vendor,
        model: llmForm.value.model || undefined,
        apiKey: llmForm.value.apiKey || undefined,
      },
    })
    toast.success('AI model updated')
  } catch {
    toast.error('Failed to update AI model')
  }
}

async function saveChartLibrary() {
  try {
    await projectStore.updateProject(projectId, {
      chartLibrary: chartLibForm.value.library,
    })
    toast.success('Chart library updated')
  } catch {
    toast.error('Failed to update chart library')
  }
}

async function saveColorConfig() {
  try {
    const config: ColorConfig = {
      palette: colorForm.value.palette.filter((c) => c.trim()),
      background: colorForm.value.background || undefined,
      textColor: colorForm.value.textColor || undefined,
    }
    await projectStore.updateProject(projectId, { colorConfig: config })
    toast.success('Color config updated')
  } catch {
    toast.error('Failed to update color config')
  }
}

const schemaEnabled = computed(() => {
  return connectionStatus.value === 'success' || !!project.value?.schemaDetectedAt
})

async function testConnection() {
  testingConnection.value = true
  connectionStatus.value = 'idle'
  connectionError.value = ''
  try {
    const result = await projectApi.testConnection(projectId)
    if (result.success) {
      connectionStatus.value = 'success'
      toast.success('Connection successful')
    } else {
      connectionStatus.value = 'error'
      connectionError.value = result.error || 'Connection failed'
      toast.error('Connection failed')
    }
  } catch {
    connectionStatus.value = 'error'
    connectionError.value = 'Connection failed'
    toast.error('Connection failed')
  } finally {
    testingConnection.value = false
  }
}

function detectSchema() {
  detectingSchema.value = true
  schemaProgress.value = {}
  schemaError.value = ''

  cancelDetection = projectApi.detectSchemaWithProgress(
    projectId,
    (event) => {
      schemaProgress.value = event
    },
    async () => {
      try {
        const updated = await projectApi.getById(projectId)
        if (project.value) {
          project.value.schemaDetectedAt = updated.schemaDetectedAt ? new Date(updated.schemaDetectedAt) : undefined
        }
        toast.success('Schema detected successfully')
      } catch {
        toast.error('Schema detected but failed to refresh project')
      } finally {
        detectingSchema.value = false
        schemaProgress.value = {}
        cancelDetection = null
      }
    },
    (message) => {
      schemaError.value = message
      detectingSchema.value = false
      cancelDetection = null
      toast.error(message)
    },
  )
}

onUnmounted(() => {
  cancelDetection?.()
})
</script>
