<template>
  <div class="min-h-screen">
    <div class="max-w-7xl mx-auto px-8 py-8">
      <div class="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="icon" @click="router.push({ name: 'project-dashboards', params: { projectId } })">
          <ArrowLeft :size="20" />
        </Button>
        <h1 class="text-3xl font-bold">Project Stats</h1>
      </div>

      <TokenUsageCard :projectId="projectId" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import Button from '../components/ui/button.vue'
import TokenUsageCard from '../components/TokenUsageCard.vue'

const route = useRoute()
const router = useRouter()
const projectId = route.params.projectId as string
</script>
