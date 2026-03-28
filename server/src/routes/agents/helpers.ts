type ConversationMessageRow = {
  role: string
  content: string
}

export function toConversationHistory(messages: ConversationMessageRow[]) {
  return messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }))
}

export async function recordTokenUsageSafe(
  record: () => Promise<void>,
  onErrorLabel: string,
): Promise<void> {
  try {
    await record()
  } catch (err) {
    console.error(onErrorLabel, err)
  }
}

export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export type MinimalTokenUsage = {
  projectId: string
  chartId?: string
  vendor: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  operation: string
}
