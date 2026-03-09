<template>
  <div class="relative group inline-flex">
    <Info :size="size" class="text-muted-foreground cursor-help" />
    <div :class="['info-tooltip', sizeClass]">
      <slot>{{ text }}</slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Info } from 'lucide-vue-next'

interface Props {
  text?: string
  size?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 16,
})

const sizeClass = computed(() => (props.size <= 14 ? 'text-xs' : 'text-sm'))
</script>

<style scoped>
.info-tooltip {
  display: none;
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  background: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  width: max-content;
  max-width: 300px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 50;
  line-height: 1.4;
}
.group:hover .info-tooltip {
  display: block;
}
</style>
