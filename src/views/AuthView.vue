<script setup lang="ts">
import { ref, computed, onMounted, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAuthorisationURLWithQueryParamsAndSetState } from 'supertokens-web-js/recipe/thirdparty'
import { signIn } from 'supertokens-web-js/recipe/emailpassword'
import { Loader2 } from 'lucide-vue-next'
import { API_BASE_URL } from '../services/api'
import GoogleIcon from '../components/icons/GoogleIcon.vue'
import GithubIcon from '../components/icons/GithubIcon.vue'
import MicrosoftIcon from '../components/icons/MicrosoftIcon.vue'
import OktaIcon from '../components/icons/OktaIcon.vue'
import UiButton from '../components/ui/button.vue'
import UiCard from '../components/ui/card.vue'
import UiInput from '../components/ui/input.vue'

interface ProviderInfo {
  id: string
  label: string
  icon: Component
}

const providerMap: Record<string, ProviderInfo> = {
  google: { id: 'google', label: 'Continue with Google', icon: GoogleIcon },
  github: { id: 'github', label: 'Continue with GitHub', icon: GithubIcon },
  'active-directory': { id: 'active-directory', label: 'Continue with Microsoft', icon: MicrosoftIcon },
  okta: { id: 'okta', label: 'Continue with Okta', icon: OktaIcon },
}

const route = useRoute()
const router = useRouter()
const loadingProvider = ref<string | null>(null)
const error = ref('')
const providers = ref<ProviderInfo[]>([])
const loadingProviders = ref(true)
const idleLogout = computed(() => route.query.reason === 'idle')

const email = ref('')
const password = ref('')
const signingIn = ref(false)

onMounted(async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/providers`)
    const data = await res.json()
    providers.value = (data.providers as string[])
      .map((id) => providerMap[id])
      .filter((p): p is ProviderInfo => !!p)
  } catch {
    providers.value = [{ id: 'google', label: 'Continue with Google', icon: GoogleIcon }]
  } finally {
    loadingProviders.value = false
  }
})

async function handleEmailPasswordSignIn() {
  if (!email.value || !password.value) {
    error.value = 'Please enter email and password'
    return
  }

  signingIn.value = true
  error.value = ''

  try {
    const response = await signIn({
      formFields: [
        { id: 'email', value: email.value },
        { id: 'password', value: password.value },
      ],
    })

    if (response.status === 'OK') {
      router.push({ name: 'home' })
    } else if (response.status === 'WRONG_CREDENTIALS_ERROR') {
      error.value = 'Invalid email or password'
    } else {
      error.value = 'Sign in failed. Please try again.'
    }
  } catch (err: unknown) {
    const stErr = err as { isSuperTokensGeneralError?: boolean; message?: string }
    if (stErr.isSuperTokensGeneralError) {
      error.value = stErr.message || 'Something went wrong.'
    } else {
      error.value = 'Unable to sign in. Please try again.'
    }
  } finally {
    signingIn.value = false
  }
}

async function handleOAuthSignIn(provider: string) {
  loadingProvider.value = provider
  error.value = ''

  try {
    const authUrl = await getAuthorisationURLWithQueryParamsAndSetState({
      thirdPartyId: provider,
      frontendRedirectURI: `${window.location.origin}/auth/callback/${provider}`,
    })
    window.location.assign(authUrl)
  } catch (err: unknown) {
    const stErr = err as { isSuperTokensGeneralError?: boolean; message?: string }
    if (stErr.isSuperTokensGeneralError) {
      error.value = stErr.message || 'Something went wrong.'
    } else {
      error.value = `Unable to start sign in. Please try again.`
    }
    loadingProvider.value = null
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/50 px-4">
    <div class="w-full max-w-sm">
      <div class="flex flex-col items-center gap-2 mb-8">
        <div class="flex items-center justify-center w-16 h-16">
          <img src="/logo.svg" alt="QueryBoard Logo" class="w-full h-full" />
        </div>
        <h1 class="text-2xl font-bold tracking-tight">QueryBoard</h1>
        <p class="text-sm text-muted-foreground">Sign in to your account</p>
      </div>

      <div v-if="idleLogout" class="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm px-3 py-2 mb-4 text-center">
        You were signed out due to 15 minutes of inactivity.
      </div>

      <UiCard class="p-6">
        <div
          v-if="error"
          class="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2 mb-4"
        >
          {{ error }}
        </div>

        <div v-if="loadingProviders" class="flex justify-center py-4">
          <Loader2 :size="20" class="animate-spin text-muted-foreground" />
        </div>

        <div v-else class="space-y-4">
          <!-- Email/Password Login -->
          <form @submit.prevent="handleEmailPasswordSignIn" class="space-y-3">
            <div>
              <label class="block text-sm font-medium mb-1.5">Email</label>
              <UiInput
                v-model="email"
                type="email"
                placeholder="admin@example.com"
                :disabled="signingIn"
                required
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1.5">Password</label>
              <UiInput
                v-model="password"
                type="password"
                placeholder="Enter your password"
                :disabled="signingIn"
                required
              />
            </div>
            <UiButton
              type="submit"
              :disabled="signingIn || loadingProvider !== null || !email || !password"
              class="w-full"
            >
              <Loader2 v-if="signingIn" :size="16" class="animate-spin mr-2" />
              Sign In
            </UiButton>
          </form>

          <!-- Divider -->
          <div v-if="providers.length > 0" class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t"></div>
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <!-- OAuth Providers -->
          <div v-if="providers.length > 0" class="space-y-3">
            <UiButton
              v-for="p in providers"
              :key="p.id"
              type="button"
              variant="outline"
              :disabled="!!loadingProvider || signingIn"
              class="w-full flex items-center justify-center gap-2"
              @click="handleOAuthSignIn(p.id)"
            >
              <Loader2 v-if="loadingProvider === p.id" :size="16" class="animate-spin" />
              <component v-else :is="p.icon" :size="16" />
              {{ p.label }}
            </UiButton>
          </div>
        </div>
      </UiCard>
    </div>
  </div>
</template>
