# QueryBoard — Terraform Deployment (AWS)

Deploys QueryBoard to AWS using ECS Fargate, Aurora Serverless v2, S3, and CloudFront.

## Architecture

```
CloudFront (CDN)
├── /api/*  ──→  ALB ──→ ECS Backend (Express)
├── /auth/* ──→  ALB ──→ ECS Backend (Express)
└── /*      ──→  S3  (Vue SPA)

ECS Backend ──→ SuperTokens (ECS, Service Discovery)
ECS Backend ──→ Aurora PostgreSQL (Serverless v2)
SuperTokens ──→ Aurora PostgreSQL (Serverless v2)
```

## Resources Created

- **VPC** with public/private subnets, NAT gateway
- **Aurora Serverless v2** (PostgreSQL 16)
- **ECS Fargate** cluster with 2 services: backend + SuperTokens
- **ALB** in front of the backend
- **S3 + CloudFront** for the Vue frontend (SPA)
- **CloudWatch** log groups
- **ACM certificate + Route53** records (optional, if domain provided)

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Terraform >= 1.5
3. Backend Docker image pushed to ECR (see below)
4. An S3 bucket for Terraform state

## Usage

### 1. Push backend image to ECR

```bash
# Create ECR repo (one-time)
aws ecr create-repository --repository-name queryboard-backend

# Build and push
cd /path/to/queryboard
docker build -t queryboard-backend -f server/Dockerfile ./server
aws ecr get-login-password | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com
docker tag queryboard-backend:latest <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/queryboard-backend:latest
docker push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/queryboard-backend:latest
```

### 2. Configure variables

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

### 3. Initialize and apply

```bash
# Init with S3 backend
terraform init \
  -backend-config="bucket=your-tf-state-bucket" \
  -backend-config="key=queryboard/terraform.tfstate" \
  -backend-config="region=us-east-1"

terraform plan
terraform apply
```

### 4. Deploy frontend to S3

```bash
# Build frontend with the correct API domain
cd /path/to/queryboard
VITE_API_DOMAIN=$(terraform -chdir=deploy/terraform output -raw api_domain) npm run build

# Sync to S3
aws s3 sync dist/ s3://$(terraform -chdir=deploy/terraform output -raw frontend_bucket) --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id $(terraform -chdir=deploy/terraform output -raw cloudfront_distribution_id) \
  --paths "/*"
```

## Custom Domain (Optional)

To use a custom domain like `queryboard.yourcompany.com`:

1. Create a Route53 hosted zone for your domain
2. Set `domain_name` and `route53_zone_id` in `terraform.tfvars`
3. Apply — Terraform creates ACM cert, validates via DNS, and configures ALB + CloudFront

## Updating

```bash
# Backend: push new image, force ECS redeploy
docker build -t queryboard-backend -f server/Dockerfile ./server
docker tag queryboard-backend:latest <ECR_URI>:latest
docker push <ECR_URI>:latest
aws ecs update-service --cluster queryboard-prod-cluster --service queryboard-prod-backend --force-new-deployment

# Frontend: rebuild and sync
VITE_API_DOMAIN=https://queryboard.yourcompany.com npm run build
aws s3 sync dist/ s3://queryboard-prod-frontend --delete
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
```

## Cost Estimate (us-east-1)

| Resource | ~Monthly Cost |
|---|---|
| Aurora Serverless v2 (0.5 ACU min) | ~$45 |
| ECS Fargate (2 tasks, 0.25 vCPU) | ~$18 |
| NAT Gateway | ~$32 |
| ALB | ~$16 |
| CloudFront | ~$1 (low traffic) |
| S3 | < $1 |
| **Total** | **~$113/mo** |

To reduce costs: use a single public subnet (no NAT gateway) or deploy on a single EC2 instance with Docker Compose instead.

## Teardown

```bash
# Empty the S3 bucket first
aws s3 rm s3://$(terraform output -raw frontend_bucket) --recursive

terraform destroy
```
