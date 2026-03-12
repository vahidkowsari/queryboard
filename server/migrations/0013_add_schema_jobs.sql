CREATE TABLE IF NOT EXISTS "schema_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "phase" varchar(30),
  "message" text,
  "current" integer,
  "total" integer,
  "error_message" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_schema_jobs_project_id" ON "schema_jobs" ("project_id");
