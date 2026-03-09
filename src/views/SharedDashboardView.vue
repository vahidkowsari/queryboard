<template>
  <div class="min-h-screen">
    <div v-if="loading" class="flex items-center justify-center h-screen">
      <LoadingSpinner label="Loading shared dashboard..." />
    </div>

    <div v-else-if="error" class="flex items-center justify-center h-screen">
      <div class="text-center">
        <Link2Off :size="64" class="mx-auto text-muted-foreground mb-4" />
        <h2 class="text-xl font-semibold mb-2">Dashboard not found</h2>
        <p class="text-muted-foreground">This share link may have expired or been revoked.</p>
      </div>
    </div>

    <div v-else-if="dashboard">
      <div class="max-w-7xl mx-auto px-8 py-8">
        <div class="flex items-center justify-between mb-8">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <Share2 :size="18" class="text-muted-foreground" />
              <span class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Shared Dashboard</span>
            </div>
            <h1 class="text-3xl font-bold">{{ dashboard.name }}</h1>
            <p v-if="dashboard.description" class="text-sm text-muted-foreground mt-1">
              {{ dashboard.description }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <div v-if="charts.length > 0" class="flex border rounded-md">
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
            </div>
          </div>
        </div>

        <div v-if="charts.length === 0" class="text-center py-16">
          <BarChart3 :size="64" class="mx-auto text-muted-foreground mb-4" />
          <h2 class="text-xl font-semibold mb-2">No charts</h2>
          <p class="text-muted-foreground">This dashboard has no charts yet.</p>
        </div>

        <div
          v-else
          :class="
            viewMode === 'compact'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
              : 'grid grid-cols-1 lg:grid-cols-2 gap-6'
          "
        >
          <SharedChartCard v-for="chart in charts" :key="chart.id" :chart="chart" :compact="viewMode === 'compact'" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Share2, BarChart3, List, LayoutGrid, Link2Off } from 'lucide-vue-next'
import { dashboardApi } from '../services/dashboard.api'
import type { DashboardRow, ChartRow } from '../services/dashboard.api'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import SharedChartCard from '../components/SharedChartCard.vue'
import Button from '../components/ui/button.vue'

const route = useRoute()

const loading = ref(true)
const error = ref(false)
const dashboard = ref<DashboardRow | null>(null)
const charts = ref<ChartRow[]>([])
const viewMode = ref<'full' | 'compact'>('full')

onMounted(async () => {
  const token = route.params.token as string
  try {
    const data = await dashboardApi.getShared(token)
    dashboard.value = data
    charts.value = data.charts || []
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>
