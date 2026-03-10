# Architecture

## Overview

QueryBoard is a full-stack application that uses AI (Claude) to generate interactive data visualizations from natural language queries. Users connect any supported database, describe what they want to see, and the AI agent writes SQL, runs queries, and produces Vega-Lite charts automatically.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3, TypeScript, Vite, Pinia, TailwindCSS, shadcn-vue |
| Backend | Express, TypeScript, tsx |
| App Database | PostgreSQL (Drizzle ORM) |
| Data Sources | AWS Athena, PostgreSQL, MySQL, BigQuery, Redshift |
| AI | Vercel AI SDK — Anthropic (Claude), OpenAI (GPT), Google (Gemini) |
| Charts | Vega-Lite, Chart.js, ECharts, Plotly (per-project) |
| Streaming | Server-Sent Events (SSE) |

## Project Structure

```
queryboard/
├── src/                          # Frontend (Vue 3)
│   ├── components/
│   │   ├── AIChartGenerator.vue  # Core: AI chat → chart generation
│   │   ├── ChartCard.vue         # Chart display card with actions
│   │   ├── VegaChart.vue         # Vega-Lite renderer
│   │   └── ui/                   # shadcn-vue primitives
│   ├── views/
│   │   ├── ProjectList.vue       # Home: list/create projects
│   │   ├── ProjectSettings.vue   # DB connection + schema detection
│   │   ├── DashboardList.vue     # Dashboards within a project
│   │   ├── DashboardView.vue     # Charts grid within a dashboard
│   │   ├── ChartCreate.vue       # New chart page
│   │   ├── ChartView.vue         # Edit existing chart
│   │   ├── ChartFullscreen.vue   # Fullscreen chart view
│   │   └── SchemaExplorer.vue    # Browse detected schema
│   ├── services/
│   │   ├── api.ts                # Axios instance
│   │   ├── project.api.ts        # Project CRUD API
│   │   └── dashboard.api.ts      # Dashboard + Chart CRUD API
│   ├── stores/
│   │   ├── project.store.ts      # Project state (Pinia)
│   │   └── dashboard.store.ts    # Dashboard state (Pinia)
│   ├── types/index.ts            # Shared TypeScript types
│   └── router/index.ts           # Vue Router config
│
├── server/                       # Backend (Express + TypeScript)
│   ├── src/
│   │   ├── index.ts              # Entry point, route mounting, migrations
│   │   ├── config.ts             # Environment config (port, db, claude)
│   │   ├── types.ts              # Shared types (Schema, QueryExecutor, etc.)
│   │   ├── routes/
│   │   │   ├── projects.ts       # Project CRUD
│   │   │   ├── dashboards.ts     # Dashboard CRUD
│   │   │   ├── charts.ts         # Chart CRUD
│   │   │   ├── agents.ts         # AI agents (chart generation, Q&A)
│   │   │   └── schema.ts         # Schema detection + retrieval
│   │   ├── services/
│   │   │   │   ├── chart-agent.ts    # Agentic chart generation (core)
│   │   │   ├── schema-detector.ts
│   │   │   ├── schema-enricher.ts
│   │   │   ├── claude.service.ts # askLLM (multi-vendor)
│   │   │   ├── llm-providers/    # Per-vendor LLM models
│   │   │   │   └── index.ts      # Factory (anthropic/openai/google)
│   │   │   ├── chart-libraries/  # Per-library chart rules
│   │   │   │   └── index.ts      # Factory (vega-lite/chartjs/echarts/plotly)
│   │   │   ├── query-executors/  # Per-engine query execution
│   │   │   │   ├── index.ts      # Factory
│   │   │   │   ├── athena.executor.ts
│   │   │   │   ├── postgres.executor.ts
│   │   │   │   ├── mysql.executor.ts
│   │   │   │   ├── bigquery.executor.ts
│   │   │   │   └── redshift.executor.ts
│   │   │   └── schema-providers/ # Per-engine schema detection
│   │   │       ├── index.ts      # Factory
│   │   │       ├── athena.provider.ts
│   │   │       ├── postgres.provider.ts
│   │   │       ├── mysql.provider.ts
│   │   │       ├── bigquery.provider.ts
│   │   │       └── redshift.provider.ts
│   │   └── middleware/
│   │       ├── error.ts          # Error handler + asyncHandler
│   │       └── project.ts        # Middleware to load project context
│   ├── migrations/               # Drizzle SQL migrations
│   └── projects.config.json      # Seed project config
│
├── docker-compose.yml            # PostgreSQL for app metadata
├── .env.example                  # Environment variables template
└── package.json                  # Frontend deps + dev scripts
```

## Data Flow

```
User types natural language query
        │
        ▼
  AIChartGenerator.vue ──── SSE fetch ────▶ POST /generate-chart
        │                                         │
        │  receives:                               ▼
        │  • step events                    chart-agent.ts
        │  • thinking events                (agentic loop)
        │  • result event                         │
        │                                         ├─ list_tables
        ▼                                         ├─ get_columns
  Renders Vega-Lite chart                         ├─ run_query ──▶ QueryExecutor ──▶ Database
  + saves to DB                                   └─ create_chart ──▶ Vega-Lite spec
```

## Multi-Engine Architecture

Database connections are configured per-project. The system uses two factory patterns:

**QueryExecutor** — executes SQL and returns results
```
createQueryExecutor(engine, config) → { execute(sql), sqlRules }
```

**SchemaProvider** — detects tables and columns
```
createSchemaProvider(engine, config) → { detectSchema() }
```

Each engine provides its own SQL dialect rules that are injected into the AI agent's system prompt, so Claude writes correct SQL for whichever database the project uses.

| Engine | Schema Detection | Query Execution | SQL Rules |
|---|---|---|---|
| Athena | `SHOW TABLES` / `SHOW COLUMNS` | AWS SDK | Presto/Trino dialect |
| PostgreSQL | `information_schema` | `pg` pool | PostgreSQL dialect |
| MySQL | `information_schema` | `mysql2` pool | MySQL dialect |
| BigQuery | Dataset metadata API | `@google-cloud/bigquery` | Standard SQL |
| Redshift | `information_schema` | `pg` (PostgreSQL-compatible) | Redshift SQL |

## API Routes

All project-scoped routes are prefixed with `/api/projects/:projectId`.

| Method | Path | Description |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/projects` | Project CRUD |
| GET/POST | `/.../schema` | Get or detect schema |
| GET/POST/PUT/DELETE | `/.../dashboards` | Dashboard CRUD |
| GET/POST/PUT/DELETE | `/.../dashboards/:id/charts` | Chart CRUD |
| POST | `/.../agents/generate-chart` | AI chart generation (SSE) |
| POST | `/.../agents/ask` | AI Q&A agent (SSE) |

## Frontend Routes

| Path | View |
|---|---|
| `/` | ProjectList |
| `/projects/:id` | DashboardList |
| `/projects/:id/settings` | ProjectSettings |
| `/projects/:id/schema` | SchemaExplorer |
| `/projects/:id/dashboard/:id` | DashboardView |
| `/.../charts/new` | ChartCreate |
| `/.../charts/:id` | ChartView |
| `/.../charts/:id/fullscreen` | ChartFullscreen |
