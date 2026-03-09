<template>
  <div class="min-h-screen">
    <div class="max-w-7xl mx-auto px-8 py-8">
      <div class="flex items-center justify-between mb-8">
        <div class="flex items-center gap-3">
          <Button variant="ghost" size="icon" @click="$router.push('/')">
            <ArrowLeft :size="20" />
          </Button>
          <div>
            <h1 class="text-3xl font-bold">Dashboards</h1>
            <p v-if="projectStore.currentProject" class="text-sm text-muted-foreground">
              {{ projectStore.currentProject.name }}
            </p>
          </div>
        </div>
        <div class="flex gap-3">
          <Button
            variant="outline"
            size="icon"
            @click="$router.push(`/projects/${projectId}/settings`)"
            title="Project settings"
          >
            <Settings :size="18" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            @click="$router.push(`/projects/${projectId}/stats`)"
            title="Project stats"
          >
            <Activity :size="18" />
          </Button>
          <Button variant="outline" @click="showAskPanel = true">
            <MessageSquare :size="18" />
            Ask
          </Button>
          <Button v-if="isEditor()" @click="showCreateModal = true">
            <Plus :size="20" />
            New Dashboard
          </Button>
        </div>
      </div>

      <DashboardListSkeleton v-if="dashboardStore.loading" />

      <template v-else>
      <div v-if="dashboardStore.dashboards.length > 0" class="flex items-center gap-2 mb-4">
        <div class="flex border rounded-md">
          <Button
            variant="ghost"
            size="icon"
            :class="viewMode === 'card' ? 'bg-muted' : ''"
            @click="viewMode = 'card'"
            title="Card view"
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
          variant="outline"
          size="sm"
          @click="sortBy = sortBy === 'date' ? 'name' : 'date'"
          class="flex items-center gap-1"
        >
          <ArrowUpDown :size="14" />
          {{ sortBy === 'date' ? 'Date' : 'Name' }}
        </Button>
      </div>

      <div v-if="dashboardStore.dashboards.length === 0" class="text-center py-16" >
        <LayoutDashboard :size="64" class="mx-auto text-muted-foreground mb-4" />
        <h2 class="text-xl font-semibold mb-2">No dashboards yet</h2>
        <p class="text-muted-foreground mb-6">Create your first dashboard to get started</p>
        <Button @click="showCreateModal = true"> Create Dashboard </Button>
      </div>

      <!-- Card view -->
      <div v-else-if="viewMode === 'card'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card
          v-for="dashboard in sortedDashboards"
          :key="dashboard.id"
          class="hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
          @click="navigateToProject(dashboard.id)"
        >
          <div v-if="dashboard.thumbnail" class="w-full h-48 bg-muted relative overflow-hidden">
            <img
              :src="getThumbnailUrl(dashboard)"
              :alt="dashboard.name"
              class="w-full h-full object-cover"
            />
          </div>
          <div v-else class="w-full h-48 bg-muted flex items-center justify-center">
            <LayoutDashboard :size="48" class="text-muted-foreground/30" />
          </div>
          <div class="p-6">
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <h3 class="text-lg font-semibold">{{ dashboard.name }}</h3>
                <p v-if="dashboard.description" class="text-sm text-muted-foreground mt-1">
                  {{ dashboard.description }}
                </p>
              </div>
              <div v-if="isEditor()" class="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  @click.stop="permDashboardId = dashboard.id"
                  title="Settings"
                >
                  <Settings2 :size="18" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  @click.stop="duplicateDashboard(dashboard.id)"
                  :disabled="duplicating === dashboard.id"
                  title="Duplicate dashboard"
                >
                  <Copy :size="18" :class="{ 'animate-pulse': duplicating === dashboard.id }" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  @click.stop="deleteDashboard(dashboard.id)"
                  title="Delete dashboard"
                >
                  <Trash2 :size="18" />
                </Button>
              </div>
            </div>

            <div class="flex items-center gap-4 text-sm text-muted-foreground">
              <div class="flex items-center gap-1">
                <BarChart3 :size="16" />
                <span>{{ dashboard.chartCount ?? dashboard.charts.length }} charts</span>
              </div>
              <div>{{ formatDate(dashboard.updatedAt) }}</div>
            </div>
          </div>
        </Card>
      </div>

      <!-- List view -->
      <div v-else class="border rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-muted/50">
            <tr>
              <th class="text-left px-4 py-3 font-medium">Name</th>
              <th class="text-left px-4 py-3 font-medium">Charts</th>
              <th class="text-left px-4 py-3 font-medium">Updated</th>
              <th class="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="dashboard in sortedDashboards"
              :key="dashboard.id"
              class="border-t hover:bg-muted/30 cursor-pointer"
              @click="navigateToProject(dashboard.id)"
            >
              <td class="px-4 py-3">
                <div class="font-medium">{{ dashboard.name }}</div>
                <div v-if="dashboard.description" class="text-xs text-muted-foreground mt-0.5">{{ dashboard.description }}</div>
              </td>
              <td class="px-4 py-3 text-muted-foreground">
                {{ dashboard.chartCount ?? dashboard.charts.length }}
              </td>
              <td class="px-4 py-3 text-muted-foreground">
                {{ formatDate(dashboard.updatedAt) }}
              </td>
              <td class="px-4 py-3 text-right">
                <div v-if="isEditor()" class="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" class="h-7 w-7" @click.stop="permDashboardId = dashboard.id" title="Settings">
                    <Settings2 :size="14" />
                  </Button>
                  <Button variant="ghost" size="icon" class="h-7 w-7" @click.stop="duplicateDashboard(dashboard.id)" :disabled="duplicating === dashboard.id" title="Duplicate">
                    <Copy :size="14" />
                  </Button>
                  <Button variant="ghost" size="icon" class="h-7 w-7" @click.stop="deleteDashboard(dashboard.id)" title="Delete">
                    <Trash2 :size="14" />
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </template>
    </div>

    <Modal :show="showCreateModal" @close="showCreateModal = false">
      <h2 class="text-xl font-semibold mb-4">Create New Dashboard</h2>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2">Name</label>
          <Input v-model="newDashboard.name" type="text" placeholder="My Dashboard" @keyup.enter="createDashboard" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Description (optional)</label>
          <Textarea v-model="newDashboard.description" placeholder="Dashboard description..." :rows="3" />
        </div>
      </div>

      <div class="flex gap-3 mt-6">
        <Button @click="createDashboard" :disabled="!newDashboard.name.trim()" class="flex-1"> Create </Button>
        <Button variant="outline" @click="showCreateModal = false"> Cancel </Button>
      </div>
    </Modal>

    <DashboardPermissions
      v-if="permDashboardId"
      :projectId="projectId"
      :dashboardId="permDashboardId"
      @close="permDashboardId = null"
    />

    <AskPanel :projectId="projectId" :show="showAskPanel" @close="showAskPanel = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Plus,
  Trash2,
  LayoutGrid,
  TableProperties,
  ArrowUpDown,
  LayoutDashboard,
  Copy,
  Settings,
  Settings2,
  Activity,
  MessageSquare,
} from 'lucide-vue-next'
import { useDashboardStore } from '../stores/dashboard.store'
import { useProjectStore } from '../stores/project.store'
import DashboardListSkeleton from '../components/skeletons/DashboardListSkeleton.vue'
import Button from '../components/ui/button.vue'
import Card from '../components/ui/card.vue'
import Input from '../components/ui/input.vue'
import Textarea from '../components/ui/textarea.vue'
import Modal from '../components/Modal.vue'
import DashboardPermissions from '../components/DashboardPermissions.vue'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { useRole } from '../composables/useRole'
import AskPanel from '../components/AskPanel.vue'
import { formatDate } from '../utils/formatDate'

