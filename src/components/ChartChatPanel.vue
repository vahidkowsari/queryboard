<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { MessageSquare, Send, Loader2, X, ChevronDown, ChevronUp, Code, Check, Copy, Sparkles } from 'lucide-vue-next'
import { marked } from 'marked'
import { API_BASE_URL } from '../services/api'
import { config } from '../config'
import { useResumableSSE, type SSECallbacks } from '../composables/useResumableSSE'
import Button from './ui/button.vue'
import type { Chart } from '../types'

marked.setOptions({ breaks: true, gfm: true })

function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}

interface Props {
  projectId: string
  dashboardId: string
  chart: Chart
  show: boolean
  showLlmDetails?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sql?: string
  data?: Record<string, string>[]
  columns?: string[]
}

const messages = ref<ChatMessage[]>([])
const question = ref('')
const loading = ref(false)
const loadingHistory = ref(false)
const conversationId = ref<string | null>(null)
const agentSteps = ref<string[]>([])
const totalStepsReceived = ref(0)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const messagesRef = ref<HTMLElement | null>(null)
const expandedSql = ref<number | null>(null)
const expandedData = ref<number | null>(null)
const copiedIndex = ref<number | null>(null)
const { startSession, reconnectSession, findLatestSession, finishSession } = useResumableSSE()
let assistantResultCommitted = false

const suggestions = computed(() => [
  'What insights can you find?',
  'What is driving the biggest value?',
  'Are there any outliers?',
  'Summarize the key trends',
])

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

async function copyToClipboard(text: string, index: number) {
  await navigator.clipboard.writeText(text)
  copiedIndex.value = index
  setTimeout(() => { copiedIndex.value = null }, config.copyFeedbackMs)
}

