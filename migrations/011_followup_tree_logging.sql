-- Migration: Add follow-up tree logging and action_type columns
-- Enables tree-structured logging where follow-up actions reference their parent log entry
-- Also adds action_type to distinguish initial vs follow-up interactions

-- Add parent_log_id column (self-referencing FK for follow-up tree structure)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS parent_log_id UUID REFERENCES usage_logs(id);
-- NULL means this is a root/initial interaction; non-NULL means it's a follow-up

-- Add action_type column to distinguish the specific action
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS action_type TEXT;
-- Values: 'initial', 'trace_walkthrough', 'explain_simple', 'similar_problem',
--         'real_world_example', 'ai_recommendation'
-- NULL for legacy rows (treated as 'initial')

-- Add index on parent_log_id for efficient tree queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_parent_log_id ON usage_logs(parent_log_id);

-- Add index on action_type for filtering
CREATE INDEX IF NOT EXISTS idx_usage_logs_action_type ON usage_logs(action_type);

-- Add comments for documentation
COMMENT ON COLUMN usage_logs.parent_log_id IS 'References the parent usage_logs row this follow-up branched from. NULL for initial/root interactions.';
COMMENT ON COLUMN usage_logs.action_type IS 'Type of action: initial, trace_walkthrough, explain_simple, similar_problem, real_world_example, ai_recommendation';
