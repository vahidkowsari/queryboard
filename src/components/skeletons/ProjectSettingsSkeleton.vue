<template>
  <div class="space-y-6">
    <div v-for="i in 3" :key="i" class="border rounded-xl p-6 space-y-4">
      <Skeleton class="h-6 w-32" />
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-2">
          <Skeleton class="h-4 w-20" />
          <Skeleton class="h-9 w-full rounded-md" />
        </div>
        <div class="space-y-2">
          <Skeleton class="h-4 w-24" />
          <Skeleton class="h-9 w-full rounded-md" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Skeleton from '../ui/skeleton.vue'
</script>
