import { onMounted, onUnmounted } from 'vue'
import Session from 'supertokens-web-js/recipe/session'
import { useRouter } from 'vue-router'
import { config } from '../config'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove']

export function useIdleTimeout() {
  const router = useRouter()
  let timer: ReturnType<typeof setTimeout> | null = null

  function resetTimer() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      const hasSession = await Session.doesSessionExist()
      if (hasSession) {
        await Session.signOut()
        router.push({ name: 'auth', query: { reason: 'idle' } })
      }
    }, config.idleTimeoutMs)
  }

  onMounted(() => {
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
  })

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
    ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetTimer))
  })
}