async function loadHistory() {
  loadingHistory.value = true
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/projects/${props.projectId}/agents/chart-chat/history?chartId=${props.chart.id}`,
      { credentials: 'include' },
    )
    if (res.ok) {
      const data = await res.json()
      if (data.conversationId) {
        conversationId.value = data.conversationId
        messages.value = (data.messages || []).map((m: ChatMessage) => ({
          role: m.role,
          content: m.content,
          sql: m.sql || undefined,
          data: m.data || undefined,
          columns: m.columns || undefined,
        }))
        scrollToBottom()
      }
    }
  } catch {
    // Silently fail — user can still start a new conversation
  } finally {
    loadingHistory.value = false
  }
}

watch(() => props.show, (val) => {
  if (val) {
    if (!conversationId.value) loadHistory()
    void tryReconnectSession()
    nextTick(() => inputRef.value?.focus())
  }
}, { immediate: true })

watch(() => props.chart.id, () => {
  // Reset when chart changes
  messages.value = []
  conversationId.value = null
  agentSteps.value = []
  question.value = ''
  if (props.show) loadHistory()
})

async function sendMessage(messageText?: string) {
  const q = (messageText || question.value).trim()
  if (!q || loading.value) return

  messages.value.push({ role: 'user', content: q })
  question.value = ''
  loading.value = true
  agentSteps.value = []
  totalStepsReceived.value = 0
  assistantResultCommitted = false
  scrollToBottom()

  try {
    await startSession(
      `/api/projects/${props.projectId}/agents/chart-chat`,
      {
        message: q,
        dashboardId: props.dashboardId,
        chartId: props.chart.id,
        ...(conversationId.value ? { conversationId: conversationId.value } : {}),
      },
      makeChartChatCallbacks(),
    )
    finishSession()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const msg = err instanceof Error ? err.message : 'Failed to chat'
    messages.value.push({ role: 'assistant', content: `Error: ${msg}` })
    finishSession()
  } finally {
    loading.value = false
    agentSteps.value = []
    scrollToBottom()
  }
}

function makeChartChatCallbacks(): SSECallbacks {
  return {
    onConversation: (data) => {
      conversationId.value = data.conversationId
    },
    onStep: (data) => {
      const shouldShow = props.showLlmDetails || !data.step.startsWith('Using ')
      if (shouldShow) {
        agentSteps.value.push(data.step)
        scrollToBottom()
      }
      totalStepsReceived.value++
    },
    onResult: (data) => {
      if (assistantResultCommitted) return
      assistantResultCommitted = true
      messages.value.push({
        role: 'assistant',
        content: data.answer as string,
        sql: data.sql as string | undefined,
        data: data.data as Record<string, string>[] | undefined,
        columns: data.columns as string[] | undefined,
      })
      scrollToBottom()
    },
    onError: (data) => {
      messages.value.push({ role: 'assistant', content: `Error: ${data.error}` })
    },
  }
}

async function tryReconnectSession() {
  const sessionId = await findLatestSession(props.projectId, 'chart-chat', {
    dashboardId: props.dashboardId,
    chartId: props.chart.id,
  })
  if (!sessionId || loading.value) return

  loading.value = true
  agentSteps.value = []
  totalStepsReceived.value = 0
  assistantResultCommitted = false
  scrollToBottom()

  try {
    const ok = await reconnectSession(props.projectId, sessionId, makeChartChatCallbacks())
    if (!ok) {
      // Session expired or unavailable
    }
    finishSession()
  } catch {
    finishSession()
  } finally {
    loading.value = false
    agentSteps.value = []
    scrollToBottom()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

</script>

<template>
  <Teleport to="body">
    <Transition name="chart-chat">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/40 backdrop-blur-sm" @click="emit('close')" />
        <div class="relative bg-background shadow-2xl border w-full max-w-2xl h-[80vh] rounded-2xl flex flex-col overflow-hidden">

          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-3 border-b shrink-0">
            <div class="flex items-center gap-2 min-w-0">
              <div class="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0">
                <MessageSquare :size="14" class="text-primary" />
              </div>
              <div class="min-w-0">
                <h2 class="font-semibold text-sm truncate">Chat with chart</h2>
                <p class="text-xs text-muted-foreground truncate">{{ chart.name }}</p>
              </div>
            </div>
            <button @click="emit('close')" class="text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1 hover:bg-muted" title="Close (Esc)">
              <X :size="18" />
            </button>
          </div>

          <!-- Messages -->
          <div ref="messagesRef" class="flex-1 overflow-y-auto">
            <div class="max-w-xl mx-auto px-5 py-5 space-y-4">

              <!-- Loading history -->
              <div v-if="loadingHistory" class="text-center py-12 text-muted-foreground">
                <Loader2 :size="24" class="animate-spin mx-auto mb-3 text-primary" />
                <p class="text-sm">Loading conversation...</p>
              </div>

              <!-- Empty state -->
              <div v-else-if="messages.length === 0" class="text-center py-12 text-muted-foreground">
                <div class="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mx-auto mb-3">
                  <Sparkles :size="20" class="text-primary" />
                </div>
                <p class="text-sm font-medium text-foreground mb-1">Ask about this chart</p>
                <p class="text-xs mb-5">Get insights, explore trends, and ask questions about the data</p>
                <div class="flex flex-wrap gap-2 justify-center">
                  <button
                    v-for="suggestion in suggestions"
                    :key="suggestion"
                    @click="sendMessage(suggestion)"
                    class="px-3 py-1.5 text-xs border rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {{ suggestion }}
                  </button>
                </div>
              </div>

              <!-- Messages -->
              <div v-for="(msg, i) in messages" :key="i" :class="msg.role === 'user' ? 'flex justify-end' : ''">

                <!-- User message -->
                <div v-if="msg.role === 'user'" class="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
                  {{ msg.content }}
                </div>

                <!-- Assistant message -->
                <div v-else class="space-y-2">

                  <!-- Text answer -->
                  <div class="relative group/msg">
                    <div class="bg-muted/60 rounded-2xl rounded-bl-md px-4 py-3 text-sm prose prose-sm dark:prose-invert max-w-none" v-html="renderMarkdown(msg.content)" />
                    <button
                      @click="copyToClipboard(msg.content, i)"
                      class="absolute top-2 right-2 p-1 rounded-lg bg-background/80 border text-muted-foreground hover:text-foreground opacity-0 group-hover/msg:opacity-100 transition-opacity"
                      :title="copiedIndex === i ? 'Copied!' : 'Copy'"
                    >
                      <Check v-if="copiedIndex === i" :size="12" class="text-green-500" />
                      <Copy v-else :size="12" />
                    </button>
                  </div>

                  <!-- SQL toggle -->
                  <div v-if="msg.sql" class="ml-2">
                    <button
                      @click="expandedSql = expandedSql === i ? null : i"
                      class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Code :size="12" />
                      <span>{{ expandedSql === i ? 'Hide' : 'Show' }} SQL</span>
                      <ChevronUp v-if="expandedSql === i" :size="12" />
                      <ChevronDown v-else :size="12" />
                    </button>
                    <pre v-if="expandedSql === i" class="mt-1.5 p-3 bg-muted rounded-lg text-xs overflow-x-auto font-mono">{{ msg.sql }}</pre>
                  </div>

                  <!-- Data table toggle -->
                  <div v-if="msg.data && msg.data.length > 0" class="ml-2">
                    <button
                      @click="expandedData = expandedData === i ? null : i"
                      class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>{{ expandedData === i ? 'Hide' : 'Show' }} data ({{ msg.data.length }} rows)</span>
                      <ChevronUp v-if="expandedData === i" :size="12" />
                      <ChevronDown v-else :size="12" />
                    </button>
                    <div v-if="expandedData === i" class="mt-1.5 border rounded-lg overflow-x-auto max-h-[200px] overflow-y-auto">
                      <table class="w-full text-xs">
                        <thead class="bg-muted sticky top-0">
                          <tr>
                            <th v-for="col in msg.columns" :key="col" class="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                              {{ col }}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(row, ri) in msg.data.slice(0, 50)" :key="ri" class="border-t">
                            <td v-for="col in msg.columns" :key="col" class="px-2 py-1 whitespace-nowrap">
                              {{ row[col] }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div v-if="msg.data.length > 50" class="px-2 py-1 text-xs text-muted-foreground border-t">
                        Showing 50 of {{ msg.data.length }} rows
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Loading steps -->
              <div v-if="loading" class="space-y-1.5">
                <div v-for="(step, i) in agentSteps" :key="i" class="flex items-start gap-2 text-xs text-muted-foreground">
                  <Loader2 v-if="i === agentSteps.length - 1" :size="12" class="animate-spin mt-0.5 shrink-0 text-primary" />
                  <span v-else class="mt-0.5 shrink-0 text-green-500">&#10003;</span>
                  <span>{{ step }}</span>
                </div>
                <div v-if="agentSteps.length === 0" class="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 :size="12" class="animate-spin text-primary" />
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Input -->
          <div class="border-t px-4 py-3 shrink-0">
            <div class="flex gap-2">
              <textarea
                ref="inputRef"
                v-model="question"
                placeholder="Ask a question about this chart..."
                rows="1"
                class="flex-1 resize-none bg-muted/60 border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 placeholder:text-muted-foreground transition-colors"
                @keydown="onKeydown"
              />
              <Button size="icon" class="rounded-xl h-10 w-10 shrink-0" :disabled="!question.trim() || loading" @click="sendMessage()">
                <Loader2 v-if="loading" :size="16" class="animate-spin" />
                <Send v-else :size="16" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.chart-chat-enter-active,
.chart-chat-leave-active {
  transition: opacity 0.2s ease;
}
.chart-chat-enter-active > :last-child,
.chart-chat-leave-active > :last-child {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.chart-chat-enter-from,
.chart-chat-leave-to {
  opacity: 0;
}
.chart-chat-enter-from > :last-child,
.chart-chat-leave-to > :last-child {
  transform: scale(0.96);
  opacity: 0;
}
</style>

<style>
.chart-chat .prose.prose-sm { font-size: 0.8125rem; line-height: 1.5; }
.chart-chat .prose.prose-sm p { margin-top: 0.25em; margin-bottom: 0.25em; }
</style>
