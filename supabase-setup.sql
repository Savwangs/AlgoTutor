-- ================================================
-- AlgoTutor Supabase Database Schema
-- ================================================
-- Run this in Supabase SQL Editor to set up authentication
-- and subscription management for AlgoTutor
-- ================================================

-- ================================================
-- 1. USERS TABLE
-- ================================================
-- Stores user information and subscription status
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  chatgpt_user_id TEXT UNIQUE, -- ChatGPT's user identifier
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'cancelled', 'expired', 'trialing')),
  usage_count INTEGER DEFAULT 0,
  stripe_customer_id TEXT, -- For future Stripe integration
  stripe_subscription_id TEXT, -- For future Stripe integration
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- 3. PREMIUM CODES TABLE
-- ================================================
-- Stores premium activation codes for linking ChatGPT users to paid accounts
CREATE TABLE IF NOT EXISTS premium_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  stripe_session_id TEXT,
  used BOOLEAN DEFAULT false,
  used_by_chatgpt_user_id TEXT,
  mcp_user_id TEXT,  -- The subnet-based user ID from MCP tool calls (null until linked)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE
);

-- Migration: Add mcp_user_id column if table already exists
-- Run this in Supabase SQL Editor if table already exists:
-- ALTER TABLE premium_codes ADD COLUMN IF NOT EXISTS mcp_user_id TEXT;

-- ================================================
-- 4. SUBSCRIPTION PLANS TABLE
-- ================================================
-- Defines available subscription tiers
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  price_monthly DECIMAL(10,2) NOT NULL,
  usage_limit INTEGER, -- NULL means unlimited
  features JSONB DEFAULT '{}',
  stripe_price_id TEXT, -- For future Stripe integration
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- 4. INSERT DEFAULT PLANS
-- ================================================
INSERT INTO subscription_plans (name, price_monthly, usage_limit, features, stripe_price_id) VALUES
  ('Free', 0, 10, '{
    "modes": ["learn"],
    "max_per_day": 10,
    "priority_support": false
  }', NULL),
  ('Premium', 9.99, NULL, '{
    "modes": ["learn", "build", "debug"],
    "priority_support": true,
    "unlimited_usage": true
  }', 'price_TfeAEdFfqE0EMv')
ON CONFLICT (name) DO NOTHING;

-- ================================================
-- 5. INDEXES FOR PERFORMANCE
-- ================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_chatgpt_id ON users(chatgpt_user_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_mode ON usage_logs(mode);
CREATE INDEX IF NOT EXISTS idx_premium_codes_code ON premium_codes(code);
CREATE INDEX IF NOT EXISTS idx_premium_codes_email ON premium_codes(email);
CREATE INDEX IF NOT EXISTS idx_premium_codes_stripe_session ON premium_codes(stripe_session_id);

-- ================================================
-- 6. FUNCTION TO UPDATE updated_at TIMESTAMP
-- ================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- 7. TRIGGER TO AUTO-UPDATE updated_at
-- ================================================
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- 8. ROW LEVEL SECURITY (RLS) - Optional
-- ================================================
-- Enable RLS for security (users can only see their own data)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (true); -- Service role can read all, adjust as needed

-- Policy: Users can update their own data
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (true); -- Service role can update all

-- Policy: Service role can insert users
CREATE POLICY users_insert ON users
  FOR INSERT
  WITH CHECK (true); -- Service role can insert

-- Policy: Users can read their own usage logs
CREATE POLICY usage_logs_select_own ON usage_logs
  FOR SELECT
  USING (true); -- Service role can read all

-- Policy: Service role can insert usage logs
CREATE POLICY usage_logs_insert ON usage_logs
  FOR INSERT
  WITH CHECK (true);

-- Enable RLS for premium_codes
ALTER TABLE premium_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can read all premium codes
CREATE POLICY premium_codes_select ON premium_codes
  FOR SELECT
  USING (true);

-- Policy: Service role can insert premium codes
CREATE POLICY premium_codes_insert ON premium_codes
  FOR INSERT
  WITH CHECK (true);

-- Policy: Service role can update premium codes
CREATE POLICY premium_codes_update ON premium_codes
  FOR UPDATE
  USING (true);

-- ================================================
-- 9. HELPER VIEWS
-- ================================================

-- View: User subscription details with plan info
CREATE OR REPLACE VIEW user_subscriptions AS
SELECT 
  u.id,
  u.email,
  u.subscription_tier,
  u.subscription_status,
  u.usage_count,
  sp.price_monthly,
  sp.usage_limit,
  sp.features,
  u.created_at,
  u.updated_at
FROM users u
LEFT JOIN subscription_plans sp ON u.subscription_tier = sp.name;

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

