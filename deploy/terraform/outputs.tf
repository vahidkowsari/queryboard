output "alb_dns_name" {
  description = "ALB DNS name (backend API)"
  value       = aws_lb.main.dns_name
}

output "cloudfront_domain" {
  description = "CloudFront domain (frontend)"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "frontend_bucket" {
  description = "S3 bucket name for frontend assets"
  value       = aws_s3_bucket.frontend.bucket
}

output "rds_endpoint" {
  description = "RDS cluster endpoint"
  value       = aws_rds_cluster.main.endpoint
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecr_repository_url" {
  description = "ECR repository URL for backend image"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_registry" {
  description = "ECR registry URL (for docker login)"
  value       = split("/", aws_ecr_repository.backend.repository_url)[0]
}

output "api_domain" {
  description = "Resolved API domain"
  value       = local.api_domain
}

output "web_domain" {
  description = "Resolved website domain"
  value       = local.web_domain
}
