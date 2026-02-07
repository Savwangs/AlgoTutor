-- ================================================
-- AlgoTutor Supabase Database Schema
-- ================================================
-- Run this in Supabase SQL Editor to set up the
-- AlgoTutor database tables and indexes
-- ================================================

-- ================================================
-- 1. USERS TABLE
-- ================================================
-- Stores user information
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  chatgpt_user_id TEXT UNIQUE, -- ChatGPT's user identifier
  widget_id TEXT,              -- Linked widget ID for cross-session tracking
  usage_count INTEGER DEFAULT 0,
  early_user BOOLEAN DEFAULT false,
  early_user_registered_at TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- 2. USAGE LOGS TABLE
-- ================================================
-- Tracks every API call made by users
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('learn', 'build', 'debug')),
  topic TEXT,
  widget_id TEXT,
  -- V2 personalization metadata
  pattern_detected TEXT,
  mistake_type TEXT,
  data_structures TEXT[],
  trick_shown TEXT,
  request_data JSONB,
  response_summary JSONB,
  what_professors_test TEXT,
  dont_forget TEXT,
  mistake JSONB,
  time_complexity TEXT,
  difficulty_score TEXT,
  related_patterns TEXT[],
  -- Follow-up tree structure
  parent_log_id UUID REFERENCES usage_logs(id),
  action_type TEXT,
  -- User feedback
  feedback_decision TEXT,
  feedback_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- 3. FREE SESSIONS TABLE
-- ================================================
-- Tracks widget sessions across IP changes
CREATE TABLE IF NOT EXISTS free_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id TEXT UNIQUE NOT NULL,
  browser_ip TEXT,
  mcp_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- 4. INDEXES FOR PERFORMANCE
-- ================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_chatgpt_id ON users(chatgpt_user_id);
CREATE INDEX IF NOT EXISTS idx_users_early_user ON users(early_user) WHERE early_user = true;
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_mode ON usage_logs(mode);
CREATE INDEX IF NOT EXISTS idx_usage_logs_widget_id ON usage_logs(widget_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_pattern ON usage_logs(pattern_detected);
CREATE INDEX IF NOT EXISTS idx_usage_logs_mistake_type ON usage_logs(mistake_type);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_mode ON usage_logs(user_id, mode, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_difficulty ON usage_logs(difficulty_score);
CREATE INDEX IF NOT EXISTS idx_usage_logs_feedback ON usage_logs(feedback_decision);
CREATE INDEX IF NOT EXISTS idx_usage_logs_feedback_reason ON usage_logs(feedback_reason);
CREATE INDEX IF NOT EXISTS idx_usage_logs_parent_log_id ON usage_logs(parent_log_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action_type ON usage_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_free_sessions_widget_id ON free_sessions(widget_id);
CREATE INDEX IF NOT EXISTS idx_free_sessions_pending ON free_sessions(mcp_user_id) WHERE mcp_user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_free_sessions_mcp_user ON free_sessions(mcp_user_id) WHERE mcp_user_id IS NOT NULL;

-- ================================================
-- 5. FUNCTION TO UPDATE updated_at TIMESTAMP
-- ================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- 6. TRIGGER TO AUTO-UPDATE updated_at
-- ================================================
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (true); -- Service role can read all

-- Policy: Users can update their own data
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (true); -- Service role can update all

-- Policy: Service role can insert users
CREATE POLICY users_insert ON users
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can read their own usage logs
CREATE POLICY usage_logs_select_own ON usage_logs
  FOR SELECT
  USING (true); -- Service role can read all

-- Policy: Service role can insert usage logs
CREATE POLICY usage_logs_insert ON usage_logs
  FOR INSERT
  WITH CHECK (true);

-- ================================================
-- 8. HELPER VIEWS
-- ================================================

-- View: Daily usage statistics
CREATE OR REPLACE VIEW daily_usage_stats AS
SELECT 
  DATE(created_at) as date,
  mode,
  COUNT(*) as request_count,
  COUNT(DISTINCT user_id) as unique_users
FROM usage_logs
GROUP BY DATE(created_at), mode
ORDER BY date DESC;
