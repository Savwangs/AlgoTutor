// auth.js - Authentication and user management with Supabase
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;

// Check if Supabase is configured
export function isAuthEnabled() {
  return !!(supabaseUrl && supabaseKey && process.env.REQUIRE_AUTH === 'true');
}

// Initialize Supabase client (only if credentials are provided)
// Use service role key with admin options to bypass RLS
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });
  console.log('✅ Supabase authentication initialized with service role key');
} else {
  console.log('ℹ️  Supabase not configured - running without authentication');
}

/**
 * Get or create a user based on ChatGPT user identifier
 * ChatGPT passes user info in headers or as part of the request
 */
export async function getOrCreateUser(userIdentifier) {
  console.log('[Auth] getOrCreateUser called with identifier:', userIdentifier);
  
  if (!supabase) {
    console.log('[Auth] Supabase not configured - returning guest user');
    // Auth disabled - return a guest user
    return {
      id: 'guest',
      email: 'guest@algotutor.local',
      subscription_tier: 'free',
      subscription_status: 'active',
      usage_count: 0,
      isGuest: true,
    };
  }

  try {
    console.log('[Auth] Querying Supabase for existing user...');
    // Try to find existing user by ChatGPT user ID
    let { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('chatgpt_user_id', userIdentifier)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      console.error('[Auth] Error fetching user:', fetchError);
      throw fetchError;
    }

    if (existingUser) {
      console.log(`[Auth] ✓ Found existing user:`, {
        email: existingUser.email,
        tier: existingUser.subscription_tier,
        status: existingUser.subscription_status,
        usage_count: existingUser.usage_count
      });
      return existingUser;
    }

    console.log('[Auth] User not found, creating new user...');
    // Create new user if not found
    const newUserData = {
      chatgpt_user_id: userIdentifier,
      email: `${userIdentifier}@chatgpt.user`, // Placeholder email
      subscription_tier: 'free',
      subscription_status: 'active',
      usage_count: 0,
    };
    console.log('[Auth] New user data:', newUserData);

    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([newUserData])
      .select()
      .single();

    if (createError) {
      console.error('[Auth] Error creating user:', createError);
      throw createError;
    }

    console.log(`[Auth] ✓ Created new user:`, {
      email: newUser.email,
      tier: newUser.subscription_tier
    });
    return newUser;
  } catch (error) {
    console.error('[Auth] ❌ Error in getOrCreateUser:', error);
    throw error;
  }
}

/**
 * Check if user has access to a specific mode
 */
export function canAccessMode(user, mode) {
  console.log(`[Auth] Checking if user can access mode:`, { tier: user.subscription_tier, mode });
  
  if (!supabase || !isAuthEnabled()) {
    console.log('[Auth] Auth disabled - allowing access');
    return true; // No restrictions when auth is disabled
  }

  const tier = user.subscription_tier || 'free';

  const accessRules = {
    free: ['learn'], // Free users can only use Learn Mode
    premium: ['learn', 'build', 'debug'], // Premium gets all modes
  };

  const allowed = accessRules[tier]?.includes(mode) ?? false;
  console.log(`[Auth] Access check result:`, { tier, mode, allowed, allowedModes: accessRules[tier] });
  return allowed;
}

/**
 * Check if user has exceeded usage limits
 * Uses a rolling 24-hour window instead of daily reset at midnight
 */
export async function checkUsageLimit(user) {
  console.log('[Auth] Checking usage limit for user:', { email: user.email, id: user.id });
  
  if (!supabase || !isAuthEnabled()) {
    console.log('[Auth] Auth disabled - no limits');
    return { allowed: true, remaining: null };
  }

  const tier = user.subscription_tier || 'free';
  const freeLimit = parseInt(process.env.FREE_TIER_LIMIT || '1', 10);

  // Premium has unlimited usage
  if (tier === 'premium') {
    console.log('[Auth] Premium user - unlimited access');
    return { allowed: true, remaining: null };
  }

  // Rolling 24-hour window: count usage from exactly 24 hours ago
  const now = Date.now();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  
  try {
    // First, count usage in the last 24 hours
    const { count, error: countError } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', twentyFourHoursAgo);

    if (countError) {
      console.error('[Auth] Error counting usage:', countError);
      // Fall back to allowing access on error
      return { allowed: true, remaining: null };
    }

    const recentUsage = count || 0;
    console.log(`[Auth] Usage in last 24h:`, { recentUsage, limit: freeLimit, since: twentyFourHoursAgo });

    // Check free tier usage
    if (recentUsage >= freeLimit) {
      // Get the most recent usage log to calculate when cooldown expires
      const { data: lastUsage, error: lastError } = await supabase
        .from('usage_logs')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let cooldownExpiresAt = null;
      if (!lastError && lastUsage) {
        // Cooldown expires 24 hours after the most recent usage
        const lastUsageTime = new Date(lastUsage.created_at).getTime();
        cooldownExpiresAt = new Date(lastUsageTime + 24 * 60 * 60 * 1000).toISOString();
        console.log(`[Auth] Cooldown expires at:`, cooldownExpiresAt);
      }

      console.log(`[Auth] ❌ Free tier limit exceeded:`, { recentUsage, limit: freeLimit });
      return {
        allowed: false,
        remaining: 0,
        cooldownExpiresAt,
        message: `Free tier limit reached (${freeLimit} use per 24 hours). Upgrade to Premium for unlimited access.`,
      };
    }

    const remaining = freeLimit - recentUsage;
    console.log(`[Auth] ✓ Usage limit OK:`, { recentUsage, limit: freeLimit, remaining });
    return {
      allowed: true,
      remaining,
    };
  } catch (error) {
    console.error('[Auth] Error in checkUsageLimit:', error);
    // Fall back to allowing access on error
    return { allowed: true, remaining: null };
  }
}

