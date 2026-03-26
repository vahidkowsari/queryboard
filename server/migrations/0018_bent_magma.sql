CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" varchar(128),
	"action" varchar(50) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid,
	"entity_name" varchar(255),
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schema_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"phase" varchar(30),
	"message" text,
	"current" integer,
	"total" integer,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_permissions_conversation_id_user_id_group_id_unique') THEN ALTER TABLE "conversation_permissions" DROP CONSTRAINT "conversation_permissions_conversation_id_user_id_group_id_unique"; END IF; END $$;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN IF NOT EXISTS "summary" text;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN IF NOT EXISTS "created_by" varchar(128);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "show_llm_details" boolean DEFAULT false;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_project_id_projects_id_fk') THEN ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_history_chart_id_charts_id_fk') THEN ALTER TABLE "refresh_history" ADD CONSTRAINT "refresh_history_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_history_dashboard_id_dashboards_id_fk') THEN ALTER TABLE "refresh_history" ADD CONSTRAINT "refresh_history_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schema_jobs_project_id_projects_id_fk') THEN ALTER TABLE "schema_jobs" ADD CONSTRAINT "schema_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_project_id" ON "audit_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_id" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity_type" ON "audit_logs" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refresh_history_chart_id" ON "refresh_history" USING btree ("chart_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refresh_history_dashboard_id" ON "refresh_history" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refresh_history_created_at" ON "refresh_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_schema_jobs_project_id" ON "schema_jobs" USING btree ("project_id");