const route = useRoute()
const router = useRouter()
const dashboardStore = useDashboardStore()
const projectStore = useProjectStore()
const toast = useToast()
const { confirm } = useConfirm()
const projectId = route.params.projectId as string
const { isEditor } = useRole()

const duplicating = ref<string | null>(null)
const permDashboardId = ref<string | null>(null)
const showCreateModal = ref(false)
const viewMode = ref<'card' | 'list'>('card')
const showAskPanel = ref(false)
const sortBy = ref<'date' | 'name'>('date')

const sortedDashboards = computed(() => {
  const list = [...dashboardStore.dashboards]
  if (sortBy.value === 'name') {
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }
  return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
})
const newDashboard = ref({
  name: '',
  description: '',
})

async function createDashboard() {
  if (!newDashboard.value.name.trim()) return

  try {
    const dashboard = await dashboardStore.createDashboard(
      newDashboard.value.name,
      newDashboard.value.description || undefined,
    )

    newDashboard.value = { name: '', description: '' }
    showCreateModal.value = false
    toast.success('Dashboard created')
    router.push(`/projects/${projectId}/dashboard/${dashboard.id}`)
  } catch {
    toast.error('Failed to create dashboard')
  }
}

async function duplicateDashboard(id: string) {
  if (duplicating.value) return
  duplicating.value = id
  try {
    const full = await dashboardStore.loadDashboard(id)
    if (!full) throw new Error('Dashboard not found')
    const newDash = await dashboardStore.createDashboard(`${full.name} (Copy)`, full.description)
    for (const chart of full.charts) {
      await dashboardStore.addChartToDashboard(newDash.id, {
        ...chart,
        id: crypto.randomUUID(),
        dashboardId: newDash.id,
      })
    }
    toast.success('Dashboard duplicated')
    router.push(`/projects/${projectId}/dashboard/${newDash.id}`)
  } catch {
    toast.error('Failed to duplicate dashboard')
  } finally {
    duplicating.value = null
  }
}

