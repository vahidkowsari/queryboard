CREATE TABLE IF NOT EXISTS "conversation_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "user_id" varchar(128),
  "group_id" uuid REFERENCES "groups"("id") ON DELETE CASCADE,
  "permission" varchar(20) NOT NULL DEFAULT 'view',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CHECK ("user_id" IS NOT NULL OR "group_id" IS NOT NULL),
  UNIQUE ("conversation_id", "user_id", "group_id")
);

CREATE INDEX "idx_conversation_permissions_conversation_id" ON "conversation_permissions" ("conversation_id");
CREATE INDEX "idx_conversation_permissions_user_id" ON "conversation_permissions" ("user_id");
CREATE INDEX "idx_conversation_permissions_group_id" ON "conversation_permissions" ("group_id");
