// server.js
import 'dotenv/config';
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { generateLearnContent, generateBuildSolution, generateDebugAnalysis } from './llm.js';
import { authenticateRequest, logUsage, isAuthEnabled } from './auth.js';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY) 
  : null;

// Initialize Supabase for server-side operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

//
// 0. Debug Logging Helpers
//
const DEBUG = true; // Set to false to disable verbose logging

function logSection(title) {
  if (!DEBUG) return;
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

function logInfo(label, value) {
  if (!DEBUG) return;
  if (typeof value === 'object') {
    console.log(`[INFO] ${label}:`, JSON.stringify(value, null, 2));
  } else {
    console.log(`[INFO] ${label}:`, value);
  }
}

function logError(label, error) {
  console.error(`[ERROR] ${label}:`, error);
}

function logSuccess(message) {
  if (!DEBUG) return;
  console.log(`[SUCCESS] ✓ ${message}`);
}

//
// 1. Load widget HTML
//
const algoTutorHtml = readFileSync("public/algo-tutor.html", "utf8");
console.log('[STARTUP] Widget HTML loaded successfully');

//
// 2. Zod schemas for tool inputs
//

// Learn Mode Schema - ONLY INPUT FIELDS
const learnModeInputSchema = z.object({
  topic: z.string().min(1).describe("DSA topic to learn (e.g., BFS, heaps, linked lists, dynamic programming)"),
  difficulty: z.enum(["basic", "normal", "dumb-it-down"]).default("normal").describe("Difficulty level"),
  depth: z.enum(["tiny", "normal", "full"]).default("normal").describe("Explanation depth: tiny (5 steps), normal, or full walkthrough"),
  exampleSize: z.enum(["small", "medium"]).default("small").describe("Size of example to use"),
  showEdgeCases: z.boolean().default(true).describe("Whether to include edge cases"),
  showDryRun: z.boolean().default(true).describe("Whether to include dry-run table"),
  showPaperVersion: z.boolean().default(true).describe("Whether to include paper version summary"),
});

// Build Mode Schema - ONLY INPUT FIELDS
const buildModeInputSchema = z.object({
  problem: z.string().min(1).describe("The coding problem description"),
  language: z.enum(["python", "java", "cpp"]).default("python").describe("Programming language"),
  allowRecursion: z.boolean().default(true).describe("Whether recursion is allowed"),
  skeletonOnly: z.boolean().default(false).describe("Whether to show skeleton only (no full solution)"),
  includeDryRun: z.boolean().default(true).describe("Whether to include dry-run demonstration"),
  minimalCode: z.boolean().default(true).describe("Whether to use minimal code style"),
});

// Debug Mode Schema - ONLY INPUT FIELDS
const debugModeInputSchema = z.object({
  code: z.string().min(1).describe("The code snippet to debug"),
  problemDescription: z.string().optional().describe("Optional description of what the code should do"),
  language: z.enum(["python", "java", "cpp"]).default("python").describe("Programming language"),
  generateTests: z.boolean().default(true).describe("Whether to generate test cases"),
  showEdgeWarnings: z.boolean().default(true).describe("Whether to show edge case warnings"),
});

//
// 3. In-memory session storage
//
let sessions = [];
let nextId = 1;

//
// Helper: Create MCP tool response
// MCP SDK expects content array with text/resource items
//
function makeToolOutput(mode, outputs, message) {
  // Create a structured output for the widget
  // Include _widgetOnly instruction so ChatGPT knows not to repeat
  const widgetData = {
    _widgetOnly: true,
    _instruction: "This content is displayed in the AlgoTutor panel. DO NOT repeat, summarize, or elaborate on any of this data in your response. Simply acknowledge the panel is ready.",
    mode,
    outputs,
    sessionId: `session-${nextId - 1}`,
    message: message || null,
  };
  
  // Return JSON for widget, with instruction embedded
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(widgetData)
      }
    ]
  };
}

