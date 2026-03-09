<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="fixed inset-0 bg-black/50" @click="$emit('close')" />
      <Card :class="['relative w-full flex flex-col', maxWidthClass, 'max-h-[85vh]']">
        <div class="overflow-y-auto flex-1 p-6">
          <slot />
        </div>
        <div v-if="$slots.footer" class="border-t p-6 pt-4 bg-background">
          <slot name="footer" />
        </div>
      </Card>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Card from './ui/card.vue'

interface Props {
  show: boolean
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl'
  scrollable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  maxWidth: 'md',
  scrollable: false,
})

defineEmits<{ close: [] }>()

const maxWidthClass = computed(() => {
  const map = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl' }
  return map[props.maxWidth]
})
</script>
