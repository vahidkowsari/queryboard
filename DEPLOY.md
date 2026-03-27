# Deploying QueryBoard

## Local Development

```bash
docker compose up -d
```

Runs frontend (Vite dev server on port 5173) + backend + postgres + supertokens.

---

## AWS Production Deployment

QueryBoard is designed for AWS deployment with:

1. **RDS PostgreSQL** — managed database
2. **ECS Fargate** — runs backend + SuperTokens as containers
3. **S3 + CloudFront** — serves frontend static build
4. **ALB** — load balancer for backend API
5. **Secrets Manager** — stores API keys and credentials

### Infrastructure Setup

All infrastructure is defined in Terraform at `deploy/terraform/`:

```bash
cd deploy/terraform
terraform init
terraform plan
terraform apply
```

### Deploying Backend

```bash
# Build and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ecr-url>
docker build -t queryboard-backend ./server
docker tag queryboard-backend:latest <ecr-url>:latest
docker push <ecr-url>:latest

# Force ECS to deploy new image
aws ecs update-service --cluster <cluster-name> --service <service-name> --force-new-deployment
```

### Deploying Frontend

```bash
# Build and upload to S3
npm run build
aws s3 sync dist/ s3://<bucket-name>/

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

### Backups

RDS automated backups are enabled. For manual backups:

```bash
aws rds create-db-snapshot --db-instance-identifier <instance-id> --db-snapshot-identifier backup-$(date +%Y%m%d)
```
