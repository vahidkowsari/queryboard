<template>
  <Card>
    <div class="p-6 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <ScrollText :size="18" class="text-muted-foreground" />
          <h2 class="text-lg font-semibold">Audit Log</h2>
        </div>
        <Button variant="ghost" size="icon" class="h-7 w-7" @click="loadLogs" :disabled="loading">
          <RefreshCw :size="14" :class="{ 'animate-spin': loading }" />
        </Button>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted-foreground">Action</label>
          <select
            v-model="filters.action"
            class="h-8 rounded-md border border-input bg-background px-2 text-xs"
            @change="resetAndLoad"
          >
            <option value="">All actions</option>
            <option v-for="a in ACTIONS" :key="a.value" :value="a.value">{{ a.label }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted-foreground">Entity</label>
          <select
            v-model="filters.entityType"
            class="h-8 rounded-md border border-input bg-background px-2 text-xs"
            @change="resetAndLoad"
          >
            <option value="">All entities</option>
            <option v-for="e in ENTITY_TYPES" :key="e.value" :value="e.value">{{ e.label }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted-foreground">User</label>
          <select
            v-model="filters.userId"
            class="h-8 min-w-[140px] rounded-md border border-input bg-background px-2 text-xs"
            @change="resetAndLoad"
          >
            <option value="">All users</option>
            <option v-for="u in users" :key="u.id" :value="u.id">{{ u.email || u.id.substring(0, 8) }}</option>
          </select>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading && rows.length === 0" class="flex items-center justify-center py-8">
        <LoadingSpinner label="Loading audit log..." />
      </div>

      <!-- Table -->
      <div v-else-if="rows.length > 0" class="border rounded-lg overflow-auto max-h-[500px]">
        <table class="w-full text-sm">
          <thead class="bg-muted sticky top-0">
            <tr>
              <th class="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
              <th class="px-3 py-2 text-left font-medium text-muted-foreground">User</th>
              <th class="px-3 py-2 text-left font-medium text-muted-foreground">Action</th>
              <th class="px-3 py-2 text-left font-medium text-muted-foreground">Entity</th>
              <th class="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th class="px-3 py-2 text-left font-medium text-muted-foreground">Details</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-t hover:bg-muted/40 transition-colors">
              <td class="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{{ formatDate(row.createdAt) }}</td>
              <td class="px-3 py-2 whitespace-nowrap text-xs">{{ resolveEmail(row.userId) }}</td>
              <td class="px-3 py-2">
                <span :class="actionBadgeClass(row.action)" class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                  {{ actionLabel(row.action) }}
                </span>
              </td>
              <td class="px-3 py-2 capitalize text-xs">{{ row.entityType }}</td>
              <td class="px-3 py-2 text-xs font-medium truncate max-w-[200px]" :title="row.entityName || undefined">
                {{ row.entityName || '—' }}
              </td>
              <td class="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]" :title="detailsText(row.details)">
                {{ detailsText(row.details) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty state -->
      <p v-else class="text-sm text-muted-foreground text-center py-6">
        No audit log entries yet. Actions will appear here as users interact with the project.
      </p>

      <!-- Pagination -->
      <div v-if="total > PAGE_SIZE" class="flex items-center justify-between pt-2">
        <p class="text-xs text-muted-foreground">{{ total }} total entries</p>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="page === 0" @click="prevPage">
            <ChevronLeft :size="14" />
            Prev
          </Button>
          <span class="text-xs text-muted-foreground">Page {{ page + 1 }} of {{ totalPages }}</span>
          <Button variant="outline" size="sm" :disabled="page >= totalPages - 1" @click="nextPage">
            Next
            <ChevronRight :size="14" />
          </Button>
        </div>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ScrollText, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { projectApi, type AuditLogRow } from '../services/project.api'
import LoadingSpinner from './LoadingSpinner.vue'
import Card from './ui/card.vue'
import Button from './ui/button.vue'

const props = defineProps<{ projectId: string }>()

const PAGE_SIZE = 50

const loading = ref(false)
const rows = ref<AuditLogRow[]>([])
const total = ref(0)
const page = ref(0)
const users = ref<{ id: string; email: string | null }[]>([])

const filters = ref({
  action: '',
  entityType: '',
  userId: '',
})

const ACTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'shared', label: 'Shared' },
  { value: 'unshared', label: 'Unshared' },
  { value: 'exported', label: 'Exported' },
  { value: 'imported', label: 'Imported' },
  { value: 'generated', label: 'Generated' },
  { value: 'moved', label: 'Moved' },
  { value: 'permission_granted', label: 'Permission Granted' },
  { value: 'permission_revoked', label: 'Permission Revoked' },
]

const ENTITY_TYPES = [
  { value: 'project', label: 'Project' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'chart', label: 'Chart' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'permission', label: 'Permission' },
  { value: 'schema', label: 'Schema' },
]

const totalPages = computed(() => Math.ceil(total.value / PAGE_SIZE))

function actionLabel(action: string): string {
  const found = ACTIONS.find((a) => a.value === action)
  return found?.label || action
}

function actionBadgeClass(action: string): string {
  const base = 'border '
  switch (action) {
    case 'created':
    case 'imported':
      return base + 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800'
    case 'updated':
    case 'moved':
    case 'reordered':
      return base + 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800'
    case 'deleted':
      return base + 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800'
    case 'shared':
    case 'permission_granted':
      return base + 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800'
    case 'unshared':
    case 'permission_revoked':
      return base + 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-800'
    case 'generated':
      return base + 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-400 dark:border-cyan-800'
    case 'exported':
      return base + 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800'
    default:
      return base + 'bg-muted text-muted-foreground'
  }
}

function resolveEmail(userId: string | null): string {
  if (!userId) return '—'
  const user = users.value.find((u) => u.id === userId)
  return user?.email || userId.substring(0, 8)
}

function detailsText(details: Record<string, unknown> | null): string {
  if (!details) return ''
  const parts: string[] = []
  for (const [key, val] of Object.entries(details)) {
    if (val === null || val === undefined) continue
    if (Array.isArray(val)) {
      parts.push(`${key}: ${val.join(', ')}`)
    } else {
      parts.push(`${key}: ${val}`)
    }
  }
  return parts.join(' | ')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resetAndLoad() {
  page.value = 0
  loadLogs()
}

async function loadLogs() {
  loading.value = true
  try {
    const filter: Record<string, string | number> = {
      limit: PAGE_SIZE,
      offset: page.value * PAGE_SIZE,
    }
    if (filters.value.action) filter.action = filters.value.action
    if (filters.value.entityType) filter.entityType = filters.value.entityType
    if (filters.value.userId) filter.userId = filters.value.userId

    const result = await projectApi.getAuditLog(props.projectId, filter)
    rows.value = result.rows
    total.value = result.total
  } catch {
    console.error('Failed to load audit log')
  } finally {
    loading.value = false
  }
}

async function loadUsers() {
  try {
    users.value = await projectApi.listUsers(props.projectId)
  } catch {
    // Non-critical
  }
}

function prevPage() {
  if (page.value > 0) {
    page.value--
    loadLogs()
  }
}

function nextPage() {
  if (page.value < totalPages.value - 1) {
    page.value++
    loadLogs()
  }
}

onMounted(() => {
  loadLogs()
  loadUsers()
})
</script>
