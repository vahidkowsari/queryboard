<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import ToastContainer from './components/ToastContainer.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { useIdleTimeout } from './composables/useIdleTimeout'

useIdleTimeout()

const route = useRoute()
const hideHeader = computed(() => {
  const name = route.name as string
  return name === 'shared-dashboard' || name === 'chart-fullscreen' || name === 'auth' || name === 'auth-callback'
})
</script>

<template>
  <div class="flex flex-col min-h-screen">
    <AppHeader v-if="!hideHeader" />
    <main class="flex-1">
      <router-view />
    </main>
    <AppFooter v-if="!hideHeader" />
    <ToastContainer />
    <ConfirmDialog />
  </div>
</template>

<style></style>
