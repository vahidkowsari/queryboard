import { ref, readonly } from 'vue'
import Session from 'supertokens-web-js/recipe/session'

export type AppRole = 'admin' | 'editor' | 'viewer'

const currentRoles = ref<AppRole[]>([])

export function useRole() {
  async function refreshRoles() {
    try {
      const payload = await Session.getAccessTokenPayloadSecurely()
      currentRoles.value = (payload?.roles as AppRole[]) ?? []
    } catch {
      currentRoles.value = []
    }
  }

  const isAdmin = () => currentRoles.value.includes('admin')
  const isEditor = () => currentRoles.value.includes('editor') || isAdmin()
  const isViewer = () => currentRoles.value.length > 0

  return {
    roles: readonly(currentRoles),
    refreshRoles,
    isAdmin,
    isEditor,
    isViewer,
  }
}
