-- Migration: Add subscription_cancel_at column to users table
-- This column stores the Unix timestamp (in seconds) of when a cancelled subscription ends
-- It's used to display the "Premium access until" date in the dashboard

ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cancel_at BIGINT;

-- Add a comment for documentation
COMMENT ON COLUMN users.subscription_cancel_at IS 'Unix timestamp (seconds) when a cancelled subscription ends. NULL if not cancelled.';
