-- Add filters column to charts table for dashboard-level filtering
ALTER TABLE charts ADD COLUMN IF NOT EXISTS filters jsonb;