//
// 4. Create MCP server with tools + widget
//
function createAlgoTutorServer() {
  const server = new McpServer({
    name: "algo-tutor",
    version: "1.0.0",
  });

  //
  // Widget resource with CSP and domain metadata
  //
  server.registerResource(
    "algo-tutor-widget",
    "ui://widget/algo-tutor.html",
    {},
    async () => ({
      contents: [
        {
          uri: "ui://widget/algo-tutor.html",
          mimeType: "text/html+skybridge",
          text: algoTutorHtml,
          _meta: { 
            "openai/widgetPrefersBorder": true,
            "openai/widgetDomain": "algo-tutor.org",
            "openai/widgetCSP": {
              connect_domains: [
                "https://algo-tutor.org",
                "https://*.supabase.co",
                "https://api.openai.com"
              ],
              resource_domains: [
                "https://cdn.jsdelivr.net",
                "https://fonts.googleapis.com",
                "https://fonts.gstatic.com"
              ]
            },
            "openai/widgetDescription": "Interactive DSA learning tool with Learn, Build, and Debug modes."
          },
        },
      ],
    })
  );

  //
  // 🚀 Tool 1: Learn Mode
  //
  server.registerTool(
    "learn_mode",
    {
      title: "AlgoTutor Learn Mode",
      description:
        "Explains any DSA topic in small, clear steps with minimal code, examples, and dry-runs. Perfect for learning algorithms from scratch.",
      inputSchema: learnModeInputSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Preparing your lesson...",
        "openai/toolInvocation/invoked": "Lesson ready! Check the AlgoTutor panel.",
        "openai/instruction": "The content is displayed in the AlgoTutor widget panel above. Do NOT repeat, summarize, or re-explain the widget content in your response. Simply acknowledge that the lesson is ready in the panel with 1-2 brief sentences.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args, context) => {
      logSection('LEARN MODE TOOL CALLED');
      console.log('[learn_mode] Raw arguments:', JSON.stringify(args, null, 2));
      console.log('[learn_mode] Context received:', JSON.stringify(Object.keys(context || {})));
      console.log('[learn_mode] Has requestInfo?', !!context?.requestInfo);
      console.log('[learn_mode] Has headers?', !!context?.requestInfo?.headers);
      
      // Extract headers from MCP context
      const headers = context?.requestInfo?.headers || {};
      console.log('[learn_mode] Headers extracted:', JSON.stringify(headers, null, 2));
      
      // Create a mock req object for our auth system
      const mockReq = { headers };
      
      logInfo('Tool arguments received', args);
      
      try {
        // Authenticate and authorize user
        logInfo('Starting authentication', 'learn mode');
        const authResult = await authenticateRequest(mockReq, 'learn');
        logInfo('Authentication result', { success: authResult.success });
        
        if (!authResult.success) {
          logError('Authentication failed', authResult.error);
          // Add upgradeUrl for LIMIT_EXCEEDED errors
          const errorWithUpgrade = {
            ...authResult.error,
            upgradeUrl: authResult.error.code === 'LIMIT_EXCEEDED' ? 'https://algo-tutor.org/pricing.html' : undefined
          };
          // Format error response as JSON in content text (same format as success)
          // so the widget can parse and display the upgrade button
          const errorData = {
            _widgetOnly: true,
            _instruction: "Display the error in the AlgoTutor panel with upgrade option if available.",
            mode: "learn",
            error: errorWithUpgrade
          };
          const errorResponse = {
            content: [{
              type: "text",
              text: JSON.stringify(errorData)
            }]
          };
          logInfo('Returning error response', errorResponse);
          return errorResponse;
        }
        
        const user = authResult.user;
        logSuccess(`User authenticated: ${user.email}, tier: ${user.subscription_tier}`);
        
        const id = `session-${nextId++}`;
        const session = { id, mode: "learn", timestamp: new Date().toISOString(), input: args, userId: user.id };
        sessions.push(session);
        
        console.log(`[learn_mode] Session created: ${id} for user: ${user.email}`);
        logInfo("Session ID", id);
        
        // Generate content with Claude
        logSection('CALLING LLM TO GENERATE CONTENT');
        logInfo('Topic to explain', args.topic);
        const outputs = await generateLearnContent(args);
        logSuccess('LLM content generated');
        logInfo('Generated outputs structure', {
          hasPattern: !!outputs.pattern,
          hasStepByStep: !!outputs.stepByStep,
          hasCode: !!outputs.code,
          hasDryRunTable: !!outputs.dryRunTable,
          hasEdgeCases: !!outputs.edgeCases,
          hasPaperVersion: !!outputs.paperVersion
        });
        
        // Log usage
        logInfo('Logging usage to Supabase', { userId: user.id, mode: 'learn', topic: args.topic });
        await logUsage(user, 'learn', args.topic);
        logSuccess('Usage logged successfully');
        
        // Add usage info to response if auth is enabled
        // Subtract 1 because we just used one (check happens before logging)
        let message = "";
        if (isAuthEnabled() && authResult.usageRemaining !== null) {
          const actualRemaining = Math.max(0, authResult.usageRemaining - 1);
          message = `✅ (${actualRemaining} uses remaining today)`;
          logInfo('Usage remaining', actualRemaining);
        }
        
        const finalResponse = makeToolOutput("learn", outputs, message);
        logSection('FINAL RESPONSE TO CHATGPT');
        logInfo('Response structure', {
          state: finalResponse.state,
          hasContent: !!finalResponse.content,
          hasToolOutput: !!finalResponse.toolOutput,
          toolOutputKeys: finalResponse.toolOutput ? Object.keys(finalResponse.toolOutput) : []
        });
        logInfo('Complete response', finalResponse);
        
        return finalResponse;
      } catch (error) {
        logError('LEARN MODE ERROR', error);
        logError('Error stack', error.stack);
        throw error;
      }
    }
  );

  //
  // 🚀 Tool 2: Build Mode
  //
  server.registerTool(
    "build_mode",
    {
      title: "AlgoTutor Build Mode",
      description:
        "Builds a complete solution for a coding problem with step-by-step logic, minimal code, dry-run, and complexity analysis.",
      inputSchema: buildModeInputSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Building your solution...",
        "openai/toolInvocation/invoked": "Solution ready! Check the AlgoTutor panel.",
        "openai/instruction": "The content is displayed in the AlgoTutor widget panel above. Do NOT repeat, summarize, or re-explain the widget content in your response. Simply acknowledge that the solution is ready in the panel with 1-2 brief sentences.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args, context) => {
      logSection('BUILD MODE TOOL CALLED');
      logInfo('Tool arguments received', args);
      
      // Extract headers from MCP context
      const headers = context?.requestInfo?.headers || {};
      const mockReq = { headers };
      
      try {
        // Authenticate and authorize user
        const authResult = await authenticateRequest(mockReq, 'build');
        logInfo('Authentication result', { success: authResult.success });
        
        if (!authResult.success) {
          logError('Authentication/Authorization failed', authResult.error);
          // Add upgradeUrl for LIMIT_EXCEEDED errors
          const errorWithUpgrade = {
            ...authResult.error,
            upgradeUrl: authResult.error.code === 'LIMIT_EXCEEDED' ? 'https://algo-tutor.org/pricing.html' : undefined
          };
          // Format error response as JSON in content text (same format as success)
          const errorData = {
            _widgetOnly: true,
            _instruction: "Display the error in the AlgoTutor panel with upgrade option if available.",
            mode: "build",
            error: errorWithUpgrade
          };
          return {
            content: [{
              type: "text",
              text: JSON.stringify(errorData)
            }]
          };
        }
        
        const user = authResult.user;
        logSuccess(`User authorized for build mode: ${user.email}`);
        
        const id = `session-${nextId++}`;
        const session = { id, mode: "build", timestamp: new Date().toISOString(), input: args, userId: user.id };
        sessions.push(session);
        
        console.log(`[build_mode] Session created: ${id} for user: ${user.email}`);
        
        // Generate solution with Claude
        logSection('CALLING LLM TO GENERATE SOLUTION');
        const outputs = await generateBuildSolution(args);
        logSuccess('Solution generated');
        
        // Log usage
        await logUsage(user, 'build', args.problem);
        logSuccess('Usage logged');
        
        // Add usage info to response if auth is enabled
        // Subtract 1 because we just used one (check happens before logging)
        let message = "";
        if (isAuthEnabled() && authResult.usageRemaining !== null) {
          const actualRemaining = Math.max(0, authResult.usageRemaining - 1);
          message = `✅ (${actualRemaining} uses remaining today)`;
        }
        
        const finalResponse = makeToolOutput("build", outputs, message);
        logInfo('Build mode response', finalResponse);
        
        return finalResponse;
      } catch (error) {
        logError('BUILD MODE ERROR', error);
        throw error;
      }
    }
  );

  //
  // 🚀 Tool 3: Debug Mode
  //
  server.registerTool(
    "debug_mode",
    {
      title: "AlgoTutor Debug Mode",
      description:
        "Diagnoses bugs in code line-by-line, classifies the error type, shows before/after code, and generates test cases.",
      inputSchema: debugModeInputSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Analyzing your code...",
        "openai/toolInvocation/invoked": "Debug complete! Check the AlgoTutor panel.",
        "openai/instruction": "The content is displayed in the AlgoTutor widget panel above. Do NOT repeat, summarize, or re-explain the widget content in your response. Simply acknowledge that the debug analysis is ready in the panel with 1-2 brief sentences.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args, context) => {
      logSection('DEBUG MODE TOOL CALLED');
      logInfo('Tool arguments received', args);
      
      // Extract headers from MCP context
      const headers = context?.requestInfo?.headers || {};
      const mockReq = { headers };
      
      try {
        // Authenticate and authorize user
        const authResult = await authenticateRequest(mockReq, 'debug');
        logInfo('Authentication result', { success: authResult.success });
        
        if (!authResult.success) {
          logError('Authentication/Authorization failed', authResult.error);
          // Add upgradeUrl for LIMIT_EXCEEDED errors
          const errorWithUpgrade = {
            ...authResult.error,
            upgradeUrl: authResult.error.code === 'LIMIT_EXCEEDED' ? 'https://algo-tutor.org/pricing.html' : undefined
          };
          // Format error response as JSON in content text (same format as success)
          const errorData = {
            _widgetOnly: true,
            _instruction: "Display the error in the AlgoTutor panel with upgrade option if available.",
            mode: "debug",
            error: errorWithUpgrade
          };
          return {
            content: [{
              type: "text",
              text: JSON.stringify(errorData)
            }]
          };
        }
        
        const user = authResult.user;
        logSuccess(`User authorized for debug mode: ${user.email}`);
        
        const id = `session-${nextId++}`;
        const session = { id, mode: "debug", timestamp: new Date().toISOString(), input: args, userId: user.id };
        sessions.push(session);
        
        console.log(`[debug_mode] Session created: ${id} for user: ${user.email}`);
        
        // Generate debug analysis with Claude
        logSection('CALLING LLM TO DEBUG CODE');
        const outputs = await generateDebugAnalysis(args);
        logSuccess('Debug analysis generated');
        
        // Log usage
        await logUsage(user, 'debug', 'code_debug');
        logSuccess('Usage logged');
        
        // Add usage info to response if auth is enabled
        // Subtract 1 because we just used one (check happens before logging)
        let message = "";
        if (isAuthEnabled() && authResult.usageRemaining !== null) {
          const actualRemaining = Math.max(0, authResult.usageRemaining - 1);
          message = `✅ (${actualRemaining} uses remaining today)`;
        }
        
        const finalResponse = makeToolOutput("debug", outputs, message);
        logInfo('Debug mode response', finalResponse);
        
        return finalResponse;
      } catch (error) {
        logError('DEBUG MODE ERROR', error);
        throw error;
      }
    }
  );

  //
  // 🚀 Tool 4: List sessions (utility)
  //
  server.registerTool(
    "list_algo_sessions",
    {
      title: "List AlgoTutor sessions",
      description: "Returns recent AlgoTutor sessions for reference.",
      inputSchema: z.object({}),
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Loading sessions...",
        "openai/toolInvocation/invoked": "Sessions loaded.",
        "openai/instruction": "The sessions are displayed in the AlgoTutor widget panel above. Do NOT repeat or list the sessions in your response. Simply acknowledge that the sessions are loaded with 1-2 brief sentences.",
      },
      annotations: { readOnlyHint: true },
    },
    async () => {
      console.log("[list_algo_sessions] Total sessions:", sessions.length);
      
      return {
        state: "update",
        content: [],
        toolOutput: {
          sessions: sessions.slice(-10), // Last 10 sessions
          totalCount: sessions.length,
        },
      };
    }
  );

  return server;
}

