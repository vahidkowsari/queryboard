CREATE TABLE IF NOT EXISTS "groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_groups_project_id" ON "groups" ("project_id");

CREATE TABLE IF NOT EXISTS "group_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "user_id" varchar(128) NOT NULL,
  "added_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE ("group_id", "user_id")
);

CREATE INDEX "idx_group_members_group_id" ON "group_members" ("group_id");
CREATE INDEX "idx_group_members_user_id" ON "group_members" ("user_id");

CREATE TABLE IF NOT EXISTS "dashboard_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dashboard_id" uuid NOT NULL REFERENCES "dashboards"("id") ON DELETE CASCADE,
  "user_id" varchar(128),
  "group_id" uuid REFERENCES "groups"("id") ON DELETE CASCADE,
  "permission" varchar(20) NOT NULL DEFAULT 'view',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CHECK ("user_id" IS NOT NULL OR "group_id" IS NOT NULL)
);

CREATE INDEX "idx_dashboard_permissions_dashboard_id" ON "dashboard_permissions" ("dashboard_id");
CREATE INDEX "idx_dashboard_permissions_user_id" ON "dashboard_permissions" ("user_id");
CREATE INDEX "idx_dashboard_permissions_group_id" ON "dashboard_permissions" ("group_id");
