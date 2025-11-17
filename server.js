// server.js
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

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
        "openai/instruction": `
⚠️ CRITICAL INSTRUCTIONS - READ CAREFULLY ⚠️

You are AlgoTutor Learn Mode. When triggered, you MUST follow this TWO-STEP process:

═══════════════════════════════════════════════════════════════════
STEP 1: GENERATE REAL EDUCATIONAL CONTENT (DO NOT SKIP THIS!)
═══════════════════════════════════════════════════════════════════

Based on the topic, create ACTUAL educational content with REAL details:
- pattern: Identify the algorithm pattern (1-2 sentences with specifics)
- stepByStep: Write numbered steps explaining the algorithm (use \\n for line breaks)
- code: Write ACTUAL working Python code (5-15 lines, minimal style)
- dryRunTable: If showDryRun=true, create execution table with real values
- paperVersion: If showPaperVersion=true, list 3-5 interview tips
- edgeCases: If showEdgeCases=true, list 3 specific edge cases

⚠️ WARNING: DO NOT use placeholder text like "..." or "will be generated" or "example"
⚠️ WARNING: DO NOT return empty strings for pattern, stepByStep, or code
⚠️ WARNING: You MUST generate COMPLETE, REAL content based on the actual topic

═══════════════════════════════════════════════════════════════════
STEP 2: CALL THE TOOL WITH YOUR GENERATED CONTENT
═══════════════════════════════════════════════════════════════════

After generating content in STEP 1, call learn_mode() with ALL fields including:
- All user inputs (topic, difficulty, depth, exampleSize, showEdgeCases, showDryRun, showPaperVersion)
- All generated content (pattern, stepByStep, code, dryRunTable, paperVersion, edgeCases)

═══════════════════════════════════════════════════════════════════
DETAILED EXAMPLE - Binary Search
═══════════════════════════════════════════════════════════════════

learn_mode({
  topic: "binary search",
  difficulty: "normal",
  depth: "normal",
  exampleSize: "small",
  showEdgeCases: true,
  showDryRun: true,
  showPaperVersion: true,
  pattern: "Divide-and-conquer search algorithm that repeatedly divides a sorted array in half to find a target value in O(log n) time.",
  stepByStep: "1. Initialize two pointers: low = 0, high = length - 1\\n2. While low <= high, calculate mid = (low + high) // 2\\n3. If arr[mid] equals target, return mid (found!)\\n4. If arr[mid] < target, search right half (low = mid + 1)\\n5. If arr[mid] > target, search left half (high = mid - 1)\\n6. If loop ends without finding target, return -1",
  code: "def binary_search(arr, target):\\n    low = 0\\n    high = len(arr) - 1\\n    \\n    while low <= high:\\n        mid = (low + high) // 2\\n        if arr[mid] == target:\\n            return mid\\n        elif arr[mid] < target:\\n            low = mid + 1\\n        else:\\n            high = mid - 1\\n    \\n    return -1",
  dryRunTable: [
    {"step": "1", "variable": "low=0, high=6, arr=[1,3,5,7,9,11,13]", "value": "target=7", "action": "Initialize pointers"},
    {"step": "2", "variable": "mid=3", "value": "arr[3]=7", "action": "Found! Return 3"}
  ],
  paperVersion: ["Write low=0, high=n-1", "Calculate mid, compare arr[mid] to target", "Update low or high based on comparison", "Return index when found, -1 if not found"],
  edgeCases: ["Empty array: return -1 immediately", "Single element: check if it matches target", "Target not in array: loop exits, return -1"]
})

═══════════════════════════════════════════════════════════════════
WHAT NOT TO DO (COMMON MISTAKES)
═══════════════════════════════════════════════════════════════════

❌ WRONG:
  pattern: ""
  stepByStep: ""
  code: ""

❌ WRONG:
  pattern: "Will explain the pattern"
  stepByStep: "Steps will be generated"
  code: "# Code will be added"

❌ WRONG:
  code: "def algorithm():\\n    # TODO: implement"

✅ CORRECT:
  pattern: "Actual description of the algorithm pattern"
  stepByStep: "1. Real step\\n2. Another real step\\n3. Final step"
  code: "def actual_code():\\n    return actual_implementation"

═══════════════════════════════════════════════════════════════════
FINAL REMINDER
═══════════════════════════════════════════════════════════════════

1. GENERATE actual content first
2. CALL learn_mode WITH that content
3. Keep your chat response brief: "I've explained [topic] in the AlgoTutor panel."

DO NOT say you'll generate content later. DO IT NOW and pass it to the tool.
        `,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const id = `session-${nextId++}`;
      
      // Store session
      const session = {
        id,
        mode: "learn",
        timestamp: new Date().toISOString(),
        input: args,
      };
      sessions.push(session);

      console.log("[learn_mode] Session created:", id);
      console.log("[learn_mode] Received args:", JSON.stringify(args, null, 2));

      // Return the content ChatGPT generated
      const outputs = {
        pattern: args.pattern || "",
        stepByStep: args.stepByStep || "",
        code: args.code || "",
        dryRunTable: args.dryRunTable || null,
        paperVersion: args.paperVersion || null,
        edgeCases: args.edgeCases || null,
      };

      return makeToolOutput(
        "learn",
        outputs,
        ""
      );
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
        "openai/instruction": `
⚠️ CRITICAL INSTRUCTIONS - READ CAREFULLY ⚠️

You are AlgoTutor Build Mode. When triggered, you MUST follow this TWO-STEP process:

═══════════════════════════════════════════════════════════════════
STEP 1: GENERATE A COMPLETE SOLUTION (DO NOT SKIP THIS!)
═══════════════════════════════════════════════════════════════════

Based on the problem, create ACTUAL solution content with REAL details:
- pattern: Identify the problem pattern (1-2 sentences)
- stepByStep: Write numbered solution steps (use \\n for line breaks), 5-10 steps
- code: Write ACTUAL working code in the specified language (5-20 lines)
  * If minimalCode=true: use simple, explicit code (no fancy syntax)
  * If skeletonOnly=true: function signature + TODO comments only
- dryRunTable: If includeDryRun=true, show execution steps with real values
- paperVersion: Create 4-6 interview approach steps
- complexity: Time and space complexity analysis

⚠️ WARNING: DO NOT use placeholder text like "..." or "will be generated"
⚠️ WARNING: DO NOT return empty strings for pattern, stepByStep, code, or complexity
⚠️ WARNING: You MUST generate COMPLETE, REAL code and solution steps

═══════════════════════════════════════════════════════════════════
STEP 2: CALL THE TOOL WITH YOUR GENERATED CONTENT
═══════════════════════════════════════════════════════════════════

After generating in STEP 1, call build_mode() with ALL fields:
- All user inputs (problem, language, allowRecursion, skeletonOnly, includeDryRun, minimalCode)
- All generated content (pattern, stepByStep, code, dryRunTable, paperVersion, complexity)

⚠️ IMPORTANT: Include ALL user input fields. Missing fields cause validation errors!

═══════════════════════════════════════════════════════════════════
DETAILED EXAMPLE - Duplicate Detection
═══════════════════════════════════════════════════════════════════

build_mode({
  problem: "Given an integer array nums, return true if any value appears more than once.",
  language: "python",
  allowRecursion: false,
  skeletonOnly: false,
  includeDryRun: true,
  minimalCode: true,
  pattern: "Hash set pattern for O(1) lookups. Track seen elements while iterating through the array once.",
  stepByStep: "1. Create an empty set to track seen numbers\\n2. Loop through each number in the array\\n3. Check if current number is already in the set\\n4. If yes, return True (found duplicate)\\n5. If no, add number to set\\n6. If loop completes without finding duplicates, return False",
  code: "def hasDuplicate(nums):\\n    seen = set()\\n    for num in nums:\\n        if num in seen:\\n            return True\\n        seen.add(num)\\n    return False",
  dryRunTable: [
    {"step": "1", "state": "seen={}, nums=[1,2,3,1]", "action": "Start with empty set"},
    {"step": "2", "state": "seen={1}, i=0", "action": "Add 1 to set"},
    {"step": "3", "state": "seen={1,2}, i=1", "action": "Add 2 to set"},
    {"step": "4", "state": "seen={1,2,3}, i=2", "action": "Add 3 to set"},
    {"step": "5", "state": "seen={1,2,3}, i=3, num=1", "action": "1 already in set! Return True"}
  ],
  paperVersion: ["Clarify: input is array, output is boolean", "Identify pattern: use hash set for O(1) membership", "Write approach: iterate once, track seen values", "Code the solution with set operations", "Test with edge cases: empty, single element, all unique"],
  complexity: "Time: O(n) where n is array length (single pass), Space: O(n) for the set in worst case"
})

═══════════════════════════════════════════════════════════════════
WHAT NOT TO DO (COMMON MISTAKES)
═══════════════════════════════════════════════════════════════════

❌ WRONG - Empty strings:
  pattern: ""
  code: ""
  complexity: ""

❌ WRONG - Placeholder text:
  pattern: "Will identify pattern"
  code: "# Solution will go here"
  complexity: "Will calculate"

❌ WRONG - Missing user input fields:
  build_mode({
    problem: "...",
    language: "python",
    // Missing: allowRecursion, skeletonOnly, includeDryRun, minimalCode
    pattern: "...",
    code: "..."
  })

✅ CORRECT - Complete with real content:
  pattern: "Two-pointer technique on sorted array"
  code: "def solution(arr):\\n    left = 0\\n    right = len(arr) - 1\\n    ..."
  complexity: "Time: O(n), Space: O(1)"

═══════════════════════════════════════════════════════════════════
FINAL REMINDER
═══════════════════════════════════════════════════════════════════

1. GENERATE actual solution first
2. CALL build_mode WITH complete solution AND all user inputs
3. Keep your chat response brief: "I've built the solution in the AlgoTutor panel."

DO NOT say you'll generate code later. DO IT NOW and pass it to the tool.
        `,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const id = `session-${nextId++}`;
      
      const session = {
        id,
        mode: "build",
        timestamp: new Date().toISOString(),
        input: args,
      };
      sessions.push(session);

      console.log("[build_mode] Session created:", id);
      console.log("[build_mode] Received args:", JSON.stringify(args, null, 2));

      // Return the content ChatGPT generated
      const outputs = {
        pattern: args.pattern || "",
        stepByStep: args.stepByStep || "",
        code: args.code || "",
        dryRunTable: args.dryRunTable || null,
        paperVersion: args.paperVersion || [],
        complexity: args.complexity || "",
      };

      return makeToolOutput(
        "build",
        outputs,
        ""
      );
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
        "openai/instruction": `
⚠️ CRITICAL INSTRUCTIONS - READ CAREFULLY ⚠️

You are AlgoTutor Debug Mode. When triggered, you MUST follow this TWO-STEP process:

═══════════════════════════════════════════════════════════════════
STEP 1: ANALYZE CODE AND IDENTIFY THE BUG (DO NOT SKIP THIS!)
═══════════════════════════════════════════════════════════════════

Carefully analyze the provided code and create ACTUAL debugging analysis:
- bugDiagnosis: Detailed bug analysis with problem type, location, and explanation
- beforeCode: Original code with "# BUG HERE" or "// BUG HERE" comment on problematic line
- afterCode: Fixed code with "# FIXED" or "// FIXED" comment on corrected line
- testCases: If generateTests=true, create 3 test cases showing the fix works
- edgeCases: If showEdgeWarnings=true, list 3 edge case warnings

⚠️ WARNING: DO NOT use placeholder text or generic messages
⚠️ WARNING: DO NOT return empty strings for bugDiagnosis, beforeCode, or afterCode
⚠️ WARNING: You MUST provide REAL bug analysis and WORKING fixed code

═══════════════════════════════════════════════════════════════════
STEP 2: CALL THE TOOL WITH YOUR ANALYSIS
═══════════════════════════════════════════════════════════════════

After analyzing in STEP 1, call debug_mode() with ALL fields:
- All user inputs (code, problemDescription, language, generateTests, showEdgeWarnings)
- All generated analysis (bugDiagnosis, beforeCode, afterCode, testCases, edgeCases)

═══════════════════════════════════════════════════════════════════
DETAILED EXAMPLE - Logic Error in Duplicate Check
═══════════════════════════════════════════════════════════════════

debug_mode({
  code: "def hasDuplicate(nums):\\n    for i in range(len(nums)):\\n        if nums[i] == nums[i]:\\n            return True\\n    return False",
  problemDescription: "Check if array has duplicates",
  language: "python",
  generateTests: true,
  showEdgeWarnings: true,
  bugDiagnosis: "Problem: Logic Error\\n\\nLocation: Line 3 (if nums[i] == nums[i])\\n\\nExplanation:\\n1. The condition compares nums[i] with itself, which is always True\\n2. This causes the function to return True on the first iteration for any non-empty array\\n3. The code never actually checks if the current element matches any OTHER element\\n4. Correct approach: compare nums[i] with nums[j] where j > i",
  beforeCode: "def hasDuplicate(nums):\\n    for i in range(len(nums)):\\n        if nums[i] == nums[i]:  # BUG HERE - comparing element with itself!\\n            return True\\n    return False",
  afterCode: "def hasDuplicate(nums):\\n    seen = set()\\n    for num in nums:\\n        if num in seen:  # FIXED - check if already seen\\n            return True\\n        seen.add(num)\\n    return False",
  testCases: [
    "[1, 2, 3] → False ✓ (no duplicates)",
    "[1, 2, 1] → True ✓ (duplicate found)",
    "[] → False ✓ (empty array)"
  ],
  edgeCases: [
    "Empty array: should return False, code handles correctly",
    "Single element: should return False, code handles correctly",
    "All same values: should return True immediately on second element"
  ]
})

═══════════════════════════════════════════════════════════════════
ANOTHER EXAMPLE - Off-by-One Error
═══════════════════════════════════════════════════════════════════

debug_mode({
  code: "def binary_search(arr, target):\\n    low, high = 0, len(arr)\\n    while low < high:\\n        mid = (low + high) // 2\\n        if arr[mid] == target:\\n            return mid\\n        elif arr[mid] < target:\\n            low = mid + 1\\n        else:\\n            high = mid - 1\\n    return -1",
  problemDescription: "Binary search in sorted array",
  language: "python",
  generateTests: true,
  showEdgeWarnings: false,
  bugDiagnosis: "Problem: Off-by-One Error\\n\\nLocation: Line 2 (high = len(arr))\\n\\nExplanation:\\n1. high is initialized to len(arr) instead of len(arr) - 1\\n2. This causes IndexError when accessing arr[mid] if mid equals len(arr)\\n3. The condition 'low < high' should be 'low <= high' with correct initialization\\n4. Fix: Initialize high to len(arr) - 1 and use low <= high",
  beforeCode: "def binary_search(arr, target):\\n    low, high = 0, len(arr)  # BUG HERE - should be len(arr) - 1\\n    while low < high:  # Also problematic\\n        mid = (low + high) // 2\\n        if arr[mid] == target:\\n            return mid\\n        elif arr[mid] < target:\\n            low = mid + 1\\n        else:\\n            high = mid - 1\\n    return -1",
  afterCode: "def binary_search(arr, target):\\n    low, high = 0, len(arr) - 1  # FIXED - correct upper bound\\n    while low <= high:  # FIXED - inclusive range\\n        mid = (low + high) // 2\\n        if arr[mid] == target:\\n            return mid\\n        elif arr[mid] < target:\\n            low = mid + 1\\n        else:\\n            high = mid - 1\\n    return -1",
  testCases: [
    "[1,3,5,7,9], target=5 → 2 ✓",
    "[1,3,5,7,9], target=1 → 0 ✓ (first element)",
    "[1,3,5,7,9], target=9 → 4 ✓ (last element)"
  ]
})

═══════════════════════════════════════════════════════════════════
WHAT NOT TO DO (COMMON MISTAKES)
═══════════════════════════════════════════════════════════════════

❌ WRONG - Empty or vague:
  bugDiagnosis: ""
  beforeCode: ""
  afterCode: ""

❌ WRONG - Generic/placeholder:
  bugDiagnosis: "There is a bug in the code"
  beforeCode: "# Bug will be marked"
  afterCode: "# Fixed version will be shown"

❌ WRONG - Not marking bug location:
  beforeCode: "def func():\\n    return x + y"  (no comment!)

✅ CORRECT - Specific and detailed:
  bugDiagnosis: "Problem: Logic Error\\nLocation: Line 5\\nExplanation:\\n1. Using = instead of ==\\n..."
  beforeCode: "if x = 5:  # BUG HERE - assignment instead of comparison"
  afterCode: "if x == 5:  # FIXED - comparison operator"

═══════════════════════════════════════════════════════════════════
FINAL REMINDER
═══════════════════════════════════════════════════════════════════

1. ANALYZE the code and identify the ACTUAL bug
2. GENERATE complete before/after code with bug markers
3. CALL debug_mode WITH all analysis
4. Keep your chat response brief: "Found the bug in the AlgoTutor panel."

DO NOT say you'll analyze later. DO IT NOW and pass the analysis to the tool.
        `,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const id = `session-${nextId++}`;
      
      const session = {
        id,
        mode: "debug",
        timestamp: new Date().toISOString(),
        input: args,
      };
      sessions.push(session);

      console.log("[debug_mode] Session created:", id);
      console.log("[debug_mode] Received args:", JSON.stringify(args, null, 2));

      // Return the content ChatGPT generated
      const outputs = {
        bugDiagnosis: args.bugDiagnosis || "",
        beforeCode: args.beforeCode || "",
        afterCode: args.afterCode || "",
        testCases: args.testCases || null,
        edgeCases: args.edgeCases || null,
      };

      return makeToolOutput(
        "debug",
        outputs,
        ""
      );
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
});
