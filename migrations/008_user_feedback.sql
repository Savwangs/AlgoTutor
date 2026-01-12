-- Migration: Add user feedback columns for V2 personalization
-- Captures user feedback on LLM outputs (thumbs up/down + reason)

-- Add feedback decision column (yes = thumbs up, no = thumbs down)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS feedback_decision TEXT;
-- Values: 'yes' (thumbs up), 'no' (thumbs down), NULL (no feedback given)

-- Add feedback reason column
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS feedback_reason TEXT;
-- Positive reasons: 'clear_explanation', 'good_examples', 'helped_understand', 'easy_code'
-- Negative reasons: 'unclear', 'too_advanced', 'already_knew', 'code_broken'

-- Add index for efficient feedback analysis queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_feedback ON usage_logs(feedback_decision);
CREATE INDEX IF NOT EXISTS idx_usage_logs_feedback_reason ON usage_logs(feedback_reason);

-- Add comments for documentation
COMMENT ON COLUMN usage_logs.feedback_decision IS 'User feedback: yes (thumbs up) or no (thumbs down)';
COMMENT ON COLUMN usage_logs.feedback_reason IS 'Reason for feedback: clear_explanation, good_examples, helped_understand, easy_code, unclear, too_advanced, already_knew, code_broken';
