<template>
  <div class="min-h-screen">
    <div class="max-w-5xl mx-auto px-8 py-12">
      <h1 class="text-4xl font-bold mb-8">Documentation</h1>

      <div class="prose prose-slate dark:prose-invert max-w-none">
        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">Getting Started</h2>
          <p class="text-muted-foreground mb-4">
            QueryBoard is an intelligent dashboard application that uses AI to generate charts from your data using natural language queries. Connect any supported database, describe what you want to see, and the AI agent writes SQL, runs queries, and produces interactive charts automatically.
          </p>
          
          <h3 class="text-xl font-semibold mb-3 mt-6">Prerequisites</h3>
          <ul class="list-disc list-inside space-y-2 text-muted-foreground">
            <li>Node.js 18+</li>
            <li>PostgreSQL (for the app database)</li>
            <li>At least one LLM API key: <code class="text-sm bg-muted px-1 py-0.5 rounded">ANTHROPIC_API_KEY</code>, <code class="text-sm bg-muted px-1 py-0.5 rounded">OPENAI_API_KEY</code>, or <code class="text-sm bg-muted px-1 py-0.5 rounded">GOOGLE_AI_API_KEY</code></li>
          </ul>

          <h3 class="text-xl font-semibold mb-3 mt-6">Creating a Project</h3>
          <ol class="list-decimal list-inside space-y-2 text-muted-foreground">
            <li>Click <strong>New Project</strong> on the home page</li>
            <li>Enter a project name and optional description</li>
            <li>Configure database engine (AWS Athena, PostgreSQL, MySQL, BigQuery, or Amazon Redshift)</li>
            <li>Enter database connection details (credentials, endpoints, etc.)</li>
            <li>Choose LLM vendor (Anthropic Claude, OpenAI GPT, or Google Gemini) and model</li>
            <li>Optionally provide a per-project API key or use server-level environment variables</li>
            <li>Choose chart library (Vega-Lite, Chart.js, ECharts, or Plotly)</li>
            <li>Configure color theme and palette (optional)</li>
          </ol>

          <h3 class="text-xl font-semibold mb-3 mt-6">Adding Charts with AI</h3>
          <ol class="list-decimal list-inside space-y-2 text-muted-foreground">
            <li>Open a dashboard and click <strong>Add Chart</strong></li>
            <li>Enter a natural language query describing what you want to visualize:
              <ul class="list-disc list-inside ml-6 mt-2 space-y-1">
                <li>"Show me sales by region as a bar chart"</li>
                <li>"Display monthly revenue trends as a line chart"</li>
                <li>"Create a pie chart of customer distribution by country"</li>
                <li>"Compare Q1 vs Q2 revenue by product category"</li>
              </ul>
            </li>
            <li>Watch the AI agent work in real-time via streaming updates:
              <ul class="list-disc list-inside ml-6 mt-2 space-y-1">
                <li>Lists available tables</li>
                <li>Inspects relevant columns</li>
                <li>Generates and executes SQL queries</li>
                <li>Creates chart specifications</li>
              </ul>
            </li>
            <li>Toggle "Show AI Reasoning" to see the LLM's decision-making process</li>
            <li>Review the generated chart and SQL query</li>
            <li>Save the chart or iterate with follow-up requests</li>
          </ol>
        </section>

        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">AI-Powered Chart Generation</h2>
          <p class="text-muted-foreground mb-4">
            QueryBoard uses an agentic AI workflow where the LLM autonomously decides which tools to call across multiple turns to generate the perfect visualization.
          </p>
          
          <div class="grid grid-cols-1 gap-4 mb-6">
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Natural Language to Chart</h3>
              <p class="text-sm text-muted-foreground">Describe what you want in plain English and the AI writes SQL, queries your database, and produces an interactive chart</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Agentic Workflow</h3>
              <p class="text-sm text-muted-foreground">The LLM autonomously decides which tools to call (list tables, inspect columns, run queries, create chart) across multiple turns</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Chart Type Selection</h3>
              <p class="text-sm text-muted-foreground">Choose Auto, Bar, Line, Area, Pie, Scatter, KPI, or Table — the AI adapts the visualization accordingly</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Chart Refinement</h3>
              <p class="text-sm text-muted-foreground">Iterate on existing charts with follow-up requests; the agent intelligently decides whether to re-query or just adjust the visual spec</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Error Recovery</h3>
              <p class="text-sm text-muted-foreground">If a query fails, the agent sees the error and can fix the SQL and retry automatically. Column hints are provided on COLUMN_NOT_FOUND errors</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Multi-Query Composition</h3>
              <p class="text-sm text-muted-foreground">The agent can run multiple named queries and merge results using concat, join, or label strategies for comparisons (e.g., before/after, cohort A vs B)</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Real-Time Streaming</h3>
              <p class="text-sm text-muted-foreground">See the AI's progress step-by-step via Server-Sent Events with checkmarks for completed steps and a spinner for the current one</p>
            </div>
          </div>

          <h3 class="text-xl font-semibold mb-3 mt-6">Safety Guardrails</h3>
          <ul class="list-disc list-inside space-y-2 text-muted-foreground">
            <li><strong>Max 10 agent turns</strong> — prevents infinite loops and excessive token burn</li>
            <li><strong>LIMIT enforcement</strong> — all generated queries include LIMIT clauses; CTEs and subqueries on fact tables also require inner LIMITs</li>
            <li><strong>Large table safety</strong> — automatic LIMIT enforcement inside CTEs and subqueries on large fact tables to prevent scan-limit errors on billion-row tables</li>
            <li><strong>Read-only access</strong> — the agent only has SELECT access; no mutations possible</li>
            <li><strong>Retry limit</strong> — at most 1 retry on query failure</li>
          </ul>
        </section>

        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">Multi-Database Support</h2>
          <p class="text-muted-foreground mb-4">
            QueryBoard supports multiple database engines with engine-specific SQL dialect rules injected into the AI agent's system prompt.
          </p>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">AWS Athena</h3>
              <p class="text-sm text-muted-foreground">Presto/Trino dialect with AWS SSO profile authentication</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">PostgreSQL</h3>
              <p class="text-sm text-muted-foreground">Standard PostgreSQL dialect with connection pooling</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">MySQL</h3>
              <p class="text-sm text-muted-foreground">MySQL dialect with backtick quoting for identifiers</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Google BigQuery</h3>
              <p class="text-sm text-muted-foreground">Standard SQL with SAFE_CAST, UNNEST, and backtick references</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Amazon Redshift</h3>
              <p class="text-sm text-muted-foreground">PostgreSQL-compatible dialect with Redshift-specific SQL rules</p>
            </div>
          </div>

          <p class="text-muted-foreground mt-4">
            Each project stores its own engine type and credentials, allowing you to work with multiple databases across different projects.
          </p>
        </section>

        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">Multi-LLM Support</h2>
          <p class="text-muted-foreground mb-4">
            Choose from multiple AI providers with per-project configuration via the Vercel AI SDK unified interface.
          </p>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Anthropic Claude</h3>
              <p class="text-sm text-muted-foreground">Claude Sonnet, Opus, Haiku models</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">OpenAI GPT</h3>
              <p class="text-sm text-muted-foreground">GPT-4o and other models</p>
            </div>
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Google Gemini</h3>
              <p class="text-sm text-muted-foreground">Gemini 2.0 Flash and other models</p>
            </div>
          </div>

          <ul class="list-disc list-inside space-y-2 text-muted-foreground">
            <li>Per-project configuration — each project can use a different LLM vendor and model</li>
            <li>API key override — use a per-project API key or fall back to server-level environment variables</li>
            <li>Unified tool-use interface across all vendors</li>
          </ul>
        </section>

        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">Schema Management</h2>
          
          <h3 class="text-xl font-semibold mb-3">Automatic Schema Detection</h3>
          <p class="text-muted-foreground mb-4">
            One-click detection of all tables and columns from your connected database. The system uses engine-specific schema providers to query metadata.
          </p>

          <h3 class="text-xl font-semibold mb-3">AI-Enriched Descriptions</h3>
          <p class="text-muted-foreground mb-4">
            The LLM automatically generates human-readable descriptions for tables and columns based on their names and data types, making it easier to understand your schema.
          </p>

          <h3 class="text-xl font-semibold mb-3">Schema Explorer</h3>
          <ul class="list-disc list-inside space-y-2 text-muted-foreground">
            <li>Browse all detected tables and columns</li>
            <li>Search across table and column names</li>
            <li>Filter by table prefix groups (e.g., fact, dim)</li>
            <li>Expand/collapse all tables</li>
            <li>Column highlighting on search match</li>
            <li>View approximate row counts for each table</li>
          </ul>
        </section>

        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">Project Management</h2>
          
          <div class="space-y-4">
            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Multi-Project Support</h3>
              <p class="text-sm text-muted-foreground mb-2">Create and manage multiple independent projects, each with its own database connection, AI model, and chart library configuration.</p>
            </div>

            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Project Settings</h3>
              <p class="text-sm text-muted-foreground mb-2">Configure name, description, database connection, AI model, chart library, and color theme per project.</p>
            </div>

            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Export / Import</h3>
              <p class="text-sm text-muted-foreground mb-2">Export a full project (settings, schema, dashboards, charts) as JSON and re-import it into another instance.</p>
            </div>

            <div class="border rounded-lg p-4">
              <h3 class="font-semibold mb-2">Token Usage Stats</h3>
              <p class="text-sm text-muted-foreground mb-2">Dedicated Stats page per project showing total/prompt/completion token counts, estimated cost, usage by model and operation, and recent history.</p>
            </div>
          </div>
        </section>

        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">Authentication & User Roles</h2>
          <p class="text-muted-foreground mb-4">
            QueryBoard uses SuperTokens for authentication with role-based access control.
          </p>

          <h3 class="text-xl font-semibold mb-3">Roles</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div class="border rounded-lg p-4">
              <h4 class="font-semibold mb-2">Admin</h4>
              <p class="text-sm text-muted-foreground">Full access to all features including user management</p>
            </div>
            <div class="border rounded-lg p-4">
              <h4 class="font-semibold mb-2">Editor</h4>
              <p class="text-sm text-muted-foreground">Can create and modify projects, dashboards, and charts</p>
            </div>
            <div class="border rounded-lg p-4">
              <h4 class="font-semibold mb-2">Viewer</h4>
              <p class="text-sm text-muted-foreground">Read-only access to view dashboards and charts</p>
            </div>
          </div>

          <ul class="list-disc list-inside space-y-2 text-muted-foreground">
            <li>First user automatically gets Admin role</li>
            <li>Subsequent users get Viewer role by default</li>
            <li>Admins can manage user roles via the Admin panel</li>
            <li>Google OAuth authentication supported</li>
          </ul>
        </section>

        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">Dashboard Management</h2>
          
          <h3 class="text-xl font-semibold mb-3">Core Features</h3>
          <ul class="list-disc list-inside space-y-2 text-muted-foreground mb-4">
            <li><strong>Create dashboards</strong> — organize charts into named dashboards with optional descriptions</li>
            <li><strong>Inline name editing</strong> — click the dashboard name to rename it in place</li>
            <li><strong>Duplicate dashboards</strong> — clone a dashboard with all its charts</li>
            <li><strong>Delete dashboards</strong> — with confirmation dialog; cascade deletes all contained charts</li>
            <li><strong>Chart count display</strong> — see how many charts each dashboard contains</li>
            <li><strong>Last updated timestamp</strong> — displayed on dashboard cards and the dashboard header</li>
          </ul>

          <h3 class="text-xl font-semibold mb-3">Dashboard Sharing</h3>
          <ol class="list-decimal list-inside space-y-2 text-muted-foreground mb-4">
            <li>Open a dashboard and click the <strong>Share</strong> button</li>
            <li>Click <strong>Generate Share Link</strong> to create a public read-only URL</li>
            <li>Copy the link and share it — no login required to view</li>
            <li>Revoke the link at any time to disable access</li>
          </ol>

          <h3 class="text-xl font-semibold mb-3">View Modes</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="border rounded-lg p-4">
              <h4 class="font-semibold mb-2">Full View</h4>
              <p class="text-sm text-muted-foreground">Large chart cards with name, description tooltip, and all action buttons</p>
            </div>
            <div class="border rounded-lg p-4">
              <h4 class="font-semibold mb-2">Compact View</h4>
              <p class="text-sm text-muted-foreground">Smaller grid cards showing charts only with minimal chrome</p>
            </div>
            <div class="border rounded-lg p-4">
              <h4 class="font-semibold mb-2">List View</h4>
              <p class="text-sm text-muted-foreground">Tabular layout with name, description, chart type, updated date, and action buttons</p>
            </div>
          </div>

          <h3 class="text-xl font-semibold mb-3 mt-6">Auto-Refresh</h3>
          <p class="text-muted-foreground mb-2">
            Schedule automatic data refresh per dashboard with preset intervals or custom cron expressions:
          </p>
          <ul class="list-disc list-inside space-y-1 text-muted-foreground">
            <li>15 minutes, hourly, daily, or weekly presets</li>
            <li>Custom cron expressions for advanced scheduling</li>
            <li>Last refresh timestamp displayed</li>
          </ul>
        </section>

        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">Chart Management</h2>
          
          <h3 class="text-xl font-semibold mb-3">Chart Operations</h3>
          <div class="space-y-3 text-muted-foreground mb-6">
            <div>
              <strong>Create:</strong> Generate new charts via AI from a dedicated page
            </div>
            <div>
              <strong>Edit:</strong> Modify existing charts with follow-up AI requests or rename inline
            </div>
            <div>
              <strong>Refresh:</strong> Re-run the SQL query to get fresh data for a single chart
            </div>
            <div>
              <strong>Refresh All:</strong> Batch refresh every chart in a dashboard with progress indicator
            </div>
            <div>
              <strong>Move:</strong> Move a chart from one dashboard to another via a picker modal
            </div>
            <div>
              <strong>Reorder:</strong> Drag-and-drop charts to rearrange within a dashboard; order is persisted
            </div>
            <div>
              <strong>Delete:</strong> Remove charts with confirmation dialog
            </div>
          </div>

          <h3 class="text-xl font-semibold mb-3">Export Options</h3>
          <ul class="list-disc list-inside space-y-2 text-muted-foreground mb-6">
            <li><strong>PNG:</strong> Download any chart as a PNG image</li>
            <li><strong>CSV:</strong> Download chart data as a CSV file</li>
            <li><strong>Excel:</strong> Download chart data as an Excel (.xlsx) file</li>
            <li><strong>PDF:</strong> Export the entire dashboard (all charts) as a multi-page A4 landscape PDF</li>
          </ul>

          <h3 class="text-xl font-semibold mb-3">SQL Inspector</h3>
          <p class="text-muted-foreground">
            Toggle to view/hide the generated SQL query for any chart. Useful for understanding what data is being queried and for debugging.
          </p>

          <h3 class="text-xl font-semibold mb-3 mt-6">Fullscreen Mode</h3>
          <ul class="list-disc list-inside space-y-2 text-muted-foreground">
            <li>Expand any chart to fill the entire screen</li>
            <li>Chart dynamically resizes to fill the available viewport</li>
            <li>Press Escape to exit fullscreen</li>
          </ul>
        </section>

        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">Color & Theming</h2>
          
          <h3 class="text-xl font-semibold mb-3">Project-Level Configuration</h3>
          <p class="text-muted-foreground mb-4">
            Set a default color palette, background color, and text color for all charts in a project.
          </p>

          <h3 class="text-xl font-semibold mb-3">Color Presets</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div class="border rounded-lg p-3 text-sm">Default</div>
            <div class="border rounded-lg p-3 text-sm">Vibrant</div>
            <div class="border rounded-lg p-3 text-sm">Pastel</div>
            <div class="border rounded-lg p-3 text-sm">Corporate</div>
            <div class="border rounded-lg p-3 text-sm">Ocean</div>
            <div class="border rounded-lg p-3 text-sm">Earth</div>
          </div>

          <ul class="list-disc list-inside space-y-2 text-muted-foreground">
            <li>Per-chart color override — customize colors on individual charts during generation</li>
            <li>Custom color picker — add individual colors with a visual color picker</li>
            <li>Color reset — clear custom colors to revert to library defaults</li>
          </ul>
        </section>

        <section class="mb-12">
          <h2 class="text-2xl font-semibold mb-4">Architecture</h2>
          
          <h3 class="text-xl font-semibold mb-3">Data Flow</h3>
          <div class="bg-muted p-6 rounded-lg mb-6 overflow-x-auto">
            <pre class="text-sm"><code>User Query
    ↓
