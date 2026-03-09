<template>
  <div :class="cn('animate-pulse rounded-md bg-muted', $attrs.class ?? '')" />
</template>

<script setup lang="ts">
import { cn } from '../../lib/utils'
</script>
