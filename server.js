// server.js
import 'dotenv/config';
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { generateLearnContent, generateBuildSolution, generateDebugAnalysis } from './llm.js';

//
// 1. Load widget HTML
//
const algoTutorHtml = readFileSync("public/algo-tutor.html", "utf8");

//
// 2. Zod schemas for tool inputs
//

// Learn Mode Schema
const learnModeInputSchema = z.object({
  // User inputs
  topic: z.string().min(1).describe("DSA topic to learn (e.g., BFS, heaps, linked lists, dynamic programming)"),
  difficulty: z.enum(["basic", "normal", "dumb-it-down"]).describe("Difficulty level"),
  depth: z.enum(["tiny", "normal", "full"]).describe("Explanation depth: tiny (5 steps), normal, or full walkthrough"),
  exampleSize: z.enum(["small", "medium"]).describe("Size of example to use"),
  showEdgeCases: z.boolean().describe("Whether to include edge cases"),
  showDryRun: z.boolean().describe("Whether to include dry-run table"),
  showPaperVersion: z.boolean().describe("Whether to include paper version summary"),
  // Generated content (ChatGPT provides these)
  pattern: z.string().optional().describe("Algorithm pattern identification"),
  stepByStep: z.string().optional().describe("Numbered step-by-step explanation"),
  code: z.string().optional().describe("Working code implementation"),
  dryRunTable: z.array(z.object({
    step: z.string(),
    variable: z.string().optional(),
    value: z.string().optional(),
    action: z.string()
  })).optional().describe("Step-by-step execution table"),
  paperVersion: z.array(z.string()).optional().describe("Interview tips for paper/whiteboard"),
  edgeCases: z.array(z.string()).optional().describe("Edge cases to consider"),
});

// Build Mode Schema
const buildModeInputSchema = z.object({
  // User inputs
  problem: z.string().min(1).describe("The coding problem description"),
  language: z.enum(["python", "java", "cpp"]).describe("Programming language"),
  allowRecursion: z.boolean().describe("Whether recursion is allowed"),
  skeletonOnly: z.boolean().describe("Whether to show skeleton only (no full solution)"),
  includeDryRun: z.boolean().describe("Whether to include dry-run demonstration"),
  minimalCode: z.boolean().describe("Whether to use minimal code style"),
  // Generated content (ChatGPT provides these)
  pattern: z.string().optional().describe("Problem pattern identification"),
  stepByStep: z.string().optional().describe("Step-by-step solution logic"),
  code: z.string().optional().describe("Full working solution code"),
  dryRunTable: z.array(z.object({
    step: z.string(),
    state: z.string().optional(),
    action: z.string()
  })).optional().describe("Dry-run execution table"),
  paperVersion: z.array(z.string()).optional().describe("Interview approach steps"),
  complexity: z.string().optional().describe("Time/space complexity analysis"),
});

// Debug Mode Schema
const debugModeInputSchema = z.object({
  // User inputs
  code: z.string().min(1).describe("The code snippet to debug"),
  problemDescription: z.string().optional().describe("Optional description of what the code should do"),
  language: z.enum(["python", "java", "cpp"]).describe("Programming language"),
  generateTests: z.boolean().describe("Whether to generate test cases"),
  showEdgeWarnings: z.boolean().describe("Whether to show edge case warnings"),
  // Generated content (ChatGPT provides these)
  bugDiagnosis: z.string().optional().describe("Bug analysis and explanation"),
  beforeCode: z.string().optional().describe("Original buggy code"),
  afterCode: z.string().optional().describe("Fixed code"),
  testCases: z.array(z.string()).optional().describe("Test cases to verify the fix"),
  edgeCases: z.array(z.string()).optional().describe("Edge case warnings"),
});

//
// 3. In-memory session storage
//
let sessions = [];
let nextId = 1;

//
// Helper: shape ChatGPT expects for persistent widget state
//
function makeToolOutput(mode, outputs, message) {
  return {
    state: "update",
    content: message ? [{ type: "text", text: message }] : [],
    toolOutput: {
      mode,
      outputs,
      sessionId: `session-${nextId - 1}`,
    },
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
  // Widget resource
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
          _meta: { "openai/widgetPrefersBorder": true },
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
        "openai/instruction": "Use this tool to explain a DSA topic. The server will generate educational content about the requested topic.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const id = `session-${nextId++}`;
      const session = { id, mode: "learn", timestamp: new Date().toISOString(), input: args };
      sessions.push(session);
      
      console.log("[learn_mode] Session created:", id);
      console.log("[learn_mode] Received args:", JSON.stringify(args, null, 2));
      
      // Generate content with Claude
      const outputs = await generateLearnContent(args);
      
      console.log("[learn_mode] Generated outputs:", JSON.stringify(outputs, null, 2));
      
      return makeToolOutput("learn", outputs, "");
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
        "openai/instruction": "Use this tool to build a solution for a coding problem. The server will generate a complete solution with step-by-step logic and complexity analysis.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const id = `session-${nextId++}`;
      const session = { id, mode: "build", timestamp: new Date().toISOString(), input: args };
      sessions.push(session);
      
      console.log("[build_mode] Session created:", id);
      console.log("[build_mode] Received args:", JSON.stringify(args, null, 2));
      
      // Generate solution with Claude
      const outputs = await generateBuildSolution(args);
      
      console.log("[build_mode] Generated outputs:", JSON.stringify(outputs, null, 2));
      
      return makeToolOutput("build", outputs, "");
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
        "openai/instruction": "Use this tool to debug code and find errors. The server will analyze the code, identify bugs, and provide fixed versions.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const id = `session-${nextId++}`;
      const session = { id, mode: "debug", timestamp: new Date().toISOString(), input: args };
      sessions.push(session);
      
      console.log("[debug_mode] Session created:", id);
      console.log("[debug_mode] Received args:", JSON.stringify(args, null, 2));
      
      // Generate debug analysis with Claude
      const outputs = await generateDebugAnalysis(args);
      
      console.log("[debug_mode] Generated outputs:", JSON.stringify(outputs, null, 2));
      
      return makeToolOutput("debug", outputs, "");
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
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Preflight
  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    return res.end();
  }

  // Health check
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("AlgoTutor MCP Server - Learn DSA in small steps!");
  }

  // Handle MCP
  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && MCP_METHODS.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createAlgoTutorServer();
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (e) {
      console.error("MCP handler error:", e);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  res.writeHead(404).end("Not Found");
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
