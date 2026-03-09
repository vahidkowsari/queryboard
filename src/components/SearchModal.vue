<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Search, LayoutDashboard, BarChart3, FolderOpen, X } from 'lucide-vue-next'
import { projectApi } from '../services/project.api'
import { dashboardApi } from '../services/dashboard.api'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const selectedIndex = ref(0)
const loading = ref(false)

interface SearchResult {
  type: 'project' | 'dashboard' | 'chart'
  id: string
  name: string
  description?: string
  projectId?: string
  dashboardId?: string
  projectName?: string
  dashboardName?: string
}

const allItems = ref<SearchResult[]>([])

async function loadAllItems() {
  loading.value = true
  try {
    const projects = await projectApi.list()
    const items: SearchResult[] = []

    for (const p of projects) {
      items.push({ type: 'project', id: p.id, name: p.name, description: p.description || undefined })

      try {
        const dashboards = await dashboardApi.list(p.id)
        for (const d of dashboards) {
          items.push({
            type: 'dashboard',
            id: d.id,
            name: d.name,
            description: d.description || undefined,
            projectId: p.id,
            projectName: p.name,
          })
          if (d.charts) {
            for (const c of d.charts) {
              items.push({
                type: 'chart',
                id: c.id,
                name: c.name,
                description: c.description || undefined,
                projectId: p.id,
                dashboardId: d.id,
                projectName: p.name,
                dashboardName: d.name,
              })
            }
          }
        }
      } catch {
        // skip if dashboards fail
      }
    }

    allItems.value = items
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return allItems.value.slice(0, 20)
  return allItems.value
    .filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.projectName?.toLowerCase().includes(q) ||
        item.dashboardName?.toLowerCase().includes(q),
    )
    .slice(0, 20)
})

watch(
  () => props.show,
  async (val) => {
    if (val) {
      query.value = ''
      selectedIndex.value = 0
      await loadAllItems()
      await nextTick()
      inputRef.value?.focus()
    }
  },
)

watch(query, () => {
  selectedIndex.value = 0
})

function navigate(item: SearchResult) {
  if (item.type === 'project') {
    router.push(`/projects/${item.id}`)
  } else if (item.type === 'dashboard') {
    router.push(`/projects/${item.projectId}/dashboard/${item.id}`)
  } else if (item.type === 'chart') {
    router.push(`/projects/${item.projectId}/dashboard/${item.dashboardId}`)
  }
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filtered.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = filtered.value[selectedIndex.value]
    if (item) navigate(item)
  } else if (e.key === 'Escape') {
    emit('close')
  }
}

</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" @click.self="emit('close')">
      <div class="fixed inset-0 bg-black/40" @click="emit('close')" />
      <div class="relative bg-background border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div class="flex items-center gap-3 px-4 border-b">
          <Search :size="18" class="text-muted-foreground shrink-0" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            placeholder="Search dashboards, charts, projects..."
            class="flex-1 py-3 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            @keydown="onKeydown"
          />
          <button @click="emit('close')" class="text-muted-foreground hover:text-foreground">
            <X :size="16" />
          </button>
        </div>

        <div class="max-h-[300px] overflow-y-auto p-2">
          <div v-if="loading" class="text-center py-6 text-sm text-muted-foreground">Loading...</div>

          <div v-else-if="filtered.length === 0" class="text-center py-6 text-sm text-muted-foreground">
            No results found
          </div>

          <button
            v-for="(item, i) in filtered"
            :key="`${item.type}-${item.id}`"
            class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors"
            :class="i === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted'"
            @click="navigate(item)"
            @mouseenter="selectedIndex = i"
          >
            <div class="shrink-0">
              <FolderOpen v-if="item.type === 'project'" :size="16" class="text-muted-foreground" />
              <LayoutDashboard v-else-if="item.type === 'dashboard'" :size="16" class="text-muted-foreground" />
              <BarChart3 v-else :size="16" class="text-muted-foreground" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">{{ item.name }}</div>
              <div v-if="item.type === 'dashboard'" class="text-xs text-muted-foreground truncate">
                {{ item.projectName }}
              </div>
              <div v-else-if="item.type === 'chart'" class="text-xs text-muted-foreground truncate">
                {{ item.projectName }} / {{ item.dashboardName }}
              </div>
              <div v-else-if="item.description" class="text-xs text-muted-foreground truncate">
                {{ item.description }}
              </div>
            </div>
            <span class="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-muted">
              {{ item.type }}
            </span>
          </button>
        </div>

        <div class="flex items-center gap-3 px-4 py-2 border-t text-[11px] text-muted-foreground">
          <span><kbd class="px-1 py-0.5 rounded border bg-muted text-[10px]">↑↓</kbd> Navigate</span>
          <span><kbd class="px-1 py-0.5 rounded border bg-muted text-[10px]">↵</kbd> Open</span>
          <span><kbd class="px-1 py-0.5 rounded border bg-muted text-[10px]">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
