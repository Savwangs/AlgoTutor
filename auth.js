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
      early_user: true,
      early_user_registered_at: new Date().toISOString(),
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
 * All modes are available to all users.
 */
export function canAccessMode(user, mode) {
  return true;
}

/**
 * Check if user has exceeded usage limits
 * Currently unlimited for all users.
 */
export async function checkUsageLimit(user, widgetId = null) {
  return { allowed: true, remaining: null };
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
 * @param {string} metadata.whatProfessorsTest - What Professors Test content (Learn + Debug)
 * @param {string} metadata.dontForget - Don't Forget warning (Build mode)
 * @param {object} metadata.mistake - Full bug location details (Debug mode)
 * @param {string} metadata.timeComplexity - Time/space complexity analysis
 * @param {string} metadata.difficultyScore - Difficulty rating (easy/medium/hard)
 * @param {string[]} metadata.relatedPatterns - Related DSA patterns
 */
export async function logUsage(user, mode, topic = null, widgetId = null, metadata = {}) {
  if (!supabase) {
    console.log('[Auth] Skipping logUsage - Supabase not configured');
    return; // Skip logging if Supabase not configured
  }

  console.log('[Auth] logUsage called:', { userId: user.id, mode, topic, widgetId, hasMetadata: Object.keys(metadata).length > 0 });

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

    // Add V2 personalization metadata if provided
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
    
    // Add new V2 enhanced logging fields
    if (metadata.whatProfessorsTest) {
      logEntry.what_professors_test = metadata.whatProfessorsTest;
    }
    if (metadata.dontForget) {
      logEntry.dont_forget = metadata.dontForget;
    }
    if (metadata.mistake) {
      logEntry.mistake = metadata.mistake;
    }
    if (metadata.timeComplexity) {
      logEntry.time_complexity = metadata.timeComplexity;
    }
    if (metadata.difficultyScore) {
      logEntry.difficulty_score = metadata.difficultyScore;
    }
    if (metadata.relatedPatterns && metadata.relatedPatterns.length > 0) {
      logEntry.related_patterns = metadata.relatedPatterns;
    }

    // Add follow-up tree logging fields
    if (metadata.parentLogId) {
      logEntry.parent_log_id = metadata.parentLogId;
    }
    if (metadata.actionType) {
      logEntry.action_type = metadata.actionType;
    }

    // Log the full entry being inserted for debugging
    console.log('[Auth] Inserting usage log entry:', JSON.stringify(logEntry, null, 2));

    const { data: logData, error: logError } = await supabase
      .from('usage_logs')
      .insert([logEntry])
      .select('id')
      .single();

    if (logError) {
      console.error('[Auth] ❌ Error logging usage:', logError);
      console.error('[Auth] Error details:', {
        code: logError.code,
        message: logError.message,
        details: logError.details,
        hint: logError.hint
      });
      return null;
    }
    
    console.log('[Auth] ✓ Usage log inserted successfully, id:', logData?.id);

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
      metadataKeys.length > 0 ? `(metadata: ${metadataKeys.join(', ')})` : '',
      logData?.id ? `(logId: ${logData.id})` : '');
    
    // Return the log ID for feedback tracking
    return logData?.id || null;
  } catch (error) {
    console.error('[Auth] Error in logUsage:', error);
    return null;
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

  // Check user record first for existing widget_id
  if (user.widget_id) {
    console.log('[Auth] Returning widget_id from user record:', user.widget_id);
    return { user, widgetId: user.widget_id };
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

    // Also store widget_id on user record for persistence across IP subnet changes
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ widget_id: pendingSession.widget_id })
      .eq('id', user.id);

    if (userUpdateError) {
      console.error('[Auth] Error storing widget_id on user:', userUpdateError);
      // Continue anyway - the session link succeeded
    } else {
      console.log('[Auth] ✓ Stored widget_id on user record:', pendingSession.widget_id);
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

    // Link pending free sessions to get widget_id
    console.log('[Auth] Step 2: Check for pending free sessions...');
    const { widgetId } = await linkPendingFreeSession(user);
    if (widgetId) {
      console.log('[Auth] ✓ Widget ID linked:', widgetId);
    }

    console.log('[Auth] ✓✓✓ AUTHENTICATION SUCCESSFUL ✓✓✓');
    console.log('='.repeat(80) + '\n');
    
    return {
      success: true,
      user,
      widgetId,
      usageRemaining: null,
    };
  } catch (error) {
    console.error('[Auth] ❌❌❌ AUTHENTICATION ERROR ❌❌❌');
    console.error('[Auth] Error details:', error);
    console.error('[Auth] Error stack:', error.stack);
    throw error;
  }
}

