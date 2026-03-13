<template>
  <div class="min-h-screen">
    <div class="max-w-7xl mx-auto px-8 py-8">
      <div class="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="icon" @click="$router.push({ name: 'project-dashboards', params: { projectId } })">
          <ArrowLeft :size="20" />
        </Button>
        <div>
          <h1 class="text-3xl font-bold">Schema Explorer</h1>
          <p class="text-sm text-muted-foreground mt-1" v-if="schema">
            {{ schema.database }} ({{ schema.engine }}) &middot; {{ tableCount }} tables &middot;
            {{ columnCount }} columns
          </p>
        </div>
      </div>

      <SchemaExplorerSkeleton v-if="loading" />

      <div v-else-if="error" class="text-center py-16">
        <Database :size="64" class="mx-auto text-muted-foreground mb-4" />
        <h2 class="text-xl font-semibold mb-2">Schema unavailable</h2>
        <p class="text-muted-foreground">{{ error }}</p>
      </div>

      <template v-else>
        <div class="flex items-center gap-3 mb-6">
          <div class="relative flex-1">
            <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="search" placeholder="Search tables or columns..." class="pl-10" />
          </div>
          <div class="flex gap-2">
            <Button
              v-for="group in tableGroups"
              :key="group"
              :variant="activeGroup === group ? 'default' : 'outline'"
              size="sm"
              @click="activeGroup = activeGroup === group ? null : group"
            >
              {{ group }} ({{ groupCounts[group] }})
            </Button>
          </div>
          <Button variant="outline" size="sm" @click="toggleAll">
            {{ allExpanded ? 'Collapse All' : 'Expand All' }}
          </Button>
        </div>

        <div v-if="filteredTables.length === 0" class="text-center py-12 text-muted-foreground">
          No tables match your search.
        </div>

        <div class="space-y-2">
          <Card v-for="[tableName, tableInfo] in filteredTables" :key="tableName" class="overflow-hidden">
            <button
              class="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
              @click="toggle(tableName)"
            >
              <ChevronRight
                :size="16"
                class="text-muted-foreground transition-transform shrink-0"
                :class="{ 'rotate-90': expanded[tableName] }"
              />
              <Database :size="16" class="text-muted-foreground shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono font-semibold text-sm">{{ tableName }}</span>
                  <span class="text-xs px-2 py-0.5 rounded-full" :class="prefixBadgeClass(tableName)">
                    {{ tablePrefix(tableName) }}
                  </span>
                  <span v-if="tableInfo.isView" class="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
                    <Eye :size="10" />
                    view
                  </span>
                </div>
                <p v-if="tableInfo.description" class="text-xs text-muted-foreground mt-0.5 truncate">
                  {{ tableInfo.description }}
                </p>
                <p v-if="tableInfo.partitionKeys?.length" class="text-xs text-amber-600 mt-0.5">
                  Partitioned by: {{ tableInfo.partitionKeys.join(', ') }}
                </p>
              </div>
              <div class="ml-auto flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                <span v-if="tableInfo.rowCount != null">~{{ formatRowCount(tableInfo.rowCount) }} rows</span>
                <span>{{ tableInfo.columns.length }} columns</span>
              </div>
            </button>

            <div v-if="expanded[tableName]" class="border-t bg-muted/30">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b text-muted-foreground">
                    <th class="text-left py-2 px-4 pl-12 font-medium w-1/4">Column</th>
                    <th class="text-left py-2 px-4 font-medium w-1/6">Type</th>
                    <th class="text-left py-2 px-4 font-medium">Description / Samples</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="col in tableInfo.columns"
                    :key="col.name"
                    class="border-b last:border-0 hover:bg-muted/50"
                    :class="{ 'bg-yellow-50 dark:bg-yellow-900/10': isColumnMatch(col.name) }"
                  >
                    <td class="py-1.5 px-4 pl-12">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-mono text-xs">{{ col.name.trim() }}</span>
                        <span v-if="col.isPrimaryKey" class="text-xs px-1 py-0 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-0.5">
                          <Key :size="9" />PK
                        </span>
                        <span v-if="col.isPartitionKey" class="text-xs px-1 py-0 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          PART
                        </span>
                        <span v-if="col.nullable === false" class="text-xs text-muted-foreground">NOT NULL</span>
                      </div>
                      <div v-if="col.references" class="flex items-center gap-1 mt-0.5 text-xs text-blue-600 dark:text-blue-400">
                        <ArrowRight :size="10" />
                        <span class="font-mono">{{ col.references.table }}.{{ col.references.column }}</span>
                      </div>
                    </td>
                    <td class="py-1.5 px-4">
                      <span class="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                        {{ col.type }}
                      </span>
                    </td>
                    <td class="py-1.5 px-4 text-xs">
                      <span v-if="col.description" class="text-muted-foreground">{{ col.description }}</span>
                      <span v-else-if="!col.sampleValues?.length" class="text-muted-foreground/50">—</span>
                      <div v-if="col.sampleValues?.length" class="flex flex-wrap gap-1 mt-1">
                        <span
                          v-for="val in col.sampleValues.slice(0, 6)"
                          :key="val"
                          class="px-1.5 py-0 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono text-xs"
                        >{{ val }}</span>
                        <span v-if="col.sampleValues.length > 6" class="text-muted-foreground/60 text-xs">+{{ col.sampleValues.length - 6 }} more</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Search, Database, ChevronRight, Eye, Key, ArrowRight } from 'lucide-vue-next'
