-- Migration: Add claimed_by_widget_id to premium_codes table
-- Purpose: Prevent premium code theft by binding codes to the first device that claims them
-- Run this in Supabase SQL Editor

-- Add claimed_by_widget_id column to track which device first activated the code
ALTER TABLE premium_codes ADD COLUMN IF NOT EXISTS claimed_by_widget_id TEXT;

-- Create index for faster lookups by widget_id
CREATE INDEX IF NOT EXISTS idx_premium_codes_claimed_by_widget ON premium_codes(claimed_by_widget_id) WHERE claimed_by_widget_id IS NOT NULL;