async function deleteDashboard(id: string) {
  const name = dashboardStore.dashboards.find((d) => d.id === id)?.name || 'this dashboard'
  const confirmed = await confirm({
    title: 'Delete Dashboard',
    message: `Are you sure you want to delete "${name}"? All charts in this dashboard will also be deleted.`,
    confirmLabel: 'Delete',
    variant: 'danger',
  })
  if (confirmed) {
    try {
      await dashboardStore.deleteDashboard(id)
      toast.success('Dashboard deleted')
    } catch {
      toast.error('Failed to delete dashboard')
    }
  }
}

onMounted(() => {
  projectStore.loadProject(projectId)
  dashboardStore.setProjectId(projectId)
  dashboardStore.fetchDashboards()
})

function navigateToProject(id: string) {
  router.push(`/projects/${projectId}/dashboard/${id}`)
}

const thumbnailCache = new Map<string, string>()

function getThumbnailUrl(dashboard: { id: string; thumbnail: { type: 'Buffer'; data: number[] } | ArrayBuffer | null }): string {
  if (!dashboard.thumbnail) return ''
  
  if (thumbnailCache.has(dashboard.id)) {
    return thumbnailCache.get(dashboard.id)!
  }
  
  // Handle Buffer object from PostgreSQL (serialized as {type: 'Buffer', data: [...]})
  let bytes: Uint8Array
  if (typeof dashboard.thumbnail === 'object' && 'type' in dashboard.thumbnail && dashboard.thumbnail.type === 'Buffer') {
    bytes = new Uint8Array(dashboard.thumbnail.data)
  } else if (dashboard.thumbnail instanceof ArrayBuffer) {
    bytes = new Uint8Array(dashboard.thumbnail)
  } else {
    console.error('Unknown thumbnail format:', dashboard.thumbnail)
    return ''
  }
  
  const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '')
  const base64 = window.btoa(binary)
  const dataUrl = `data:image/jpeg;base64,${base64}`
  
  thumbnailCache.set(dashboard.id, dataUrl)
  return dataUrl
}
</script>
