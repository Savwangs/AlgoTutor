// server.js
import 'dotenv/config';
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { generateLearnContent, generateBuildSolution, generateDebugAnalysis, generateDebugFillInBlank, generateTraceAndWalkthrough, generateRealWorldExample, generateBuildTraceWalkthrough, generateBuildSimilarProblem, generateDebugTraceWalkthrough, generateDebugSimilarProblem, generateAIRecommendation } from './llm.js';
import { authenticateRequest, logUsage, isAuthEnabled } from './auth.js';
import { createClient } from '@supabase/supabase-js';

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
const DEBUG = process.env.NODE_ENV !== 'production'; // Auto-off in production, on in development

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

// Learn Mode Schema - ONLY INPUT FIELDS (simplified - removed toggle options)
const learnModeInputSchema = z.object({
  topic: z.string().min(1).describe("DSA topic/pattern to learn (e.g., BFS, heaps, two pointers, sliding window, dynamic programming)"),
  difficulty: z.enum(["basic", "normal", "dumb-it-down"]).default("normal").describe("Difficulty level"),
  depth: z.enum(["tiny", "normal", "full"]).default("normal").describe("Explanation depth: tiny (5 steps), normal, or full walkthrough"),
  exampleSize: z.enum(["small", "medium"]).default("small").describe("Size of example to use"),
});

// Learn Mode Trace/Walkthrough Schema - for follow-up requests
const learnTraceWalkthroughSchema = z.object({
  topic: z.string().min(1).describe("The DSA topic/algorithm to generate trace table and walkthrough for"),
  code: z.string().optional().describe("Optional: The code from the initial learn response to trace through"),
  parentLogId: z.string().optional().describe("The logId of the parent interaction this follow-up branches from"),
});

// Learn Mode Real World Example Schema - for follow-up requests
const learnRealWorldExampleSchema = z.object({
  topic: z.string().min(1).describe("The DSA topic/algorithm to generate a practice problem for"),
  parentLogId: z.string().optional().describe("The logId of the parent interaction this follow-up branches from"),
});

// Build Mode Schema - SIMPLIFIED (test cases and constraints are detected from problem description)
const buildModeInputSchema = z.object({
  problem: z.string().min(1).describe("The coding problem description (may include test cases and constraints inline)"),
  language: z.enum(["python", "java", "cpp"]).default("python").describe("Programming language"),
  allowRecursion: z.boolean().default(true).describe("Whether recursion is allowed"),
  minimalCode: z.boolean().default(true).describe("Whether to use minimal code style"),
});

// Build Mode Trace/Walkthrough Schema - for follow-up requests
const buildTraceWalkthroughSchema = z.object({
  problem: z.string().min(1).describe("The original problem description"),
  code: z.string().min(1).describe("The code from the build mode response"),
  testCases: z.string().optional().describe("Optional test cases extracted from problem description"),
  constraints: z.string().optional().describe("Optional constraints extracted from problem description"),
  isEdgeCase: z.boolean().default(false).describe("Whether to use an edge case (true) or normal case (false)"),
  parentLogId: z.string().optional().describe("The logId of the parent interaction this follow-up branches from"),
});

// Build Mode Similar Problem Schema - for follow-up requests
const buildSimilarProblemSchema = z.object({
  code: z.string().min(1).describe("The code from the build mode solution"),
  problem: z.string().optional().describe("The original problem description"),
  language: z.enum(["python", "java", "cpp"]).default("python").describe("Programming language"),
  topic: z.string().optional().describe("The algorithm/data structure topic inferred from the code"),
  weakSpots: z.string().optional().describe("Accumulated info about what the user got wrong in previous fill-in-blank quizzes - used to focus blanks on weak areas"),
  parentLogId: z.string().optional().describe("The logId of the parent interaction this follow-up branches from"),
});

// Debug Mode Schema - simplified (only code and language)
const debugModeInputSchema = z.object({
  code: z.string().min(1).describe("The code snippet to debug"),
  language: z.enum(["python", "java", "cpp"]).default("python").describe("Programming language"),
});

// Debug Mode Trace/Walkthrough Schema - for follow-up requests
const debugTraceWalkthroughSchema = z.object({
  code: z.string().min(1).describe("The code to trace through"),
  problem: z.string().optional().describe("Optional description of what the code does"),
  language: z.enum(["python", "java", "cpp"]).default("python").describe("Programming language"),
  parentLogId: z.string().optional().describe("The logId of the parent interaction this follow-up branches from"),
});