import { api, extractApiError } from '../services/api'
import Button from '../components/ui/button.vue'
import Card from '../components/ui/card.vue'
import Input from '../components/ui/input.vue'
import SchemaExplorerSkeleton from '../components/skeletons/SchemaExplorerSkeleton.vue'
import type { Schema, SchemaTable } from '../types'

const route = useRoute()
const projectId = route.params.projectId as string

const schema = ref<Schema | null>(null)
const loading = ref(true)
const error = ref('')
const search = ref('')
const expanded = ref<Record<string, boolean>>({})
const activeGroup = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await api.get(`/projects/${projectId}/schema`)
    schema.value = res.data
  } catch (err: unknown) {
    error.value = extractApiError(err)
  } finally {
    loading.value = false
  }
})

const tableEntries = computed(() => {
  if (!schema.value) return []
  return Object.entries(schema.value.tables) as [string, SchemaTable][]
})

const tableCount = computed(() => tableEntries.value.length)

const columnCount = computed(() => tableEntries.value.reduce((sum, [, info]) => sum + info.columns.length, 0))

const tableGroups = computed(() => {
  const prefixes = new Set(tableEntries.value.map(([name]) => tablePrefix(name)))
  return Array.from(prefixes).sort()
})

const groupCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const [name] of tableEntries.value) {
    const p = tablePrefix(name)
    counts[p] = (counts[p] || 0) + 1
  }
  return counts
})

const filteredTables = computed(() => {
  const q = search.value.toLowerCase().trim()
  return tableEntries.value.filter(([name, info]) => {
    if (activeGroup.value && tablePrefix(name) !== activeGroup.value) return false
    if (!q) return true
    if (name.toLowerCase().includes(q)) return true
    return info.columns.some((c) => c.name.toLowerCase().includes(q))
  })
})

const allExpanded = computed(
  () => filteredTables.value.length > 0 && filteredTables.value.every(([name]) => expanded.value[name]),
)

function isColumnMatch(colName: string): boolean {
  const q = search.value.toLowerCase().trim()
  if (!q) return false
  return colName.toLowerCase().includes(q)
}

function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function tablePrefix(name: string): string {
  const idx = name.indexOf('_')
  return idx > 0 ? name.substring(0, idx) : name
}

function prefixBadgeClass(name: string): string {
  const p = tablePrefix(name)
  if (p === 'fact') return 'bg-blue-100 text-blue-700'
  if (p === 'dim') return 'bg-green-100 text-green-700'
  return 'bg-slate-100 text-slate-600'
}

function toggle(tableName: string) {
  expanded.value[tableName] = !expanded.value[tableName]
}

function toggleAll() {
  const shouldExpand = !allExpanded.value
  for (const [name] of filteredTables.value) {
    expanded.value[name] = shouldExpand
  }
}
</script>
