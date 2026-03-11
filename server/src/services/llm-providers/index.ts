import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { config } from '../../config.js'
import type { LLMVendor, LLMConfig } from '../../types.js'
import type { LanguageModel } from 'ai'

/**
 * Resolved LLM model with vendor and model ID information
 */
interface ResolvedLLM {
  model: LanguageModel
  vendor: LLMVendor
  modelId: string
}

/**
 * Creates an LLM model instance based on vendor configuration
 * Supports Anthropic (Claude), OpenAI (GPT), and Google (Gemini)
 * Falls back to default API keys from config if not provided
 */
export function createLLMModel(llmConfig?: LLMConfig | null): ResolvedLLM {
  const vendor = llmConfig?.vendor ?? 'anthropic'
  const apiKey = llmConfig?.apiKey || getDefaultApiKey(vendor)

  if (!apiKey) {
    throw new Error(
      `No API key configured for LLM vendor "${vendor}". Set the appropriate env var or provide a key in project settings.`,
    )
  }

  switch (vendor) {
    case 'anthropic': {
      const modelId = llmConfig?.model || config.llm.anthropic.defaultModel
      const provider = createAnthropic({ apiKey })
      return { model: provider(modelId), vendor, modelId }
    }
    case 'openai': {
      const modelId = llmConfig?.model || config.llm.openai.defaultModel
      const provider = createOpenAI({ apiKey })
      return { model: provider(modelId), vendor, modelId }
    }
    case 'google': {
      const modelId = llmConfig?.model || config.llm.google.defaultModel
      const provider = createGoogleGenerativeAI({ apiKey })
      return { model: provider(modelId), vendor, modelId }
    }
    default:
      throw new Error(`Unsupported LLM vendor: ${vendor}`)
  }
}

/**
 * Retrieves the default API key for a given LLM vendor from config
 */
function getDefaultApiKey(vendor: LLMVendor): string {
  switch (vendor) {
    case 'anthropic':
      return config.llm.anthropic.apiKey
    case 'openai':
      return config.llm.openai.apiKey
    case 'google':
      return config.llm.google.apiKey
  }
}