// Debug Mode Similar Problem Schema - for follow-up requests
const debugSimilarProblemSchema = z.object({
  code: z.string().min(1).describe("The original code that was debugged"),
  problem: z.string().optional().describe("Description of what the code does"),
  language: z.enum(["python", "java", "cpp"]).default("python").describe("Programming language"),
  topic: z.string().optional().describe("The algorithm/data structure topic inferred from the code"),
  bugInfo: z.string().optional().describe("Bug diagnosis info from debug mode - used to focus blanks on the issue type the user encountered"),
  parentLogId: z.string().optional().describe("The logId of the parent interaction this follow-up branches from"),
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
function makeToolOutput(mode, outputs, message, logId = null) {
  // Create a structured output for the widget
  // Include _widgetOnly instruction so ChatGPT knows not to repeat
  // Use mode-specific strong instructions to prevent ChatGPT from duplicating content
  
  let instruction;
  if (mode === 'build') {
    instruction = "STOP. The solution is displayed in the AlgoTutor panel above. DO NOT provide code, algorithms, solutions, explanations, or solve the problem yourself. DO NOT show any code blocks or implementation details. Simply say: 'Your solution is ready in the AlgoTutor panel above.' Nothing more.";
  } else if (mode === 'debug') {
    instruction = "STOP. The debug analysis is displayed in the AlgoTutor panel above. DO NOT fix the code, show corrected code, explain the bug, or provide any code snippets. DO NOT show before/after code or debugging steps. Simply say: 'Your debug analysis is ready in the AlgoTutor panel above.' Nothing more.";
  } else {
    // Learn mode - gentler instruction since it's educational content
    instruction = "The lesson content is displayed in the AlgoTutor panel above. DO NOT repeat, summarize, or re-explain the topic. Simply acknowledge that the lesson is ready in the panel with 1-2 brief sentences.";
  }
  
  const widgetData = {
    _widgetOnly: true,
    _instruction: instruction,
    mode,
    outputs,
    message: message || null,
    logId: logId, // For feedback tracking
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
// Helper: Infer data structures and algorithms from topic (for Learn mode)
//
function topicToDataStructures(topic) {
  if (!topic) return [];
  const lowerTopic = topic.toLowerCase();
  const structures = [];
  
  // Data Structures
  if (lowerTopic.includes('bfs') || lowerTopic.includes('breadth') || lowerTopic.includes('level order')) structures.push('queue');
  if (lowerTopic.includes('dfs') || lowerTopic.includes('depth first')) structures.push('stack');
  if (lowerTopic.includes('stack')) structures.push('stack');
  if (lowerTopic.includes('queue')) structures.push('queue');
  if (lowerTopic.includes('binary search') || lowerTopic.includes('array') || lowerTopic.includes('two pointer')) structures.push('array');
  if (lowerTopic.includes('hash') || lowerTopic.includes('two sum') || lowerTopic.includes('dictionary') || lowerTopic.includes('map')) structures.push('hashmap');
  if (lowerTopic.includes('set')) structures.push('set');
  if (lowerTopic.includes('heap') || lowerTopic.includes('priority')) structures.push('heap');
  if (lowerTopic.includes('tree') || lowerTopic.includes('bst') || lowerTopic.includes('binary tree')) structures.push('tree');
  if (lowerTopic.includes('graph') || lowerTopic.includes('adjacency')) structures.push('graph');
  if (lowerTopic.includes('linked list') || lowerTopic.includes('linkedlist')) structures.push('linked_list');
  if (lowerTopic.includes('trie')) structures.push('trie');
  
  // Algorithms
  if (lowerTopic.includes('bubble sort')) structures.push('bubble_sort');
  if (lowerTopic.includes('merge sort')) structures.push('merge_sort');
  if (lowerTopic.includes('quick sort') || lowerTopic.includes('quicksort')) structures.push('quick_sort');
  if (lowerTopic.includes('insertion sort')) structures.push('insertion_sort');
  if (lowerTopic.includes('selection sort')) structures.push('selection_sort');
  if (lowerTopic.includes('heap sort')) structures.push('heap_sort');
  if (lowerTopic.includes('radix sort')) structures.push('radix_sort');
  if (lowerTopic.includes('counting sort')) structures.push('counting_sort');
  if (lowerTopic.includes('bucket sort')) structures.push('bucket_sort');
  if (lowerTopic.includes('recursion') || lowerTopic.includes('recursive')) structures.push('recursion');
  if (lowerTopic.includes('tree recursion')) structures.push('tree_recursion');
  if (lowerTopic.includes('dynamic programming') || lowerTopic.includes(' dp ') || lowerTopic.includes('memoization')) structures.push('dynamic_programming');
  if (lowerTopic.includes('backtrack')) structures.push('backtracking');
  if (lowerTopic.includes('greedy')) structures.push('greedy');
  if (lowerTopic.includes('divide and conquer')) structures.push('divide_and_conquer');
  if (lowerTopic.includes('sliding window')) structures.push('sliding_window');
  if (lowerTopic.includes('two pointer') || lowerTopic.includes('two-pointer')) structures.push('two_pointers');
  if (lowerTopic.includes('binary search')) structures.push('binary_search');
  if (lowerTopic.includes('topological')) structures.push('topological_sort');
  if (lowerTopic.includes('dijkstra')) structures.push('dijkstra');
  if (lowerTopic.includes('bellman')) structures.push('bellman_ford');
  if (lowerTopic.includes('floyd')) structures.push('floyd_warshall');
  if (lowerTopic.includes('kruskal') || lowerTopic.includes('prim')) structures.push('minimum_spanning_tree');
  if (lowerTopic.includes('union find') || lowerTopic.includes('disjoint set')) structures.push('union_find');
  
  return [...new Set(structures)]; // Remove duplicates
}

//
// Helper: Detect data structures from code (for Build and Debug modes)
//
function detectDataStructures(code) {
  if (!code) return [];
  const structures = [];
  const lowerCode = code.toLowerCase();
  
  // Data structures
  if (lowerCode.includes('dict') || lowerCode.includes('hashmap') || lowerCode.includes('map<') || lowerCode.includes('{}') || lowerCode.includes('collections.defaultdict')) structures.push('hashmap');
  if (lowerCode.includes('list') || lowerCode.includes('array') || lowerCode.includes('[]')) structures.push('array');
  if (lowerCode.includes('queue') || lowerCode.includes('deque') || lowerCode.includes('collections.deque')) structures.push('queue');
  if (lowerCode.includes('stack') || (lowerCode.includes('.pop()') && lowerCode.includes('.append('))) structures.push('stack');
  if (lowerCode.includes('heap') || lowerCode.includes('heapq') || lowerCode.includes('priorityqueue') || lowerCode.includes('priority_queue')) structures.push('heap');
  if (lowerCode.includes('set(') || lowerCode.includes('hashset') || lowerCode.includes('set<')) structures.push('set');
  if (lowerCode.includes('treenode') || lowerCode.includes('binarytree') || lowerCode.includes('root.left') || lowerCode.includes('root.right')) structures.push('tree');
  if (lowerCode.includes('graph') || lowerCode.includes('adjacency') || lowerCode.includes('neighbors')) structures.push('graph');
  if (lowerCode.includes('listnode') || lowerCode.includes('linkedlist') || lowerCode.includes('.next')) structures.push('linked_list');
  if (lowerCode.includes('trie') || lowerCode.includes('trienode')) structures.push('trie');
  
  // Algorithms (detected from code patterns)
  if (lowerCode.includes('def ') && (lowerCode.match(/def\s+\w+\([^)]*\)[\s\S]*?\1\(/))) structures.push('recursion'); // Self-referential call
  if (lowerCode.includes('memo') || lowerCode.includes('@cache') || lowerCode.includes('@lru_cache')) structures.push('dynamic_programming');
  if (lowerCode.includes('backtrack')) structures.push('backtracking');
  if ((lowerCode.includes('left') && lowerCode.includes('right') && lowerCode.includes('mid')) || lowerCode.includes('bisect')) structures.push('binary_search');
  if (lowerCode.includes('window') || (lowerCode.includes('start') && lowerCode.includes('end') && lowerCode.includes('while'))) structures.push('sliding_window');
  
  return [...new Set(structures)];
}

//
// Helper: Detect blank placeholders in code (for Fill-in-the-Blank debug mode)
//
function detectBlanks(code) {
  if (!code) return false;
  
  const patterns = [
    // Underscores of any length (2+ consecutive)
    /_{2,}/,
    // Comment-style "YOUR CODE HERE" markers (case-insensitive, minor typos)
    /#\s*your\s*cod[e]?\s*here/i,
    /\/\/\s*your\s*cod[e]?\s*here/i,
    /\/\*\s*your\s*cod[e]?\s*here\s*\*\//i,
    // TODO markers (standalone, not part of a word in functional code)
    /^\s*#\s*todo\b/im,
    /^\s*\/\/\s*todo\b/im,
    /^\s*todo\s*:/im,
    // Explicit blank markers
    /___BLANK(?:_\d+)?___/,
    /\[BLANK\]/i,
    // Standalone BLANK on a line
    /^\s*BLANK\s*$/m,
  ];
  
  let blankCount = 0;
  for (const pattern of patterns) {
    const matches = code.match(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g')));
    if (matches) blankCount += matches.length;
  }
  
  // Only trigger fill-in-the-blank mode if at least 1 clear blank pattern found
  return blankCount >= 1;
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
        "Teaches any DSA topic with pattern recognition focus. Shows 'The Trick' callout, pattern signature keywords, memorizable template, exam-format trace table, and 'What Professors Test' edge case. Perfect for exam prep.",
      inputSchema: learnModeInputSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Preparing your lesson...",
        "openai/toolInvocation/invoked": "Lesson ready! Check the AlgoTutor panel.",
        "openai/instruction": "The lesson content is displayed in the AlgoTutor widget panel above. Do NOT repeat, summarize, or re-explain the widget content in your response. Simply acknowledge that the lesson is ready in the panel with 1-2 brief sentences.",
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
          const errorData = {
            _widgetOnly: true,
            _instruction: "Display the error in the AlgoTutor panel.",
            mode: "learn",
            error: authResult.error
          };
          return { content: [{ type: "text", text: JSON.stringify(errorData) }] };
        }
        
        const user = authResult.user;
        logSuccess(`User authenticated: ${user.email}`);
        
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
        
        // Check for validation errors (invalid/irrelevant input)
        if (outputs.error === 'INVALID_INPUT') {
          logInfo('Invalid input detected', outputs.message);
          return makeToolOutput("learn", {
            invalidInput: true,
            message: outputs.message || 'Please enter a valid DSA topic (e.g., binary search, BFS, linked lists).'
          });
        }
        
        logInfo('Generated outputs structure', {
          hasPattern: !!outputs.pattern,
          hasStepByStep: !!outputs.stepByStep,
          hasCode: !!outputs.code,
          hasDryRunTable: !!outputs.dryRunTable,
          hasEdgeCases: !!outputs.edgeCases,
          hasPaperVersion: !!outputs.paperVersion
        });
        
        // Log usage with V2 personalization metadata
        const learnMetadata = {
          patternDetected: outputs.theTrick ? outputs.theTrick.split('.')[0] : null, // First sentence as pattern
          trickShown: outputs.theTrick || null,
          dataStructures: topicToDataStructures(args.topic), // Infer from topic
          whatProfessorsTest: outputs.whatProfessorsTest || null,
          timeComplexity: outputs.complexity || null,
          difficultyScore: outputs.difficultyScore || null,
          relatedPatterns: outputs.relatedPatterns || null,
          requestData: {
            topic: args.topic,
            difficulty: args.difficulty,
            depth: args.depth,
            exampleSize: args.exampleSize,
            showPatternKeywords: args.showPatternKeywords,
            showDryRun: args.showDryRun,
            showPaperVersion: args.showPaperVersion
          },
          responseSummary: {
            hasPatternSignature: !!(outputs.patternSignature && outputs.patternSignature.length > 0),
            hasMemorableTemplate: !!outputs.memorableTemplate,
            hasDryRunTable: !!(outputs.dryRunTable && outputs.dryRunTable.length > 0),
            hasPaperSummary: !!(outputs.paperSummary || outputs.paperVersion),
            hasWhatProfessorsTest: !!outputs.whatProfessorsTest,
            hasDifficultyScore: !!outputs.difficultyScore,
            hasRelatedPatterns: !!(outputs.relatedPatterns && outputs.relatedPatterns.length > 0)
          }
        };
        
        learnMetadata.actionType = 'initial';
        logInfo('Logging usage to Supabase', { userId: user.id, mode: 'learn', topic: args.topic, widgetId: authResult.widgetId });
        const logId = await logUsage(user, 'learn', args.topic, authResult.widgetId, learnMetadata);
        logSuccess('Usage logged successfully with V2 metadata', { logId });
        
        // Add usage info to response if auth is enabled
        // Subtract 1 because we just used one (check happens before logging)
        let message = "";
        if (isAuthEnabled() && authResult.usageRemaining !== null) {
          const actualRemaining = Math.max(0, authResult.usageRemaining - 1);
          message = `✅ (${actualRemaining} uses remaining today)`;
          logInfo('Usage remaining', actualRemaining);
        }
        
        const finalResponse = makeToolOutput("learn", outputs, message, logId);
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
  // 🚀 Tool 1b: Learn Mode - Trace Table & Walkthrough (follow-up)
  //
  server.registerTool(
    "learn_trace_walkthrough",
    {
      title: "AlgoTutor Trace Table & Walkthrough",
      description:
        "Generates a detailed trace table and example walkthrough for a DSA topic. Use this when the user clicks 'See trace table and example walkthrough' in Learn Mode.",
      inputSchema: learnTraceWalkthroughSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Generating trace table and walkthrough...",
        "openai/toolInvocation/invoked": "Trace table ready! Check the AlgoTutor panel.",
        "openai/instruction": "The trace table and walkthrough are displayed in the AlgoTutor panel above. Do NOT repeat the content. Simply acknowledge that the trace table is ready.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args, context) => {
      logSection('LEARN TRACE WALKTHROUGH TOOL CALLED');
      logInfo('Tool arguments received', args);
      
      const headers = context?.requestInfo?.headers || {};
      const mockReq = { headers };
      
      try {
        // Authenticate (counts as a usage)
        const authResult = await authenticateRequest(mockReq, 'learn');
        
        if (!authResult.success) {
          const errorData = {
            _widgetOnly: true,
            _instruction: "Display the error in the AlgoTutor panel.",
            mode: "learn",
            error: authResult.error
          };
          return { content: [{ type: "text", text: JSON.stringify(errorData) }] };
        }
        
        const user = authResult.user;
        logSuccess(`User authenticated: ${user.email}`);
        
        // Generate trace table and walkthrough
        const outputs = await generateTraceAndWalkthrough(args);
        
        // Check for validation errors
        if (outputs.error === 'INVALID_INPUT') {
          return makeToolOutput("learn", {
            invalidInput: true,
            message: outputs.message || 'Please enter a valid DSA topic.'
          });
        }
        
        // Log usage
        const logId = await logUsage(user, 'learn', args.topic, authResult.widgetId, { actionType: 'trace_walkthrough', parentLogId: args.parentLogId || null });
        
        return makeToolOutput("learn", outputs, null, logId);
      } catch (error) {
        logError('LEARN TRACE WALKTHROUGH ERROR', error);
        throw error;
      }
    }
  );

  //
  // 🚀 Tool 1c: Learn Mode - Real World Example (follow-up)
  //
  server.registerTool(
    "learn_real_world_example",
    {
      title: "AlgoTutor Real World Example",
      description:
        "Generates an interactive fill-in-the-blank coding problem to test understanding of a DSA topic. Use this when the user clicks 'See a real world example' in Learn Mode.",
      inputSchema: learnRealWorldExampleSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Generating practice problem...",
        "openai/toolInvocation/invoked": "Practice problem ready! Check the AlgoTutor panel.",
        "openai/instruction": "The practice problem is displayed in the AlgoTutor panel above. Do NOT repeat the problem or give hints. Simply acknowledge that the problem is ready and encourage the user to try it.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args, context) => {
      logSection('LEARN REAL WORLD EXAMPLE TOOL CALLED');
      logInfo('Tool arguments received', args);
      
      const headers = context?.requestInfo?.headers || {};
      const mockReq = { headers };
      
      try {
        // Authenticate (counts as a usage)
        const authResult = await authenticateRequest(mockReq, 'learn');
        
        if (!authResult.success) {
          const errorData = {
            _widgetOnly: true,
            _instruction: "Display the error in the AlgoTutor panel.",
            mode: "learn",
            error: authResult.error
          };
          return { content: [{ type: "text", text: JSON.stringify(errorData) }] };
        }
        
        const user = authResult.user;
        logSuccess(`User authenticated: ${user.email}`);
        
        // Generate real world example
        const outputs = await generateRealWorldExample(args);
        
        // Check for validation errors
        if (outputs.error === 'INVALID_INPUT') {
          return makeToolOutput("learn", {
            invalidInput: true,
            message: outputs.message || 'Please enter a valid DSA topic.'
          });
        }
        
        // Log usage
        const logId = await logUsage(user, 'learn', args.topic, authResult.widgetId, { actionType: 'real_world_example', parentLogId: args.parentLogId || null });
        
        return makeToolOutput("learn", outputs, null, logId);
      } catch (error) {
        logError('LEARN REAL WORLD EXAMPLE ERROR', error);
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
        "Builds complete solutions for coding problems. Shows 'The Shortcut' callout, pattern detection, working code (supports trees, graphs, recursion when needed), 'Don't Forget' warning box, complexity analysis, and related patterns. Test cases and constraints are automatically detected from the problem description. Perfect for exam prep.",
      inputSchema: buildModeInputSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Building your solution...",
        "openai/toolInvocation/invoked": "Solution ready! Check the AlgoTutor panel.",
        "openai/instruction": "STOP. The complete solution is displayed in the AlgoTutor panel above. DO NOT provide code, algorithms, solutions, explanations, or solve the problem yourself. DO NOT show any code blocks, implementation details, or step-by-step logic. Simply say: 'Your solution is ready in the AlgoTutor panel above.' Nothing more.",
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
          const errorData = {
            _widgetOnly: true,
            _instruction: "Display the error in the AlgoTutor panel.",
            mode: "build",
            error: authResult.error
          };
          return { content: [{ type: "text", text: JSON.stringify(errorData) }] };
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
        
        // Check for validation errors (invalid/irrelevant input)
        if (outputs.error === 'INVALID_INPUT') {
          logInfo('Invalid input detected', outputs.message);
          return makeToolOutput("build", {
            invalidInput: true,
            message: outputs.message || 'Please enter a valid coding problem description.'
          });
        }
        
        // Add isBuildMode flag to outputs for UI detection
        outputs.isBuildMode = true;
        
        // Log usage with V2 personalization metadata
        const buildMetadata = {
          patternDetected: outputs.pattern || null,
          trickShown: outputs.theShortcut || null,
          dataStructures: detectDataStructures(outputs.code), // Use global helper
          dontForget: outputs.dontForget || null,
          timeComplexity: outputs.complexity || null,
          difficultyScore: outputs.difficultyScore || null,
          relatedPatterns: outputs.relatedPatterns || null,
          testCasesDetected: outputs.testCasesDetected || null,
          constraintsDetected: outputs.constraintsDetected || null,
          requestData: {
            problem: args.problem.substring(0, 200), // Truncate long problems
            language: args.language,
            allowRecursion: args.allowRecursion,
            minimalCode: args.minimalCode
          },
          responseSummary: {
            hasPattern: !!outputs.pattern,
            hasCode: !!outputs.code,
            hasDontForget: !!outputs.dontForget,
            hasDifficultyScore: !!outputs.difficultyScore,
            hasRelatedPatterns: !!(outputs.relatedPatterns && outputs.relatedPatterns.length > 0),
            hasTestCasesDetected: !!outputs.testCasesDetected,
            hasConstraintsDetected: !!outputs.constraintsDetected
          }
        };
        
        buildMetadata.actionType = 'initial';
        const logId = await logUsage(user, 'build', args.problem.substring(0, 200), authResult.widgetId, buildMetadata);
        logSuccess('Usage logged with V2 metadata', { logId });
        
        // Add usage info to response if auth is enabled
        // Subtract 1 because we just used one (check happens before logging)
        let message = "";
        if (isAuthEnabled() && authResult.usageRemaining !== null) {
          const actualRemaining = Math.max(0, authResult.usageRemaining - 1);
          message = `✅ (${actualRemaining} uses remaining today)`;
        }
        
        const finalResponse = makeToolOutput("build", outputs, message, logId);
        logInfo('Build mode response', finalResponse);
        
        return finalResponse;
      } catch (error) {
        logError('BUILD MODE ERROR', error);
        throw error;
      }
    }
  );

  //
  // 🚀 Tool 2b: Build Mode - Trace Table & Walkthrough (follow-up)
  //
  server.registerTool(
    "build_trace_walkthrough",
    {
      title: "AlgoTutor Build Mode Trace & Walkthrough",
      description:
        "Generates a dry-run table and example walkthrough for a Build Mode solution. Use this when the user clicks the trace/walkthrough follow-up button. Set isEdgeCase to true for edge case examples, false for normal cases.",
      inputSchema: buildTraceWalkthroughSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Generating trace table and walkthrough...",
        "openai/toolInvocation/invoked": "Trace table ready! Check the AlgoTutor panel.",
        "openai/instruction": "STOP. The trace table and walkthrough are displayed in the AlgoTutor panel above. DO NOT repeat the content or explain it yourself. Simply say: 'The trace table and walkthrough are ready in the AlgoTutor panel above.' Nothing more.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args, context) => {
      logSection('BUILD TRACE WALKTHROUGH TOOL CALLED');
      logInfo('Tool arguments received', args);
      
      const headers = context?.requestInfo?.headers || {};
      const mockReq = { headers };
      
      try {
        const authResult = await authenticateRequest(mockReq, 'build');
        logInfo('Authentication result', { success: authResult.success });
        
        if (!authResult.success) {
          logError('Authentication/Authorization failed', authResult.error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                _widgetOnly: true,
                _instruction: "Display the error in the AlgoTutor panel.",
                mode: "build",
                error: authResult.error
              })
            }]
          };
        }
        
        const user = authResult.user;
        logSuccess(`User authenticated: ${user.email}`);
        
        // Generate trace table and walkthrough
        const outputs = await generateBuildTraceWalkthrough(args);
        
        // Check for validation errors
        if (outputs.error === 'INVALID_INPUT') {
          return makeToolOutput("build", {
            invalidInput: true,
            message: outputs.message || 'Unable to generate trace table.'
          });
        }
        
        // Log usage
        const logId = await logUsage(user, 'build', args.problem?.substring(0, 200) || 'trace', authResult.widgetId, { actionType: 'trace_walkthrough', parentLogId: args.parentLogId || null });
        
        return makeToolOutput("build", outputs, null, logId);
      } catch (error) {
        logError('BUILD TRACE WALKTHROUGH ERROR', error);
        throw error;
      }
    }
  );

  //
  // 🚀 Tool 2c: Build Mode - Similar Problem (follow-up)
  //
  server.registerTool(
    "build_similar_problem",
    {
      title: "AlgoTutor Build Mode Similar Problem",
      description:
        "Generates a fill-in-the-blank practice problem related to the code from Build Mode. Use this when the user clicks the similar problem follow-up button after a build solution. Blanks focus on important algorithmic logic, not trivial syntax.",
      inputSchema: buildSimilarProblemSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Generating similar problem...",
        "openai/toolInvocation/invoked": "Practice problem ready! Check the AlgoTutor panel.",
        "openai/instruction": "STOP. The practice problem is displayed in the AlgoTutor panel above. DO NOT repeat the problem or give hints. Simply say: 'A similar practice problem is ready in the AlgoTutor panel above. Try to fill in the blanks!' Nothing more.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args, context) => {
      logSection('BUILD SIMILAR PROBLEM TOOL CALLED');
      logInfo('Tool arguments received', args);
      
      const headers = context?.requestInfo?.headers || {};
      const mockReq = { headers };
      
      try {
        const authResult = await authenticateRequest(mockReq, 'build');
        logInfo('Authentication result', { success: authResult.success });
        
        if (!authResult.success) {
          logError('Authentication/Authorization failed', authResult.error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                _widgetOnly: true,
                _instruction: "Display the error in the AlgoTutor panel.",
                mode: "build",
                error: authResult.error
              })
            }]
          };
        }
        
        const user = authResult.user;
        logSuccess(`User authenticated: ${user.email}`);
        
        // Generate similar problem
        const outputs = await generateBuildSimilarProblem(args);
        
        // Check for validation errors
        if (outputs.error === 'INVALID_INPUT') {
          return makeToolOutput("build", {
            invalidInput: true,
            message: outputs.message || 'Unable to generate similar problem.'
          });
        }
        
        // Log usage
        const logId = await logUsage(user, 'build', args.problem?.substring(0, 200) || 'similar', authResult.widgetId, { actionType: 'similar_problem', parentLogId: args.parentLogId || null });
        
        return makeToolOutput("build", outputs, null, logId);
      } catch (error) {
        logError('BUILD SIMILAR PROBLEM ERROR', error);
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
        "Diagnoses bugs in code and explains fixes. Shows 'The Trick' callout explaining the bug or confirming correctness, exact bug line (if bugs exist), before/after code comparison, 'If This Appears On Exam' variations, complexity analysis, and related patterns. If code is correct, provides an alternative approach with efficiency comparison.",
      inputSchema: debugModeInputSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Analyzing your code...",
        "openai/toolInvocation/invoked": "Debug complete! Check the AlgoTutor panel.",
        "openai/instruction": "STOP. The debug analysis is displayed in the AlgoTutor panel above. DO NOT fix the code, show corrected code, explain the bug, or provide any code snippets. DO NOT show before/after code, debugging steps, or solutions. Simply say: 'Your debug analysis is ready in the AlgoTutor panel above.' Nothing more.",
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
          const errorData = {
            _widgetOnly: true,
            _instruction: "Display the error in the AlgoTutor panel.",
            mode: "debug",
            error: authResult.error
          };
          return { content: [{ type: "text", text: JSON.stringify(errorData) }] };
        }
        
        const user = authResult.user;
        logSuccess(`User authorized for debug mode: ${user.email}`);
        
        const id = `session-${nextId++}`;
        const session = { id, mode: "debug", timestamp: new Date().toISOString(), input: args, userId: user.id };
        sessions.push(session);
        
        console.log(`[debug_mode] Session created: ${id} for user: ${user.email}`);
        
        // Check for blank placeholders in the code
        const hasBlanks = detectBlanks(args.code);
        logInfo('Blank detection', { hasBlanks });
        
        // Generate debug analysis (route to fill-in-blank if blanks detected)
        logSection('CALLING LLM TO DEBUG CODE');
        const outputs = hasBlanks 
          ? await generateDebugFillInBlank(args)
          : await generateDebugAnalysis(args);
        logSuccess(hasBlanks ? 'Fill-in-blank debug analysis generated' : 'Debug analysis generated');
        
        // Check for validation errors (invalid/irrelevant input)
        if (outputs.error === 'INVALID_INPUT') {
          logInfo('Invalid input detected', outputs.message);
          return makeToolOutput("debug", {
            invalidInput: true,
            message: outputs.message || 'Please enter valid code to debug.'
          });
        }
        
        // Extract mistake type from debug analysis with comprehensive matching
        const extractMistakeType = (outputs) => {
          // Handle multiple bugs - check first one if array
          const bugLine = Array.isArray(outputs.exactBugLine) 
            ? outputs.exactBugLine[0] 
            : outputs.exactBugLine;
            
          if (bugLine?.issue) {
            const issue = bugLine.issue.toLowerCase();
            // Off-by-one errors
            if (issue.includes('off-by-one') || issue.includes('off by one')) return 'off-by-one';
            if (issue.includes('< instead of <=') || issue.includes('<= instead of <')) return 'off-by-one-loop';
            if (issue.includes('len(') && issue.includes('-1')) return 'off-by-one-array';
            // Edge cases
            if (issue.includes('empty array') || issue.includes('empty list') || issue.includes('length 0')) return 'edge-case-empty';
            if (issue.includes('null') || issue.includes('none') || issue.includes('undefined')) return 'edge-case-null';
            if (issue.includes('single element') || issue.includes('one element')) return 'edge-case-single';
            if (issue.includes('edge case') || issue.includes('boundary')) return 'missing-edge-case';
            // Loop errors
            if (issue.includes('infinite loop') || issue.includes('never terminates')) return 'infinite-loop';
            // Index errors
            if (issue.includes('index') && (issue.includes('out of') || issue.includes('bounds') || issue.includes('range'))) return 'index-out-of-bounds';
            // Data structure errors
            if (issue.includes('wrong data structure') || issue.includes('should use')) return 'wrong-data-structure';
            // Logic errors
            if (issue.includes('comparison') || issue.includes('operator') || issue.includes('> instead of') || issue.includes('< instead of')) return 'comparison-operator';
            if (issue.includes('wrong condition') || issue.includes('condition is wrong')) return 'wrong-condition';
            if (issue.includes('logic') || issue.includes('logical')) return 'logic-error';
            // Return/initialization errors
            if (issue.includes('return') && (issue.includes('wrong') || issue.includes('missing') || issue.includes('early'))) return 'wrong-return';
            if (issue.includes('initialize') || issue.includes('initial value') || issue.includes('not initialized')) return 'initialization-error';
            // Recursion errors
            if (issue.includes('base case') || issue.includes('termination condition')) return 'recursion-base-case';
            if (issue.includes('recursive call') || issue.includes('recursion step')) return 'recursion-step';
            // Algorithm errors
            if (issue.includes('wrong algorithm') || issue.includes('inefficient')) return 'wrong-algorithm';
            // Type errors
            if (issue.includes('type error') || issue.includes('type mismatch') || issue.includes('cannot add')) return 'type-error';
            // Scope errors  
            if (issue.includes('scope') || issue.includes('not defined') || issue.includes('undefined variable')) return 'scope-error';
            // Reference errors
            if (issue.includes('reference') || issue.includes('not found')) return 'reference-error';
            // Generic fallback based on keywords
            if (issue.includes('missing')) return 'missing-edge-case';
            if (issue.includes('wrong')) return 'logic-error';
          }
          // Fallback to theTrick if no specific match
          if (outputs.theTrick) {
            const trick = outputs.theTrick.toLowerCase();
            if (trick.includes('off-by-one') || trick.includes('boundary')) return 'off-by-one';
            if (trick.includes('edge case')) return 'missing-edge-case';
            if (trick.includes('infinite')) return 'infinite-loop';
          }
          return 'logic-error'; // Default fallback instead of 'other'
        };
        
        // Log usage with V2 personalization metadata
        const debugMetadata = {
          patternDetected: outputs.whatCodeDoes || null,
          mistakeType: outputs.codeIsCorrect ? 'code-correct' : extractMistakeType(outputs),
          trickShown: outputs.theTrick || null,
          dataStructures: detectDataStructures(args.code), // Detect from user's code
          whatProfessorsTest: outputs.ifOnExam || null, // Maps to If On Exam field
          mistake: outputs.exactBugLine || null, // Full bug location as JSONB
          timeComplexity: outputs.complexity || null,
          difficultyScore: outputs.difficultyScore || null,
          relatedPatterns: outputs.relatedPatterns || null,
          requestData: {
            hasCode: !!args.code,
            codeLength: args.code ? args.code.length : 0,
            language: args.language
          },
          responseSummary: {
            codeIsCorrect: !!outputs.codeIsCorrect,
            hasAlternativeApproach: !!outputs.alternativeApproach,
            hasExactBugLine: !!outputs.exactBugLine,
            multipleBugs: Array.isArray(outputs.exactBugLine) && outputs.exactBugLine.length > 1,
            bugCount: Array.isArray(outputs.exactBugLine) ? outputs.exactBugLine.length : (outputs.exactBugLine ? 1 : 0),
            hasBeforeAfter: !!(outputs.beforeCode && outputs.afterCode),
            hasIfOnExam: !!outputs.ifOnExam,
            hasDifficultyScore: !!outputs.difficultyScore,
            hasRelatedPatterns: !!(outputs.relatedPatterns && outputs.relatedPatterns.length > 0)
          }
        };
        
        debugMetadata.actionType = 'initial';
        const topic = outputs.whatCodeDoes || 'code_debug';
        const logId = await logUsage(user, 'debug', topic.substring(0, 200), authResult.widgetId, debugMetadata);
        logSuccess('Usage logged with V2 metadata', { logId });
        
        // Add usage info to response if auth is enabled
        // Subtract 1 because we just used one (check happens before logging)
        let message = "";
        if (isAuthEnabled() && authResult.usageRemaining !== null) {
          const actualRemaining = Math.max(0, authResult.usageRemaining - 1);
          message = `✅ (${actualRemaining} uses remaining today)`;
        }
        
        const finalResponse = makeToolOutput("debug", outputs, message, logId);
        logInfo('Debug mode response', finalResponse);
        
        return finalResponse;
      } catch (error) {
        logError('DEBUG MODE ERROR', error);
        throw error;
      }
    }
  );

  //
  // 🚀 Tool 3b: Debug Mode - Trace Table & Walkthrough (follow-up)
  //
  server.registerTool(
    "debug_trace_walkthrough",
    {
      title: "AlgoTutor Debug Mode Trace & Walkthrough",
      description:
        "Generates a trace table and example walkthrough for code from Debug Mode. Use this when the user clicks the trace/walkthrough follow-up button after debugging.",
      inputSchema: debugTraceWalkthroughSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Generating trace table and walkthrough...",
        "openai/toolInvocation/invoked": "Trace table ready! Check the AlgoTutor panel.",
        "openai/instruction": "STOP. The trace table and walkthrough are displayed in the AlgoTutor panel above. DO NOT repeat the content or explain it yourself. Simply say: 'The trace table and walkthrough are ready in the AlgoTutor panel above.' Nothing more.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args, context) => {
      logSection('DEBUG TRACE WALKTHROUGH TOOL CALLED');
      logInfo('Tool arguments received', args);
      
      const headers = context?.requestInfo?.headers || {};
      const mockReq = { headers };
      
      try {
        const authResult = await authenticateRequest(mockReq, 'debug');
        logInfo('Authentication result', { success: authResult.success });
        
        if (!authResult.success) {
          logError('Authentication/Authorization failed', authResult.error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                _widgetOnly: true,
                _instruction: "Display the error in the AlgoTutor panel.",
                mode: "debug",
                error: authResult.error
              })
            }]
          };
        }
        
        const user = authResult.user;
        logSuccess(`User authenticated: ${user.email}`);
        
        // Generate trace table and walkthrough
        const outputs = await generateDebugTraceWalkthrough(args);
        
        // Check for validation errors
        if (outputs.error === 'INVALID_INPUT') {
          return makeToolOutput("debug", {
            invalidInput: true,
            message: outputs.message || 'Unable to generate trace table.'
          });
        }
        
        // Log usage
        const logId = await logUsage(user, 'debug', args.problem?.substring(0, 200) || 'trace', authResult.widgetId, { actionType: 'trace_walkthrough', parentLogId: args.parentLogId || null });
        
        return makeToolOutput("debug", outputs, null, logId);
      } catch (error) {
        logError('DEBUG TRACE WALKTHROUGH ERROR', error);
        throw error;
      }
    }
  );

  //
  // 🚀 Tool 3c: Debug Mode - Similar Problem (follow-up)
  //
  server.registerTool(
    "debug_similar_problem",
    {
      title: "AlgoTutor Debug Mode Similar Problem",
      description:
        "Generates a fill-in-the-blank practice problem related to the code from Debug Mode. Use this when the user clicks the similar problem follow-up button after debugging.",
      inputSchema: debugSimilarProblemSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Generating similar problem...",
        "openai/toolInvocation/invoked": "Practice problem ready! Check the AlgoTutor panel.",
        "openai/instruction": "STOP. The practice problem is displayed in the AlgoTutor panel above. DO NOT repeat the problem or give hints. Simply say: 'A similar practice problem is ready in the AlgoTutor panel above. Try to fill in the blanks!' Nothing more.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args, context) => {
      logSection('DEBUG SIMILAR PROBLEM TOOL CALLED');
      logInfo('Tool arguments received', args);
      
      const headers = context?.requestInfo?.headers || {};
      const mockReq = { headers };
      
      try {
        const authResult = await authenticateRequest(mockReq, 'debug');
        logInfo('Authentication result', { success: authResult.success });
        
        if (!authResult.success) {
          logError('Authentication/Authorization failed', authResult.error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                _widgetOnly: true,
                _instruction: "Display the error in the AlgoTutor panel.",
                mode: "debug",
                error: authResult.error
              })
            }]
          };
        }
        
        const user = authResult.user;
        logSuccess(`User authenticated: ${user.email}`);
        
        // Generate similar problem
        const outputs = await generateDebugSimilarProblem(args);
        
        // Check for validation errors
        if (outputs.error === 'INVALID_INPUT') {
          return makeToolOutput("debug", {
            invalidInput: true,
            message: outputs.message || 'Unable to generate similar problem.'
          });
        }
        
        // Log usage
        const logId = await logUsage(user, 'debug', args.problem?.substring(0, 200) || 'similar', authResult.widgetId, { actionType: 'similar_problem', parentLogId: args.parentLogId || null });
        
        return makeToolOutput("debug", outputs, null, logId);
      } catch (error) {
        logError('DEBUG SIMILAR PROBLEM ERROR', error);
        throw error;
      }
    }
  );

  //
  // 🚀 Tool 3d: AI Recommendation (follow-up after fill-in-the-blank)
  //
  const aiRecommendationSchema = z.object({
    performanceData: z.string().min(1).describe("JSON string of per-blank performance stats"),
    problemTitle: z.string().optional().describe("Title of the problem"),
    topic: z.string().optional().describe("The DSA topic"),
    problemDescription: z.string().optional().describe("Description of the problem"),
    codeWithBlanks: z.string().optional().describe("The code with blanks"),
    parentLogId: z.string().optional().describe("The logId of the parent interaction this follow-up branches from"),
  });

  server.registerTool(
    "ai_recommendation",
    {
      title: "AlgoTutor AI Recommendation",
      description:
        "Generates a personalized study recommendation based on the user's fill-in-the-blank quiz performance. Use when the user clicks the AI Recommendation button after completing a quiz.",
      inputSchema: aiRecommendationSchema,
      _meta: {
        "openai/outputTemplate": "ui://widget/algo-tutor.html",
        "openai/toolInvocation/invoking": "Generating personalized recommendation...",
        "openai/toolInvocation/invoked": "Recommendation ready! Check the AlgoTutor panel.",
        "openai/instruction": "STOP. The AI recommendation is displayed in the AlgoTutor panel above. DO NOT repeat the recommendation. Simply say: 'Your personalized study recommendation is ready in the AlgoTutor panel above.' Nothing more.",
      },
      annotations: { readOnlyHint: true },
    },
    async (args, context) => {
      logSection('AI RECOMMENDATION TOOL CALLED');
      logInfo('Tool arguments received', args);
      
      const headers = context?.requestInfo?.headers || {};
      const mockReq = { headers };
      
      try {
        const authResult = await authenticateRequest(mockReq, 'debug');
        logInfo('Authentication result', { success: authResult.success });
        
        if (!authResult.success) {
          logError('Authentication/Authorization failed', authResult.error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                _widgetOnly: true,
                _instruction: "Display the error in the AlgoTutor panel.",
                mode: "debug",
                error: authResult.error
              })
            }]
          };
        }
        
        const user = authResult.user;
        logSuccess(`User authenticated: ${user.email}`);
        
        // Generate AI recommendation
        const outputs = await generateAIRecommendation(args);
        
        // Log usage
        const logId = await logUsage(user, 'debug', args.topic?.substring(0, 200) || 'recommendation', authResult.widgetId, { actionType: 'ai_recommendation', parentLogId: args.parentLogId || null });
        
        return makeToolOutput("debug", outputs, null, logId);
      } catch (error) {
        logError('AI RECOMMENDATION ERROR', error);
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

      // Sanitize: strip internal userId from each session before returning
      const sanitizedSessions = sessions.slice(-10).map(({ userId, ...rest }) => rest);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              sessions: sanitizedSessions,
              totalCount: sessions.length,
            }),
          },
        ],
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

  // API: Register widget session for tracking
  // This endpoint links a widget_id (from browser localStorage) to the browser's IP
  // so we can track usage across OpenAI proxy IP changes
  if (req.method === "POST" && url.pathname === "/api/register-session") {
    console.log('[API] Register session request');
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    if (!supabase) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Database not configured' }));
    }

    try {
      const body = await parseJsonBody(req);
      const { widgetId } = body;

      if (!widgetId) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'widgetId is required' }));
      }

      // Get browser IP (real user IP, not OpenAI proxy)
      const ip = req.headers['cf-connecting-ip'] || req.headers['true-client-ip'] || req.headers['x-forwarded-for'];
      let browserIp = 'unknown';
      if (ip) {
        browserIp = ip.includes(',') ? ip.split(',')[0].trim() : ip;
      }

      console.log('[API] Registering session:', { widgetId, browserIp });

      // Upsert into free_sessions table
      // IMPORTANT: Reset mcp_user_id to null so it gets re-linked on the next MCP request.
      // This fixes the free tier bypass issue where users could reset their limit by
      // closing and reopening the ChatGPT tab, which caused the widget_id to become
      // orphaned from the MCP user when OpenAI's proxy IP changed.
      const { data, error } = await supabase
        .from('free_sessions')
        .upsert({
          widget_id: widgetId,
          browser_ip: browserIp,
          last_seen_at: new Date().toISOString(),
          mcp_user_id: null  // Force re-linking to maintain usage tracking across IP changes
        }, {
          onConflict: 'widget_id',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        console.error('[API] Error registering session:', error);
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'Failed to register session' }));
      }

      console.log('[API] ✓ Session registered:', widgetId);
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, widgetId }));
    } catch (error) {
      console.error('[API] ❌ Register session error:', error);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  // API: Submit feedback for a usage log
  if (req.method === "POST" && url.pathname === "/api/submit-feedback") {
    console.log('[API] Submit feedback request');
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    if (!supabase) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'Database not configured' }));
    }

    try {
      const body = await parseJsonBody(req);
      const { logId, decision, reason, widgetId } = body;

      // Validate required fields
      if (!logId) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'logId is required' }));
      }

      if (!decision || !['yes', 'no'].includes(decision)) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'decision must be "yes" or "no"' }));
      }

      // Validate reason based on decision
      const validPositiveReasons = ['clear_explanation', 'good_examples', 'helped_understand', 'easy_code'];
      const validNegativeReasons = ['unclear', 'too_advanced', 'already_knew', 'code_broken'];
      const validReasons = decision === 'yes' ? validPositiveReasons : validNegativeReasons;

      if (reason && !validReasons.includes(reason)) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: `Invalid reason for ${decision} feedback` }));
      }

      console.log('[API] Submitting feedback:', { logId, decision, reason, widgetId });

      // Verify the log entry exists and optionally verify widget ownership
      const { data: logData, error: logError } = await supabase
        .from('usage_logs')
        .select('id, widget_id')
        .eq('id', logId)
        .single();

      if (logError || !logData) {
        console.log('[API] Log entry not found:', logId);
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Log entry not found' }));
      }

      // Optional: Verify widget ownership (if widgetId provided and matches)
      if (widgetId && logData.widget_id && logData.widget_id !== widgetId) {
        console.log('[API] Widget mismatch:', { expected: logData.widget_id, got: widgetId });
        // Don't reject - just log the mismatch for now
      }

      // Update the usage log with feedback
      const { error: updateError } = await supabase
        .from('usage_logs')
        .update({
          feedback_decision: decision,
          feedback_reason: reason || null
        })
        .eq('id', logId);

      if (updateError) {
        console.error('[API] Error updating feedback:', updateError);
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'Failed to save feedback' }));
      }

      console.log('[API] ✓ Feedback saved:', { logId, decision, reason });
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true }));
    } catch (error) {
      console.error('[API] ❌ Submit feedback error:', error);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  // API: AI Recommendation (direct call from widget, bypasses MCP/ChatGPT)
  if (req.method === "POST" && url.pathname === "/api/ai-recommendation") {
    console.log('[API] AI recommendation request');
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    try {
      const body = await parseJsonBody(req);
      const { performanceData, problemTitle, topic, problemDescription } = body;

      if (!performanceData) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'performanceData is required' }));
      }

      console.log('[API] Generating AI recommendation for:', problemTitle || topic || 'unknown');

      const outputs = await generateAIRecommendation({
        performanceData,
        problemTitle,
        topic,
        problemDescription,
      });

      console.log('[API] ✓ AI recommendation generated');
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, recommendation: outputs }));
    } catch (error) {
      console.error('[API] ❌ AI recommendation error:', error);
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

  // Serve web pages (landing, login, signup, dashboard, auth-callback, reset-password)
  const webPages = ['/', '/index.html', '/login.html', '/signup.html', '/dashboard.html', '/auth-callback.html', '/reset-password.html', '/support.html', '/privacy.html', '/terms.html'];
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

  // Serve OpenAI domain verification file
  if (req.method === "GET" && url.pathname.startsWith("/.well-known/")) {
    const filePath = join(__dirname, url.pathname);
    try {
      const data = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(data);
      return;
    } catch (e) {
      // Fall through to 404
    }
  }

  console.log('[HTTP] ❌ 404 Not Found - path:', url.pathname);
  res.writeHead(404).end("Not Found");
  console.log('█'.repeat(80) + '\n');
});

httpServer.listen(port, () => {
  console.log(
    `\n🚀 AlgoTutor MCP Server (Exam Cheat Code Edition) running at http://localhost:${port}${MCP_PATH}\n`
  );
  console.log("📚 Learn Mode: Master DSA patterns with exam tricks");
  console.log("🔨 Build Mode: Build solutions with test case tracing");
  console.log("🐛 Debug Mode: Find and fix bugs with step-by-step traces\n");
  
  // Verify API key is loaded
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️  WARNING: OPENAI_API_KEY not found in environment!");
    console.warn("   Please create a .env file with: OPENAI_API_KEY=your_key_here\n");
  } else {
    console.log(`✅ OpenAI API key loaded (${process.env.OPENAI_API_KEY.substring(0, 8)}...)\n`);
  }
});
