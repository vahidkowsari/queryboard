# AWS Secrets Manager Integration

QueryBoard supports AWS Secrets Manager for secure credential storage instead of storing sensitive values in environment variables or configuration files.

## Overview

Instead of storing sensitive credentials like database passwords, API keys, and OAuth secrets in plain text environment variables, QueryBoard can fetch them securely from AWS Secrets Manager at runtime.

### Benefits

- ✅ **Enhanced Security**: Secrets never stored in code, config files, or environment variables
- ✅ **Centralized Management**: All secrets in one place with versioning and rotation support
- ✅ **Audit Trail**: AWS CloudTrail logs all secret access
- ✅ **Automatic Rotation**: Support for automated secret rotation
- ✅ **Fine-grained Access Control**: IAM policies control who/what can access secrets
- ✅ **Encryption at Rest**: Secrets encrypted using AWS KMS

## Architecture

```
┌─────────────────┐
│  ECS Container  │
│   (QueryBoard)  │
└────────┬────────┘
         │
         │ 1. Fetch secrets at startup
         ↓
┌─────────────────────┐
│  AWS Secrets        │
│  Manager            │
│  ┌───────────────┐  │
│  │ DB Password   │  │
│  │ OAuth Secrets │  │
│  │ API Keys      │  │
│  └───────────────┘  │
└─────────────────────┘
```

## What Gets Stored in Secrets Manager

The following sensitive credentials are stored in Secrets Manager:

**Database:**
- `dbPassword` - Database password

**Authentication:**
- `supertokensApiKey` - SuperTokens API key
- `googleClientSecret` - Google OAuth client secret
- `githubClientSecret` - GitHub OAuth client secret
- `microsoftClientSecret` - Microsoft OAuth client secret
- `oktaClientSecret` - Okta OAuth client secret
- `adminPassword` - Initial admin password

**LLM API Keys:**
- `anthropicApiKey` - Anthropic (Claude) API key
- `openaiApiKey` - OpenAI API key
- `googleAiApiKey` - Google AI API key

**Non-sensitive values** (still in environment variables):
- Client IDs (not secret)
- Domain names
- Configuration settings
- Feature flags

## Setup

### 1. Install Dependencies

The AWS Secrets Manager SDK is already included in `package.json`:

```bash
cd server
npm install
```

### 2. Configure Terraform

The secrets are automatically created and managed by Terraform in `deploy/terraform/secrets.tf`.

Update your `terraform.tfvars` with your secret values:

```hcl
# Database
db_password = "your-secure-db-password"

# SuperTokens
supertokens_api_key = "your-supertokens-key"

# OAuth Secrets
google_oauth_client_secret    = "your-google-secret"
github_oauth_client_secret    = "your-github-secret"
microsoft_oauth_client_secret = "your-microsoft-secret"
okta_client_secret            = "your-okta-secret"

# Admin
admin_password = "your-admin-password"

# LLM API Keys
anthropic_api_key = "your-anthropic-key"
openai_api_key    = "your-openai-key"
google_ai_api_key = "your-google-ai-key"
```

### 3. Deploy with Terraform

```bash
cd deploy/terraform
terraform init
terraform plan
terraform apply
```

This creates:
- AWS Secrets Manager secret with all credentials
- IAM policy allowing ECS tasks to read the secret
- IAM role attachment for ECS task execution

### 4. Environment Variables

The ECS task definition automatically sets:

```bash
AWS_SECRET_NAME=queryboard-secrets-production
AWS_REGION=us-east-1
```

## Local Development

For local development, you can still use `.env.local`:

```bash
# Option 1: Use environment variables (development)
DB_PASSWORD=local_password
ANTHROPIC_API_KEY=sk-ant-...

# Option 2: Use AWS Secrets Manager (testing production setup)
AWS_SECRET_NAME=queryboard-secrets-dev
AWS_REGION=us-east-1
AWS_PROFILE=your-aws-profile
```

The application will:
1. Check if `AWS_SECRET_NAME` is set
2. If yes, fetch secrets from AWS Secrets Manager
3. If no, fall back to environment variables

## How It Works

### 1. Secrets Service (`server/src/services/secrets.service.ts`)

Handles fetching secrets from AWS Secrets Manager:

```typescript
import { getSecret, getSecretJson } from './services/secrets.service.js'

// Fetch entire secret as JSON
const secrets = await getSecretJson('queryboard-secrets-production')

// Access individual values
const dbPassword = secrets.dbPassword
```

**Features:**
- 5-minute in-memory cache to reduce API calls
- Automatic retry on failure
- Graceful fallback to environment variables

### 2. Config Loader (`server/src/config-loader.ts`)

Loads configuration with secrets manager support:

```typescript
import { loadConfig } from './config-loader.js'

// Load config (async)
const config = await loadConfig()

// Use config
console.log(config.db.password) // From Secrets Manager or env var
```

