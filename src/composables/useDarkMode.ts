import { ref } from 'vue'

const isDark = ref(localStorage.getItem('theme') === 'dark')

function applyTheme() {
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

// Apply on load
applyTheme()

export function useDarkMode() {
  function toggle() {
    isDark.value = !isDark.value
    applyTheme()
  }

  return { isDark, toggle }
}
