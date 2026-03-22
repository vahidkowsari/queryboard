-- Add last_refreshed_at to charts table
ALTER TABLE "charts" ADD COLUMN "last_refreshed_at" timestamp with time zone;

-- Create refresh_history table for audit logging
CREATE TABLE IF NOT EXISTS "refresh_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chart_id" uuid NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"triggered_by" varchar(128),
	"trigger_type" varchar(20) NOT NULL,
	"status" varchar(20) NOT NULL,
	"execution_time_ms" integer,
	"row_count" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "refresh_history" ADD CONSTRAINT "refresh_history_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "charts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "refresh_history" ADD CONSTRAINT "refresh_history_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_refresh_history_chart_id" ON "refresh_history" USING btree ("chart_id");
CREATE INDEX IF NOT EXISTS "idx_refresh_history_dashboard_id" ON "refresh_history" USING btree ("dashboard_id");
CREATE INDEX IF NOT EXISTS "idx_refresh_history_created_at" ON "refresh_history" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_refresh_history_triggered_by" ON "refresh_history" USING btree ("triggered_by");
