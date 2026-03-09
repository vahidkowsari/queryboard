<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Users, Plus, Trash2, UserPlus, Loader2, X } from 'lucide-vue-next'
import { groupApi, type Group } from '../services/group.api'
import { adminApi, type UserWithRole } from '../services/admin.api'
import { useToast } from '../composables/useToast'
import UiButton from './ui/button.vue'
import UiCard from './ui/card.vue'
import UiInput from './ui/input.vue'

const props = defineProps<{ projectId: string }>()

const toast = useToast()
const groups = ref<Group[]>([])
const allUsers = ref<UserWithRole[]>([])
const loading = ref(true)
const newGroupName = ref('')
const newGroupDesc = ref('')
const addingMember = ref<string | null>(null)
const selectedUserId = ref('')

onMounted(async () => {
  try {
    const [g, u] = await Promise.all([groupApi.list(props.projectId), adminApi.listUsers()])
    groups.value = g
    allUsers.value = u
  } catch {
    toast.error('Failed to load groups')
  } finally {
    loading.value = false
  }
})

async function createGroup() {
  if (!newGroupName.value.trim()) return
  try {
    const group = await groupApi.create(props.projectId, newGroupName.value, newGroupDesc.value || undefined)
    groups.value.push(group)
    newGroupName.value = ''
    newGroupDesc.value = ''
    toast.success('Group created')
  } catch {
    toast.error('Failed to create group')
  }
}

async function deleteGroup(groupId: string) {
  try {
    await groupApi.remove(props.projectId, groupId)
    groups.value = groups.value.filter((g) => g.id !== groupId)
    toast.success('Group deleted')
  } catch {
    toast.error('Failed to delete group')
  }
}

async function addMember(groupId: string) {
  if (!selectedUserId.value) return
  try {
    await groupApi.addMember(props.projectId, groupId, selectedUserId.value)
    const group = groups.value.find((g) => g.id === groupId)
    if (group) {
      group.members.push({
        id: crypto.randomUUID(),
        groupId,
        userId: selectedUserId.value,
        addedAt: new Date().toISOString(),
      })
    }
    selectedUserId.value = ''
    addingMember.value = null
    toast.success('Member added')
  } catch {
    toast.error('Failed to add member')
  }
}

async function removeMember(groupId: string, userId: string) {
  try {
    await groupApi.removeMember(props.projectId, groupId, userId)
    const group = groups.value.find((g) => g.id === groupId)
    if (group) {
      group.members = group.members.filter((m) => m.userId !== userId)
    }
    toast.success('Member removed')
  } catch {
    toast.error('Failed to remove member')
  }
}

function userEmail(userId: string): string {
  return allUsers.value.find((u) => u.id === userId)?.email || userId.slice(0, 8)
}

function nonMembers(group: Group) {
  const memberIds = new Set(group.members.map((m) => m.userId))
  return allUsers.value.filter((u) => !memberIds.has(u.id))
}
</script>

<template>
  <UiCard>
    <div class="p-6 space-y-4">
      <div class="flex items-center gap-2">
        <Users :size="18" class="text-muted-foreground" />
        <h2 class="text-lg font-semibold">Groups</h2>
      </div>

      <div v-if="loading" class="flex justify-center py-6">
        <Loader2 :size="20" class="animate-spin text-muted-foreground" />
      </div>

      <template v-else>
        <!-- Create group -->
        <div class="flex gap-2">
          <UiInput v-model="newGroupName" placeholder="Group name" class="flex-1" />
          <UiInput v-model="newGroupDesc" placeholder="Description (optional)" class="flex-1" />
          <UiButton @click="createGroup" :disabled="!newGroupName.trim()" size="sm">
            <Plus :size="14" />
            Add
          </UiButton>
        </div>

        <!-- Groups list -->
        <div v-if="groups.length === 0" class="text-sm text-muted-foreground text-center py-4">
          No groups yet. Create one above.
        </div>

        <div v-for="group in groups" :key="group.id" class="border rounded-lg p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium text-sm">{{ group.name }}</h3>
              <p v-if="group.description" class="text-xs text-muted-foreground">{{ group.description }}</p>
            </div>
            <div class="flex items-center gap-1">
              <UiButton variant="ghost" size="sm" @click="addingMember = addingMember === group.id ? null : group.id">
                <UserPlus :size="14" />
              </UiButton>
              <UiButton variant="ghost" size="sm" @click="deleteGroup(group.id)">
                <Trash2 :size="14" class="text-destructive" />
              </UiButton>
            </div>
          </div>

          <!-- Add member form -->
          <div v-if="addingMember === group.id" class="flex gap-2">
            <select
              v-model="selectedUserId"
              class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">Select user...</option>
              <option v-for="u in nonMembers(group)" :key="u.id" :value="u.id">{{ u.email || u.id }}</option>
            </select>
            <UiButton size="sm" @click="addMember(group.id)" :disabled="!selectedUserId">Add</UiButton>
            <UiButton variant="ghost" size="sm" @click="addingMember = null">
              <X :size="14" />
            </UiButton>
          </div>

          <!-- Members -->
          <div v-if="group.members.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="member in group.members"
              :key="member.id"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted"
            >
              {{ userEmail(member.userId) }}
              <button @click="removeMember(group.id, member.userId)" class="hover:text-destructive">
                <X :size="12" />
              </button>
            </span>
          </div>
          <p v-else class="text-xs text-muted-foreground">No members</p>
        </div>
      </template>
    </div>
  </UiCard>
</template>
