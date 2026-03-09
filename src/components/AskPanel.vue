<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { MessageSquare, Send, Loader2, X, ChevronDown, ChevronUp, Code, Plus, Trash2, PanelLeftClose, PanelLeft, Copy, Check, Maximize2, Minimize2 } from 'lucide-vue-next'
import { marked } from 'marked'
import { API_BASE_URL } from '../services/api'
import { config } from '../config'
import { conversationApi, type Conversation, type ConversationMessage } from '../services/conversation.api'
import Button from './ui/button.vue'

marked.setOptions({ breaks: true, gfm: true })

function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}

const props = defineProps<{ projectId: string; show: boolean }>()
const emit = defineEmits<{ close: [] }>()

interface Message {
  role: 'user' | 'assistant'
  content: string
  sql?: string
  data?: Record<string, string>[]
  columns?: string[]
  steps?: string[]
}

const conversations = ref<Conversation[]>([])
const activeConversationId = ref<string | null>(null)
const messages = ref<Message[]>([])
const question = ref('')
const loading = ref(false)
const loadingConversations = ref(false)
const agentSteps = ref<string[]>([])
const inputRef = ref<HTMLTextAreaElement | null>(null)
const messagesRef = ref<HTMLElement | null>(null)
const expandedSql = ref<number | null>(null)
const expandedData = ref<number | null>(null)
const showSidebar = ref(true)
const copiedIndex = ref<number | null>(null)
const panelMode = ref<'float' | 'maximized'>('float')

async function copyToClipboard(text: string, index: number) {
  await navigator.clipboard.writeText(text)
  copiedIndex.value = index
  setTimeout(() => { copiedIndex.value = null }, config.copyFeedbackMs)
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

async function loadConversations() {
  loadingConversations.value = true
  try {
    conversations.value = await conversationApi.list(props.projectId)
  } catch {
    conversations.value = []
  } finally {
    loadingConversations.value = false
  }
}

async function selectConversation(conv: Conversation) {
  activeConversationId.value = conv.id
  messages.value = []
  expandedSql.value = null
  expandedData.value = null
  try {
    const full = await conversationApi.get(props.projectId, conv.id)
    messages.value = full.messages.map((m: ConversationMessage) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      sql: m.sql ?? undefined,
      data: (m.data as Record<string, string>[] | null) ?? undefined,
      columns: (m.columns as string[] | null) ?? undefined,
      steps: (m.steps as string[] | null) ?? undefined,
    }))
    scrollToBottom()
  } catch {
    messages.value = []
  }
  nextTick(() => inputRef.value?.focus())
}

function startNewConversation() {
  activeConversationId.value = null
  messages.value = []
  expandedSql.value = null
  expandedData.value = null
  nextTick(() => inputRef.value?.focus())
}

async function deleteConversation(conv: Conversation, e: Event) {
  e.stopPropagation()
  try {
    await conversationApi.remove(props.projectId, conv.id)
    conversations.value = conversations.value.filter((c) => c.id !== conv.id)
    if (activeConversationId.value === conv.id) {
      startNewConversation()
    }
  } catch {
    // ignore
  }
}

watch(() => props.show, (val) => {
  if (val) {
    loadConversations()
    nextTick(() => inputRef.value?.focus())
  }
})

function onEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  if (props.show) loadConversations()
  document.addEventListener('keydown', onEscape)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onEscape)
})

