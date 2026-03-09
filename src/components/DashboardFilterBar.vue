<template>
  <div v-if="mergedFilters.length > 0" class="mb-6 p-4 border rounded-lg bg-muted/30">
    <div class="flex items-center gap-2 mb-3">
      <Filter :size="16" class="text-muted-foreground" />
      <span class="text-sm font-semibold text-muted-foreground">Filters</span>
    </div>
    <div class="flex flex-wrap items-end gap-4">
      <div v-for="filter in mergedFilters" :key="filter.placeholder" class="flex flex-col gap-1">
        <label class="text-xs font-medium text-muted-foreground">{{ filter.label }}</label>

        <input
          v-if="filter.type === 'date'"
          type="date"
          :value="filterValues[filter.placeholder] || filter.defaultValue"
          class="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          @input="onFilterChange(filter.placeholder, ($event.target as HTMLInputElement).value)"
        />

        <select
          v-else-if="filter.type === 'select'"
          :value="filterValues[filter.placeholder] || filter.defaultValue"
          class="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          @change="onFilterChange(filter.placeholder, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in filter.options" :key="opt" :value="opt">{{ opt }}</option>
        </select>

        <div v-else-if="filter.type === 'multi-select'" class="relative">
          <button
            class="h-9 min-w-[160px] rounded-md border border-input bg-transparent px-3 py-1 text-sm text-left shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            @click="toggleMultiSelect(filter.placeholder)"
          >
            {{ getMultiSelectLabel(filter) }}
            <ChevronDown :size="14" class="absolute right-2 top-2.5 text-muted-foreground" />
          </button>
          <div
            v-if="openMultiSelect === filter.placeholder"
            class="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-md border bg-popover p-1 shadow-md"
          >
            <label
              v-for="opt in filter.options"
              :key="opt"
              class="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded cursor-pointer"
            >
              <input
                type="checkbox"
                :checked="getMultiSelectValues(filter.placeholder, filter.defaultValue).includes(opt)"
                class="rounded"
                @change="toggleMultiSelectOption(filter.placeholder, opt, filter.defaultValue)"
              />
              {{ opt }}
            </label>
          </div>
        </div>

        <input
          v-else-if="filter.type === 'text'"
          type="text"
          :value="filterValues[filter.placeholder] || filter.defaultValue"
          :placeholder="filter.label"
          class="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          @input="onFilterChange(filter.placeholder, ($event.target as HTMLInputElement).value)"
        />

        <div v-else-if="filter.type === 'number'" class="flex items-center gap-1">
          <input
            type="number"
            :value="filterValues[filter.placeholder] || filter.defaultValue"
            :min="filter.min"
            :max="filter.max"
            class="h-9 w-24 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            @input="onFilterChange(filter.placeholder, ($event.target as HTMLInputElement).value)"
          />
        </div>

        <label
          v-else-if="filter.type === 'boolean'"
          class="flex items-center gap-2 h-9 cursor-pointer"
        >
          <input
            type="checkbox"
            :checked="(filterValues[filter.placeholder] || filter.defaultValue) === 'true'"
            class="rounded"
            @change="onFilterChange(filter.placeholder, ($event.target as HTMLInputElement).checked ? 'true' : 'false')"
          />
          <span class="text-sm">{{ filter.label }}</span>
        </label>
      </div>

      <Button :disabled="props.applying" @click="applyFilters" class="h-9">
        <RefreshCw v-if="props.applying" :size="14" class="animate-spin mr-1" />
        Apply
      </Button>

      <Button v-if="hasActiveFilters" variant="ghost" size="sm" class="h-9 text-muted-foreground" @click="resetFilters">
        <X :size="14" class="mr-1" />
        Reset
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Filter, RefreshCw, X, ChevronDown } from 'lucide-vue-next'
import Button from './ui/button.vue'
import type { Chart, ChartFilter } from '../types'

interface Props {
  charts: Chart[]
  applying?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  apply: [filterValues: Record<string, string>]
}>()

const filterValues = ref<Record<string, string>>({})
const openMultiSelect = ref<string | null>(null)

const mergedFilters = computed<ChartFilter[]>(() => {
  const seen = new Map<string, ChartFilter>()
  for (const chart of props.charts) {
    if (!chart.filters?.length) continue
    for (const f of chart.filters) {
      if (!seen.has(f.placeholder)) {
        seen.set(f.placeholder, { ...f })
      } else {
        const existing = seen.get(f.placeholder)!
        if (f.options?.length && existing.options?.length) {
          const merged = new Set([...existing.options, ...f.options])
          existing.options = [...merged]
        }
      }
    }
  }
  return [...seen.values()]
})

const hasActiveFilters = computed(() => {
  return Object.keys(filterValues.value).length > 0
})

function onFilterChange(placeholder: string, value: string) {
  filterValues.value = { ...filterValues.value, [placeholder]: value }
}

function getMultiSelectValues(placeholder: string, defaultValue: string): string[] {
  const val = filterValues.value[placeholder] || defaultValue
  return val ? val.split(',').map((v) => v.trim()).filter(Boolean) : []
}

function getMultiSelectLabel(filter: ChartFilter): string {
  const values = getMultiSelectValues(filter.placeholder, filter.defaultValue)
  if (values.length === 0) return 'Select...'
  if (values.length <= 2) return values.join(', ')
  return `${values.length} selected`
}

function toggleMultiSelect(placeholder: string) {
  openMultiSelect.value = openMultiSelect.value === placeholder ? null : placeholder
}

function toggleMultiSelectOption(placeholder: string, option: string, defaultValue: string) {
  const current = getMultiSelectValues(placeholder, defaultValue)
  const idx = current.indexOf(option)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push(option)
  }
  filterValues.value = { ...filterValues.value, [placeholder]: current.join(',') }
}

function applyFilters() {
  emit('apply', { ...filterValues.value })
}

function resetFilters() {
  filterValues.value = {}
  emit('apply', {})
}

function handleClickOutside(e: MouseEvent) {
  if (openMultiSelect.value && !(e.target as HTMLElement).closest('.relative')) {
    openMultiSelect.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  for (const f of mergedFilters.value) {
    if (f.defaultValue) {
      filterValues.value[f.placeholder] = f.defaultValue
    }
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>
