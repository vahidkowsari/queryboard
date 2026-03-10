# AWS Secrets Manager for sensitive credentials

resource "aws_secretsmanager_secret" "queryboard_secrets" {
  name        = "${var.project_name}-secrets-${var.environment}"
  description = "QueryBoard application secrets including database passwords, API keys, and OAuth secrets"

  tags = {
    Name        = "${var.project_name}-secrets"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_secretsmanager_secret_version" "queryboard_secrets" {
  secret_id = aws_secretsmanager_secret.queryboard_secrets.id
  secret_string = jsonencode({
    # Database
    dbPassword = var.db_password

    # SuperTokens
    supertokensApiKey = var.supertokens_api_key

    # OAuth Secrets
    googleClientSecret    = var.google_oauth_client_secret
    githubClientSecret    = var.github_oauth_client_secret
    microsoftClientSecret = var.microsoft_oauth_client_secret
    oktaClientSecret      = var.okta_client_secret

    # Admin Password
    adminPassword = var.admin_password

    # LLM API Keys
    anthropicApiKey = var.anthropic_api_key
    openaiApiKey    = var.openai_api_key
    googleAiApiKey  = var.google_ai_api_key
  })
}

# IAM Policy for ECS tasks to access secrets
resource "aws_iam_policy" "secrets_access" {
  name        = "${var.project_name}-secrets-access-${var.environment}"
  description = "Allow ECS tasks to read QueryBoard secrets from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = aws_secretsmanager_secret.queryboard_secrets.arn
      }
    ]
  })
}

# Attach policy to ECS task execution role
resource "aws_iam_role_policy_attachment" "ecs_secrets_access" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = aws_iam_policy.secrets_access.arn
}

# Output the secret ARN for reference
output "secrets_manager_arn" {
  value       = aws_secretsmanager_secret.queryboard_secrets.arn
  description = "ARN of the Secrets Manager secret"
}

output "secrets_manager_name" {
  value       = aws_secretsmanager_secret.queryboard_secrets.name
  description = "Name of the Secrets Manager secret"
}