//
// 5. HTTP wrapper for MCP
//
const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

const httpServer = createServer(async (req, res) => {
  const requestStart = Date.now();
  console.log('\n' + '█'.repeat(80));
  console.log('🌐 HTTP REQUEST RECEIVED');
  console.log('█'.repeat(80));
  console.log('[HTTP] Method:', req.method);
  console.log('[HTTP] URL:', req.url);
  console.log('[HTTP] Headers:', JSON.stringify(req.headers, null, 2));
  
  if (!req.url) {
    console.log('[HTTP] ❌ Missing URL');
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  console.log('[HTTP] Parsed path:', url.pathname);

  // Preflight
  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    console.log('[HTTP] Handling OPTIONS preflight');
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    console.log('[HTTP] ✓ OPTIONS 204 sent');
    return res.end();
  }

  // Health check (for Render/monitoring)
  if (req.method === "GET" && url.pathname === "/health") {
    console.log('[HTTP] Health check request');
    res.writeHead(200, { "content-type": "text/plain" });
    console.log('[HTTP] ✓ Health check 200 OK');
    return res.end("AlgoTutor MCP Server - Healthy!");
  }

  // Helper: Parse JSON body
  const parseJsonBody = (req) => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  };

  // Helper: Generate premium code
  const generatePremiumCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'ALGO-';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  };

  // API: Create Stripe Checkout Session
  if (req.method === "POST" && url.pathname === "/api/create-checkout") {
    console.log('[API] Create checkout session request');
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    if (!stripe) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Stripe not configured' }));
    }

    try {
      const body = await parseJsonBody(req);
      const { email } = body;

      if (!email) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Email is required' }));
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer_email: email,
        line_items: [{
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        }],
        success_url: `https://algo-tutor.org/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://algo-tutor.org/pricing.html`,
        metadata: {
          email: email
        }
      });

      console.log('[API] ✓ Checkout session created:', session.id);
      res.writeHead(200);
      return res.end(JSON.stringify({ url: session.url, sessionId: session.id }));
    } catch (error) {
      console.error('[API] ❌ Checkout error:', error);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  // API: Stripe Webhook
  if (req.method === "POST" && url.pathname === "/api/stripe-webhook") {
    console.log('[API] Stripe webhook received');

    if (!stripe || !supabase) {
      res.writeHead(500);
      return res.end('Server not configured');
    }

    try {
      // Get raw body for signature verification
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      
      const sig = req.headers['stripe-signature'];
      let event;

      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        console.error('[API] ❌ Webhook signature verification failed:', err.message);
        res.writeHead(400);
        return res.end(`Webhook Error: ${err.message}`);
      }

      console.log('[API] Webhook event type:', event.type);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const email = session.customer_email || session.metadata?.email;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        console.log('[API] Payment completed for:', email);

        // Generate premium code
        const premiumCode = generatePremiumCode();

        // Store premium code in database
        const { error: codeError } = await supabase
          .from('premium_codes')
          .insert({
            code: premiumCode,
            email: email,
            stripe_session_id: session.id
          });

        if (codeError) {
          console.error('[API] Error storing premium code:', codeError);
        } else {
          console.log('[API] ✓ Premium code stored:', premiumCode);
        }

        // Update or create user with premium status
        const { data: existingUser } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();

        if (existingUser) {
          await supabase
            .from('users')
            .update({
              subscription_tier: 'premium',
              subscription_status: 'active',
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId
            })
            .eq('email', email);
          console.log('[API] ✓ Updated existing user to premium:', email);
        } else {
          await supabase
            .from('users')
            .insert({
              email: email,
              subscription_tier: 'premium',
              subscription_status: 'active',
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId
            });
          console.log('[API] ✓ Created new premium user:', email);
        }
      }

      if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find user by stripe_customer_id and downgrade
        await supabase
          .from('users')
          .update({
            subscription_tier: 'free',
            subscription_status: 'cancelled'
          })
          .eq('stripe_customer_id', customerId);
        console.log('[API] ✓ Subscription cancelled for customer:', customerId);
      }

      res.writeHead(200);
      return res.end(JSON.stringify({ received: true }));
    } catch (error) {
      console.error('[API] ❌ Webhook error:', error);
      res.writeHead(500);
      return res.end('Webhook handler error');
    }
  }

  // API: Get premium code by session ID
  if (req.method === "GET" && url.pathname === "/api/get-premium-code") {
    console.log('[API] Get premium code request');
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    if (!supabase) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Database not configured' }));
    }

    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'session_id is required' }));
    }

    try {
      const { data, error } = await supabase
        .from('premium_codes')
        .select('code, email')
        .eq('stripe_session_id', sessionId)
        .single();

      if (error || !data) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Code not found' }));
      }

      console.log('[API] ✓ Premium code retrieved for session:', sessionId);
      res.writeHead(200);
      return res.end(JSON.stringify({ code: data.code, email: data.email }));
    } catch (error) {
      console.error('[API] ❌ Get premium code error:', error);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  // API: Activate premium with code
  if (req.method === "POST" && url.pathname === "/api/activate-premium") {
    console.log('[API] Activate premium request');
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    if (!supabase) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Database not configured' }));
    }

    try {
      const body = await parseJsonBody(req);
      const { code, chatgpt_user_id } = body;

      if (!code || !chatgpt_user_id) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Code and chatgpt_user_id are required' }));
      }

      // Look up the code
      const { data: codeData, error: codeError } = await supabase
        .from('premium_codes')
        .select('*')
        .eq('code', code.toUpperCase())
        .single();

      if (codeError || !codeData) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Invalid code' }));
      }

      if (codeData.used) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Code already used' }));
      }

      // Find or create user with chatgpt_user_id
      let { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('chatgpt_user_id', chatgpt_user_id)
        .single();

      if (!user) {
        // Create new user
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            email: `${chatgpt_user_id}@chatgpt.user`,
            chatgpt_user_id: chatgpt_user_id,
            subscription_tier: 'premium',
            subscription_status: 'active'
          })
          .select()
          .single();

        if (createError) {
          console.error('[API] Error creating user:', createError);
          res.writeHead(500);
          return res.end(JSON.stringify({ error: 'Failed to create user' }));
        }
        user = newUser;
      } else {
        // Update existing user to premium
        await supabase
          .from('users')
          .update({
            subscription_tier: 'premium',
            subscription_status: 'active'
          })
          .eq('chatgpt_user_id', chatgpt_user_id);
      }

      // Mark code as used
      await supabase
        .from('premium_codes')
        .update({
          used: true,
          used_by_chatgpt_user_id: chatgpt_user_id,
          used_at: new Date().toISOString()
        })
        .eq('code', code.toUpperCase());

      console.log('[API] ✓ Premium activated for:', chatgpt_user_id);
      res.writeHead(200);
      return res.end(JSON.stringify({ 
        success: true, 
        message: 'Premium activated! You now have unlimited access.' 
      }));
    } catch (error) {
      console.error('[API] ❌ Activate premium error:', error);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  // CORS preflight for API endpoints
  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    });
    return res.end();
  }

  // Handle MCP
  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && MCP_METHODS.has(req.method)) {
    console.log('[HTTP] ✓ MCP endpoint matched');
    console.log('[HTTP] Setting CORS headers...');
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    console.log('[HTTP] Creating MCP server instance...');
    const server = createAlgoTutorServer();
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      console.log('[HTTP] Response closed');
      transport.close();
      server.close();
    });

    try {
      console.log('[HTTP] Connecting MCP server to transport...');
      await server.connect(transport);
      console.log('[HTTP] ✓ MCP server connected');
      
      console.log('[HTTP] Handling MCP request...');
      await transport.handleRequest(req, res);
      
      const duration = Date.now() - requestStart;
      console.log('[HTTP] ✓ MCP request handled successfully');
      console.log('[HTTP] Request duration:', duration, 'ms');
      console.log('█'.repeat(80) + '\n');
    } catch (e) {
      console.error("[HTTP] ❌ MCP handler error:", e);
      console.error("[HTTP] Error stack:", e.stack);
      console.error("[HTTP] Error type:", e.constructor.name);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
      console.log('█'.repeat(80) + '\n');
    }
    return;
  }

  // Serve widget HTML file
  if (req.method === "GET" && url.pathname === "/algo-tutor.html") {
    console.log('[HTTP] Serving widget HTML file');
    const htmlPath = join(__dirname, 'public', 'algo-tutor.html');
    console.log('[HTTP] Looking for file at:', htmlPath);
    
    try {
      const data = readFileSync(htmlPath);
      res.writeHead(200, { 
        "Content-Type": "text/html",
        "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co https://api.openai.com",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      });
      console.log('[HTTP] ✓ Widget HTML served successfully with CSP headers');
      res.end(data);
    } catch (err) {
      console.log('[HTTP] ❌ Widget file error:', err.message);
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Widget not found: " + err.message);
    }
    return;
  }

  // Serve web pages (landing, login, signup, dashboard, success)
  const webPages = ['/', '/index.html', '/login.html', '/signup.html', '/dashboard.html', '/pricing.html', '/success.html'];
  const pagePath = url.pathname === '/' ? '/index.html' : url.pathname;
  
  if (req.method === "GET" && webPages.includes(url.pathname)) {
    console.log('[HTTP] Serving web page:', pagePath);
    const htmlPath = join(__dirname, 'web', pagePath);
    
    try {
      const data = readFileSync(htmlPath);
      res.writeHead(200, { 
        "Content-Type": "text/html",
        "Cache-Control": "no-cache"
      });
      console.log('[HTTP] ✓ Web page served:', pagePath);
      res.end(data);
    } catch (err) {
      console.log('[HTTP] ❌ Web page not found:', err.message);
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Page not found");
    }
    return;
  }

  console.log('[HTTP] ❌ 404 Not Found - path:', url.pathname);
  res.writeHead(404).end("Not Found");
  console.log('█'.repeat(80) + '\n');
});

httpServer.listen(port, () => {
  console.log(
    `\n🚀 AlgoTutor MCP Server running at http://localhost:${port}${MCP_PATH}\n`
  );
  console.log("📚 Learn Mode: Explain DSA topics in small steps");
  console.log("🔨 Build Mode: Generate solutions with dry-runs");
  console.log("🐛 Debug Mode: Find and fix bugs line-by-line\n");
  
  // Verify API key is loaded
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️  WARNING: OPENAI_API_KEY not found in environment!");
    console.warn("   Please create a .env file with: OPENAI_API_KEY=your_key_here\n");
  } else {
    console.log(`✅ OpenAI API key loaded (${process.env.OPENAI_API_KEY.substring(0, 8)}...)\n`);
  }
});
