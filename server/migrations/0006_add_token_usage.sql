CREATE TABLE IF NOT EXISTS "token_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "chart_id" uuid,
  "vendor" varchar(50) NOT NULL,
  "model" varchar(100) NOT NULL,
  "prompt_tokens" integer NOT NULL DEFAULT 0,
  "completion_tokens" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "estimated_cost" numeric(10, 6),
  "operation" varchar(50) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_token_usage_project_id" ON "token_usage" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_token_usage_created_at" ON "token_usage" ("created_at");
