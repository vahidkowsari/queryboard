import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

interface SecretCache {
  value: string
  timestamp: number
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const cache = new Map<string, SecretCache>()

let client: SecretsManagerClient | null = null

/**
 * Gets or creates a singleton AWS Secrets Manager client
 */
function getClient(): SecretsManagerClient {
  if (!client) {
    client = new SecretsManagerClient({
      region: process.env.AWS_REGION ,
    })
  }
  return client
}

/**
 * Fetches a secret from AWS Secrets Manager with 5-minute caching
 */
export async function getSecret(secretName: string): Promise<string> {
  const cached = cache.get(secretName)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value
  }

  try {
    const command = new GetSecretValueCommand({ SecretId: secretName })
    const response = await getClient().send(command)

    if (!response.SecretString) {
      throw new Error(`Secret ${secretName} has no string value`)
    }

    cache.set(secretName, {
      value: response.SecretString,
      timestamp: Date.now(),
    })

    return response.SecretString
  } catch (error) {
    console.error(`Failed to fetch secret ${secretName}:`, error)
    throw error
  }
}

/**
 * Fetches a secret and parses it as JSON
 */
export async function getSecretJson<T = Record<string, string>>(secretName: string): Promise<T> {
  const secretString = await getSecret(secretName)
  try {
    return JSON.parse(secretString) as T
  } catch (error) {
    console.error(`Failed to parse secret ${secretName} as JSON:`, error)
    throw error
  }
}

/**
 * Clears the secrets cache (useful for testing or forcing refresh)
 */
export function clearCache(): void {
  cache.clear()
}
