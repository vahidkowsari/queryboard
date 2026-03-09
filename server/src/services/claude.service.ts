import { generateText } from 'ai'
import { createLLMModel } from './llm-providers/index.js'
import type { LLMConfig } from '../types.js'

export interface LLMResult {
  text: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  vendor: string
  model: string
}

export async function askLLM(prompt: string, maxTokens = 2048, llmConfig?: LLMConfig | null): Promise<LLMResult> {
  const { model, vendor, modelId } = createLLMModel(llmConfig)
  const result = await generateText({
    model,
    maxOutputTokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })
  const promptTokens = result.usage?.inputTokens ?? 0
  const completionTokens = result.usage?.outputTokens ?? 0
  return {
    text: result.text,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    vendor,
    model: modelId,
  }
}

// Backward-compat alias — uses default vendor (anthropic)
export const askClaude = askLLM
