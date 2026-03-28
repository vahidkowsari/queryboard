import type { TokenUsageInfo } from './chart-agent.js'
import type { ModelMessage } from 'ai'

export const REACT_URGENCY_PROMPTS = {
  chartCreateNow:
    'You are running out of turns. You MUST call create_chart RIGHT NOW with the data you already have. Do not call any other tool.',
  qaAnswerNow:
    'You are running out of turns. Call answer_question NOW with whatever information you have.',
} as const

export function formatAgentCycleLog(agentLabel: string, cycle: number, message: string): string {
  return `${agentLabel} [Cycle ${cycle}]: ${message}`
}

export interface ReActNodeMetadata {
  lastThought?: string
  lastToolCalls?: unknown[]
  lastNode?: 'reason' | 'act'
  currentCycle?: number
}

export interface ToolCallLike {
  toolName: string
  input?: unknown
}

export function getReActMeta(metadata: Record<string, unknown>): ReActNodeMetadata {
  return metadata as ReActNodeMetadata
}

export function setReActMeta(
  metadata: Record<string, unknown>,
  patch: Partial<ReActNodeMetadata>
): Record<string, unknown> {
  return { ...metadata, ...patch }
}

export function assertNotAborted(
  signal: AbortSignal | undefined,
  agentLabel: string,
  cycle: number,
  phase: 'reason' | 'act'
): void {
  if (!signal?.aborted) return

  const phaseLabel = phase === 'reason' ? 'Client disconnected (aborted)' : 'Client disconnected during action (aborted)'
  console.log(formatAgentCycleLog(agentLabel, cycle, phaseLabel))
  throw new Error('Operation aborted by client')
}

export function accumulateTokenUsage(
  current: TokenUsageInfo,
  usage: { inputTokens?: number; outputTokens?: number } | undefined
): TokenUsageInfo {
  const turnInput = usage?.inputTokens ?? 0
  const turnOutput = usage?.outputTokens ?? 0
  return {
    ...current,
    promptTokens: current.promptTokens + turnInput,
    completionTokens: current.completionTokens + turnOutput,
    totalTokens: current.totalTokens + turnInput + turnOutput,
  }
}

export function sanitizeTrailingAssistantToolCalls(history: ModelMessage[]): ModelMessage[] {
  const sanitizedHistory = [...history]
  while (sanitizedHistory.length > 0) {
    const lastMessage = sanitizedHistory[sanitizedHistory.length - 1] as
      | { role?: string; content?: unknown }
      | undefined
    if (!lastMessage || lastMessage.role !== 'assistant') {
      break
    }

    const content = lastMessage.content
    const hasToolCall =
      Array.isArray(content) &&
      content.some((part) => {
        if (!part || typeof part !== 'object') return false
        const type = (part as { type?: string }).type
        return type === 'tool-call' || type === 'tool_use'
      })

    if (!hasToolCall) {
      break
    }
    sanitizedHistory.pop()
  }

  return sanitizedHistory
}
