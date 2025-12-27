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
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase authentication initialized');
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
 */
export async function checkUsageLimit(user) {
  console.log('[Auth] Checking usage limit for user:', { email: user.email, id: user.id });
  
  if (!supabase || !isAuthEnabled()) {
    console.log('[Auth] Auth disabled - no limits');
    return { allowed: true, remaining: null };
  }

  const tier = user.subscription_tier || 'free';
  const freeLimit = parseInt(process.env.FREE_TIER_LIMIT || '5', 10);

  // Premium has unlimited usage
  if (tier === 'premium') {
    console.log('[Auth] Premium user - unlimited access');
    return { allowed: true, remaining: null };
  }

  // Count today's usage from usage_logs (daily reset)
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const todayStart = `${today}T00:00:00.000Z`;
  
  try {
    const { count, error } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', todayStart);

    if (error) {
      console.error('[Auth] Error counting daily usage:', error);
      // Fall back to allowing access on error
      return { allowed: true, remaining: null };
    }

    const todayUsage = count || 0;
    console.log(`[Auth] Today's usage count:`, { todayUsage, limit: freeLimit, date: today });

    // Check free tier usage
    if (todayUsage >= freeLimit) {
      console.log(`[Auth] ❌ Free tier limit exceeded:`, { todayUsage, limit: freeLimit });
      return {
        allowed: false,
        remaining: 0,
        message: `Free tier limit reached (${freeLimit} uses per day). Upgrade to Premium for unlimited access.`,
      };
    }

    const remaining = freeLimit - todayUsage;
    console.log(`[Auth] ✓ Usage limit OK:`, { todayUsage, limit: freeLimit, remaining });
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
    const user = await getOrCreateUser(userIdentifier);
    console.log('[Auth] ✓ User obtained:', { 
      id: user.id, 
      email: user.email, 
      tier: user.subscription_tier,
      usage_count: user.usage_count 
    });

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

