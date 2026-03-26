.PHONY: install dev dev-server dev-all build lint lint-fix format format-check type-check clean \
       test test-watch test-setup \
       docker-up docker-up-build docker-down docker-restart docker-rebuild docker-logs docker-logs-server docker-logs-frontend docker-ps \
       prod-up prod-down prod-build prod-logs prod-ps prod-backup \
       tf-init tf-plan tf-apply tf-destroy tf-output \
       ecr-login ecr-push deploy-backend deploy-frontend

# ── System Requirements ──────────────────────────────────
install-requirements:
	@echo "Installing system requirements via Homebrew..."
	@which brew > /dev/null || (echo "Error: Homebrew not installed. See https://brew.sh" && exit 1)
	@which node > /dev/null || brew install node
	@which docker > /dev/null || brew install --cask docker
	@which terraform > /dev/null || brew install terraform
	@which aws > /dev/null || brew install awscli
	@which gum > /dev/null || brew install gum
	@echo "All requirements installed."

# ── Install ──────────────────────────────────────────────
install:
	npm install
	cd server && npm install

# ── Development ──────────────────────────────────────────
dev:
	npm run dev

dev-server:
	npm run dev:server

dev-all:
	npm run dev:all

# ── Build ────────────────────────────────────────────────
build:
	npm run build

build-server:
	cd server && npm run build

# ── Lint ─────────────────────────────────────────────────
lint:
	npm run lint

lint-fix:
	npm run lint:fix

# ── Format ───────────────────────────────────────────────
format:
	npm run format

format-check:
	npm run format:check

# ── Type Check ───────────────────────────────────────────
type-check:
	npm run type-check

# ── Quality (lint + format check + type check) ───────────
check: lint format-check type-check

# ── Fix all (lint fix + format) ──────────────────────────
fix: lint-fix format

# ── Tests ────────────────────────────────────────────────
TEST_DB_URL = postgresql://charting:charting_dev@localhost:5432/queryboard_test

test-setup:
	@echo "Setting up test database..."
	@docker compose up -d postgres
	@sleep 2
	@docker exec charting-db psql -U charting -c "DROP DATABASE IF EXISTS queryboard_test;" || true
	@docker exec charting-db psql -U charting -c "CREATE DATABASE queryboard_test;"
	@DB_HOST=localhost DB_PORT=5432 DB_NAME=queryboard_test DB_USER=charting DB_PASSWORD=charting_dev \
		cd server && npx drizzle-kit push
	@echo "Test database ready!"

test:
	@cd server && TEST_DATABASE_URL=$(TEST_DB_URL) npm test

test-watch:
	@cd server && TEST_DATABASE_URL=$(TEST_DB_URL) npm run test:watch

# ── Clean ────────────────────────────────────────────────
clean:
	rm -rf dist node_modules/.vite
	rm -rf server/dist

# ── Docker (dev infrastructure) ─────────────────────────
docker-up:
	docker compose up -d

docker-up-build:
	docker compose up -d --build

docker-down:
	docker compose down

docker-restart:
	docker compose down && docker compose up -d

docker-rebuild:
	docker compose down && docker compose up -d --build

docker-logs:
	docker compose logs -f

docker-logs-server:
	docker compose logs -f server

docker-logs-frontend:
	docker compose logs -f frontend

docker-ps:
	docker compose ps

# ── Production ──────────────────────────────────────────
prod-build:
	docker compose -f docker-compose.prod.yml build

prod-up:
	docker compose -f docker-compose.prod.yml up -d --build

prod-down:
	docker compose -f docker-compose.prod.yml down

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f

prod-ps:
	docker compose -f docker-compose.prod.yml ps

prod-backup:
	docker compose -f docker-compose.prod.yml exec postgres pg_dump -U charting charting

# ── Terraform (AWS) ─────────────────────────────────────
TF_DIR        = deploy/terraform
AWS_REGION    = us-west-2
PROJECT_NAME  = queryboard
ENVIRONMENT   = prod-west

tf-init:
	terraform -chdir=$(TF_DIR) init

tf-plan:
	terraform -chdir=$(TF_DIR) plan

tf-apply:
	terraform -chdir=$(TF_DIR) apply

tf-destroy:
	terraform -chdir=$(TF_DIR) destroy

tf-output:
	terraform -chdir=$(TF_DIR) output

ecr-login:
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$(AWS_REGION).amazonaws.com

ecr-push:
	docker build --platform linux/amd64 -t queryboard-backend -f server/Dockerfile ./server
	docker tag queryboard-backend:latest $$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$(AWS_REGION).amazonaws.com/$(PROJECT_NAME)-$(ENVIRONMENT)-backend:latest
	docker push $$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$(AWS_REGION).amazonaws.com/$(PROJECT_NAME)-$(ENVIRONMENT)-backend:latest

deploy-backend: ecr-login ecr-push
	aws ecs update-service \
		--region $(AWS_REGION) \
		--cluster $(PROJECT_NAME)-$(ENVIRONMENT)-cluster \
		--service $(PROJECT_NAME)-$(ENVIRONMENT)-backend \
		--force-new-deployment
	@echo "Waiting for deployment to stabilize..."
	aws ecs wait services-stable \
		--region $(AWS_REGION) \
		--cluster $(PROJECT_NAME)-$(ENVIRONMENT)-cluster \
		--services $(PROJECT_NAME)-$(ENVIRONMENT)-backend
	@echo "✅ Backend deployment complete and stable."

deploy-frontend:
	VITE_API_DOMAIN=https://$$(grep 'domain_name' deploy/terraform/terraform.tfvars | head -1 | sed 's/.*= *"//;s/".*//') \
	VITE_API_URL=https://$$(grep 'domain_name' deploy/terraform/terraform.tfvars | head -1 | sed 's/.*= *"//;s/".*//') \
	npm run build
	aws s3 sync dist/ s3://$(PROJECT_NAME)-$(ENVIRONMENT)-frontend --delete
	aws cloudfront create-invalidation \
		--distribution-id $$(aws cloudfront list-distributions --query 'DistributionList.Items[?Origins.Items[?Id==`s3-frontend` && contains(DomainName, `$(PROJECT_NAME)-$(ENVIRONMENT)-frontend`)]].Id' --output text) \
		--paths "/*"
