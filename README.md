# QueryBoard

An intelligent dashboard application that uses AI to generate charts from your data using natural language queries. Supports multiple database engines, LLM providers, and chart libraries.

## Features

- **Multi-Project** - Create isolated projects with independent DB, LLM, and chart library configs
- **AI-Powered Charts** - Generate charts from natural language via agentic tool-use
- **Multi-Database** - Athena, PostgreSQL, MySQL, BigQuery, Redshift, Snowflake
- **Multi-LLM** - Anthropic Claude, OpenAI GPT, Google Gemini (via Vercel AI SDK)
- **Multi-Chart Library** - Vega-Lite, Chart.js, ECharts, Plotly (per-project)
- **Dashboard Sharing** - Generate public read-only links to share dashboards
- **Schema Explorer** - Auto-detect and LLM-enrich table/column descriptions
- **Drag & Drop** - Reorder charts within dashboards
- **Export** - PDF dashboard export, CSV/Excel per chart, PNG chart export
- **Color Theming** - Per-project and per-chart color configuration
- **TypeScript** - Fully typed frontend and backend

## Tech Stack

### Frontend

- **Vue 3** + **Vite** + **TypeScript**
- **Pinia** - State management
- **TailwindCSS** + **shadcn-vue** - UI components
- **Lucide Icons** - Icon library
- **vue-draggable-plus** - Drag & drop

### Backend

- **Express** + **TypeScript** (tsx watch)
- **PostgreSQL** + **Drizzle ORM** - App database
- **Vercel AI SDK** - Multi-vendor LLM abstraction
- **Zod** - Schema validation for agentic tools

## Project Structure

```
src/                              # Frontend (Vue 3)
├── components/                   # Vue components
│   ├── ChartCard.vue             # Chart display card with actions
│   ├── SharedChartCard.vue       # Read-only chart card for shared views
│   ├── ChartRenderer.vue         # Chart library abstraction layer
│   ├── AIChartGenerator.vue      # AI chart generation interface
│   └── Modal.vue                 # Reusable modal component
├── views/                        # Page views
│   ├── ProjectList.vue           # Project management
│   ├── ProjectSettings.vue       # Project DB/LLM/chart config
│   ├── DashboardList.vue         # Dashboard management
│   ├── DashboardView.vue         # Dashboard with charts + sharing
│   ├── SharedDashboardView.vue   # Public read-only shared dashboard
│   ├── SchemaExplorer.vue        # Database schema browser
│   └── ChartCreate.vue / ChartView.vue
├── services/                     # API clients
│   ├── api.ts                    # Axios instance
│   ├── dashboard.api.ts          # Dashboard + chart + share API
│   └── project.api.ts            # Project API
├── stores/                       # Pinia stores
│   ├── dashboard.store.ts        # Dashboard state + sharing
│   └── project.store.ts          # Project state
├── composables/                  # Vue composables
├── types/                        # TypeScript types
└── router/                       # Vue Router config

server/                           # Backend (Express + TypeScript)
├── src/
│   ├── index.ts                  # Entry point, routes, migrations
│   ├── config.ts                 # App configuration
│   ├── db/schema.ts              # Drizzle ORM schema
│   ├── routes/                   # Express route handlers
│   │   ├── dashboards.ts         # Dashboard CRUD + share endpoints
│   │   ├── charts.ts             # Chart CRUD + refresh
│   │   ├── projects.ts           # Project CRUD
│   │   ├── claude.ts             # SSE chart generation
│   │   └── schema.ts             # Schema detection + enrichment
│   └── services/                 # Business logic
│       ├── chart-agent.ts        # Agentic LLM tool-use
│       ├── dashboard.service.ts  # Dashboard + sharing logic
│       ├── query-executors/      # Athena, Postgres, MySQL, BigQuery, Redshift, Snowflake
│       ├── schema-providers/     # Per-engine schema detection
│       ├── llm-providers/        # Multi-vendor LLM factory
│       └── chart-libraries/      # Per-library prompt config
└── migrations/                   # SQL migrations
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL (for the app database)
- At least one LLM API key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_AI_API_KEY`

### Installation

1. Install dependencies:

```bash
npm install
cd server && npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

Set your LLM API keys (only the vendors you use):

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
```

3. Start both frontend and backend:

```bash
npm run dev
```

4. Open `http://localhost:5173`

## Usage

### Creating a Project

1. Click **New Project** on the home page
2. Configure database engine (Athena, PostgreSQL, MySQL, BigQuery, Redshift, or Snowflake)
3. Choose LLM vendor and model
4. Choose chart library (Vega-Lite, Chart.js, ECharts, or Plotly)

### Adding Charts with AI

1. Open a dashboard and click **Add Chart**
2. Enter a natural language query, e.g.:
   - "Show me sales by region as a bar chart"
   - "Display monthly revenue trends"
   - "Create a pie chart of customer distribution by country"
3. The AI agent will generate SQL, execute it, and create a chart
4. Review and save

### Sharing a Dashboard

1. Open a dashboard and click **Share**
2. Click **Generate Share Link** to create a public read-only URL
3. Copy the link and share it — no login required to view
4. Revoke the link at any time to disable access

### Managing Charts

- **Edit** - Click the edit icon on any chart card
- **Reorder** - Drag charts to rearrange
- **Refresh** - Re-run the SQL query to update data
- **Export** - CSV, Excel, PNG per chart; PDF for the full dashboard
- **Delete** - Click the trash icon to remove

## Architecture Flow

```
User Query → LLM Agent (tool-use) → SQL Generation → DB Query → Chart Spec → Rendering
```

1. **User Input** - Natural language chart request
2. **Agentic LLM** - Generates SQL via tool-use loop (Vercel AI SDK)
3. **Query Execution** - Runs against configured database engine
4. **Chart Generation** - LLM creates chart spec for the configured library
5. **Rendering** - ChartRenderer dispatches to the appropriate library renderer

## Development

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
