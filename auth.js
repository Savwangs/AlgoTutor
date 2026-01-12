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
 * Checks both user_id and widget_id for accurate tracking across IP changes
 */
export async function checkUsageLimit(user, widgetId = null) {
  console.log('[Auth] Checking usage limit for user:', { email: user.email, id: user.id, widgetId });
  
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
    // Count usage by user_id in the last 24 hours
    const { count: userCount, error: userCountError } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', twentyFourHoursAgo);

    if (userCountError) {
      console.error('[Auth] Error counting user usage:', userCountError);
    }

    let widgetCount = 0;
    // Also count usage by widget_id if available (more reliable across IP changes)
    if (widgetId) {
      const { count, error: widgetCountError } = await supabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('widget_id', widgetId)
        .gte('created_at', twentyFourHoursAgo);

      if (widgetCountError) {
        console.error('[Auth] Error counting widget usage:', widgetCountError);
      } else {
        widgetCount = count || 0;
      }
    }

    // Use the maximum of both counts to ensure accurate tracking
    const recentUsage = Math.max(userCount || 0, widgetCount);
    console.log(`[Auth] Usage in last 24h:`, { 
      userCount: userCount || 0, 
      widgetCount, 
      effectiveCount: recentUsage,
      limit: freeLimit, 
      since: twentyFourHoursAgo 
    });

    // Check free tier usage
    if (recentUsage >= freeLimit) {
      // Get the most recent usage log to calculate when cooldown expires
      // Check both user_id and widget_id for the most recent
      let lastUsageTime = 0;

      const { data: lastUserUsage } = await supabase
        .from('usage_logs')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastUserUsage) {
        lastUsageTime = Math.max(lastUsageTime, new Date(lastUserUsage.created_at).getTime());
      }

      if (widgetId) {
        const { data: lastWidgetUsage } = await supabase
          .from('usage_logs')
          .select('created_at')
          .eq('widget_id', widgetId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastWidgetUsage) {
          lastUsageTime = Math.max(lastUsageTime, new Date(lastWidgetUsage.created_at).getTime());
        }
      }

      let cooldownExpiresAt = null;
      if (lastUsageTime > 0) {
        cooldownExpiresAt = new Date(lastUsageTime + 24 * 60 * 60 * 1000).toISOString();
        console.log(`[Auth] Cooldown expires at:`, cooldownExpiresAt);
      }

      console.log(`[Auth] ❌ Free tier limit exceeded:`, { recentUsage, limit: freeLimit });
      return {
        allowed: false,
        remaining: 0,
        cooldownExpiresAt,
        message: `Free tier limit reached (${freeLimit} use per day)`,
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
 * Log usage for a user with optional metadata for V2 personalization
 * @param {object} user - The user object
 * @param {string} mode - The mode used (learn, build, debug)
 * @param {string} topic - The topic or problem description
 * @param {string} widgetId - The widget ID for cross-session tracking
 * @param {object} metadata - Optional metadata for V2 personalization
 * @param {string} metadata.patternDetected - The DSA pattern detected
 * @param {string} metadata.mistakeType - The type of bug/mistake (debug mode)
 * @param {string[]} metadata.dataStructures - Array of data structures used
 * @param {string} metadata.trickShown - The key insight/trick shown
 * @param {object} metadata.requestData - Original request parameters
 * @param {object} metadata.responseSummary - Summary of what was returned
 */
export async function logUsage(user, mode, topic = null, widgetId = null, metadata = {}) {
  if (!supabase) {
    return; // Skip logging if Supabase not configured
  }

  try {
    // Insert usage log with optional V2 personalization metadata
    const logEntry = {
      user_id: user.id,
      mode,
      topic,
    };
    
    // Add widget_id if available
    if (widgetId) {
      logEntry.widget_id = widgetId;
    }

    // Add V2 personalization metadata if provided (for premium users)
    if (metadata.patternDetected) {
      logEntry.pattern_detected = metadata.patternDetected;
    }
    if (metadata.mistakeType) {
      logEntry.mistake_type = metadata.mistakeType;
    }
    if (metadata.dataStructures && metadata.dataStructures.length > 0) {
      logEntry.data_structures = metadata.dataStructures;
    }
    if (metadata.trickShown) {
      logEntry.trick_shown = metadata.trickShown;
    }
    if (metadata.requestData) {
      logEntry.request_data = metadata.requestData;
    }
    if (metadata.responseSummary) {
      logEntry.response_summary = metadata.responseSummary;
    }

    const { error: logError } = await supabase.from('usage_logs').insert([logEntry]);

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

    const metadataKeys = Object.keys(metadata).filter(k => metadata[k]);
    console.log(`[Auth] Logged usage for user ${user.email}: ${mode}`, 
      widgetId ? `(widget: ${widgetId})` : '',
      metadataKeys.length > 0 ? `(metadata: ${metadataKeys.join(', ')})` : '');
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
 * Link a premium code to an MCP user using deterministic widget_id lookup
 * 
 * NEW APPROACH (fixes race condition):
 * Instead of grabbing ANY pending code, we now use the widget_id to find the specific
 * code that belongs to this user. The flow is:
 * 
 * 1. Widget activates code → claimed_by_widget_id is set on the code
 * 2. Widget registers session → free_sessions links widget_id to mcp_user_id  
 * 3. MCP request comes in → we look up widget_id from free_sessions
 * 4. We find the code by claimed_by_widget_id → deterministic, no race condition
 * 
 * This ensures each user only gets linked to their own code.
 */
export async function linkPendingPremiumCode(user, widgetId = null) {
  if (!supabase) {
    return user;
  }

  // If user is already premium, no need to check for pending codes
  if (user.subscription_tier === 'premium') {
    console.log('[Auth] User already premium, skipping code linking');
    return user;
  }

  try {
    console.log('[Auth] Checking for premium codes to link for user:', user.chatgpt_user_id);
    
    // Step 1: Get the widget_id for this MCP user from free_sessions
    // This was linked when the widget called /api/register-session
    let effectiveWidgetId = widgetId;
    
    if (!effectiveWidgetId) {
      const { data: session, error: sessionError } = await supabase
        .from('free_sessions')
        .select('widget_id')
        .eq('mcp_user_id', user.chatgpt_user_id)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionError) {
        console.error('[Auth] Error looking up widget_id from free_sessions:', sessionError);
        return user;
      }

      if (!session) {
        console.log('[Auth] No linked free_session found for this MCP user, cannot determine widget_id');
        return user;
      }

      effectiveWidgetId = session.widget_id;
    }
    
    console.log('[Auth] Found widget_id for user:', effectiveWidgetId);

    // Step 2: Find premium code claimed by this specific widget_id
    // This is deterministic - each code is bound to exactly one widget
    const { data: code, error: codeError } = await supabase
      .from('premium_codes')
      .select('*')
      .eq('claimed_by_widget_id', effectiveWidgetId)
      .eq('used', true)
      .eq('revoked', false)
      .maybeSingle();

    if (codeError) {
      console.error('[Auth] Error looking up premium code by widget_id:', codeError);
      return user;
    }

    if (!code) {
      console.log('[Auth] No premium code found for widget_id:', effectiveWidgetId);
      return user;
    }

    console.log('[Auth] Found premium code for widget:', code.code);

    // Step 3: Check if already linked to this user (just update premium status)
    // or if not linked yet (link it now)
    if (code.mcp_user_id && code.mcp_user_id !== user.chatgpt_user_id) {
      // Code is linked to a different MCP user - this shouldn't happen but handle it
      console.log('[Auth] Code is linked to different MCP user:', code.mcp_user_id, 'current user:', user.chatgpt_user_id);
      // Still upgrade this user since they have the widget with the code
    }

    // Link the code to this MCP user if not already linked
    if (!code.mcp_user_id) {
      const { error: linkError } = await supabase
        .from('premium_codes')
        .update({ mcp_user_id: user.chatgpt_user_id })
        .eq('id', code.id);

      if (linkError) {
        console.error('[Auth] Error linking code to MCP user:', linkError);
      } else {
        console.log('[Auth] ✓ Linked code to MCP user:', user.chatgpt_user_id);
      }
    }

    // Step 4: Upgrade the user to premium in the database
    console.log('[Auth] Upgrading user to premium:', { userId: user.id, userEmail: user.email });
    
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
 * Link a pending free session to an MCP user
 * This bridges the gap between widget registration (browser IP) and tool usage (OpenAI proxy IP)
 * Returns the linked widget_id so we can track usage by widget_id
 */
export async function linkPendingFreeSession(user) {
  if (!supabase) {
    return { user, widgetId: null };
  }

  // Premium users don't need free tier tracking
  if (user.subscription_tier === 'premium') {
    console.log('[Auth] Premium user, skipping free session linking');
    return { user, widgetId: null };
  }

  try {
    console.log('[Auth] Checking for pending free sessions to link...');
    
    // Look for any free session that is:
    // 1. Not yet linked to an MCP user (mcp_user_id is null)
    // 2. Recently registered (within last 5 minutes to handle timing)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: pendingSession, error } = await supabase
      .from('free_sessions')
      .select('*')
      .is('mcp_user_id', null)
      .gte('last_seen_at', fiveMinutesAgo)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Auth] Error checking for pending sessions:', error);
      return { user, widgetId: null };
    }

    if (!pendingSession) {
      // No pending session, check if user already has a linked session
      const { data: existingSession } = await supabase
        .from('free_sessions')
        .select('widget_id')
        .eq('mcp_user_id', user.chatgpt_user_id)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSession) {
        console.log('[Auth] Found existing linked session:', existingSession.widget_id);
        return { user, widgetId: existingSession.widget_id };
      }

      console.log('[Auth] No pending or linked free sessions found');
      return { user, widgetId: null };
    }

    console.log('[Auth] Found pending free session:', pendingSession.widget_id);
    console.log('[Auth] Linking session to MCP user:', user.chatgpt_user_id);

    // Link the session to this MCP user
    const { error: linkError } = await supabase
      .from('free_sessions')
      .update({ mcp_user_id: user.chatgpt_user_id })
      .eq('widget_id', pendingSession.widget_id);

    if (linkError) {
      console.error('[Auth] Error linking session to user:', linkError);
      return { user, widgetId: null };
    }

    console.log('[Auth] ✓ Successfully linked free session to user:', user.chatgpt_user_id);
    return { user, widgetId: pendingSession.widget_id };
  } catch (error) {
    console.error('[Auth] Error in linkPendingFreeSession:', error);
    return { user, widgetId: null };
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

    // Step 1.5: Check for pending free sessions and link if found
    // This must happen BEFORE premium code linking so we have the widget_id
    console.log('[Auth] Step 1.5: Check for pending free sessions...');
    const { widgetId } = await linkPendingFreeSession(user);
    if (widgetId) {
      console.log('[Auth] ✓ Widget ID linked:', widgetId);
    }

    // Step 1.6: Check for premium codes and link if found
    // Uses widget_id for deterministic lookup (fixes race condition)
    console.log('[Auth] Step 1.6: Check for premium codes...');
    user = await linkPendingPremiumCode(user, widgetId);

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

    // Check usage limits (pass widgetId for accurate tracking across IP changes)
    console.log('[Auth] Step 3: Check usage limits...');
    const usageCheck = await checkUsageLimit(user, widgetId);
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
      widgetId,
      usageRemaining: usageCheck.remaining,
    };
  } catch (error) {
    console.error('[Auth] ❌❌❌ AUTHENTICATION ERROR ❌❌❌');
    console.error('[Auth] Error details:', error);
    console.error('[Auth] Error stack:', error.stack);
    throw error;
  }
}