async function ask() {
  const q = question.value.trim()
  if (!q || loading.value) return

  messages.value.push({ role: 'user', content: q })
  question.value = ''
  loading.value = true
  agentSteps.value = []
  scrollToBottom()

  try {
    const response = await fetch(`${API_BASE_URL}/api/projects/${props.projectId}/claude/ask`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q,
        ...(activeConversationId.value ? { conversationId: activeConversationId.value } : {}),
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed' }))
      messages.value.push({ role: 'assistant', content: `Error: ${err.error || 'Request failed'}` })
      return
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ') && eventType) {
          try {
            const data = JSON.parse(line.slice(6))
            if (eventType === 'conversation') {
              activeConversationId.value = data.conversationId
              loadConversations()
            } else if (eventType === 'step') {
              agentSteps.value.push(data.step)
              scrollToBottom()
            } else if (eventType === 'result') {
              messages.value.push({
                role: 'assistant',
                content: data.answer,
                sql: data.sql,
                data: data.data,
                columns: data.columns,
                steps: data.steps,
              })
              scrollToBottom()
            } else if (eventType === 'error') {
              messages.value.push({ role: 'assistant', content: `Error: ${data.error}` })
            }
          } catch {
            // ignore parse errors
          }
          eventType = ''
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to get answer'
    messages.value.push({ role: 'assistant', content: `Error: ${msg}` })
  } finally {
    loading.value = false
    agentSteps.value = []
    scrollToBottom()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    ask()
  }
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ask-modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center" :class="panelMode === 'maximized' ? '' : 'p-4'">
        <div class="fixed inset-0 bg-black/40 backdrop-blur-sm" @click="emit('close')" />
        <div
          class="relative bg-background shadow-2xl border flex overflow-hidden transition-all duration-200"
          :class="panelMode === 'maximized' ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[85vh] rounded-2xl'"
        >

          <!-- Conversation Sidebar -->
          <div v-if="showSidebar" class="w-60 border-r flex flex-col shrink-0 bg-muted/20">
            <div class="flex items-center justify-between px-4 py-3 border-b">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">History</span>
              <button @click="showSidebar = false" class="text-muted-foreground hover:text-foreground transition-colors" title="Hide sidebar">
                <PanelLeftClose :size="16" />
              </button>
            </div>
            <div class="px-3 py-2">
              <Button variant="outline" size="sm" class="w-full text-xs" @click="startNewConversation">
                <Plus :size="14" />
                New conversation
              </Button>
            </div>
            <div class="flex-1 overflow-y-auto px-1">
              <div v-if="loadingConversations" class="flex justify-center py-4">
                <Loader2 :size="14" class="animate-spin text-muted-foreground" />
              </div>
              <div v-else-if="conversations.length === 0" class="px-3 py-6 text-xs text-muted-foreground text-center">
                No conversations yet
              </div>
              <div
                v-for="conv in conversations"
                :key="conv.id"
                :class="[
                  'w-full text-left px-3 py-2.5 text-xs group hover:bg-muted/60 transition-colors flex items-start gap-1 rounded-lg mx-auto relative',
                  activeConversationId === conv.id ? 'bg-muted' : '',
                ]"
              >
                <button
                  @click="selectConversation(conv)"
                  class="absolute inset-0 w-full h-full"
                  :aria-label="`Select conversation: ${conv.title}`"
                />
                <div class="flex-1 min-w-0 pointer-events-none">
                  <div class="truncate font-medium">{{ conv.title }}</div>
                  <div class="text-muted-foreground mt-0.5">{{ formatTime(conv.updatedAt) }}</div>
                </div>
                <button
                  @click="deleteConversation(conv, $event)"
                  class="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0 mt-0.5 transition-opacity relative z-10"
                  title="Delete"
                  :aria-label="`Delete conversation: ${conv.title}`"
                >
                  <Trash2 :size="12" />
                </button>
              </div>
            </div>
          </div>

          <!-- Chat Area -->
          <div class="flex-1 flex flex-col min-w-0">
            <!-- Header -->
            <div class="flex items-center justify-between px-5 py-3 border-b shrink-0">
              <div class="flex items-center gap-3">
                <button v-if="!showSidebar" @click="showSidebar = true" class="text-muted-foreground hover:text-foreground transition-colors" title="Show conversations">
                  <PanelLeft :size="18" />
                </button>
                <div class="flex items-center gap-2">
                  <div class="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10">
                    <MessageSquare :size="14" class="text-primary" />
                  </div>
                  <h2 class="font-semibold text-sm">Ask about your data</h2>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <button
                  @click="panelMode = panelMode === 'maximized' ? 'float' : 'maximized'"
                  class="text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1 hover:bg-muted"
                  :title="panelMode === 'maximized' ? 'Restore' : 'Maximize'"
                >
                  <Minimize2 v-if="panelMode === 'maximized'" :size="16" />
                  <Maximize2 v-else :size="16" />
                </button>
                <button @click="emit('close')" class="text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1 hover:bg-muted" title="Close (Esc)">
                  <X :size="18" />
                </button>
              </div>
            </div>

            <!-- Messages -->
            <div ref="messagesRef" class="flex-1 overflow-y-auto">
              <div class="max-w-3xl mx-auto px-6 py-6 space-y-5">
                <div v-if="messages.length === 0" class="text-center py-20 text-muted-foreground">
                  <div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mx-auto mb-4">
                    <MessageSquare :size="24" class="text-primary" />
                  </div>
                  <p class="text-sm font-medium text-foreground mb-1">Ask anything about your data</p>
                  <p class="text-xs">e.g. "How many patients are there?" or "What tables contain medication data?"</p>
                </div>

                <div v-for="(msg, i) in messages" :key="i" :class="msg.role === 'user' ? 'flex justify-end' : ''">
                  <!-- User message -->
                  <div v-if="msg.role === 'user'" class="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
                    {{ msg.content }}
                  </div>

                  <!-- Assistant message -->
                  <div v-else class="space-y-2">
                    <div class="relative group/msg">
                      <div class="bg-muted/60 rounded-2xl rounded-bl-md px-5 py-3.5 text-sm prose prose-sm dark:prose-invert max-w-none" v-html="renderMarkdown(msg.content)" />
                      <button
                        @click="copyToClipboard(msg.content, i)"
                        class="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 border text-muted-foreground hover:text-foreground opacity-0 group-hover/msg:opacity-100 transition-opacity"
                        :title="copiedIndex === i ? 'Copied!' : 'Copy'"
                      >
                        <Check v-if="copiedIndex === i" :size="14" class="text-green-500" />
                        <Copy v-else :size="14" />
                      </button>
                    </div>

                    <!-- SQL toggle -->
                    <div v-if="msg.sql" class="ml-2">
                      <button
                        @click="expandedSql = expandedSql === i ? null : i"
                        class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
                        class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span>{{ expandedData === i ? 'Hide' : 'Show' }} data ({{ msg.data.length }} rows)</span>
                        <ChevronUp v-if="expandedData === i" :size="12" />
                        <ChevronDown v-else :size="12" />
                      </button>
                      <div v-if="expandedData === i" class="mt-1.5 border rounded-lg overflow-x-auto max-h-[300px] overflow-y-auto">
                        <table class="w-full text-xs">
                          <thead class="bg-muted sticky top-0">
                            <tr>
                              <th v-for="col in msg.columns" :key="col" class="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                                {{ col }}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(row, ri) in msg.data.slice(0, config.dataPreviewMaxRows)" :key="ri" class="border-t">
                              <td v-for="col in msg.columns" :key="col" class="px-3 py-1.5 whitespace-nowrap">
                                {{ row[col] }}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <div v-if="msg.data.length > config.dataPreviewMaxRows" class="px-3 py-1.5 text-xs text-muted-foreground border-t">
                          Showing {{ config.dataPreviewMaxRows }} of {{ msg.data.length }} rows
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Loading steps -->
                <div v-if="loading" class="space-y-2">
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
            <div class="border-t px-5 py-4 shrink-0">
              <div class="max-w-3xl mx-auto flex gap-2">
                <textarea
                  ref="inputRef"
                  v-model="question"
                  placeholder="Ask a question about your data..."
                  rows="1"
                  class="flex-1 resize-none bg-muted/60 border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 placeholder:text-muted-foreground transition-colors"
                  @keydown="onKeydown"
                />
                <Button size="icon" class="rounded-xl h-10 w-10 shrink-0" :disabled="!question.trim() || loading" @click="ask">
                  <Loader2 v-if="loading" :size="16" class="animate-spin" />
                  <Send v-else :size="16" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ask-modal-enter-active,
.ask-modal-leave-active {
  transition: opacity 0.2s ease;
}
.ask-modal-enter-active > :last-child,
.ask-modal-leave-active > :last-child {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.ask-modal-enter-from,
.ask-modal-leave-to {
  opacity: 0;
}
.ask-modal-enter-from > :last-child,
.ask-modal-leave-to > :last-child {
  transform: scale(0.96);
  opacity: 0;
}
</style>

<style>
.prose.prose-sm { font-size: 0.8125rem; line-height: 1.5; }
.prose.prose-sm p { margin-top: 0.25em; margin-bottom: 0.25em; }
.prose.prose-sm ul, .prose.prose-sm ol { margin-top: 0.25em; margin-bottom: 0.25em; padding-left: 1.25em; }
.prose.prose-sm li { margin-top: 0.1em; margin-bottom: 0.1em; }
.prose.prose-sm pre { margin-top: 0.5em; margin-bottom: 0.5em; padding: 0.75em; border-radius: 0.5em; font-size: 0.75rem; }
.prose.prose-sm code:not(pre code) { padding: 0.15em 0.35em; border-radius: 0.25em; font-size: 0.8em; background: hsl(var(--muted)); }
.prose.prose-sm h1 { font-size: 1.05rem; font-weight: 600; margin-top: 0.5em; margin-bottom: 0.25em; }
.prose.prose-sm h2 { font-size: 0.95rem; font-weight: 600; margin-top: 0.5em; margin-bottom: 0.25em; }
.prose.prose-sm h3 { font-size: 0.875rem; font-weight: 600; margin-top: 0.5em; margin-bottom: 0.25em; }
.prose.prose-sm table { font-size: 0.75rem; margin-top: 0.5em; margin-bottom: 0.5em; }
.prose.prose-sm th, .prose.prose-sm td { padding: 0.25em 0.5em; }
.prose.prose-sm blockquote { margin-top: 0.5em; margin-bottom: 0.5em; padding-left: 0.75em; }
</style>
