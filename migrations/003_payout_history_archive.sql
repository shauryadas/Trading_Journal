ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS payout_requests_owner_archived_idx ON payout_requests(owner_id, archived_at, created_at DESC);