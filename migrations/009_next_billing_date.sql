-- Migration: Add next_billing_date column to users table
-- This stores the next billing date from Stripe for reliable display in dashboard

-- Add next_billing_date column to store Unix timestamp of next billing
ALTER TABLE users ADD COLUMN IF NOT EXISTS next_billing_date BIGINT;

-- Add comment for documentation
COMMENT ON COLUMN users.next_billing_date IS 'Unix timestamp (seconds) for next billing date. Updated via Stripe webhooks.';
