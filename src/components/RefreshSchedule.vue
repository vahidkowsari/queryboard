<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Clock, Trash2, Loader2 } from 'lucide-vue-next'
import { dashboardApi } from '../services/dashboard.api'
import { useToast } from '../composables/useToast'
import UiButton from './ui/button.vue'

const props = defineProps<{ projectId: string; dashboardId: string }>()

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const currentCron = ref<string | null>(null)
const lastRefreshed = ref<string | null>(null)
const selectedPreset = ref('')
const customCron = ref('')

const presets = [
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 6 AM', value: '0 6 * * *' },
  { label: 'Daily at 9 AM', value: '0 9 * * *' },
  { label: 'Weekly (Mon 9 AM)', value: '0 9 * * 1' },
  { label: 'Custom', value: 'custom' },
]

const effectiveCron = computed(() => {
  if (selectedPreset.value === 'custom') return customCron.value.trim()
  return selectedPreset.value
})

const currentLabel = computed(() => {
  if (!currentCron.value) return 'Not scheduled'
  const match = presets.find((p) => p.value === currentCron.value)
  return match ? match.label : currentCron.value
})

onMounted(async () => {
  try {
    const schedule = await dashboardApi.getRefreshSchedule(props.projectId, props.dashboardId)
    currentCron.value = schedule.refreshCron
    lastRefreshed.value = schedule.lastRefreshedAt
    if (currentCron.value) {
      const match = presets.find((p) => p.value === currentCron.value)
      if (match) {
        selectedPreset.value = match.value
      } else {
        selectedPreset.value = 'custom'
        customCron.value = currentCron.value
      }
    }
  } catch {
    toast.error('Failed to load refresh schedule')
  } finally {
    loading.value = false
  }
})

async function saveSchedule() {
  if (!effectiveCron.value) return
  saving.value = true
  try {
    const result = await dashboardApi.setRefreshSchedule(props.projectId, props.dashboardId, effectiveCron.value)
    currentCron.value = result.refreshCron
    lastRefreshed.value = result.lastRefreshedAt
    toast.success('Refresh schedule saved')
  } catch {
    toast.error('Invalid cron expression')
  } finally {
    saving.value = false
  }
}

async function clearSchedule() {
  saving.value = true
  try {
    await dashboardApi.clearRefreshSchedule(props.projectId, props.dashboardId)
    currentCron.value = null
    selectedPreset.value = ''
    customCron.value = ''
    toast.success('Refresh schedule removed')
  } catch {
    toast.error('Failed to remove schedule')
  } finally {
    saving.value = false
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleString()
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2 text-sm">
      <Clock :size="14" class="text-muted-foreground" />
      <span class="font-medium">Auto-Refresh:</span>
      <span class="text-muted-foreground">{{ currentLabel }}</span>
    </div>

    <div v-if="lastRefreshed" class="text-xs text-muted-foreground">
      Last refreshed: {{ formatDate(lastRefreshed) }}
    </div>

    <div v-if="loading" class="flex justify-center py-2">
      <Loader2 :size="16" class="animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <div class="flex gap-2 items-end">
        <div class="flex-1 space-y-1">
          <select
            v-model="selectedPreset"
            class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="">No schedule</option>
            <option v-for="p in presets" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </div>

        <input
          v-if="selectedPreset === 'custom'"
          v-model="customCron"
          placeholder="*/30 * * * *"
          class="flex h-9 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono"
        />

        <UiButton size="sm" @click="saveSchedule" :disabled="!effectiveCron || saving" class="h-9">
          {{ saving ? 'Saving...' : 'Save' }}
        </UiButton>

        <UiButton
          v-if="currentCron"
          variant="ghost"
          size="sm"
          @click="clearSchedule"
          :disabled="saving"
          class="h-9"
          title="Remove schedule"
        >
          <Trash2 :size="14" class="text-destructive" />
        </UiButton>
      </div>
    </template>
  </div>
</template>
