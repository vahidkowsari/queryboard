import { describe, it, expect, beforeEach } from 'vitest'
import type { ModelMessage } from 'ai'
import {
  accumulateTokenUsage,
  sanitizeTrailingAssistantToolCalls,
  getReActMeta,
  setReActMeta,
  incrementTelemetryCounter,
  resetTelemetryCountersForTests,
} from '../react-agent-utils.js'

describe('react-agent-utils', () => {
  beforeEach(() => {
    resetTelemetryCountersForTests()
  })

  it('accumulates token usage immutably', () => {
    const current = {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      vendor: 'anthropic',
      model: 'claude-test',
    }

    const updated = accumulateTokenUsage(current, { inputTokens: 3, outputTokens: 7 })

    expect(updated).toEqual({
      promptTokens: 13,
      completionTokens: 12,
      totalTokens: 25,
      vendor: 'anthropic',
      model: 'claude-test',
    })
    expect(current).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      vendor: 'anthropic',
      model: 'claude-test',
    })
  })

  it('sanitizes trailing assistant tool-call messages only', () => {
    const legacyToolUseMessage = {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'legacy_1',
          name: 'create_chart',
          input: {},
        },
      ],
    } as unknown as ModelMessage

    const messages: ModelMessage[] = [
      { role: 'user', content: 'u1' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'run_query',
            input: { sql: 'select 1' },
          },
        ],
      },
      legacyToolUseMessage,
      { role: 'assistant', content: 'plain thought' },
    ]

    const sanitized = sanitizeTrailingAssistantToolCalls(messages)

    expect(sanitized).toEqual(messages)

    const onlyTrailingToolCalls: ModelMessage[] = messages.slice(0, 3)
    const sanitizedTrailing = sanitizeTrailingAssistantToolCalls(onlyTrailingToolCalls)

    expect(sanitizedTrailing).toEqual([{ role: 'user', content: 'u1' }])
  })

  it('sets and gets metadata with patch semantics', () => {
    const base: Record<string, unknown> = {
      lastNode: 'reason',
      currentCycle: 2,
      other: 'kept',
    }

    const patched = setReActMeta(base, {
      lastNode: 'act',
      invalidCreateChartRetries: 1,
    })

    const meta = getReActMeta(patched)
    expect(meta.lastNode).toBe('act')
    expect(meta.invalidCreateChartRetries).toBe(1)
    expect((patched as { other?: string }).other).toBe('kept')
  })

  it('increments telemetry counters and resets between tests', () => {
    expect(incrementTelemetryCounter('chart_agent.completed')).toBe(1)
    expect(incrementTelemetryCounter('chart_agent.completed')).toBe(2)
    expect(incrementTelemetryCounter('qa_agent.completed')).toBe(1)
  })
})
