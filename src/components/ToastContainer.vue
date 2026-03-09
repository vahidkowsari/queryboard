<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="[
          'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium cursor-pointer',
          toast.type === 'success' && 'bg-green-50 border-green-200 text-green-800',
          toast.type === 'error' && 'bg-red-50 border-red-200 text-red-800',
          toast.type === 'info' && 'bg-blue-50 border-blue-200 text-blue-800',
        ]"
        @click="dismiss(toast.id)"
      >
        <CheckCircle v-if="toast.type === 'success'" :size="18" class="text-green-600 shrink-0" />
        <AlertCircle v-if="toast.type === 'error'" :size="18" class="text-red-600 shrink-0" />
        <Info v-if="toast.type === 'info'" :size="18" class="text-blue-600 shrink-0" />
        <span>{{ toast.message }}</span>
        <X :size="14" class="ml-auto shrink-0 opacity-50 hover:opacity-100" />
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { CheckCircle, AlertCircle, Info, X } from 'lucide-vue-next'
import { useToast } from '../composables/useToast'

const { toasts, dismiss } = useToast()
</script>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease;
}
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100px);
}
</style>