**Priority:**
1. AWS Secrets Manager (if `AWS_SECRET_NAME` is set)
2. Environment variables (fallback)
3. Default values (development only)

### 3. Application Startup

The application must be updated to use async config loading:

```typescript
// OLD (synchronous)
import { config } from './config.js'

// NEW (asynchronous)
import { loadConfig } from './config-loader.js'

const config = await loadConfig()
```

## Security Best Practices

### ✅ DO

- **Use Secrets Manager in production** - Never store production secrets in code
- **Rotate secrets regularly** - Use AWS secret rotation features
- **Use least privilege IAM** - Only grant necessary permissions
- **Enable CloudTrail** - Monitor secret access
- **Use KMS encryption** - Encrypt secrets with customer-managed keys
- **Separate environments** - Different secrets for dev/staging/prod

### ❌ DON'T

- **Don't commit secrets** - Never commit `.env.local` or `terraform.tfvars`
- **Don't log secrets** - Avoid logging secret values
- **Don't share secrets** - Use IAM roles, not shared credentials
- **Don't use default encryption** - Use customer-managed KMS keys
- **Don't skip rotation** - Regularly rotate all secrets

## IAM Permissions

The ECS task execution role needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:region:account:secret:queryboard-secrets-*"
    }
  ]
}
```

This is automatically configured by Terraform in `secrets.tf`.

## Monitoring

### CloudWatch Logs

Secret access is logged to CloudWatch:

```
Loading secrets from AWS Secrets Manager: queryboard-secrets-production
Successfully loaded secrets from AWS Secrets Manager
```

### CloudTrail

All Secrets Manager API calls are logged in CloudTrail:
- Who accessed the secret
- When it was accessed
- From which IP/service

### Metrics

Monitor these CloudWatch metrics:
- `GetSecretValue` API calls
- Failed secret retrievals
- Secret rotation status

## Troubleshooting

### "Failed to load secrets from AWS Secrets Manager"

**Causes:**
1. IAM permissions missing
2. Secret doesn't exist
3. Wrong AWS region
4. Network connectivity issues

**Solutions:**
1. Verify IAM role has `secretsmanager:GetSecretValue` permission
2. Check secret name matches `AWS_SECRET_NAME` environment variable
3. Verify `AWS_REGION` is correct
4. Check VPC endpoints for Secrets Manager (if using private subnets)

### "Falling back to environment variables"

This is normal if:
- `AWS_SECRET_NAME` is not set (local development)
- Secrets Manager is unavailable (graceful degradation)

Check logs to see why Secrets Manager failed.

### Secrets Not Updating

**Cause:** 5-minute cache prevents immediate updates

**Solutions:**
1. Wait 5 minutes for cache to expire
2. Restart the application
3. Call `clearCache()` programmatically (not recommended in production)

## Secret Rotation

### Manual Rotation

1. Update secret in AWS Secrets Manager:
   ```bash
   aws secretsmanager update-secret \
     --secret-id queryboard-secrets-production \
     --secret-string '{"dbPassword":"new-password",...}'
   ```

2. Wait 5 minutes for cache to expire, or restart application

### Automatic Rotation

Configure automatic rotation in Terraform:

```hcl
resource "aws_secretsmanager_secret_rotation" "queryboard" {
  secret_id           = aws_secretsmanager_secret.queryboard_secrets.id
  rotation_lambda_arn = aws_lambda_function.rotate_secret.arn

  rotation_rules {
    automatically_after_days = 30
  }
}
```

## Cost Considerations

**AWS Secrets Manager Pricing:**
- $0.40 per secret per month
- $0.05 per 10,000 API calls

**Typical costs for QueryBoard:**
- 1 secret: $0.40/month
- ~1,000 API calls/month (with caching): $0.01/month
- **Total: ~$0.41/month**

**Cost optimization:**
- Use caching (already implemented - 5 min TTL)
- Combine multiple secrets into one JSON secret (already done)
- Use VPC endpoints to avoid data transfer costs

## Migration Guide

### From Environment Variables to Secrets Manager

1. **Backup current environment variables**
   ```bash
   env | grep -E "(PASSWORD|SECRET|KEY)" > backup.env
   ```

2. **Update Terraform variables**
   - Add secret values to `terraform.tfvars`

3. **Apply Terraform**
   ```bash
   terraform apply
   ```

4. **Update application code** (if needed)
   - Change from `import { config }` to `const config = await loadConfig()`

5. **Deploy new version**
   - ECS will automatically use Secrets Manager

6. **Verify**
   - Check logs for "Successfully loaded secrets from AWS Secrets Manager"

7. **Remove old environment variables**
   - Clean up any hardcoded secrets

## Additional Resources

- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-secrets-manager/)
- [Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [IAM Policies for Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/auth-and-access.html)
