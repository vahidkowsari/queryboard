<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <div v-for="i in 6" :key="i" class="border rounded-xl p-5 space-y-3">
      <div class="flex items-start justify-between">
        <div class="flex-1 space-y-2">
          <Skeleton class="h-5 w-40" />
          <Skeleton class="h-4 w-56" />
        </div>
        <Skeleton class="h-6 w-16 rounded-full" />
      </div>
      <div class="flex items-center gap-4 pt-2">
        <Skeleton class="h-3 w-24" />
        <Skeleton class="h-3 w-20" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Skeleton from '../ui/skeleton.vue'
</script>
