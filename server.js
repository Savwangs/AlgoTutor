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
    {
      _meta: {
        "openai/widgetCsp": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co https://api.openai.com",
      }
    },
    async () => ({
      contents: [
        {
          uri: "ui://widget/algo-tutor.html",
          mimeType: "text/html+skybridge",
          text: algoTutorHtml,
          _meta: { 
            "openai/widgetPrefersBorder": true,
            "openai/widgetCsp": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co https://api.openai.com",
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
          const errorResponse = {
            state: "update",
            content: [{
              type: "text",
              text: `❌ ${authResult.error.message}`
            }],
            toolOutput: {
              error: authResult.error,
              mode: "learn"
            }
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
        let message = "";
        if (isAuthEnabled() && authResult.usageRemaining !== null) {
          message = `✅ (${authResult.usageRemaining} uses remaining today)`;
          logInfo('Usage remaining', authResult.usageRemaining);
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
          return {
            state: "update",
            content: [{
              type: "text",
              text: `❌ ${authResult.error.message}`
            }],
            toolOutput: {
              error: authResult.error,
              mode: "build"
            }
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
        let message = "";
        if (isAuthEnabled() && authResult.usageRemaining !== null) {
          message = `✅ (${authResult.usageRemaining} uses remaining today)`;
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
          return {
            state: "update",
            content: [{
              type: "text",
              text: `❌ ${authResult.error.message}`
            }],
            toolOutput: {
              error: authResult.error,
              mode: "debug"
            }
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
        let message = "";
        if (isAuthEnabled() && authResult.usageRemaining !== null) {
          message = `✅ (${authResult.usageRemaining} uses remaining today)`;
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

  // Health check
  if (req.method === "GET" && url.pathname === "/") {
    console.log('[HTTP] Health check request');
    res.writeHead(200, { "content-type": "text/plain" });
    console.log('[HTTP] ✓ Health check 200 OK');
    return res.end("AlgoTutor MCP Server - Learn DSA in small steps!");
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

  // Serve web pages (landing, login, signup, dashboard)
  const webPages = ['/', '/index.html', '/login.html', '/signup.html', '/dashboard.html', '/pricing.html'];
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
