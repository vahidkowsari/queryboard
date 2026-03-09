# Features

## AI-Powered Chart Generation

- **Natural language to chart** — describe what you want in plain English and the AI writes SQL, queries your database, and produces an interactive chart
- **Agentic workflow** — the LLM autonomously decides which tools to call (list tables, inspect columns, run queries, create chart) across multiple turns
- **Chart type selection** — choose Auto, Bar, Line, Area, Pie, Scatter, KPI, or Table; the AI adapts the visualization accordingly
- **Chart refinement** — iterate on existing charts with follow-up requests; the agent intelligently decides whether to re-query or just adjust the visual spec
- **Error recovery** — if a query fails, the agent sees the error and can fix the SQL and retry automatically
- **Column hint on error** — when a query fails with COLUMN_NOT_FOUND, the agent automatically receives the actual column names for referenced tables, reducing hallucination loops
- **CTE guidance** — the agent is prompted to use Common Table Expressions for complex multi-table queries, reducing round trips and agent turns
- **Multi-query composition** — the agent can run multiple named queries and merge results using concat, join, or label strategies for comparisons (e.g., before/after, cohort A vs B)
- **Large table safety** — automatic LIMIT enforcement inside CTEs and subqueries on large fact tables to prevent scan-limit errors on billion-row tables
- **Table row counts** — approximate row counts are fetched during schema detection and shown in tool output so the agent knows table sizes before querying
- **Real-time streaming** — see the AI's progress step-by-step via Server-Sent Events with checkmarks for completed steps and a spinner for the current one
- **AI reasoning toggle** — optionally view the LLM's reasoning between steps to understand its decision-making

## Multi-LLM Support

- **Anthropic Claude** — Claude Sonnet, Opus, Haiku
- **OpenAI GPT** — GPT-4o and other models
- **Google Gemini** — Gemini 2.0 Flash and other models
- **Per-project configuration** — each project can use a different LLM vendor and model
- **API key override** — use a per-project API key or fall back to server-level environment variables
- **Vercel AI SDK** — unified interface across all vendors with tool-use support

## Multi-Database Engine Support

- **AWS Athena** — Presto/Trino dialect, AWS SSO profile auth
- **PostgreSQL** — standard PostgreSQL dialect
- **MySQL** — MySQL dialect with backtick quoting
- **BigQuery** — Google Standard SQL with `SAFE_CAST`, `UNNEST`, backtick references
- **Amazon Redshift** — PostgreSQL-compatible dialect with Redshift-specific SQL rules; uses `pg` library and `information_schema`
- **Engine-specific SQL rules** — each engine injects its own SQL dialect rules into the AI agent's system prompt
- **Per-project connections** — each project stores its own engine type and credentials

## Multi-Chart Library Support

- **Vega-Lite** — fully implemented declarative visualization grammar
- **Chart.js** — configured, renderer planned
- **ECharts** — configured, renderer planned
- **Plotly** — configured, renderer planned
- **Per-project selection** — each project can independently choose its chart library
- **Abstraction layer** — `ChartRenderer` component delegates to library-specific renderers

## Schema Management

- **Automatic schema detection** — one-click detection of all tables and columns from the connected database
- **AI-enriched descriptions** — LLM generates human-readable descriptions for tables and columns
- **Schema Explorer** — browse all detected tables and columns with search, filtering by table prefix groups (e.g., fact, dim), expand/collapse all, and column highlighting on search match

## Project Management

- **Multi-project support** — create and manage multiple independent projects
- **Project settings** — configure name, description, database connection, AI model, chart library, and color theme per project
- **Project deletion** — cascade deletes all dashboards and charts
- **Export / Import** — export a full project (settings, schema, dashboards, charts) as JSON and re-import it into another instance
- **Token usage stats** — dedicated Stats page per project showing total/prompt/completion token counts, estimated cost, usage by model and operation, and recent history

## Authentication & User Roles

- **SuperTokens authentication** — Google OAuth (ThirdParty) + session management
- **Role-based access control** — three roles: Admin, Editor, Viewer
- **Automatic role assignment** — first user gets Admin, subsequent users get Viewer
- **Role backfill** — existing users without roles are automatically assigned on server start
- **Admin user management** — dedicated admin page to view all users and change their roles
- **Role-aware UI** — Admin link visible only to admins; session payload includes roles

## Groups & Dashboard Permissions

- **Project-scoped groups** — create named groups within a project and add/remove members
- **Dashboard-level permissions** — restrict dashboard access to specific users or groups
- **Permission levels** — View (read-only) or Edit (can modify)
- **Open by default** — dashboards with no permissions set are accessible to all project members
- **Restricted mode** — once any permission is added, only listed users/groups can access the dashboard
- **Groups management UI** — manage groups and members in Project Settings
- **Permissions dialog** — click the Shield icon on any dashboard card to manage access

