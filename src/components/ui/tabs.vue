<template>
  <div class="tabs">
    <div class="border-b border-border">
      <div class="flex gap-1">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          @click="$emit('update:modelValue', tab.value)"
          :class="[
            'px-4 py-2 text-sm font-medium transition-colors relative',
            modelValue === tab.value
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ]"
        >
          {{ tab.label }}
          <div
            v-if="modelValue === tab.value"
            class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
          />
        </button>
      </div>
    </div>
    <div class="py-6">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
  tabs: Array<{ value: string; label: string }>
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>
