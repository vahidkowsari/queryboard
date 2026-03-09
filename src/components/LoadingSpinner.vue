<template>
  <div class="flex flex-col items-center justify-center gap-3" :class="containerClass">
    <Loader2 class="animate-spin text-primary" :size="size" />
    <p v-if="label" class="text-sm text-muted-foreground">{{ label }}</p>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

interface Props {
  label?: string
  size?: number
  containerClass?: string
}

withDefaults(defineProps<Props>(), {
  size: 32,
  containerClass: '',
})
</script>
