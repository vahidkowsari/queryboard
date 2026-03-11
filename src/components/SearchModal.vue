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
    <Transition name="search-overlay">
      <div v-if="show" class="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] sm:pt-[20vh]" @click.self="emit('close')">
        <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" @click="emit('close')" />
        <Transition name="search-panel" appear>
          <div class="relative bg-background border border-border/60 rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
            <div class="flex items-center gap-3 px-4 h-12 border-b border-border/60">
              <Search :size="18" class="text-muted-foreground/60 shrink-0" />
              <input
                ref="inputRef"
                v-model="query"
                type="text"
                placeholder="Search projects, dashboards, charts..."
                class="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/50"
                @keydown="onKeydown"
              />
              <button @click="emit('close')" class="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors">
                <X :size="14" />
              </button>
            </div>

            <div class="max-h-[320px] overflow-y-auto p-1.5">
              <div v-if="loading" class="flex items-center justify-center py-8">
                <div class="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>

              <div v-else-if="filtered.length === 0" class="text-center py-8">
                <Search :size="32" class="mx-auto mb-2 text-muted-foreground/30" />
                <p class="text-sm text-muted-foreground/60">No results found</p>
              </div>

              <button
                v-for="(item, i) in filtered"
                :key="`${item.type}-${item.id}`"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors"
                :class="i === selectedIndex ? 'bg-primary/8 dark:bg-primary/15' : 'hover:bg-muted/60'"
                @click="navigate(item)"
                @mouseenter="selectedIndex = i"
              >
                <div
                  class="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg"
                  :class="{
                    'bg-blue-100 dark:bg-blue-900/30': item.type === 'project',
                    'bg-purple-100 dark:bg-purple-900/30': item.type === 'dashboard',
                    'bg-emerald-100 dark:bg-emerald-900/30': item.type === 'chart',
                  }"
                >
                  <FolderOpen v-if="item.type === 'project'" :size="15" class="text-blue-600 dark:text-blue-400" />
                  <LayoutDashboard v-else-if="item.type === 'dashboard'" :size="15" class="text-purple-600 dark:text-purple-400" />
                  <BarChart3 v-else :size="15" class="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium truncate" :class="i === selectedIndex ? 'text-foreground' : ''">{{ item.name }}</div>
                  <div v-if="item.type === 'dashboard'" class="text-xs text-muted-foreground/60 truncate">
                    {{ item.projectName }}
                  </div>
                  <div v-else-if="item.type === 'chart'" class="text-xs text-muted-foreground/60 truncate">
                    {{ item.projectName }} · {{ item.dashboardName }}
                  </div>
                  <div v-else-if="item.description" class="text-xs text-muted-foreground/60 truncate">
                    {{ item.description }}
                  </div>
                </div>
              </button>
            </div>

            <div class="flex items-center gap-4 px-4 py-2 border-t border-border/40 bg-muted/30">
              <span class="flex items-center gap-1 text-[11px] text-muted-foreground/50"><kbd class="px-1.5 py-0.5 rounded border border-border/50 bg-background text-[10px] font-mono">↑↓</kbd> Navigate</span>
              <span class="flex items-center gap-1 text-[11px] text-muted-foreground/50"><kbd class="px-1.5 py-0.5 rounded border border-border/50 bg-background text-[10px] font-mono">↵</kbd> Open</span>
              <span class="flex items-center gap-1 text-[11px] text-muted-foreground/50"><kbd class="px-1.5 py-0.5 rounded border border-border/50 bg-background text-[10px] font-mono">esc</kbd> Close</span>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.search-overlay-enter-active,
.search-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.search-overlay-enter-from,
.search-overlay-leave-to {
  opacity: 0;
}

.search-panel-enter-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.search-panel-leave-active {
  transition: all 0.15s ease-in;
}
.search-panel-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(-8px);
}
.search-panel-leave-to {
  opacity: 0;
  transform: scale(0.98) translateY(-4px);
}
</style>
