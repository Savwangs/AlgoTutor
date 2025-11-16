// server.js
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

//
// 1. Load widget HTML
//
const mentorHtml = readFileSync("public/cs-61a-mentor.html", "utf8");

//
// 2. Zod schemas for tool input
//
const setContextInputSchema = z.object({
  code: z.string().min(1),
  language: z.enum(["python", "scheme", "sql", "oop", "other"]),
  taskType: z.enum([
    "explain",
    "env_diagram",
    "recursion_trace",
    "tree_help",
    "fill_blanks"
  ]),
  question: z.string().optional(),
});

const listSessionsSchema = z.object({}); // no inputs

//
// 3. Memory
//
let sessions = [];
let nextId = 1;

function makeStructuredContent(currentSession, message) {
  return {
    state: "update",   // 🔥 REQUIRED for widget persistence
    content: message ? [{ type: "text", text: message }] : [],
    structuredContent: {
      currentSession,
      recentSessions: sessions.slice(-10)
    }
  };
}

//
// 4. Create MCP server
//
function createMentorServer() {
  const server = new McpServer({
    name: "cs61a-mentor-app",
    version: "1.0.0"
  });

  //
  // 🚀 Widget resource
  //
  server.registerResource(
    "cs61a-mentor-widget",
    "ui://widget/cs-61a-mentor.html",
    {},
    async () => ({
      contents: [
        {
          uri: "ui://widget/cs-61a-mentor.html",
          mimeType: "text/html+skybridge",
          text: mentorHtml,
          _meta: {
            "openai/widgetPrefersBorder": true
          }
        }
      ]
    })
  );

  //
  // 🚀 Main tool: store CS61A context
  //
  server.registerTool(
    "set_cs61a_context",
    {
      title: "Set CS61A context",
      description:
        "Store CS61A code and metadata so ChatGPT can explain it or generate diagrams.",
      inputSchema: setContextInputSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/cs-61a-mentor.html",
        "openai/toolInvocation/invoking": "Updating CS61A context…",
        "openai/toolInvocation/invoked": "CS61A context updated."
      },
      annotations: { readOnlyHint: true }
    },
    async (args) => {
      const id = `session-${nextId++}`;

      const baseSession = {
        id,
        code: args.code.trim(),
        language: args.language,
        taskType: args.taskType,
        question: args.question ? args.question.trim() : null,
        modelNotes: {}
      };

      sessions.push(baseSession);

      return makeStructuredContent(
        baseSession,
        "CS61A context stored successfully."
      );
    }
  );

  //
  // 🚀 Tool: list stored sessions
  //
  server.registerTool(
    "list_cs61a_sessions",
    {
      title: "List recent CS61A sessions",
      description: "Return the stored CS61A sessions.",
      inputSchema: listSessionsSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/cs-61a-mentor.html",
        "openai/toolInvocation/invoking": "Loading sessions…",
        "openai/toolInvocation/invoked": "Loaded sessions."
      },
      annotations: { readOnlyHint: true }
    },
    async () => ({
      state: "update",  // 🔥 REQUIRED for persistence
      content: [],
      structuredContent: {
        currentSession: sessions[sessions.length - 1] || null,
        recentSessions: sessions.slice(-10)
      }
    })
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
      "Access-Control-Expose-Headers": "Mcp-Session-Id"
    });
    return res.end();
  }

  // Health check
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("CS61A Mentor MCP server");
  }

  // Handle MCP request
  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && MCP_METHODS.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createMentorServer();
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined
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
    `CS61A Mentor MCP server running at http://localhost:${port}${MCP_PATH}`
  );
});