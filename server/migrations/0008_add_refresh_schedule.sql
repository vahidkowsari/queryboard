ALTER TABLE "dashboards"
  ADD COLUMN "refresh_cron" varchar(50),
  ADD COLUMN "last_refreshed_at" timestamp with time zone;
