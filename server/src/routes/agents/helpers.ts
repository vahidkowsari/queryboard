type ConversationMessage = {
  role: string
  content: string
}

export function toConversationHistory(messages: ConversationMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => ({ role: msg.role as 'user' | 'assistant', content: msg.content }))
}

export async function recordTokenUsageSafe(task: () => Promise<void>, errorPrefix: string): Promise<void> {
  try {
    await task()
  } catch (err) {
    console.error(errorPrefix, err)
  }
}

export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}
