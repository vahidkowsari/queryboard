ALTER TABLE "projects" ADD COLUMN "llm_config" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "chart_library" varchar(50) DEFAULT 'vega-lite';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "color_config" jsonb;
