<template>
  <Card>
    <div class="p-6 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Activity :size="18" class="text-muted-foreground" />
          <h2 class="text-lg font-semibold">Token Usage</h2>
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model="selectedDays"
            class="h-8 rounded-md border border-input bg-background px-2 text-xs"
            @change="loadSummary"
          >
            <option :value="0">All time</option>
            <option :value="7">Last 7 days</option>
            <option :value="30">Last 30 days</option>
            <option :value="90">Last 90 days</option>
          </select>
          <Button variant="ghost" size="icon" class="h-7 w-7" @click="loadSummary" :disabled="loading">
            <RefreshCw :size="14" :class="{ 'animate-spin': loading }" />
          </Button>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-8">
        <LoadingSpinner label="Loading usage..." />
      </div>

      <template v-else-if="summary">
        <!-- Summary cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="border rounded-lg p-3">
            <p class="text-xs text-muted-foreground">Total Tokens</p>
            <p class="text-xl font-bold">{{ formatNumber(summary.totalTokens) }}</p>
          </div>
          <div class="border rounded-lg p-3">
            <p class="text-xs text-muted-foreground">Prompt Tokens</p>
            <p class="text-xl font-bold">{{ formatNumber(summary.totalPromptTokens) }}</p>
          </div>
          <div class="border rounded-lg p-3">
            <p class="text-xs text-muted-foreground">Completion Tokens</p>
            <p class="text-xl font-bold">{{ formatNumber(summary.totalCompletionTokens) }}</p>
          </div>
          <div class="border rounded-lg p-3">
            <p class="text-xs text-muted-foreground">Estimated Cost</p>
            <p class="text-xl font-bold">${{ summary.totalEstimatedCost.toFixed(4) }}</p>
          </div>
        </div>

        <!-- By Model -->
        <div v-if="summary.byModel.length > 0">
          <h3 class="text-sm font-semibold mb-2">By Model</h3>
          <div class="border rounded-lg overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted">
                <tr>
                  <th class="px-3 py-2 text-left font-medium text-muted-foreground">Vendor</th>
                  <th class="px-3 py-2 text-left font-medium text-muted-foreground">Model</th>
                  <th class="px-3 py-2 text-right font-medium text-muted-foreground">Tokens</th>
                  <th class="px-3 py-2 text-right font-medium text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in summary.byModel" :key="`${row.vendor}-${row.model}`" class="border-t">
                  <td class="px-3 py-1.5 capitalize">{{ row.vendor }}</td>
                  <td class="px-3 py-1.5 font-mono text-xs">{{ row.model }}</td>
                  <td class="px-3 py-1.5 text-right">{{ formatNumber(row.totalTokens) }}</td>
                  <td class="px-3 py-1.5 text-right">${{ row.estimatedCost.toFixed(4) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- By Operation -->
        <div v-if="summary.byOperation.length > 0">
          <h3 class="text-sm font-semibold mb-2">By Operation</h3>
          <div class="border rounded-lg overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted">
                <tr>
                  <th class="px-3 py-2 text-left font-medium text-muted-foreground">Operation</th>
                  <th class="px-3 py-2 text-right font-medium text-muted-foreground">Requests</th>
                  <th class="px-3 py-2 text-right font-medium text-muted-foreground">Tokens</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in summary.byOperation" :key="row.operation" class="border-t">
                  <td class="px-3 py-1.5">{{ operationLabel(row.operation) }}</td>
                  <td class="px-3 py-1.5 text-right">{{ row.count }}</td>
                  <td class="px-3 py-1.5 text-right">{{ formatNumber(row.totalTokens) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Recent history toggle -->
        <div>
          <button
            class="text-sm font-semibold text-primary hover:underline"
            @click="showHistory = !showHistory"
          >
            {{ showHistory ? 'Hide' : 'Show' }} Recent Requests
          </button>

          <div v-if="showHistory" class="mt-2 border rounded-lg overflow-auto max-h-64">
            <div v-if="historyLoading" class="flex items-center justify-center py-4">
              <LoadingSpinner label="Loading..." />
            </div>
            <table v-else-if="history.length > 0" class="w-full text-sm">
              <thead class="bg-muted sticky top-0">
                <tr>
                  <th class="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
                  <th class="px-3 py-2 text-left font-medium text-muted-foreground">Operation</th>
                  <th class="px-3 py-2 text-left font-medium text-muted-foreground">Model</th>
                  <th class="px-3 py-2 text-right font-medium text-muted-foreground">Tokens</th>
                  <th class="px-3 py-2 text-right font-medium text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in history" :key="row.id" class="border-t">
                  <td class="px-3 py-1.5 whitespace-nowrap text-xs">{{ formatDate(row.createdAt) }}</td>
                  <td class="px-3 py-1.5">{{ operationLabel(row.operation) }}</td>
                  <td class="px-3 py-1.5 font-mono text-xs">{{ row.model }}</td>
                  <td class="px-3 py-1.5 text-right">{{ formatNumber(row.totalTokens) }}</td>
                  <td class="px-3 py-1.5 text-right">
                    {{ row.estimatedCost ? `$${parseFloat(row.estimatedCost).toFixed(4)}` : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="text-sm text-muted-foreground text-center py-4">No usage recorded yet.</p>
          </div>
        </div>

        <p v-if="summary.totalTokens === 0" class="text-sm text-muted-foreground text-center py-2">
          No token usage recorded yet. Generate a chart or detect schema to start tracking.
        </p>
      </template>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { Activity, RefreshCw } from 'lucide-vue-next'
import { tokenUsageApi, type TokenUsageSummary, type TokenUsageRow } from '../services/token-usage.api'
import LoadingSpinner from './LoadingSpinner.vue'
import Card from './ui/card.vue'
import Button from './ui/button.vue'

const props = defineProps<{ projectId: string }>()

const loading = ref(false)
const summary = ref<TokenUsageSummary | null>(null)
const selectedDays = ref(0)
const showHistory = ref(false)
const history = ref<TokenUsageRow[]>([])
const historyLoading = ref(false)

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const OPERATION_LABELS: Record<string, string> = {
  'chart-generate': 'Chart Generation',
  'schema-enrich': 'Schema Enrichment',
  'llm-generate': 'LLM Query',
}

function operationLabel(op: string): string {
  return OPERATION_LABELS[op] || op
}

async function loadSummary() {
  loading.value = true
  try {
    summary.value = await tokenUsageApi.getSummary(props.projectId, selectedDays.value || undefined)
  } catch {
    console.error('Failed to load token usage summary')
  } finally {
    loading.value = false
  }
}

async function loadHistory() {
  historyLoading.value = true
  try {
    history.value = await tokenUsageApi.getByProject(props.projectId, 50)
  } catch {
    console.error('Failed to load token usage history')
  } finally {
    historyLoading.value = false
  }
}

watch(showHistory, (val) => {
  if (val && history.value.length === 0) loadHistory()
})

onMounted(loadSummary)
</script>
