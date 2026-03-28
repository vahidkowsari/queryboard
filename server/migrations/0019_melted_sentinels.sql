CREATE TABLE "sse_session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"event" varchar(40) NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sse_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(30) NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"dashboard_id" uuid,
	"chart_id" uuid,
	"conversation_id" uuid,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sse_session_events" ADD CONSTRAINT "sse_session_events_session_id_sse_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sse_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sse_sessions" ADD CONSTRAINT "sse_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sse_session_events_session_id" ON "sse_session_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_sse_session_events_created_at" ON "sse_session_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sse_sessions_project_id" ON "sse_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_sse_sessions_user_id" ON "sse_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sse_sessions_dashboard_id" ON "sse_sessions" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "idx_sse_sessions_chart_id" ON "sse_sessions" USING btree ("chart_id");--> statement-breakpoint
CREATE INDEX "idx_sse_sessions_conversation_id" ON "sse_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_sse_sessions_status" ON "sse_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sse_sessions_expires_at" ON "sse_sessions" USING btree ("expires_at");