/**
 * Log usage for a user
 */
export async function logUsage(user, mode, topic = null) {
  if (!supabase) {
    return; // Skip logging if Supabase not configured
  }

  try {
    // Insert usage log
    const { error: logError } = await supabase.from('usage_logs').insert([
      {
        user_id: user.id,
        mode,
        topic,
      },
    ]);

    if (logError) {
      console.error('[Auth] Error logging usage:', logError);
    }

    // Increment user usage count
    const { error: updateError } = await supabase
      .from('users')
      .update({ usage_count: user.usage_count + 1 })
      .eq('id', user.id);

    if (updateError) {
      console.error('[Auth] Error updating usage count:', updateError);
    }

    console.log(`[Auth] Logged usage for user ${user.email}: ${mode}`);
  } catch (error) {
    console.error('[Auth] Error in logUsage:', error);
  }
}

/**
 * Get user subscription status
 */
export async function getUserSubscription(userId) {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('subscription_tier, subscription_status, usage_count')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[Auth] Error fetching subscription:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[Auth] Error in getUserSubscription:', error);
    return null;
  }
}

/**
 * Update user subscription (for future payment integration)
 */
export async function updateSubscription(userId, tier, status = 'active') {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        subscription_tier: tier,
        subscription_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('[Auth] Error updating subscription:', error);
      return null;
    }

    console.log(`[Auth] Updated subscription for user ${userId}: ${tier} (${status})`);
    return data;
  } catch (error) {
    console.error('[Auth] Error in updateSubscription:', error);
    return null;
  }
}

/**
 * Link a pending premium code to an MCP user
 * This bridges the gap between widget activation (browser IP) and tool usage (OpenAI proxy IP)
 */
export async function linkPendingPremiumCode(user) {
  if (!supabase) {
    return user;
  }

  // If user is already premium, no need to check for pending codes
  if (user.subscription_tier === 'premium') {
    console.log('[Auth] User already premium, skipping code linking');
    return user;
  }

  try {
    console.log('[Auth] Checking for pending premium codes to link...');
    
    // Look for any premium code that is:
    // 1. Marked as used (activated in widget)
    // 2. Not yet linked to an MCP user (mcp_user_id is null)
    const { data: pendingCode, error } = await supabase
      .from('premium_codes')
      .select('*')
      .eq('used', true)
      .is('mcp_user_id', null)
      .order('used_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Auth] Error checking for pending codes:', error);
      return user;
    }

    if (!pendingCode) {
      console.log('[Auth] No pending premium codes found');
      return user;
    }

    console.log('[Auth] Found pending premium code:', pendingCode.code);
    console.log('[Auth] Linking code to MCP user:', user.chatgpt_user_id);

    // Link the code to this MCP user
    const { data: linkedCode, error: linkError } = await supabase
      .from('premium_codes')
      .update({ mcp_user_id: user.chatgpt_user_id })
      .eq('id', pendingCode.id)
      .select();

    console.log('[Auth] Code link result:', { linkedCode, linkError, rowsUpdated: linkedCode?.length });

    if (linkError) {
      console.error('[Auth] Error linking code to user:', linkError);
      return user;
    }

    // Upgrade the user to premium in the database
    console.log('[Auth] Attempting to upgrade user to premium:', { userId: user.id, userEmail: user.email });
    
    const { data: updatedUser, error: upgradeError } = await supabase
      .from('users')
      .update({
        subscription_tier: 'premium',
        subscription_status: 'active'
      })
      .eq('id', user.id)
      .select();

    console.log('[Auth] User upgrade result:', { 
      updatedUser, 
      upgradeError, 
      rowsUpdated: updatedUser?.length,
      newTier: updatedUser?.[0]?.subscription_tier 
    });

    if (upgradeError) {
      console.error('[Auth] Error upgrading user to premium:', upgradeError);
      return user;
    }

    if (!updatedUser || updatedUser.length === 0) {
      console.error('[Auth] ❌ UPDATE returned 0 rows! User was NOT updated in database.');
      console.error('[Auth] This may be due to RLS policy blocking the update.');
      return user;
    }

    // Update the user object in memory with the returned data
    user.subscription_tier = updatedUser[0].subscription_tier;
    user.subscription_status = updatedUser[0].subscription_status;

    console.log('[Auth] ✓ Successfully linked premium code to user:', user.chatgpt_user_id);
    console.log('[Auth] ✓ User upgraded to premium! New tier:', user.subscription_tier);
    
    return user;
  } catch (error) {
    console.error('[Auth] Error in linkPendingPremiumCode:', error);
    return user;
  }
}

