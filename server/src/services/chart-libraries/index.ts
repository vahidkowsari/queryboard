import type { ChartLibrary } from '../../types.js'

export interface ChartLibraryConfig {
  name: ChartLibrary
  promptRules: string
  specDescription: string
}

const VEGA_LITE: ChartLibraryConfig = {
  name: 'vega-lite',
  promptRules: `VEGA-LITE RULES:
- Set width to "container" and height to 400 (KPIs: height 200).
- Use "tableau10" for categorical colors, "blues" or "viridis" for sequential.
- Include a descriptive title.
- Use human-readable axis labels (replace underscores with spaces, title case).
- All data values are returned as strings — use {"calculate": "toNumber(datum.field)", "as": "field_num"} transforms for numeric fields.
- Include data inline: "data": {"values": [...]} with ALL rows.
- Do NOT use "rank" or "dense_rank" window transforms — use sort encoding instead.
- For KPIs (single number), use {"mark": {"type": "text", "fontSize": 64, "fontWeight": "bold"}}.
- FOR KPIs WITH CHANGE INDICATORS: When the user asks for a KPI with trend/change/comparison (e.g. "show total revenue vs last month"), the SQL should return a SINGLE ROW with these columns:
  * The primary metric (e.g. "total_revenue")
  * "previous_value" — the comparison period value
  * "change_pct" — percentage change ((current - previous) / ABS(previous) * 100)
  * "period_label" — a human-readable comparison label (e.g. "vs last month", "vs last year")
  Example SQL: WITH current AS (SELECT SUM(amount) AS total FROM orders WHERE date >= '2024-01-01'), prior AS (SELECT SUM(amount) AS total FROM orders WHERE date BETWEEN '2023-01-01' AND '2023-12-31') SELECT current.total AS total_revenue, prior.total AS previous_value, ROUND((current.total - prior.total) / ABS(prior.total) * 100, 1) AS change_pct, 'vs last year' AS period_label FROM current, prior
  The frontend automatically renders change_pct as a colored up/down arrow badge. Field names are flexible — any of these work: change_pct, pct_change, growth, yoy, mom, qoq, delta_pct for percentages; change, delta, diff for absolute changes; previous, prior, baseline for previous values; period_label, vs, compared_to for the comparison label.
- For pie/donut, use arc mark with theta encoding.
- For bar charts with many categories (>10), show top N only.
- FOR TABLE CHARTS: Return an empty object {} as the chart_spec. The frontend will render the data as an HTML table automatically. Do NOT create a Vega-Lite spec with marks or axes for tables.
- FOR GEO/MAP CHARTS (choropleth):
  Use a LAYERED spec with TWO layers: (1) borders layer for all states, (2) data layer with color encoding.
  COMPLETE WORKING EXAMPLE (follow this pattern exactly):
  {
    "title": "Facilities by State",
    "projection": {"type": "albersUsa"},
    "layer": [
      {
        "data": {"url": "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json", "format": {"type": "topojson", "feature": "states"}},
        "mark": {"type": "geoshape", "fill": "#e8e8e8", "stroke": "#999", "strokeWidth": 0.5}
      },
      {
        "data": {"url": "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json", "format": {"type": "topojson", "feature": "states"}},
        "transform": [
          {"lookup": "id", "from": {"data": {"values": [{"fips": 6, "state_name": "California", "count": 42}]}, "key": "fips", "fields": ["state_name", "count"]}}
        ],
        "mark": {"type": "geoshape", "stroke": "#fff", "strokeWidth": 0.5},
        "encoding": {
          "color": {"field": "count", "type": "quantitative", "scale": {"scheme": "blues"}, "legend": {"title": "Count"}},
          "tooltip": [{"field": "state_name", "type": "nominal", "title": "State"}, {"field": "count", "type": "quantitative", "title": "Facilities"}]
        }
      }
    ]
  }
  GEO RULES:
  - Put "projection" at the TOP LEVEL, not inside each layer.
  - The "fields" array in the lookup MUST list ALL fields you use in encoding/tooltip.
  - FIPS mapping: AL=1, AK=2, AZ=4, AR=5, CA=6, CO=8, CT=9, DE=10, DC=11, FL=12, GA=13, HI=15, ID=16, IL=17, IN=18, IA=19, KS=20, KY=21, LA=22, ME=23, MD=24, MA=25, MI=26, MN=27, MS=28, MO=29, MT=30, NE=31, NV=32, NH=33, NJ=34, NM=35, NY=36, NC=37, ND=38, OH=39, OK=40, OR=41, PA=42, RI=44, SC=45, SD=46, TN=47, TX=48, UT=49, VT=50, VA=51, WA=53, WV=54, WI=55, WY=56
  - Use a CASE statement in SQL to convert state abbreviations to FIPS codes.
  - SQL should also output a human-readable state name column for tooltips.
  - Do NOT use "data.values" at the top level — data goes INSIDE the lookup transform's "from" block.`,
  specDescription:
    'Complete Vega-Lite v6 specification. For standard charts: include "data": {"values": [...]} with ALL result rows. For geo/map charts: use a layered spec with TopoJSON URL and lookup transform as described in the rules.',
}

