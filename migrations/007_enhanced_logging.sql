-- Migration: Enhanced logging columns for V2 personalized exam prep
-- Adds new columns to usage_logs for capturing detailed learning data

-- Add widget_id column if it doesn't exist (for cross-session tracking)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS widget_id TEXT;

-- Add What Professors Test column (Learn + Debug modes, NULL for Build)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS what_professors_test TEXT;

-- Add Don't Forget column (Build mode only, NULL for Learn/Debug)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS dont_forget TEXT;

-- Add Mistake column - stores full bug location details as JSON (Debug mode)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS mistake JSONB;

-- Add Time Complexity column (all modes)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS time_complexity TEXT;

-- Add Difficulty Score column (easy/medium/hard - all modes)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS difficulty_score TEXT;

-- Add Related Patterns array column (all modes)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS related_patterns TEXT[];

-- Add indexes for V2 querying
CREATE INDEX IF NOT EXISTS idx_usage_logs_widget_id ON usage_logs(widget_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_difficulty ON usage_logs(difficulty_score);

-- Add comments for documentation
COMMENT ON COLUMN usage_logs.widget_id IS 'Browser widget ID for cross-session tracking';
COMMENT ON COLUMN usage_logs.what_professors_test IS 'What Professors Test content (Learn + Debug modes)';
COMMENT ON COLUMN usage_logs.dont_forget IS 'Don''t Forget warning content (Build mode only)';
COMMENT ON COLUMN usage_logs.mistake IS 'Full bug location details as JSONB (Debug mode) - includes lineNumber, code, issue';
COMMENT ON COLUMN usage_logs.time_complexity IS 'Time and space complexity analysis';
COMMENT ON COLUMN usage_logs.difficulty_score IS 'Difficulty rating: easy, medium, or hard';
COMMENT ON COLUMN usage_logs.related_patterns IS 'Array of related DSA patterns for V2 recommendations';