/**
 * Extract user identifier from request headers
 * ChatGPT sends user info in various ways depending on the setup
 */
export function extractUserIdentifier(req) {
  console.log('[Auth] Extracting user identifier from request');
  console.log('[Auth] All request headers:', JSON.stringify(req.headers, null, 2));
  
  // Try to get user ID from various possible header locations
  const possibleHeaders = [
    'x-chatgpt-user-id',
    'x-openai-user-id', 
    'x-user-id',
    'user-id',
  ];

  for (const header of possibleHeaders) {
    const value = req.headers[header];
    if (value) {
      console.log(`[Auth] ✓ Found user identifier in header '${header}':`, value);
      return value;
    }
  }

  // Try OpenAI subject from meta (MCP specific)
  const subject = req.headers['openai/subject'] || req.headers['openai-subject'];
  if (subject) {
    console.log(`[Auth] ✓ Found OpenAI subject:`, subject);
    return subject;
  }

  // Fallback: use IP address as identifier
  // Use cf-connecting-ip (Cloudflare's client IP) or first IP from x-forwarded-for
  let ip = req.headers['cf-connecting-ip'] || req.headers['true-client-ip'];
  
  if (!ip) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // Take only the first IP (original client), ignore proxy IPs
      ip = forwardedFor.split(',')[0].trim();
    }
  }
  
  ip = ip || 'unknown';
  
  // OpenAI's MCP requests come from multiple IPs in the same /24 subnet
  // Group by first 3 octets (e.g., 20.168.7.205 -> 20.168.7) to treat as same user
  const ipParts = ip.split('.');
  let userIdentifier;
  if (ipParts.length === 4) {
    // Use /24 subnet (first 3 octets) for OpenAI IPs
    const subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
    userIdentifier = `subnet-${subnet}`;
    console.log(`[Auth] No user header found, using IP subnet as fallback:`, { fullIp: ip, subnet });
  } else {
    userIdentifier = `ip-${ip}`;
    console.log(`[Auth] No user header found, using IP as fallback:`, ip);
  }
  
  return userIdentifier;
}

/**
 * Middleware to authenticate and authorize requests
 */
export async function authenticateRequest(req, mode) {
  console.log('\n' + '='.repeat(80));
  console.log('[Auth] AUTHENTICATING REQUEST');
  console.log('='.repeat(80));
  console.log('[Auth] Mode requested:', mode);
  
  const userIdentifier = extractUserIdentifier(req);
  console.log(`[Auth] User identifier:`, userIdentifier);

  try {
    // Get or create user
    console.log('[Auth] Step 1: Get or create user...');
    let user = await getOrCreateUser(userIdentifier);
    console.log('[Auth] ✓ User obtained:', { 
      id: user.id, 
      email: user.email, 
      tier: user.subscription_tier,
      usage_count: user.usage_count 
    });

    // Step 1.5: Check for pending premium codes and link if found
    console.log('[Auth] Step 1.5: Check for pending premium codes...');
    user = await linkPendingPremiumCode(user);

    // Check if user can access this mode
    console.log('[Auth] Step 2: Check mode access...');
    if (!canAccessMode(user, mode)) {
      console.log(`[Auth] ❌ Access DENIED - ${user.subscription_tier} tier cannot access ${mode} mode`);
      return {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Your ${user.subscription_tier} plan does not include access to ${mode} mode. Upgrade to Premium for full access.`,
        },
      };
    }
    console.log('[Auth] ✓ Mode access granted');

    // Check usage limits
    console.log('[Auth] Step 3: Check usage limits...');
    const usageCheck = await checkUsageLimit(user);
    console.log('[Auth] Usage check result:', usageCheck);
    
    if (!usageCheck.allowed) {
      console.log('[Auth] ❌ Usage limit EXCEEDED');
      return {
        success: false,
        error: {
          code: 'LIMIT_EXCEEDED',
          message: usageCheck.message,
          cooldownExpiresAt: usageCheck.cooldownExpiresAt,
        },
      };
    }
    console.log('[Auth] ✓ Usage limit OK');

    console.log('[Auth] ✓✓✓ AUTHENTICATION SUCCESSFUL ✓✓✓');
    console.log('='.repeat(80) + '\n');
    
    return {
      success: true,
      user,
      usageRemaining: usageCheck.remaining,
    };
  } catch (error) {
    console.error('[Auth] ❌❌❌ AUTHENTICATION ERROR ❌❌❌');
    console.error('[Auth] Error details:', error);
    console.error('[Auth] Error stack:', error.stack);
    throw error;
  }
}

