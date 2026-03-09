# Agentic AI Chart Generation

## Overview

The chart generation system uses an LLM's **tool-use** capability to autonomously explore a database, write SQL, execute queries, and produce chart visualizations. The system supports multiple LLM vendors (Anthropic Claude, OpenAI GPT, Google Gemini) via the **Vercel AI SDK**, and multiple chart libraries (Vega-Lite, Chart.js, ECharts, Plotly). Each project can independently configure which vendor and chart library to use.

## How It Works

### The Agent Loop

The agent runs in a turn-based loop (`chart-agent.ts`):

```
User query → Claude (with tools) → Tool call → Execute → Result back to Claude → ... → create_chart
```

Each turn:
1. Claude receives the conversation history + available tools
2. Claude decides which tool(s) to call (or finishes)
3. The server executes the tool and returns results to Claude
4. Repeat until Claude calls `create_chart` or max turns is reached

### Tools

The agent has 4 tools available:

| Tool | Purpose | When Used |
|---|---|---|
| `list_tables` | Show all tables with descriptions | First step — discover available data |
| `get_columns` | Show columns, types, descriptions for a table | Understand table structure before writing SQL |
| `run_query` | Execute SQL on the connected database | Run the data query |
| `create_chart` | Produce final Vega-Lite spec with inline data | Terminal step — ends the agent loop |

### Typical Flow (New Chart)

```
Turn 1: Claude calls list_tables
         → Returns table names + descriptions

Turn 2: Claude calls get_columns("fact_orders")
         → Returns columns with types

Turn 3: Claude calls get_columns("dim_products")
         → Returns columns with types

Turn 4: Claude calls run_query("SELECT ... FROM ... JOIN ... LIMIT 50")
         → Returns query results (columns + rows)

Turn 5: Claude calls create_chart({ title, sql, description, vega_spec })
         → Agent loop ends, chart returned to frontend
```

### Error Recovery

If a query fails, Claude sees the error message and can:
- Fix the SQL syntax and retry
- Call `get_columns` again to verify column names
- Try a simpler query approach

The prompt instructs Claude to retry at most once on failure.

## Chart Refinement

When a chart already exists, the user can type a follow-up request to refine it. The agent receives the existing chart context:

- Original user query
- Current SQL
- Current description
- Data sample (first 3 rows)

### Refinement Workflow

The agent intelligently decides the approach:

**Visual-only changes** (colors, chart type, labels, sorting):
- Claude calls `create_chart` directly with modified Vega-Lite spec
- No database query needed — instant response

**Data changes** (new filters, columns, aggregations):
- Claude modifies the SQL
- Calls `run_query` with the updated query
- Calls `create_chart` with new data

### Example Refinement Requests

| Request | Agent Action |
|---|---|
| "Make it a horizontal bar chart" | Direct `create_chart` (visual only) |
| "Add color by category" | Direct `create_chart` (visual only) |
| "Filter to only 2023-2024" | `run_query` with updated WHERE → `create_chart` |
| "Show top 20 instead of top 10" | `run_query` with updated LIMIT → `create_chart` |
| "Break it down by region" | `get_columns` → `run_query` → `create_chart` |

## Engine-Specific SQL Rules

Each database engine provides its own SQL rules that are injected into the agent's system prompt. This ensures Claude writes correct SQL regardless of the dialect:

- **Athena**: Presto/Trino syntax, CAST for types, no alias references in WHERE/HAVING
- **PostgreSQL**: `::type` casting, `string_agg()`, `DATE_TRUNC()`, `ILIKE`
- **MySQL**: Backtick quoting, `GROUP_CONCAT()`, `DATE_FORMAT()`
- **BigQuery**: `SAFE_CAST()`, `STRING_AGG()`, `UNNEST()`, backtick table references

Rules are defined in each executor file (`server/src/services/query-executors/*.executor.ts`).

## SSE Streaming

The agent streams real-time updates to the frontend via Server-Sent Events:

| Event | Payload | Purpose |
|---|---|---|
| `step` | `{ step: "Listing tables..." }` | Show progress in UI |
| `thinking` | `{ text: "I need to find..." }` | Claude's reasoning text (toggleable) |
| `result` | `{ title, sql, vegaSpec, data, ... }` | Final chart result |
| `error` | `{ error: "message" }` | Error occurred |

The frontend displays steps with checkmarks (completed) and a spinner (current), with an optional toggle to show Claude's reasoning between steps.

## Safety Guardrails

- **Max turns**: 20 — prevents infinite loops
- **Force finish**: On turns 19-20, if query results exist, Claude is instructed to call `create_chart` immediately
- **LIMIT enforcement**: The prompt requires all queries to include LIMIT clauses
- **Read-only**: The agent only has SELECT access — no mutations possible
- **Retry limit**: The prompt instructs at most 1 retry on query failure

## Configuration

The agent uses the Claude model specified in `VITE_CLAUDE_MODEL` (default: `claude-sonnet-4-20250514`). Sonnet is recommended for the agent loop — it's fast, follows instructions well, and cheaper than Opus.

## Adding New Tools

To add a new tool to the agent:

1. Add the tool definition to the `TOOLS` array in `chart-agent.ts`
2. Add a handler function (e.g., `handleNewTool()`)
3. Add the tool dispatch in the agent loop's tool processing block
4. Update the system prompt if the tool changes the expected workflow
