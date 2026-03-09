# QueryBoard

An AI-powered data visualization platform. Connect any supported database, describe what you want to see in natural language, and the AI agent writes SQL, runs queries, and produces interactive charts automatically.

## Features

- **Natural language to chart** — describe what you want, get a chart
- **Agentic AI** — LLM autonomously explores your schema, writes SQL, and builds visualizations
- **Chart refinement** — iterate on existing charts with follow-up requests
- **Multi-engine** — supports AWS Athena, PostgreSQL, MySQL, and BigQuery
- **Multi-LLM** — Anthropic Claude, OpenAI GPT, Google Gemini via Vercel AI SDK
- **Multi-chart** — Vega-Lite, Chart.js, ECharts, Plotly (per-project)
- **Real-time streaming** — see the AI's progress step-by-step via SSE
- **Schema enrichment** — AI-generated descriptions for tables and columns
- **Dashboard management** — organize charts into dashboards with drag-and-drop
- **Fullscreen mode** — view any chart in fullscreen

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- An API key for at least one LLM vendor (Anthropic, OpenAI, or Google)

## Quick Start

### 1. Clone and install

```bash
cd queryboard
npm install
cd server && npm install && cd ..
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and set your LLM API key(s):

```
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# GOOGLE_AI_API_KEY=...
```

### 4. Start the app

```bash
npm run dev:all
```

This starts both the frontend (http://localhost:5173) and backend (http://localhost:3001).

## Usage

1. **Create a project** — click "New Project", select your database engine, enter connection details
2. **Detect schema** — go to Project Settings and click "Detect Schema"
3. **Create a dashboard** — add a new dashboard from the project page
4. **Generate charts** — open a dashboard, click "New Chart", type a natural language query
5. **Refine charts** — type a follow-up in the same text box and regenerate

## Supported Databases

| Engine | Connection Config |
|---|---|
| **AWS Athena** | Database, Workgroup, Region, AWS SSO Profile |
| **PostgreSQL** | Host, Port, Database, User, Password |
| **MySQL** | Host, Port, Database, User, Password |
| **BigQuery** | GCP Project ID, Dataset |

Database connections are configured per-project. Each project stores its own engine type and credentials.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | If using Claude | Anthropic API key |
| `OPENAI_API_KEY` | If using GPT | OpenAI API key |
| `GOOGLE_AI_API_KEY` | If using Gemini | Google AI API key |
| `VITE_API_URL` | No | Backend URL (default: `http://localhost:3001`) |
| `DB_HOST` | No | PostgreSQL host (default: `localhost`) |
| `DB_PORT` | No | PostgreSQL port (default: `5432`) |
| `DB_NAME` | No | PostgreSQL database (default: `charting`) |
| `DB_USER` | No | PostgreSQL user (default: `charting`) |
| `DB_PASSWORD` | No | PostgreSQL password (default: `charting_dev`) |

## Scripts

| Command | Description |
|---|---|
| `npm run dev:all` | Start frontend + backend concurrently |
| `npm run dev` | Start Vite dev server only |
| `npm run dev:server` | Start Express backend only |
| `npm run build` | Build frontend for production |

## Documentation

- [Features](./FEATURES.md) — complete feature list
- [Architecture](./ARCHITECTURE.md) — system design, project structure, data flow
- [Agentic AI](./AGENTIC.md) — how the AI agent works, tools, refinement
