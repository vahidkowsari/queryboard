<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <Skeleton class="h-9 w-64 rounded-md" />
      <Skeleton class="h-9 w-28 rounded-md" />
      <Skeleton class="h-9 w-28 rounded-md" />
    </div>
    <div class="space-y-3">
      <div v-for="i in 8" :key="i" class="border rounded-lg p-4 space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Skeleton class="h-4 w-4 rounded" />
            <Skeleton class="h-5 w-40" />
          </div>
          <Skeleton class="h-4 w-16" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Skeleton from '../ui/skeleton.vue'
</script>
