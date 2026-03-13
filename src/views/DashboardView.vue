<template>
  <div class="min-h-screen">
    <DashboardViewSkeleton v-if="loading" />

    <div v-else-if="!dashboard" class="flex items-center justify-center h-screen">
      <div class="text-center">
        <p class="text-muted-foreground">Dashboard not found</p>
        <Button @click="router.push({ name: 'project-dashboards', params: { projectId } })" class="mt-4"> Back to Dashboards </Button>
      </div>
    </div>

    <div v-else>
      <div class="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div class="flex items-center gap-3 sm:gap-4">
            <Button variant="ghost" size="icon" @click="router.push({ name: 'project-dashboards', params: { projectId } })">
              <ArrowLeft :size="20" />
            </Button>
            <div>
              <InlineEdit :model-value="dashboardName || dashboard.name" @save="saveDashboardName">
                <template #default="{ value }">
                  <h1 class="text-3xl font-bold">{{ value }}</h1>
                </template>
              </InlineEdit>
              <p class="text-sm text-muted-foreground mt-1">Last updated {{ formatDate(dashboard.updatedAt, true) }}</p>
            </div>
          </div>
          <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <div v-if="dashboard.charts.length > 0" class="flex border rounded-md">
              <Button
                variant="ghost"
                size="icon"
                :class="viewMode === 'full' ? 'bg-muted' : ''"
                @click="viewMode = 'full'"
                title="Full view"
              >
                <List :size="18" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                :class="viewMode === 'compact' ? 'bg-muted' : ''"
                @click="viewMode = 'compact'"
                title="Charts only"
              >
                <LayoutGrid :size="18" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                :class="viewMode === 'list' ? 'bg-muted' : ''"
                @click="viewMode = 'list'"
                title="List view"
              >
                <TableProperties :size="18" />
              </Button>
            </div>
            <Button
              v-if="isEditor()"
              variant="outline"
              size="icon"
              @click="showSettingsModal = true"
              title="Settings"
            >
              <Settings2 :size="18" />
            </Button>
            <Button
              v-if="dashboard.charts.length > 0"
              variant="outline"
              size="icon"
              @click="handleExportPdf"
              :disabled="exportingPdf"
              title="Export PDF"
            >
              <FileDown :size="18" :class="{ 'animate-pulse': exportingPdf }" />
            </Button>
            <Button
              v-if="dashboard.charts.length > 0"
              variant="outline"
              size="icon"
              @click="refreshAllCharts"
              :disabled="refreshing"
              title="Refresh Data"
            >
              <RefreshCw :size="18" :class="{ 'animate-spin': refreshing }" />
            </Button>
            <Button variant="outline" size="icon" @click="showAskPanel = true" title="Ask AI">
              <MessageSquare :size="18" />
            </Button>
            <Button
              v-if="isEditor()"
              @click="router.push({ name: 'chart-create', params: { projectId, dashboardId: dashboard.id } })"
              title="Add Chart"
            >
              <Plus :size="18" />
              <span class="hidden sm:inline">Add Chart</span>
            </Button>
          </div>
        </div>

        <div v-if="refreshing" class="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-2">
          <RefreshCw :size="16" class="animate-spin text-primary" />
          <span class="text-sm text-primary">{{ refreshStatus }}</span>
        </div>

        <DashboardFilterBar
          v-if="dashboard.charts.length > 0"
          :charts="sortedCharts"
          :applying="refreshing"
          @apply="handleApplyFilters"
        />

        <div ref="chartsContainer">
          <div v-if="dashboard.charts.length === 0" class="text-center py-16">
            <BarChart3 :size="64" class="mx-auto text-muted-foreground mb-4" />
            <h2 class="text-xl font-semibold mb-2">No charts yet</h2>
            <p class="text-muted-foreground mb-6">
              {{ isEditor() ? 'Add your first chart using AI' : 'No charts have been added yet. Contact an editor or admin to add charts.' }}
            </p>
            <Button v-if="isEditor()" @click="router.push({ name: 'chart-create', params: { projectId, dashboardId: dashboard.id } })">
              Add Chart
            </Button>
          </div>

          <div v-else-if="viewMode === 'list'" class="border rounded-lg overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted">
                <tr>
                  <th class="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th class="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                  <th class="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th class="px-4 py-3 text-left font-medium text-muted-foreground">Created by</th>
                  <th class="px-4 py-3 text-left font-medium text-muted-foreground">Updated</th>
                  <th class="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="chart in sortedCharts"
                  :key="chart.id"
                  class="border-t hover:bg-muted/50 cursor-pointer transition-colors"
                  @click="editChart(chart)"
                >
                  <td class="px-4 py-3 font-medium">{{ chart.name }}</td>
                  <td class="px-4 py-3 text-muted-foreground max-w-xs truncate">{{ chart.description || '—' }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">
                      {{ chart.chartType || 'auto' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {{ chart.createdBy ? (userEmailMap.get(chart.createdBy) ?? '—') : '—' }}
                  </td>
                  <td class="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {{ formatDate(chart.updatedAt, true) }}
                  </td>
                  <td class="px-4 py-3 text-right" @click.stop>
                    <div class="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" @click="fullscreenChart(chart)" title="Full screen">
                        <Maximize2 :size="16" />
                      </Button>
                      <div class="relative">
                        <Button variant="ghost" size="icon" @click="toggleListExport(chart.id)" title="Export">
                          <Download :size="16" />
                        </Button>
                        <div
                          v-if="listExportMenuId === chart.id"
                          class="absolute right-0 top-8 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[120px]"
                        >
                          <button
                            class="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                            @click="handleListExport(chart, 'csv')"
                          >
                            <FileText :size="14" /> CSV
                          </button>
                          <button
                            class="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                            @click="handleListExport(chart, 'excel')"
                          >
                            <Sheet :size="14" class="text-green-600" /> Excel
                          </button>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" @click="refreshChart(chart)" title="Refresh">
                        <RefreshCw :size="16" />
                      </Button>
                      <Button v-if="isEditor()" variant="ghost" size="icon" @click="openMoveModal(chart)" title="Move">
                        <ArrowRightLeft :size="16" />
                      </Button>
                      <Button v-if="isEditor()" variant="ghost" size="icon" @click="deleteChart(chart)" title="Delete">
                        <Trash2 :size="16" />
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <VueDraggable
            v-else
            v-model="sortedCharts"
            :class="
              viewMode === 'compact'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4'
                : 'grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6'
            "
            :animation="200"
            handle=".drag-handle"
            @end="onDragEnd"
          >
            <ChartCard
              v-for="chart in sortedCharts"
              :key="chart.id"
              :chart="chart"
              :compact="viewMode === 'compact'"
              :chart-library="chartLibrary"
              :color-config="colorConfig"
              :owner-email="chart.createdBy ? userEmailMap.get(chart.createdBy) : undefined"
              @edit="editChart"
              @delete="deleteChart"
              @refresh="refreshChart"
              @fullscreen="fullscreenChart"
              @move="openMoveModal"
            />
          </VueDraggable>
        </div>
      </div>
    </div>

    <Modal :show="showSettingsModal" @close="showSettingsModal = false">
      <h2 class="text-xl font-semibold mb-6">Dashboard Settings</h2>

      <!-- Share section -->
      <div class="mb-6">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <Share2 :size="16" /> Share
        </h3>
        <div v-if="!dashboard?.shareToken" class="space-y-3">
          <p class="text-sm text-muted-foreground">
            Generate a public link that anyone can use to view this dashboard (read-only).
          </p>
          <Button @click="handleCreateShareLink" :disabled="sharingInProgress" class="w-full">
            {{ sharingInProgress ? 'Generating...' : 'Generate Share Link' }}
          </Button>
        </div>
        <div v-else class="space-y-3">
          <p class="text-sm text-muted-foreground">Anyone with this link can view the dashboard.</p>
          <div class="flex gap-2">
            <Input :model-value="shareUrl" readonly class="flex-1 font-mono text-xs" />
            <Button variant="outline" size="icon" @click="copyShareLink" title="Copy link">
              <Copy :size="16" />
            </Button>
          </div>
          <Button
            variant="outline"
            class="w-full text-red-600 hover:text-red-700"
            @click="handleRevokeShareLink"
            :disabled="sharingInProgress"
          >
            {{ sharingInProgress ? 'Revoking...' : 'Revoke Share Link' }}
          </Button>
        </div>
      </div>

      <hr class="mb-6" />

      <!-- Auto-refresh section -->
      <div class="mb-6">
        <h3 class="text-sm font-semibold mb-3">Auto-Refresh</h3>
        <RefreshSchedule v-if="dashboard" :projectId="projectId" :dashboardId="dashboard.id" />
      </div>

      <div class="flex justify-end">
        <Button variant="outline" @click="showSettingsModal = false">Close</Button>
      </div>
    </Modal>

    <Modal :show="!!movingChart" @close="movingChart = null">
      <h2 class="text-xl font-semibold mb-4">Move Chart</h2>
      <p class="text-sm text-muted-foreground mb-4">
        Move <strong>{{ movingChart?.name }}</strong> to another dashboard:
      </p>
      <select
        v-model="moveTargetId"
        class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-4"
      >
        <option value="">Select dashboard...</option>
        <option v-for="d in otherDashboards" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
      <div class="flex gap-3">
        <Button @click="handleMoveChart" :disabled="!moveTargetId" class="flex-1">Move</Button>
        <Button variant="outline" @click="movingChart = null">Cancel</Button>
      </div>
    </Modal>

    <AskPanel :projectId="projectId" :show="showAskPanel" @close="showAskPanel = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  ArrowLeft,
  Plus,
  BarChart3,
  RefreshCw,
  LayoutGrid,
  List,
  TableProperties,
  Maximize2,
  Trash2,
  FileDown,
  FileText,
  Sheet,
  Download,
  Share2,
  Copy,
  ArrowRightLeft,
  Settings2,
  MessageSquare,
} from 'lucide-vue-next'
import { VueDraggable } from 'vue-draggable-plus'
import { useDashboardStore } from '../stores/dashboard.store'
import { dashboardApi } from '../services/dashboard.api'
import { projectApi } from '../services/project.api'
import { generateDashboardThumbnail } from '../utils/generateThumbnail'
import ChartCard from '../components/ChartCard.vue'
import RefreshSchedule from '../components/RefreshSchedule.vue'
import InlineEdit from '../components/InlineEdit.vue'
import DashboardViewSkeleton from '../components/skeletons/DashboardViewSkeleton.vue'
import Button from '../components/ui/button.vue'
import Input from '../components/ui/input.vue'
import Modal from '../components/Modal.vue'
import type { Chart } from '../types'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { formatDate } from '../utils/formatDate'
import { useProjectColorConfig } from '../composables/useProjectColorConfig'
import { useRole } from '../composables/useRole'
import AskPanel from '../components/AskPanel.vue'
import DashboardFilterBar from '../components/DashboardFilterBar.vue'
import { exportDashboardPdf } from '../utils/exportDashboardPdf'
import { exportCsv, exportExcel } from '../utils/exportData'

const router = useRouter()
const route = useRoute()
const dashboardStore = useDashboardStore()
const toast = useToast()
const { confirm } = useConfirm()
const projectId = route.params.projectId as string

const loading = ref(true)
const dashboardName = ref('')
const refreshing = ref(false)
const refreshStatus = ref('')
const viewMode = ref<'full' | 'compact' | 'list'>('full')
const chartsContainer = ref<HTMLElement | null>(null)
const exportingPdf = ref(false)
const showSettingsModal = ref(false)
const sharingInProgress = ref(false)
const listExportMenuId = ref<string | null>(null)
const movingChart = ref<Chart | null>(null)
const moveTargetId = ref('')
const otherDashboards = ref<{ id: string; name: string }[]>([])
const { colorConfig, chartLibrary } = useProjectColorConfig(projectId)
const { isEditor } = useRole()
const showAskPanel = ref(false)

const sortedCharts = ref<Chart[]>([])
const userEmailMap = ref<Map<string, string>>(new Map())

const dashboard = computed(() => {
  const id = route.params.id as string
  return dashboardStore.dashboards.find((d) => d.id === id)
})

watch(
  () => dashboard.value?.charts?.length,
  () => {
    if (dashboard.value?.charts) sortedCharts.value = [...dashboard.value.charts]
  },
  { immediate: true },
)

async function onDragEnd() {
  if (!dashboard.value) return
  try {
    await dashboardStore.reorderCharts(dashboard.value.id, sortedCharts.value)
  } catch {
    toast.error('Failed to save chart order')
  }
}

async function saveDashboardName(newName: string) {
  if (!dashboard.value) return
  try {
    await dashboardStore.updateDashboard(dashboard.value.id, newName, dashboard.value.description)
    dashboardName.value = newName
    toast.success('Dashboard name updated')
  } catch {
    toast.error('Failed to update dashboard name')
  }
}

function editChart(chart: Chart) {
  if (dashboard.value) {
    router.push({ name: 'chart-edit', params: { projectId, dashboardId: dashboard.value.id, chartId: chart.id } })
  }
}

function fullscreenChart(chart: Chart) {
  if (dashboard.value) {
    router.push({ name: 'chart-fullscreen', params: { projectId, dashboardId: dashboard.value.id, chartId: chart.id } })
  }
}

async function deleteChart(chart: Chart) {
  const confirmed = await confirm({
    title: 'Delete Chart',
    message: `Are you sure you want to delete "${chart.name}"? This action cannot be undone.`,
    confirmLabel: 'Delete',
    variant: 'danger',
  })
  if (confirmed && dashboard.value) {
    try {
      await dashboardStore.deleteChart(dashboard.value.id, chart.id)
      toast.success('Chart deleted')
    } catch {
      toast.error('Failed to delete chart')
    }
  }
}

async function refreshChart(chart: Chart) {
  if (!dashboard.value) return
  try {
    await dashboardStore.refreshChart(dashboard.value.id, chart.id)
  } catch (err) {
    toast.error(`Failed to refresh "${chart.name}"`)
  }
}

async function handleExportPdf() {
  if (!chartsContainer.value || !dashboard.value) return
  exportingPdf.value = true
  try {
    await exportDashboardPdf(chartsContainer.value, dashboard.value.name)
    toast.success('PDF exported')
  } catch {
    toast.error('Failed to export PDF')
  } finally {
    exportingPdf.value = false
  }
}

async function refreshAllCharts() {
  if (!dashboard.value || refreshing.value) return
  refreshing.value = true
  const charts = [...dashboard.value.charts]
  for (let i = 0; i < charts.length; i++) {
    const c = charts[i]
    if (!c) continue
    refreshStatus.value = `Refreshing chart ${i + 1} of ${charts.length}: ${c.name}`
    await refreshChart(c)
  }
  refreshStatus.value = ''
  refreshing.value = false
  toast.success('All charts refreshed')
}

const shareUrl = computed(() => {
  if (!dashboard.value?.shareToken) return ''
  return `${window.location.origin}/shared/${dashboard.value.shareToken}`
})

async function handleCreateShareLink() {
  if (!dashboard.value) return
  sharingInProgress.value = true
  try {
    await dashboardStore.createShareLink(dashboard.value.id)
    toast.success('Share link created')
  } catch {
    toast.error('Failed to create share link')
  } finally {
    sharingInProgress.value = false
  }
}

async function handleRevokeShareLink() {
  if (!dashboard.value) return
  sharingInProgress.value = true
  try {
    await dashboardStore.revokeShareLink(dashboard.value.id)
    toast.success('Share link revoked')
  } catch {
    toast.error('Failed to revoke share link')
  } finally {
    sharingInProgress.value = false
  }
}

function copyShareLink() {
  navigator.clipboard.writeText(shareUrl.value)
  toast.success('Link copied to clipboard')
}

async function openMoveModal(chart: Chart) {
  movingChart.value = chart
  moveTargetId.value = ''
  try {
    const all = await dashboardApi.list(projectId)
    otherDashboards.value = all
      .filter((d) => d.id !== dashboard.value?.id)
      .map((d) => ({ id: d.id, name: d.name }))
  } catch {
    toast.error('Failed to load dashboards')
  }
}

async function handleMoveChart() {
  if (!movingChart.value || !moveTargetId.value || !dashboard.value) return
  try {
    await dashboardApi.moveChart(projectId, dashboard.value.id, movingChart.value.id, moveTargetId.value)
    sortedCharts.value = sortedCharts.value.filter((c) => c.id !== movingChart.value!.id)
    await dashboardStore.loadDashboard(dashboard.value.id)
    const targetName = otherDashboards.value.find((d) => d.id === moveTargetId.value)?.name || 'target'
    toast.success(`Chart moved to "${targetName}"`)
    movingChart.value = null
  } catch {
    toast.error('Failed to move chart')
  }
}

function toggleListExport(chartId: string) {
  listExportMenuId.value = listExportMenuId.value === chartId ? null : chartId
}

function handleListExport(chart: Chart, type: 'csv' | 'excel') {
  listExportMenuId.value = null
  if (type === 'csv') exportCsv(chart)
  else exportExcel(chart)
}

async function handleApplyFilters(filterValues: Record<string, string>) {
  if (!dashboard.value) return
  refreshing.value = true
  refreshStatus.value = 'Applying filters...'
  try {
    await dashboardStore.refreshFiltered(dashboard.value.id, filterValues)
    if (dashboard.value?.charts) sortedCharts.value = [...dashboard.value.charts]
    toast.success('Filters applied')
  } catch {
    toast.error('Failed to apply filters')
  } finally {
    refreshing.value = false
    refreshStatus.value = ''
  }
}

let thumbnailUpdateTimeout: ReturnType<typeof setTimeout> | null = null
let isGeneratingThumbnail = false

async function updateThumbnail(showNotification = false) {
  if (!chartsContainer.value || !dashboard.value || dashboard.value.charts.length === 0) return
  if (isGeneratingThumbnail) return
  
  isGeneratingThumbnail = true
  try {
    const thumbnailData = await generateDashboardThumbnail(chartsContainer.value)
    await dashboardApi.uploadThumbnail(projectId, dashboard.value.id, thumbnailData)
    if (showNotification) {
      toast.success('Dashboard thumbnail updated')
    }
  } catch (error) {
    console.error('Failed to generate thumbnail:', error)
    if (showNotification) {
      toast.error('Failed to update dashboard thumbnail')
    }
  } finally {
    isGeneratingThumbnail = false
  }
}

function scheduleThumbnailUpdate(delay = 1500) {
  if (thumbnailUpdateTimeout) {
    clearTimeout(thumbnailUpdateTimeout)
  }
  thumbnailUpdateTimeout = setTimeout(() => {
    updateThumbnail()
  }, delay)
}

onMounted(async () => {
  dashboardStore.setProjectId(projectId)
  const id = route.params.id as string
  await dashboardStore.loadDashboard(id)
  if (dashboard.value) {
    dashboardName.value = dashboard.value.name
  }
  loading.value = false

  if (dashboard.value && dashboard.value.charts.length > 0) {
    scheduleThumbnailUpdate(2000)
  }

  try {
    const users = await projectApi.listUsers(projectId)
    userEmailMap.value = new Map(users.map((u) => [u.id, u.email ?? u.id.slice(0, 8)]))
  } catch {
    // non-critical — ownership info just won't show
  }
})

watch(
  () => dashboard.value?.charts.length,
  (newLength, oldLength) => {
    if (newLength && newLength > 0 && newLength !== oldLength) {
      scheduleThumbnailUpdate()
    }
  },
)
</script>
