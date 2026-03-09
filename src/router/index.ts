import { createRouter, createWebHistory } from 'vue-router'
import Session from 'supertokens-web-js/recipe/session'
import { useRole } from '../composables/useRole'
import ProjectList from '../views/ProjectList.vue'
import ProjectSettings from '../views/ProjectSettings.vue'
import DashboardList from '../views/DashboardList.vue'
import DashboardView from '../views/DashboardView.vue'
import ChartCreate from '../views/ChartCreate.vue'
import ChartView from '../views/ChartView.vue'
import ChartFullscreen from '../views/ChartFullscreen.vue'
import SchemaExplorer from '../views/SchemaExplorer.vue'
import SharedDashboardView from '../views/SharedDashboardView.vue'
import ProjectStats from '../views/ProjectStats.vue'
import AuthView from '../views/AuthView.vue'
import AuthCallbackView from '../views/AuthCallbackView.vue'
import AdminUsers from '../views/AdminUsers.vue'
import DocsView from '../views/DocsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/auth',
      name: 'auth',
      component: AuthView,
      meta: { public: true },
    },
    {
      path: '/auth/callback/:provider',
      name: 'auth-callback',
      component: AuthCallbackView,
      meta: { public: true },
    },
    {
      path: '/',
      name: 'home',
      component: ProjectList,
    },
    {
      path: '/docs',
      name: 'docs',
      component: DocsView,
    },
    {
      path: '/projects/:projectId',
      name: 'project-dashboards',
      component: DashboardList,
    },
    {
      path: '/projects/:projectId/settings',
      name: 'project-settings',
      component: ProjectSettings,
    },
    {
      path: '/projects/:projectId/stats',
      name: 'project-stats',
      component: ProjectStats,
    },
    {
      path: '/projects/:projectId/schema',
      name: 'schema',
      component: SchemaExplorer,
    },
    {
      path: '/projects/:projectId/dashboard/:id',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/projects/:projectId/dashboard/:dashboardId/charts/new',
      name: 'chart-create',
      component: ChartCreate,
    },
    {
      path: '/projects/:projectId/dashboard/:dashboardId/charts/:chartId',
      name: 'chart-edit',
      component: ChartView,
    },
    {
      path: '/projects/:projectId/dashboard/:dashboardId/charts/:chartId/fullscreen',
      name: 'chart-fullscreen',
      component: ChartFullscreen,
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      component: AdminUsers,
      meta: { requiresAdmin: true },
    },
    {
      path: '/shared/:token',
      name: 'shared-dashboard',
      component: SharedDashboardView,
      meta: { public: true },
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  if (to.meta.public) return next()

  const hasSession = await Session.doesSessionExist()
  if (!hasSession) return next({ name: 'auth' })

  const { refreshRoles, isAdmin } = useRole()
  await refreshRoles()

  if (to.meta.requiresAdmin && !isAdmin()) {
    return next({ name: 'home' })
  }

  next()
})

export default router
