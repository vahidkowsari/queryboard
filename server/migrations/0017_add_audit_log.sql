-- Create audit_logs table for tracking user actions
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

-- Add foreign key to projects
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS "idx_audit_logs_project_id" ON "audit_logs" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_id" ON "audit_logs" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_action" ON "audit_logs" USING btree ("action");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity_type" ON "audit_logs" USING btree ("entity_type");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");
