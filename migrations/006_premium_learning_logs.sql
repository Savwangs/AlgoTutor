-- Migration: Add columns to usage_logs for V2 personalization features
-- These columns capture learning data to enable
-- personalized quizzes, flashcards, and spaced repetition in V2

-- Add new columns to usage_logs for V2 personalization
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS request_data JSONB;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS response_summary JSONB;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS pattern_detected TEXT;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS mistake_type TEXT;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS data_structures TEXT[];
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS trick_shown TEXT;

-- Add indexes for efficient querying of learning patterns
CREATE INDEX IF NOT EXISTS idx_usage_logs_pattern ON usage_logs(pattern_detected);
CREATE INDEX IF NOT EXISTS idx_usage_logs_mistake_type ON usage_logs(mistake_type);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_mode ON usage_logs(user_id, mode, created_at);
-- Add comments for documentation
COMMENT ON COLUMN usage_logs.request_data IS 'JSONB containing the original request parameters (topic, difficulty, language, etc.)';
COMMENT ON COLUMN usage_logs.response_summary IS 'JSONB containing summary of what was returned (hasPatternSignature, hasTemplate, etc.)';
COMMENT ON COLUMN usage_logs.pattern_detected IS 'The DSA pattern detected in Build mode or the topic in Learn mode';
COMMENT ON COLUMN usage_logs.mistake_type IS 'The type of bug/mistake found in Debug mode (off-by-one, forgot edge case, etc.)';
COMMENT ON COLUMN usage_logs.data_structures IS 'Array of data structures used in the solution (array, hashmap, queue, etc.)';
COMMENT ON COLUMN usage_logs.trick_shown IS 'The key insight/trick shown to the user for this topic';
