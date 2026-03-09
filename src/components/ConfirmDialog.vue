<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="fixed inset-0 bg-black/50" @click="handleCancel" />
        <div class="relative bg-background border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
          <h2 class="text-lg font-semibold mb-2">{{ title }}</h2>
          <p class="text-sm text-muted-foreground mb-6">{{ message }}</p>
          <div class="flex justify-end gap-3">
            <Button variant="outline" @click="handleCancel">Cancel</Button>
            <Button
              :class="variant === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : ''"
              @click="handleConfirm"
            >
              {{ confirmLabel }}
            </Button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useConfirm } from '../composables/useConfirm'
import Button from './ui/button.vue'

const { visible, title, message, confirmLabel, variant, handleConfirm, handleCancel } = useConfirm()
</script>

<style scoped>
.dialog-enter-active {
  transition: all 0.2s ease;
}
.dialog-leave-active {
  transition: all 0.15s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