## Dashboard Management

- **Create dashboards** — organize charts into named dashboards with optional descriptions
- **Inline name editing** — click the dashboard name to rename it in place
- **Duplicate dashboards** — clone a dashboard with all its charts
- **Delete dashboards** — with confirmation dialog; cascade deletes all contained charts
- **Share dashboards** — generate a public read-only share link; revoke at any time
- **Export dashboard PDF** — export the entire dashboard (all charts) as a multi-page A4 landscape PDF
- **Chart count display** — see how many charts each dashboard contains
- **Last updated timestamp** — displayed on dashboard cards and the dashboard header
- **Cron-based auto-refresh** — schedule automatic data refresh per dashboard with preset intervals (15 min, hourly, daily, weekly) or custom cron expressions; last refresh timestamp displayed

## Chart Management

- **Create charts** — generate new charts via AI from a dedicated page
- **Edit charts** — modify existing charts with follow-up AI requests or rename inline
- **Delete charts** — with confirmation dialog
- **Refresh charts** — re-run the SQL query to get fresh data for a single chart
- **Refresh all charts** — batch refresh every chart in a dashboard with progress indicator
- **Move chart** — move a chart from one dashboard to another via a picker modal
- **Drag-and-drop reordering** — rearrange charts within a dashboard; order is persisted
- **Export PNG** — download any chart as a PNG image
- **Export CSV** — download chart data as a CSV file
- **Export Excel** — download chart data as an Excel (.xlsx) file
- **SQL inspector** — toggle to view/hide the generated SQL query for any chart

## Dashboard View Modes

- **Full view** — large chart cards with name, description tooltip, and all action buttons
- **Compact view** — smaller grid cards showing charts only with minimal chrome
- **List view** — tabular layout with name, description, chart type, updated date, and action buttons

## Fullscreen Mode

- **Fullscreen chart view** — expand any chart to fill the entire screen
- **Dynamic sizing** — chart resizes to fill the available viewport
- **Keyboard shortcut** — press Escape to exit fullscreen

## Color & Theming

- **Project-level color config** — set a default color palette, background color, and text color for all charts in a project
- **Per-chart color override** — customize colors on individual charts during generation
- **Color presets** — Default, Vibrant, Pastel, Corporate, Ocean, Earth palettes
- **Custom color picker** — add individual colors with a visual color picker
- **Color reset** — clear custom colors to revert to library defaults

## UX

- **Icon-only action buttons** — Settings, Export PDF, Refresh Data, and Ask buttons use icon-only style with tooltips for a cleaner toolbar
- **Toast notifications** — success and error feedback for all actions
- **Confirmation dialogs** — destructive actions (delete project, dashboard, chart) require confirmation
- **Loading states** — spinners with labels for all async operations
- **Info tooltips** — hover to see chart descriptions
- **Inline editing** — click-to-edit for dashboard and chart names
- **Empty states** — helpful messages and CTAs when no projects, dashboards, or charts exist
- **Responsive grid** — layouts adapt from 1 to 3 columns based on screen width

## Safety Guardrails

- **Max 10 agent turns** — prevents infinite loops and excessive token burn
- **Force finish** — on the final turns, the agent is instructed to produce a chart/answer immediately with whatever data it has
- **LIMIT enforcement** — all generated queries include LIMIT clauses; CTEs and subqueries on fact tables also require inner LIMITs
- **Scan limit protection** — agent is instructed to cap cohort selections at ~50K patients and reduce LIMITs on retry after scan-limit errors
- **Null data guard** — charts saved with null data show a friendly message instead of a render crash
- **Read-only access** — the agent only has SELECT access; no mutations possible
- **Retry limit** — at most 1 retry on query failure
- **SI-prefix number formatting** — chart axes display 1k, 1M, 1B instead of scientific notation

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3, TypeScript, Vite, Pinia, TailwindCSS, shadcn-vue, Lucide icons |
| Backend | Express, TypeScript, tsx |
| Auth | SuperTokens (ThirdParty + Session + UserRoles) |
| App Database | PostgreSQL (Drizzle ORM) |
| Data Sources | AWS Athena, PostgreSQL, MySQL, BigQuery, Amazon Redshift |
| AI | Vercel AI SDK — Anthropic, OpenAI, Google |
| Charts | Vega-Lite (Chart.js, ECharts, Plotly planned) |
| Streaming | Server-Sent Events (SSE) with 120s CloudFront/ALB timeouts for long-running agent sessions |
| Drag & Drop | vue-draggable-plus |
| PDF Export | html2canvas, jsPDF |
