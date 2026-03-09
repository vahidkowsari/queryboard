<template>
  <div class="max-w-7xl mx-auto px-8 py-8">
    <div class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-4">
        <Skeleton class="h-10 w-10 rounded-md" />
        <div class="space-y-2">
          <Skeleton class="h-8 w-56" />
          <Skeleton class="h-4 w-36" />
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Skeleton class="h-9 w-9 rounded-md" />
        <Skeleton class="h-9 w-9 rounded-md" />
        <Skeleton class="h-9 w-9 rounded-md" />
        <Skeleton class="h-9 w-9 rounded-md" />
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div v-for="i in 4" :key="i" class="border rounded-xl p-5 space-y-4">
        <div class="flex items-center justify-between">
          <Skeleton class="h-5 w-44" />
          <div class="flex gap-1">
            <Skeleton class="h-7 w-7 rounded-md" />
            <Skeleton class="h-7 w-7 rounded-md" />
          </div>
        </div>
        <Skeleton class="h-52 w-full rounded-lg" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Skeleton from '../ui/skeleton.vue'
</script>
