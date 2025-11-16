// server.js
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const mentorHtml = readFileSync("public/cs61a-mentor.html", "utf8");

const setContextInputSchema = {
  code: z.string().min(1),
  language: z.enum(["python", "scheme", "sql", "oop", "other"]),
  taskType: z.enum([
    "explain",
    "env_diagram",
    "recursion_trace",
    "tree_help",
    "fill_blanks",
  ]),
  question: z.string().nullable().optional(),
};

let sessions = [];
let nextId = 1;

function makeStructuredContent(currentSession, message) {
  return {
    content: message ? [{ type: "text", text: message }] : [],
    structuredContent: {
      currentSession,
      recentSessions: sessions.slice(-10), // last 10 sessions
    },
  };
}

function createMentorServer() {
  const server = new McpServer({ name: "cs61a-mentor-app", version: "0.1.0" });

  // Resource: the widget itself
  server.registerResource(
    "cs61a-mentor-widget",
    "ui://widget/cs61a-mentor.html",
    {},
    async () => ({
      contents: [
        {
          uri: "ui://widget/cs61a-mentor.html",
          mimeType: "text/html+skybridge",
          text: mentorHtml,
          _meta: {
            "openai/widgetPrefersBorder": true,
          },
        },
      ],
    })
  );

  // Main tool: set CS61A context
  server.registerTool(
    "set_cs61a_context",
    {
      title: "Set CS61A context",
      description:
        "Store CS61A code and metadata (language, task type, question) so ChatGPT can generate explanations, environment diagrams, and traces.",
      inputSchema: setContextInputSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/cs61a-mentor.html",
        "openai/toolInvocation/invoking":
          "Updating CS61A context for this session…",
        "openai/toolInvocation/invoked": "CS61A context updated.",
      },
      annotations: {
        readOnlyHint: true, // does not modify external resources
      },
    },
    async (args, extra) => {
      const code = args.code.trim();
      const language = args.language;
      const taskType = args.taskType;
      const question = (args.question || "").trim() || null;

      const id = `session-${nextId++}`;

      const baseSession = {
        id,
        code,
        language,
        taskType,
        question,
        // The model can later add modelNotes + envDiagram when it re-calls this tool
        modelNotes: {},
      };

      sessions = [...sessions, baseSession];

      // You *could* inspect extra here (e.g. user id) if you want per-user state
      const message =
        "CS61A context stored. Use this session to reason about environment diagrams, frames, recursion traces, and exam-style behavior.";

      return makeStructuredContent(baseSession, message);
    }
  );

  // Optional: a tool to list recent sessions explicitly
  server.registerTool(
    "list_cs61a_sessions",
    {
      title: "List recent CS61A sessions",
      description:
        "Returns the recent CS61A Mentor sessions so ChatGPT can reference or switch between them.",
      inputSchema: {
        // no input required
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      _meta: {
        "openai/outputTemplate": "ui://widget/cs61a-mentor.html",
        "openai/toolInvocation/invoking": "Loading recent CS61A sessions…",
        "openai/toolInvocation/invoked": "Loaded recent CS61A sessions.",
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      const currentSession = sessions[sessions.length - 1] || null;
      return {
        content: [],
        structuredContent: {
          currentSession,
          recentSessions: sessions.slice(-10),
        },
      };
    }
  );

  return server;
}

// Basic HTTP server with /mcp endpoint (same pattern as the quickstart)
const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  // CORS preflight for MCP
  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && url.pathname === "/") {
    res
      .writeHead(200, { "content-type": "text/plain" })
      .end("CS61A Mentor MCP server");
    return;
  }

  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createMentorServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP request:", error);
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
    `CS61A Mentor MCP server listening on http://localhost:${port}${MCP_PATH}`
  );
});
