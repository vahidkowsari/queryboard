<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Settings2, Trash2, Loader2, Users, User, Shield } from 'lucide-vue-next'
import { conversationApi, type ConversationPermission } from '../services/conversation.api'
import { groupApi, type Group } from '../services/group.api'
import { adminApi, type UserWithRole } from '../services/admin.api'
import { useToast } from '../composables/useToast'
import UiButton from './ui/button.vue'

const props = defineProps<{ projectId: string; conversationId: string }>()
const emit = defineEmits<{ close: [] }>()

const toast = useToast()
const permissions = ref<ConversationPermission[]>([])
const groups = ref<Group[]>([])
const allUsers = ref<UserWithRole[]>([])
const loading = ref(true)

const newType = ref<'user' | 'group'>('user')
const newTargetId = ref('')
const newLevel = ref<'view' | 'edit'>('view')
const adding = ref(false)

onMounted(async () => {
  try {
    const [p, g, u] = await Promise.all([
      conversationApi.listPermissions(props.projectId, props.conversationId),
      groupApi.list(props.projectId),
      adminApi.listUsers(),
    ])
    permissions.value = p
    groups.value = g
    allUsers.value = u
  } catch {
    toast.error('Failed to load permissions')
  } finally {
    loading.value = false
  }
})

const isRestricted = computed(() => permissions.value.length > 0)

function targetLabel(perm: ConversationPermission): string {
  if (perm.userId) {
    const user = allUsers.value.find((u) => u.id === perm.userId)
    return user?.email || perm.userId.slice(0, 8)
  }
  if (perm.groupId) {
    const group = groups.value.find((g) => g.id === perm.groupId)
    return group?.name || perm.groupId.slice(0, 8)
  }
  return 'Unknown'
}

function targetIcon(perm: ConversationPermission) {
  return perm.groupId ? Users : User
}

async function addPermission() {
  if (!newTargetId.value || adding.value) return
  adding.value = true
  try {
    const perm = await conversationApi.setPermission(
      props.projectId,
      props.conversationId,
      newLevel.value,
      newType.value === 'user' ? newTargetId.value : undefined,
      newType.value === 'group' ? newTargetId.value : undefined,
    )
    // Replace existing permission for same target or add new
    permissions.value = permissions.value.filter(
      (p) => !(
        (perm.userId && p.userId === perm.userId) ||
        (perm.groupId && p.groupId === perm.groupId)
      ),
    )
    permissions.value.push(perm)
    newTargetId.value = ''
    toast.success('Permission added')
  } catch {
    toast.error('Failed to add permission')
  } finally {
    adding.value = false
  }
}

async function removePermission(permId: string) {
  try {
    await conversationApi.removePermission(props.projectId, props.conversationId, permId)
    permissions.value = permissions.value.filter((p) => p.id !== permId)
    toast.success('Permission removed')
  } catch {
    toast.error('Failed to remove permission')
  }
}

const targetOptions = computed(() => {
  if (newType.value === 'user') {
    return allUsers.value.map((u) => ({ id: u.id, label: u.email || u.id }))
  }
  return groups.value.map((g) => ({ id: g.id, label: g.name }))
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="emit('close')">
    <div class="bg-background rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b">
        <div class="flex items-center gap-2">
          <Settings2 :size="18" class="text-primary" />
          <h2 class="font-semibold">Conversation Permissions</h2>
        </div>
        <UiButton variant="ghost" size="sm" @click="emit('close')">×</UiButton>
      </div>

      <div class="px-6 py-4 space-y-4 overflow-y-auto flex-1">
        <div v-if="loading" class="flex justify-center py-8">
          <Loader2 :size="20" class="animate-spin text-muted-foreground" />
        </div>

        <template v-else>
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Shield :size="12" /> Access Control
          </h3>
          <p class="text-xs text-muted-foreground">
            <template v-if="isRestricted">
              This conversation is <strong>restricted</strong> — only listed users/groups can access it.
            </template>
            <template v-else>
              This conversation is <strong>open</strong> — all project members can access it. Add a permission to restrict access.
            </template>
          </p>

          <!-- Add permission -->
          <div class="flex gap-2 items-end">
            <div class="flex-1 space-y-1">
              <label class="text-xs font-medium">Type</label>
              <select
                v-model="newType"
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="user">User</option>
                <option value="group">Group</option>
              </select>
            </div>
            <div class="flex-1 space-y-1">
              <label class="text-xs font-medium">{{ newType === 'user' ? 'User' : 'Group' }}</label>
              <select
                v-model="newTargetId"
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select...</option>
                <option v-for="opt in targetOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
              </select>
            </div>
            <div class="space-y-1">
              <label class="text-xs font-medium">Level</label>
              <select
                v-model="newLevel"
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="view">View</option>
                <option value="edit">Edit</option>
              </select>
            </div>
            <UiButton size="sm" @click="addPermission" :disabled="!newTargetId || adding" class="h-9">Add</UiButton>
          </div>

          <!-- Permission list -->
          <div v-if="permissions.length" class="space-y-1.5">
            <div
              v-for="perm in permissions"
              :key="perm.id"
              class="flex items-center justify-between py-2 px-3 rounded-md border text-sm"
            >
              <div class="flex items-center gap-2">
                <component :is="targetIcon(perm)" :size="14" class="text-muted-foreground" />
                <span>{{ targetLabel(perm) }}</span>
                <span
                  class="text-xs px-1.5 py-0.5 rounded-full"
                  :class="perm.permission === 'edit' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'"
                >
                  {{ perm.permission }}
                </span>
              </div>
              <UiButton variant="ghost" size="sm" @click="removePermission(perm.id)">
                <Trash2 :size="14" class="text-destructive" />
              </UiButton>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
