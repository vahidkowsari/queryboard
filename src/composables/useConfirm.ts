import { ref } from 'vue'

const visible = ref(false)
const title = ref('')
const message = ref('')
const confirmLabel = ref('Confirm')
const variant = ref<'danger' | 'default'>('default')
let resolvePromise: ((value: boolean) => void) | null = null

export function useConfirm() {
  function confirm(opts: {
    title: string
    message: string
    confirmLabel?: string
    variant?: 'danger' | 'default'
  }): Promise<boolean> {
    title.value = opts.title
    message.value = opts.message
    confirmLabel.value = opts.confirmLabel || 'Confirm'
    variant.value = opts.variant || 'default'
    visible.value = true

    return new Promise((resolve) => {
      resolvePromise = resolve
    })
  }

  function handleConfirm() {
    visible.value = false
    resolvePromise?.(true)
    resolvePromise = null
  }

  function handleCancel() {
    visible.value = false
    resolvePromise?.(false)
    resolvePromise = null
  }

  return { visible, title, message, confirmLabel, variant, confirm, handleConfirm, handleCancel }
}
