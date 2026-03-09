<template>
  <header class="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
    <div class="max-w-7xl mx-auto flex items-center justify-between h-14 px-8">
      <router-link to="/" class="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
        <div class="flex items-center justify-center w-8 h-8">
          <img src="/logo.svg" alt="QueryBoard" class="w-full h-full" />
        </div>
        <span class="font-bold text-lg tracking-tight">QueryBoard</span>
      </router-link>

      <nav v-if="showBreadcrumb" class="hidden sm:flex items-center gap-1.5 text-sm">
        <router-link to="/" class="text-muted-foreground hover:text-foreground transition-colors">
          Projects
        </router-link>
        <ChevronRight :size="14" class="text-muted-foreground/50" />
        <router-link
          :to="`/projects/${projectStore.currentProject!.id}`"
          class="text-muted-foreground hover:text-foreground transition-colors max-w-[200px] truncate"
        >
          {{ projectStore.currentProject!.name }}
        </router-link>
        <template v-if="pageTitle">
          <ChevronRight :size="14" class="text-muted-foreground/50" />
          <span class="text-foreground font-medium truncate max-w-[200px]">{{ pageTitle }}</span>
        </template>
      </nav>
      <div v-else />

      <div class="flex items-center gap-3">
        <button
          @click="showSearch = !showSearch"
          class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          title="Search (Ctrl+K)"
        >
          <Search :size="16" />
        </button>
        <button
          @click="toggleDark"
          class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          :title="isDark ? 'Light mode' : 'Dark mode'"
        >
          <Sun v-if="isDark" :size="16" />
          <Moon v-else :size="16" />
        </button>
        <router-link
          v-if="isAdmin()"
          to="/admin/users"
          class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Shield :size="16" />
          <span class="hidden sm:inline">Admin</span>
        </router-link>
        <button
          @click="handleSignOut"
          class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut :size="16" />
          <span class="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </div>
  </header>
  <SearchModal :show="showSearch" @close="showSearch = false" />
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight, LogOut, Shield, Moon, Sun, Search } from 'lucide-vue-next'
import Session from 'supertokens-web-js/recipe/session'
import { useProjectStore } from '../stores/project.store'
import { useDashboardStore } from '../stores/dashboard.store'
import { useRole } from '../composables/useRole'
import { useDarkMode } from '../composables/useDarkMode'
import SearchModal from './SearchModal.vue'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const dashboardStore = useDashboardStore()
const { isAdmin } = useRole()
const { isDark, toggle: toggleDark } = useDarkMode()
const showSearch = ref(false)

function handleCmdK(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    showSearch.value = !showSearch.value
  }
}

onMounted(() => document.addEventListener('keydown', handleCmdK))
onUnmounted(() => document.removeEventListener('keydown', handleCmdK))

async function handleSignOut() {
  await Session.signOut()
  router.push({ name: 'auth' })
}

const isHomePage = computed(() => route.name === 'home')

const showBreadcrumb = computed(() => {
  return !isHomePage.value && projectStore.currentProject
})

const pageTitle = computed(() => {
  const name = route.name as string
  if (name === 'project-dashboards') return ''
  if (name === 'project-settings') return 'Settings'
  if (name === 'project-stats') return 'Stats'
  if (name === 'schema') return 'Schema Explorer'
  if (name === 'dashboard') {
    const id = route.params.id as string
    const dash = dashboardStore.dashboards.find((d) => d.id === id)
    return dash?.name || 'Dashboard'
  }
  if (name === 'chart-create') return 'New Chart'
  if (name === 'chart-edit') return 'Edit Chart'
  if (name === 'chart-fullscreen') return 'Fullscreen'
  return ''
})
</script>