const CHARTJS: ChartLibraryConfig = {
  name: 'chartjs',
  promptRules: `CHART.JS RULES:
- Return a complete Chart.js configuration object with "type", "data", and "options".
- Supported types: bar, line, pie, doughnut, scatter, radar, polarArea.
- Include all data inline in "data.datasets[].data" arrays.
- Use "data.labels" for category labels.
- Set descriptive "options.plugins.title.text".
- Use human-readable labels (replace underscores with spaces, title case).
- All data values are returned as strings — convert numeric values with parseFloat() in your data arrays.
- For KPIs, use a single doughnut chart with center text plugin or a simple display object.
- Use appealing color palettes from Chart.js defaults.
- Set "options.responsive" to true and "options.maintainAspectRatio" to false.
- FOR TABLE CHARTS: Return an empty object {} as the chart_spec. The frontend will render the data as an HTML table automatically. Do NOT create a Chart.js configuration for tables.`,
  specDescription: 'Complete Chart.js configuration object with type, data (inline), and options.',
}

const ECHARTS: ChartLibraryConfig = {
  name: 'echarts',
  promptRules: `ECHARTS RULES:
- Return a complete ECharts option object.
- Use "series" array for data series, "xAxis"/"yAxis" for axes.
- Include all data inline in series[].data arrays.
- Supported types: bar, line, pie, scatter, radar, heatmap, treemap.
- Set descriptive "title.text".
- Use human-readable axis labels (replace underscores with spaces, title case).
- All data values are returned as strings — convert numeric values to numbers in data arrays.
- For KPIs, use a gauge chart or a simple text display.
- Set "tooltip.trigger" appropriately ("axis" for bar/line, "item" for pie/scatter).
- Use "legend" to show series labels.
- For pie charts, use series[].type = "pie" with data as [{name, value}] arrays.
- FOR TABLE CHARTS: Return an empty object {} as the chart_spec. The frontend will render the data as an HTML table automatically. Do NOT create an ECharts configuration for tables.`,
  specDescription: 'Complete ECharts option object with series, axes, and inline data.',
}

const PLOTLY: ChartLibraryConfig = {
  name: 'plotly',
  promptRules: `PLOTLY RULES:
- Return an object with "data" (array of traces) and "layout".
- Each trace has "type", "x", "y" (or other relevant fields), and optional "name".
- Supported types: bar, scatter, line (scatter with mode "lines"), pie, heatmap, box, histogram.
- Include all data inline in trace arrays.
- Set descriptive "layout.title.text".
- Use human-readable axis labels in "layout.xaxis.title" and "layout.yaxis.title".
- All data values are returned as strings — convert numeric values to numbers in trace arrays.
- For KPIs, use an indicator trace with "mode": "number".
- Set "layout.autosize" to true.
- For pie charts, use "labels" and "values" in the trace.
- FOR TABLE CHARTS: Return an empty object {} as the chart_spec. The frontend will render the data as an HTML table automatically. Do NOT create a Plotly configuration for tables.`,
  specDescription: 'Complete Plotly figure with data (traces array) and layout object.',
}

const LIBRARIES: Record<ChartLibrary, ChartLibraryConfig> = {
  'vega-lite': VEGA_LITE,
  chartjs: CHARTJS,
  echarts: ECHARTS,
  plotly: PLOTLY,
}

export function getChartLibraryConfig(library?: ChartLibrary | null): ChartLibraryConfig {
  return LIBRARIES[library ?? 'vega-lite']
}
