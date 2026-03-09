import { ref, onMounted } from 'vue'
import { useProjectStore } from '../stores/project.store'
import type { ColorConfig, ChartLibrary } from '../types'

export function useProjectColorConfig(projectId: string) {
  const projectStore = useProjectStore()
  const colorConfig = ref<ColorConfig | undefined>(undefined)
  const chartLibrary = ref<ChartLibrary | undefined>(undefined)

  onMounted(async () => {
    const project = await projectStore.loadProject(projectId)
    colorConfig.value = project?.colorConfig
    chartLibrary.value = project?.chartLibrary
  })

  return { colorConfig, chartLibrary }
}
