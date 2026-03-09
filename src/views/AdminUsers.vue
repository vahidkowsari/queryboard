<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Shield, Users, Loader2 } from 'lucide-vue-next'
import { adminApi, type UserWithRole } from '../services/admin.api'
import type { AppRole } from '../composables/useRole'
import UiCard from '../components/ui/card.vue'
import UiButton from '../components/ui/button.vue'

const users = ref<UserWithRole[]>([])
const loading = ref(true)
const updating = ref<string | null>(null)
const error = ref('')

const roleLabels: Record<AppRole, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'bg-red-100 text-red-700' },
  editor: { label: 'Editor', color: 'bg-blue-100 text-blue-700' },
  viewer: { label: 'Viewer', color: 'bg-muted text-muted-foreground' },
}

const allRoles: AppRole[] = ['admin', 'editor', 'viewer']

function primaryRole(user: UserWithRole): AppRole | null {
  return user.roles[0] ?? null
}

onMounted(async () => {
  try {
    users.value = await adminApi.listUsers()
  } catch {
    error.value = 'Failed to load users'
  } finally {
    loading.value = false
  }
})

async function changeRole(userId: string, role: AppRole) {
  updating.value = userId
  try {
    await adminApi.setUserRole(userId, role)
    const user = users.value.find((u) => u.id === userId)
    if (user) user.roles = [role]
  } catch {
    error.value = 'Failed to update role'
  } finally {
    updating.value = null
  }
}
</script>

<template>
  <div class="min-h-screen">
  <div class="max-w-7xl mx-auto px-8 py-8">
    <div class="flex items-center gap-3 mb-6">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
        <Shield :size="20" class="text-primary" />
      </div>
      <div>
        <h1 class="text-xl font-bold">User Management</h1>
        <p class="text-sm text-muted-foreground">Manage user roles and permissions</p>
      </div>
    </div>

    <div v-if="error" class="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2 mb-4">
      {{ error }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <Loader2 :size="24" class="animate-spin text-muted-foreground" />
    </div>

    <UiCard v-else class="overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b bg-muted/30">
            <th class="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
            <th class="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
            <th class="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" class="border-b last:border-0 hover:bg-muted/20">
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <Users :size="16" class="text-muted-foreground" />
                <span>{{ user.email || user.id }}</span>
              </div>
            </td>
            <td class="px-4 py-3">
              <span
                v-if="primaryRole(user)"
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                :class="roleLabels[primaryRole(user)!].color"
              >
                {{ roleLabels[primaryRole(user)!].label }}
              </span>
              <span v-else class="text-muted-foreground text-xs">No role</span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-1">
                <UiButton
                  v-for="role in allRoles"
                  :key="role"
                  size="sm"
                  :variant="user.roles.includes(role) ? 'default' : 'outline'"
                  :disabled="updating === user.id || user.roles.includes(role)"
                  class="text-xs h-7 px-2"
                  @click="changeRole(user.id, role)"
                >
                  <Loader2 v-if="updating === user.id" :size="12" class="animate-spin mr-1" />
                  {{ roleLabels[role].label }}
                </UiButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="!users.length" class="flex flex-col items-center py-12 text-muted-foreground">
        <Users :size="32" class="mb-2" />
        <p>No users found</p>
      </div>
    </UiCard>
  </div>
  </div>
</template>
