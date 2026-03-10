variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "queryboard"
}

variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (e.g. dev, staging, prod)"
  type        = string
  default     = "prod"
}

# ── Networking ──────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# ── Database ────────────────────────────────────────────

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "queryboard"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "queryboard"
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

# ── ECS ─────────────────────────────────────────────────

variable "backend_cpu" {
  description = "CPU units for backend task (1024 = 1 vCPU)"
  type        = number
  default     = 256
}

variable "backend_memory" {
  description = "Memory (MiB) for backend task"
  type        = number
  default     = 512
}

variable "supertokens_cpu" {
  description = "CPU units for SuperTokens task"
  type        = number
  default     = 256
}

variable "supertokens_memory" {
  description = "Memory (MiB) for SuperTokens task"
  type        = number
  default     = 512
}

variable "supertokens_image" {
  description = "Docker image for SuperTokens"
  type        = string
  default     = "registry.supertokens.io/supertokens/supertokens-postgresql:latest"
}

# ── Domain ──────────────────────────────────────────────

variable "domain_name" {
  description = "Domain name for the app (e.g. queryboard.yourcompany.com). Leave empty to skip DNS/cert."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID. Required if domain_name is set."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of an existing ACM certificate (must cover domain_name and *.domain_name)"
  type        = string
  default     = ""
}

# ── Auth ────────────────────────────────────────────────

variable "google_oauth_client_id" {
  description = "Google OAuth client ID"
  type        = string
  default     = ""
}

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_oauth_client_id" {
  description = "GitHub OAuth client ID"
  type        = string
  default     = ""
}

variable "github_oauth_client_secret" {
  description = "GitHub OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "microsoft_oauth_client_id" {
  description = "Microsoft (Azure AD) OAuth client ID"
  type        = string
  default     = ""
}

variable "microsoft_oauth_client_secret" {
  description = "Microsoft (Azure AD) OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "allowed_email_domain" {
  description = "Restrict login to this email domain (e.g. yourcompany.com). Empty = allow all."
  type        = string
  default     = ""
}

variable "admin_email" {
  description = "Initial admin email for email/password login"
  type        = string
  default     = ""
}

variable "admin_password" {
  description = "Initial admin password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "okta_client_id" {
  description = "Okta OAuth client ID"
  type        = string
  default     = ""
}

variable "okta_client_secret" {
  description = "Okta OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "okta_domain" {
  description = "Okta domain (e.g., yourcompany.okta.com)"
  type        = string
  default     = ""
}

variable "supertokens_api_key" {
  description = "SuperTokens API key for managed core"
  type        = string
  sensitive   = true
  default     = ""
}

# ── LLM API Keys ───────────────────────────────────────

variable "anthropic_api_key" {
  description = "Anthropic API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_ai_api_key" {
  description = "Google AI API key"
  type        = string
  sensitive   = true
  default     = ""
}
