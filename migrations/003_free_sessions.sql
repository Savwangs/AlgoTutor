-- Migration: Create free_sessions table for tracking widget sessions across IP changes
-- Run this in Supabase SQL Editor

-- Create the free_sessions table
CREATE TABLE IF NOT EXISTS free_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id TEXT UNIQUE NOT NULL,
  browser_ip TEXT,
  mcp_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups by widget_id
CREATE INDEX IF NOT EXISTS idx_free_sessions_widget_id ON free_sessions(widget_id);

-- Create index for finding pending sessions (no mcp_user_id linked yet)
CREATE INDEX IF NOT EXISTS idx_free_sessions_pending ON free_sessions(mcp_user_id) WHERE mcp_user_id IS NULL;

-- Create index for looking up sessions by mcp_user_id
CREATE INDEX IF NOT EXISTS idx_free_sessions_mcp_user ON free_sessions(mcp_user_id) WHERE mcp_user_id IS NOT NULL;

-- Add widget_id column to usage_logs table if it doesn't exist
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS widget_id TEXT;

-- Create index for counting usage by widget_id
CREATE INDEX IF NOT EXISTS idx_usage_logs_widget_id ON usage_logs(widget_id) WHERE widget_id IS NOT NULL;

-- Grant permissions (adjust as needed for your RLS setup)
-- ALTER TABLE free_sessions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all operations for service role" ON free_sessions FOR ALL USING (true);

