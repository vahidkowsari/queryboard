import dotenv from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { getSecretJson } from './services/secrets.service.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '..', '.env.local') })

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

interface SecretsManagerConfig {
  dbPassword?: string
  supertokensApiKey?: string
  googleClientSecret?: string
  githubClientSecret?: string
  microsoftClientSecret?: string
  oktaClientSecret?: string
  adminPassword?: string
  anthropicApiKey?: string
  openaiApiKey?: string
  googleAiApiKey?: string
}

let secretsCache: SecretsManagerConfig | null = null

async function loadSecretsFromManager(): Promise<SecretsManagerConfig> {
  if (secretsCache) {
    return secretsCache
  }

  const secretName = process.env.AWS_SECRET_NAME
  if (!secretName) {
    console.log('AWS_SECRET_NAME not set, skipping Secrets Manager')
    return {}
  }

  try {
    console.log(`Loading secrets from AWS Secrets Manager: ${secretName}`)
    secretsCache = await getSecretJson<SecretsManagerConfig>(secretName)
    console.log('Successfully loaded secrets from AWS Secrets Manager')
    return secretsCache
  } catch (error) {
    console.error('Failed to load secrets from AWS Secrets Manager:', error)
    console.log('Falling back to environment variables')
    return {}
  }
}

export async function loadConfig() {
  const secrets = await loadSecretsFromManager()

  return {
    port: parseInt(optional('PORT', '3001')),

    db: {
      host: optional('DB_HOST', 'localhost'),
      port: parseInt(optional('DB_PORT', '5432')),
      database: optional('DB_NAME', 'charting'),
      user: optional('DB_USER', 'charting'),
      password: secrets.dbPassword || optional('DB_PASSWORD', 'charting_dev'),
    },

    supertokens: {
      connectionURI: optional('SUPERTOKENS_CONNECTION_URI', 'http://localhost:3567'),
      apiKey: secrets.supertokensApiKey || optional('SUPERTOKENS_API_KEY', ''),
      apiDomain: optional('API_DOMAIN', 'http://localhost:3001'),
      websiteDomain: optional('WEBSITE_DOMAIN', 'http://localhost:5173'),
      googleClientId: optional('GOOGLE_OAUTH_CLIENT_ID', ''),
      googleClientSecret: secrets.googleClientSecret || optional('GOOGLE_OAUTH_CLIENT_SECRET', ''),
      githubClientId: optional('GITHUB_OAUTH_CLIENT_ID', ''),
      githubClientSecret: secrets.githubClientSecret || optional('GITHUB_OAUTH_CLIENT_SECRET', ''),
      microsoftClientId: optional('MICROSOFT_OAUTH_CLIENT_ID', ''),
      microsoftClientSecret: secrets.microsoftClientSecret || optional('MICROSOFT_OAUTH_CLIENT_SECRET', ''),
      oktaClientId: optional('OKTA_CLIENT_ID', ''),
      oktaClientSecret: secrets.oktaClientSecret || optional('OKTA_CLIENT_SECRET', ''),
      oktaDomain: optional('OKTA_DOMAIN', ''),
      allowedEmailDomain: optional('ALLOWED_EMAIL_DOMAIN', ''),
      adminEmail: optional('ADMIN_EMAIL', ''),
      adminPassword: secrets.adminPassword || optional('ADMIN_PASSWORD', ''),
    },

    llm: {
      anthropic: {
        apiKey: secrets.anthropicApiKey || optional('ANTHROPIC_API_KEY', ''),
        defaultModel: optional('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514'),
      },
      openai: {
        apiKey: secrets.openaiApiKey || optional('OPENAI_API_KEY', ''),
        defaultModel: optional('OPENAI_MODEL', 'gpt-4o'),
      },
      google: {
        apiKey: secrets.googleAiApiKey || optional('GOOGLE_AI_API_KEY', ''),
        defaultModel: optional('GOOGLE_AI_MODEL', 'gemini-2.0-flash'),
      },
    },
  } as const
}