AIChartGenerator.vue ──SSE──→ POST /generate-chart
    ↓                              ↓
Receives events:              chart-agent.ts
• step events                 (agentic loop)
• thinking events                  ↓
• result event               ├─ list_tables
    ↓                        ├─ get_columns
Renders chart                ├─ run_query ──→ QueryExecutor ──→ Database
+ saves to DB                └─ create_chart ──→ Chart spec</code></pre>
          </div>

          <h3 class="text-xl font-semibold mb-3">Multi-Engine Architecture</h3>
          <p class="text-muted-foreground mb-4">
            Database connections are configured per-project using two factory patterns:
          </p>

          <div class="space-y-4 mb-6">
            <div class="border rounded-lg p-4">
              <h4 class="font-semibold mb-2">QueryExecutor</h4>
              <p class="text-sm text-muted-foreground mb-2">Executes SQL and returns results</p>
              <code class="text-xs bg-muted px-2 py-1 rounded">createQueryExecutor(engine, config) → { execute(sql), sqlRules }</code>
            </div>

            <div class="border rounded-lg p-4">
              <h4 class="font-semibold mb-2">SchemaProvider</h4>
              <p class="text-sm text-muted-foreground mb-2">Detects tables and columns</p>
              <code class="text-xs bg-muted px-2 py-1 rounded">createSchemaProvider(engine, config) → { detectSchema() }</code>
            </div>
          </div>

          <p class="text-muted-foreground mb-4">
            Each engine provides its own SQL dialect rules that are injected into the AI agent's system prompt, ensuring the LLM writes correct SQL for whichever database the project uses.
          </p>

          <h3 class="text-xl font-semibold mb-3">Agentic Workflow Steps</h3>
          <ol class="list-decimal list-inside space-y-2 text-muted-foreground">
            <li><strong>User Input:</strong> Natural language chart request</li>
            <li><strong>Agentic LLM:</strong> Generates SQL via tool-use loop using the Vercel AI SDK</li>
            <li><strong>Query Execution:</strong> Runs against the configured database engine</li>
            <li><strong>Chart Generation:</strong> LLM creates chart spec for the configured library (Vega-Lite, Chart.js, etc.)</li>
            <li><strong>Rendering:</strong> ChartRenderer component dispatches to the appropriate library renderer</li>
          </ol>
        </section>

        <section>
          <h2 class="text-2xl font-semibold mb-4">Tech Stack</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 class="text-lg font-semibold mb-3">Frontend</h3>
              <ul class="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                <li>Vue 3 + Vite + TypeScript</li>
                <li>Pinia - State management</li>
                <li>TailwindCSS + shadcn-vue - UI components</li>
                <li>Lucide Icons - Icon library</li>
                <li>vue-draggable-plus - Drag & drop</li>
                <li>html2canvas + jsPDF - PDF export</li>
              </ul>
            </div>
            <div>
              <h3 class="text-lg font-semibold mb-3">Backend</h3>
              <ul class="list-disc list-inside space-y-1 text-muted-foreground text-sm">
                <li>Express + TypeScript (tsx watch)</li>
                <li>PostgreSQL + Drizzle ORM - App database</li>
                <li>Vercel AI SDK - Multi-vendor LLM abstraction</li>
                <li>Zod - Schema validation for agentic tools</li>
                <li>SuperTokens - Authentication & user roles</li>
                <li>Server-Sent Events (SSE) - Real-time streaming</li>
              </ul>
            </div>
          </div>

          <h3 class="text-lg font-semibold mb-3 mt-6">Data Sources</h3>
          <ul class="list-disc list-inside space-y-1 text-muted-foreground text-sm">
            <li>AWS Athena (Presto/Trino dialect)</li>
            <li>PostgreSQL</li>
            <li>MySQL</li>
            <li>Google BigQuery</li>
            <li>Amazon Redshift</li>
          </ul>

          <h3 class="text-lg font-semibold mb-3 mt-6">Chart Libraries</h3>
          <ul class="list-disc list-inside space-y-1 text-muted-foreground text-sm">
            <li>Vega-Lite (fully implemented)</li>
            <li>Chart.js (configured, renderer planned)</li>
            <li>ECharts (configured, renderer planned)</li>
            <li>Plotly (configured, renderer planned)</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>
