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
    "fill_blanks",
  ]),
  question: z.string().optional(),
});

const listSessionsSchema = z.object({}); // no inputs

const updateOutputSchema = z.object({
  sessionId: z.string().optional(), // if omitted, use latest session
  summary: z.string().optional(),
  explanation: z.string().optional(),
  recursionTrace: z.string().optional(),
  envDiagram: z.string().optional(),
  treeHelp: z.string().optional(),
  fillBlanksHelp: z.string().optional(),
  error: z.string().optional(),
});

//
// 3. In-memory session storage
//
let sessions = [];
let nextId = 1;

//
// Helper: shape ChatGPT expects for persistent widget state
//
function makeToolOutput(currentSession, message) {
  return {
    state: "update",
    content: message ? [{ type: "text", text: message }] : [],
    toolOutput: {
      currentSession,
      recentSessions: sessions.slice(-10),
    },
  };
}

//
// 4. Create MCP server with tools + widget
//
function createMentorServer() {
  const server = new McpServer({
    name: "cs61a-mentor-app",
    version: "1.2.0",
  });

  //
  // Widget resource
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
          _meta: { "openai/widgetPrefersBorder": true },
        },
      ],
    })
  );

  //
  // 🚀 Tool 1: store CS61A context
  //
  server.registerTool(
    "set_cs61a_context",
    {
      title: "Set CS61A context",
      description:
        "Store CS61A code and metadata so ChatGPT can explain it or generate diagrams. Called when the user clicks 'Send to CS61A Mentor' in the UI.",
      inputSchema: setContextInputSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/cs-61a-mentor.html",
        "openai/toolInvocation/invoking": "Updating CS61A context…",
        "openai/toolInvocation/invoked": "CS61A context updated.",
        "openai/instruction": `
You are the CS61A Mentor.

This tool is used when the user submits code via the CS61A Mentor+ UI.
You MUST:

- Store the code, language, taskType, and optional question in the current session.
- Treat this session as the primary context for all follow-up explanations.
- Do NOT provide long explanations in chat when this tool is called.
- After context is stored, future questions about this code should usually be answered by calling the "update_cs61a_output" tool and filling in its fields.

Keep chat responses short (e.g. “Context stored. Use the Mentor panel to see details.”).
        `,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const id = `session-${nextId++}`;

      const baseSession = {
        id,
        code: args.code.trim(),
        language: args.language,
        taskType: args.taskType,
        question: args.question ? args.question.trim() : null,
        modelNotes: {
          summary: null,
          explanation: null,
          recursionTrace: null,
          treeHelp: null,
          fillBlanksHelp: null,
          error: null,
        },
        envDiagram: null,
      };

      sessions.push(baseSession);

      console.log("[set_cs61a_context] stored session", id);

      return makeToolOutput(
        baseSession,
        "CS61A context stored successfully."
      );
    }
  );

  //
  // 🚀 Tool 2: list stored sessions
  //
  server.registerTool(
    "list_cs61a_sessions",
    {
      title: "List recent CS61A sessions",
      description:
        "Return the stored CS61A sessions so the Mentor UI and model can inspect past context.",
      inputSchema: listSessionsSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/cs-61a-mentor.html",
        "openai/toolInvocation/invoking": "Loading sessions…",
        "openai/toolInvocation/invoked": "Loaded sessions.",
        "openai/instruction": `
Use this tool when you need to know what CS61A sessions already exist,
for example when the user says “use the previous session” or “use the last code I sent”.

Do NOT give long explanations in chat when this tool is called;
instead, use it to decide which session to use, then call "update_cs61a_output"
to show explanations inside the Mentor UI.
        `,
      },
      annotations: { readOnlyHint: true },
    },
    async () => {
      const currentSession = sessions[sessions.length - 1] || null;
      console.log(
        "[list_cs61a_sessions] currentSession",
        currentSession?.id,
        "total sessions",
        sessions.length
      );
      return {
        state: "update",
        content: [],
        toolOutput: {
          currentSession,
          recentSessions: sessions.slice(-10),
        },
      };
    }
  );

  //
  // 🚀 Tool 3: write explanations into the Mentor UI
  //
  server.registerTool(
    "update_cs61a_output",
    {
      title: "Update CS61A Mentor output",
      description: `
Write explanations, recursion traces, and environment diagrams into the CS61A Mentor UI.

The model should call this tool instead of answering in chat whenever the user asks
to explain code, trace recursion, build an environment diagram, or get help with trees/links/fill-in-the-blanks.
      `,
      inputSchema: updateOutputSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/cs-61a-mentor.html",
        "openai/toolInvocation/invoking": "Updating CS61A Mentor output…",
        "openai/toolInvocation/invoked": "CS61A Mentor output updated.",
        "openai/instruction": `
You are writing the FULL tutoring answer into the CS61A Mentor UI.

When the user asks any of the following:
- "Explain this code"
- "Trace this recursion"
- "Draw the environment diagram"
- "Help me with this tree / Link problem"
- "Help me fill in the blanks"

You MUST:
1. Select the appropriate CS61A session (usually the latest one unless sessionId is provided).
2. Fill in as many of these fields as make sense:
   - summary: a 1–3 sentence overview of what the code does.
   - explanation: a step-by-step, beginner-friendly explanation (Markdown ok).
   - recursionTrace: a clear trace of calls/returns for recursive functions.
   - envDiagram: an ASCII-style environment diagram (frames & arrows).
   - treeHelp: explanations focused on Trees/Links structure.
   - fillBlanksHelp: guidance on how to fill exam-style blanks.
   - error: user-facing error, if something is wrong with the request.
3. Prefer to put ALL detailed content into these fields rather than the chat.

Chat responses after calling this tool should be very short, e.g.:
- "Updated the Mentor panel with a full explanation."
- "Recursion trace and environment diagram are now in the Mentor UI."
        `,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      if (sessions.length === 0) {
        console.warn(
          "[update_cs61a_output] no sessions exist yet; nothing to update"
        );
        return makeToolOutput(
          null,
          "No CS61A sessions exist yet. Ask the user to submit code via the Mentor UI."
        );
      }

      const targetId = args.sessionId;
      let session =
        (targetId && sessions.find((s) => s.id === targetId)) ||
        sessions[sessions.length - 1];

      if (!session) {
        console.warn(
          "[update_cs61a_output] could not find session for id",
          targetId
        );
        return makeToolOutput(
          null,
          "Could not find a matching CS61A session to update."
        );
      }

      const notes = session.modelNotes || {};
      session.modelNotes = {
        ...notes,
        summary: args.summary ?? notes.summary,
        explanation: args.explanation ?? notes.explanation,
        recursionTrace: args.recursionTrace ?? notes.recursionTrace,
        treeHelp: args.treeHelp ?? notes.treeHelp,
        fillBlanksHelp: args.fillBlanksHelp ?? notes.fillBlanksHelp,
        error: args.error ?? notes.error,
      };

      if (typeof args.envDiagram === "string") {
        session.envDiagram = { text: args.envDiagram };
      }

      console.log(
        "[update_cs61a_output] updated session",
        session.id,
        "modelNotes keys:",
        Object.keys(session.modelNotes).filter((k) => session.modelNotes[k])
      );

      return makeToolOutput(
        session,
        "CS61A Mentor output updated from model reasoning."
      );
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
    return res.end("CS61A Mentor MCP server");
  }

  // Handle MCP
  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && MCP_METHODS.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createMentorServer();
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
    `CS61A Mentor MCP server running at http://localhost:${port}${MCP_PATH}`
  );
});
