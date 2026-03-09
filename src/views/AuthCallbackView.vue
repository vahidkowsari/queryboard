<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { signInAndUp } from 'supertokens-web-js/recipe/thirdparty'
import { Loader2 } from 'lucide-vue-next'

const router = useRouter()
const error = ref('')

onMounted(async () => {
  try {
    const response = await signInAndUp()

    if (response.status === 'OK') {
      router.push('/')
    } else if (response.status === 'NO_EMAIL_GIVEN_BY_PROVIDER') {
      error.value = 'Google did not provide an email. Please use a different account.'
    } else if (response.status === 'SIGN_IN_UP_NOT_ALLOWED') {
      error.value = response.reason
    }
  } catch (err: unknown) {
    const stErr = err as { isSuperTokensGeneralError?: boolean; message?: string }
    if (stErr.isSuperTokensGeneralError) {
      error.value = stErr.message || 'Something went wrong.'
    } else {
      error.value = 'Unable to complete sign in. Please try again.'
    }
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/50 px-4">
    <div v-if="error" class="text-center">
      <div class="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3 mb-4">
        {{ error }}
      </div>
      <button
        class="text-primary font-medium hover:underline text-sm"
        @click="router.push('/auth')"
      >
        Back to Sign In
      </button>
    </div>
    <div v-else class="flex flex-col items-center gap-3">
      <Loader2 :size="24" class="animate-spin text-primary" />
      <p class="text-sm text-muted-foreground">Completing sign in...</p>
    </div>
  </div>
</template>
