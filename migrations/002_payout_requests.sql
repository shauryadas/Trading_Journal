CREATE TABLE payout_requests (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT current_setting('hatchable.user_id'::text, true),
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  firm TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'Requested' CHECK (status IN ('Requested', 'Paid', 'Cancelled', 'Rejected')),
  eligibility_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payout_requests_owner_created_idx ON payout_requests(owner_id, created_at DESC);
CREATE INDEX payout_requests_owner_account_idx ON payout_requests(owner_id, account_id, status);