# Deploying QueryBoard

## Quick Start (Docker Compose)

The simplest way to deploy QueryBoard is with Docker Compose on a single server.

### 1. Create environment file

```bash
cp .env.example .env
```

Edit `.env` with your values:

```
# Database
DB_PASSWORD=your_secure_password

# Domains — set to your server's URL (no trailing slash)
API_DOMAIN=https://queryboard.yourcompany.com
WEBSITE_DOMAIN=https://queryboard.yourcompany.com

# Google OAuth
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret

# Optional: restrict to a single email domain
ALLOWED_EMAIL_DOMAIN=yourcompany.com

# LLM API keys (set the ones you use)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=AI...

# Port to expose (default 80)
PORT=80
```

### 2. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This starts 4 services:
- **postgres** — PostgreSQL database
- **supertokens** — Auth service
- **backend** — Express API server
- **frontend** — Nginx serving the Vue app + proxying `/api` and `/auth` to the backend

### 3. Access

Open `http://your-server-ip` (or your domain if DNS is configured).

### Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Logs

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
```

---

## Production Considerations

### HTTPS

For production, put a reverse proxy with TLS in front (e.g., Caddy, Traefik, or an AWS ALB). The simplest option:

```bash
# Install Caddy on the host
sudo apt install caddy

# Caddyfile
queryboard.yourcompany.com {
    reverse_proxy localhost:80
}
```

Caddy auto-provisions Let's Encrypt certificates.

### AWS Deployment

For a more robust AWS setup:

1. **RDS PostgreSQL** — replace the Docker PostgreSQL
2. **ECS Fargate** — run backend + SuperTokens as ECS tasks
3. **S3 + CloudFront** — serve the frontend static build
4. **ALB** — load balancer in front of backend tasks
5. **Secrets Manager** — store API keys and credentials

### Backups

The PostgreSQL volume (`pgdata`) contains all data. Back it up regularly:

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U charting charting > backup.sql
```
