<template>
  <div class="min-h-screen">
    <div class="max-w-7xl mx-auto px-8 py-8">
      <div class="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" @click="goBack">
          <ArrowLeft :size="20" />
        </Button>
        <h1 class="text-3xl font-bold">New Chart</h1>
      </div>

      <AIChartGenerator
        :dashboard-id="dashboardId"
        :color-config="colorConfig"
        :chart-library="chartLibrary"
        @chart-created="handleChartCreated"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import AIChartGenerator from '../components/AIChartGenerator.vue'
import Button from '../components/ui/button.vue'
import { useProjectColorConfig } from '../composables/useProjectColorConfig'

const router = useRouter()
const route = useRoute()
const projectId = route.params.projectId as string
const dashboardId = route.params.dashboardId as string
const { colorConfig, chartLibrary } = useProjectColorConfig(projectId)

function goBack() {
  router.push(`/projects/${projectId}/dashboard/${dashboardId}`)
}

function handleChartCreated(chart: any) {
  router.push(`/projects/${projectId}/dashboard/${dashboardId}/charts/${chart.id}`)
}
</script>
