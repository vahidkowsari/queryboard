ALTER TABLE "dashboards" ADD COLUMN "share_token" varchar(64) UNIQUE;
CREATE INDEX "idx_dashboards_share_token" ON "dashboards" ("share_token");
