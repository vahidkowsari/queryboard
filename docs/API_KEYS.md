# API Keys Configuration

QueryBoard supports multiple LLM providers and database engines. This guide explains how to configure API keys for each service.

## LLM Provider API Keys

QueryBoard supports three LLM providers. You need **at least one** API key configured to use AI features (chart generation, schema enrichment, Q&A).

### Anthropic Claude (Recommended)

1. Get your API key from [Anthropic Console](https://console.anthropic.com/)
2. Add to `.env.local`:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```
3. Supported models:
   - `claude-sonnet-4-6` (default)
   - `claude-opus-4-6`
   - `claude-haiku-4-5-20251001`

### OpenAI GPT

1. Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Add to `.env.local`:
   ```bash
   OPENAI_API_KEY=sk-...
   ```
3. Supported models:
   - `gpt-4o` (default)
   - `gpt-4o-mini`
   - `gpt-4.1`
   - `o3`

### Google Gemini

1. Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Add to `.env.local`:
   ```bash
   GOOGLE_AI_API_KEY=...
   ```
3. Supported models:
   - `gemini-2.0-flash` (default)
   - `gemini-2.0-pro`
   - `gemini-1.5-pro`

## Database Connection Credentials

### AWS Athena

**Option 1: AWS SSO Profile (Recommended for local development)**
```bash
AWS_PROFILE=your-profile-name
```

**Option 2: Access Keys**
```bash
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

### Google BigQuery

1. Create a service account in [Google Cloud Console](https://console.cloud.google.com/)
2. Download the JSON key file
3. Add to `.env.local`:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
   ```

### PostgreSQL / MySQL

No API keys needed - credentials are configured per-project in the UI.

## Configuration Files

### `.env.local` (Local Development)

This file is gitignored and contains your actual API keys:

```bash
# LLM API Keys
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...

# AWS Configuration
AWS_PROFILE=your-profile
# or
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Google Cloud
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

### `.env.example` (Template)

This file is committed to git and shows which variables are available:

```bash
# Copy this file to .env.local and fill in your actual values
cp .env.example .env.local
```

## Docker Configuration

The `docker-compose.yml` automatically loads `.env.local` via the `env_file` directive:

```yaml
server:
  env_file:
    - .env.local
  environment:
    # ... other vars
```

After adding or changing API keys in `.env.local`:

```bash
# Recreate the server container to load new environment variables
docker compose down server && docker compose up -d server
```

## Per-Project API Key Override

You can override the server-level API key for individual projects:

1. Go to **Project Settings** → **AI & Charts** tab
2. Enter an API key in the **"API Key Override"** field
3. Click **"Save AI Model"**

This is useful for:
- Using different API keys for different projects
- Testing different LLM providers
- Isolating API usage and costs

## Production Deployment

For production, use AWS Secrets Manager instead of environment variables:

1. Create a secret in AWS Secrets Manager with your API keys
2. Set the secret name in your environment:
   ```bash
   AWS_SECRET_NAME=queryboard-secrets-production
   AWS_REGION=us-east-1
   ```
3. The application will automatically fetch secrets from AWS Secrets Manager

See [SECRETS_MANAGER.md](./SECRETS_MANAGER.md) for details.

## Troubleshooting

### "No API key configured for LLM vendor"

**Cause**: The API key is not loaded in the server environment.

**Solution**:
1. Verify the key is in `.env.local`
2. Recreate the server container:
   ```bash
   docker compose down server && docker compose up -d server
   ```
3. Verify the key is loaded:
   ```bash
   docker exec queryboard-server env | grep ANTHROPIC_API_KEY
   ```

### API key works in UI but not in Docker

**Cause**: The `env_file` directive may not be loading `.env.local`.

**Solution**:
1. Check that `.env.local` exists in the project root
2. Verify `docker-compose.yml` has:
   ```yaml
   server:
     env_file:
       - .env.local
   ```
3. Recreate (not just restart) the container:
   ```bash
   docker compose down server && docker compose up -d server
   ```

### Multiple API keys not working

**Cause**: Only one LLM provider is configured per project.

**Solution**: Each project uses one LLM provider at a time. To use multiple providers:
- Create separate projects for each LLM provider, OR
- Change the LLM vendor in Project Settings → AI & Charts

## Security Best Practices

1. **Never commit `.env.local`** - It's gitignored by default
2. **Use AWS Secrets Manager in production** - Don't use environment variables
3. **Rotate API keys regularly** - Especially if they're exposed
4. **Use per-project overrides** - For better isolation and cost tracking
5. **Restrict API key permissions** - Use read-only keys where possible
