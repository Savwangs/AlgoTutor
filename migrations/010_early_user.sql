-- EARLY_ACCESS: Track users who signed up during the early access period
-- Run this migration in Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS early_user BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS early_user_registered_at TIMESTAMP;

-- Mark all existing users as early users
UPDATE users SET early_user = true, early_user_registered_at = created_at WHERE early_user IS NULL;

-- Index for efficient querying of early users
CREATE INDEX IF NOT EXISTS idx_users_early_user ON users(early_user) WHERE early_user = true;
