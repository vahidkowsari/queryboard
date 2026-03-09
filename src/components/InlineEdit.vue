<template>
  <div class="flex items-center gap-2">
    <input v-if="editing" ref="inputRef" v-model="localValue" :class="inputClass" @keyup.enter="save" @blur="save" />
    <slot v-else :value="localValue">
      <span>{{ localValue }}</span>
    </slot>
    <Button
      variant="ghost"
      size="icon"
      @mousedown.prevent
      @click="editing ? save() : startEdit()"
      :title="editing ? 'Save' : 'Edit'"
    >
      <Check v-if="editing" :size="iconSize" />
      <Edit2 v-else :size="iconSize" />
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { Edit2, Check } from 'lucide-vue-next'
import Button from './ui/button.vue'

interface Props {
  modelValue: string
  inputClass?: string
  iconSize?: number
}

const props = withDefaults(defineProps<Props>(), {
  inputClass: 'text-3xl font-bold h-auto py-1 px-2 border rounded outline-none focus:ring-2 focus:ring-primary',
  iconSize: 18,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: [value: string]
}>()

const editing = ref(false)
const localValue = ref(props.modelValue)
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelValue,
  (v) => {
    localValue.value = v
  },
)

function startEdit() {
  localValue.value = props.modelValue
  editing.value = true
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

function save() {
  if (!editing.value) return
  editing.value = false
  if (!localValue.value.trim()) {
    localValue.value = props.modelValue
    return
  }
  if (localValue.value !== props.modelValue) {
    emit('update:modelValue', localValue.value)
    emit('save', localValue.value)
  }
}
</script>
