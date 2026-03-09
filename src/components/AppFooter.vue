<template>
  <footer class="border-t bg-background/80 backdrop-blur-md mt-auto">
    <div class="max-w-7xl mx-auto px-8 py-6">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <div class="flex items-center gap-2">
            <img src="/logo.svg" alt="QueryBoard" class="w-5 h-5" />
            <span class="font-semibold">QueryBoard</span>
          </div>
          <span class="hidden sm:inline">·</span>
          <span class="hidden sm:inline">v{{ version }}</span>
          <span class="hidden sm:inline">·</span>
          <span class="hidden sm:inline">© {{ currentYear }}</span>
        </div>
        
        <div class="flex items-center gap-6 text-sm text-muted-foreground">
          <router-link to="/docs" class="hover:text-foreground transition-colors">
            Documentation
          </router-link>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import packageJson from '../../package.json'

const currentYear = computed(() => new Date().getFullYear())
const version = packageJson.version
</script>
