import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = 'gpt-4o-mini'; // Cheapest GPT-5 model (~$0.00015/1K input tokens)

// Input validation prefix - added to all system prompts
const VALIDATION_PREFIX = `
**CRITICAL: CHECK INPUT RELEVANCE FIRST**

Before generating ANY content, you MUST evaluate if the input is related to:
- Data structures (arrays, trees, graphs, linked lists, stacks, queues, heaps, etc.)
- Algorithms (sorting, searching, dynamic programming, recursion, BFS, DFS, etc.)
- Coding problems or code snippets
- Computer science concepts

IRRELEVANT INPUT EXAMPLES (MUST reject these):
- Food/cooking: "cake time it is", "pizza recipe", "best restaurants"
- Greetings/chat: "hello how are you", "what's up", "tell me a joke"
- Random phrases: "the weather is nice", "I love music", "my dog is cute"
- Non-CS topics: "explain quantum physics", "write me a poem", "stock market tips"

If the input is CLEARLY unrelated to DSA/coding/programming, you MUST respond with ONLY this JSON:
{"error": "INVALID_INPUT", "message": "Please enter a valid DSA topic, coding problem, or code snippet."}

VALID INPUT HANDLING:
- Typos are OK: "linged liwts" = "linked lists", "binery surch" = "binary search"
- Capitalization doesn't matter: "BINARY SEARCH", "binary search", "BinarySearch" all work
- Unclear but technical input: Try to interpret it charitably and proceed
- When in doubt about CS relevance: Attempt to find a reasonable interpretation

`;

// Helper function to call OpenAI
async function callOpenAI(systemPrompt, userPrompt, maxTokens = 2048) {
  console.log('\n' + '='.repeat(80));
  console.log('[LLM] CALLING OPENAI API');
  console.log('='.repeat(80));
  console.log('[LLM] Model:', MODEL);
  console.log('[LLM] Max tokens:', maxTokens);
  console.log('[LLM] System prompt length:', systemPrompt.length, 'chars');
  console.log('[LLM] User prompt length:', userPrompt.length, 'chars');
  console.log('[LLM] User prompt preview:', userPrompt.substring(0, 150) + '...');
  
  try {
    const startTime = Date.now();
    console.log('[LLM] Sending request to OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" }, // Force JSON mode for valid output
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
    });
    
    const duration = Date.now() - startTime;
    console.log('[LLM] ✓ Response received in', duration, 'ms');
    console.log('[LLM] Tokens used:', {
      prompt: completion.usage?.prompt_tokens,
      completion: completion.usage?.completion_tokens,
      total: completion.usage?.total_tokens
    });
    
    let content = completion.choices[0].message.content;
    console.log('[LLM] Response length:', content.length, 'chars');
    console.log('[LLM] Response preview:', content.substring(0, 200) + '...');
    
    // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    console.log('[LLM] ✓ Response cleaned and ready');
    console.log('='.repeat(80) + '\n');
    
    return content;
  } catch (error) {
    console.error('[LLM] ❌ ERROR calling OpenAI API');
    console.error('[LLM] Error type:', error.constructor.name);
    console.error('[LLM] Error message:', error.message);
    console.error('[LLM] Error details:', error);
    throw new Error(`OpenAI API failed: ${error.message}`);
  }
}

// Generate Learn Mode content (simplified - no trace table, pattern keywords, paper summary, example walkthrough)
export async function generateLearnContent(args) {
  console.log('[generateLearnContent] Starting Learn Mode content for:', args.topic);
  console.log('[generateLearnContent] Args:', JSON.stringify(args, null, 2));
  
  const systemPrompt = VALIDATION_PREFIX + `You are AlgoTutor, an expert CS educator focused on EXAM SURVIVAL. Your job is to help students instantly recognize patterns and write correct code under time pressure. You teach exam tricks, not just DSA concepts. Keep explanations direct and actionable. Avoid unnecessary filler words. Respond with valid JSON only.`;
  
  // Build difficulty instruction
  let difficultyInstruction = '';
  if (args.difficulty === 'basic') {
    difficultyInstruction = 'Use simple vocabulary, avoid jargon, explain like teaching a beginner. Keep sentences short and clear.';
  } else if (args.difficulty === 'dumb-it-down') {
    difficultyInstruction = 'Use extremely simple language, many analogies and real-world comparisons. Assume zero prior CS knowledge. Explain every term.';
  } else {
    difficultyInstruction = 'Use standard CS terminology. Assume basic programming knowledge.';
  }
  
  // Build depth instruction
  let depthInstruction = '';
  if (args.depth === 'tiny') {
    depthInstruction = 'Keep explanation to EXACTLY 5 short steps. Be concise.';
  } else if (args.depth === 'full') {
    depthInstruction = 'Provide 10-15 comprehensive steps with full detail and examples.';
  } else {
    depthInstruction = 'Provide 7-10 detailed steps.';
  }
  
  // Build example size instruction
  let exampleInstruction = '';
  if (args.exampleSize === 'small') {
    exampleInstruction = 'Use small arrays/inputs with 3-5 elements maximum in all examples.';
  } else {
    exampleInstruction = 'Use medium arrays/inputs with 5-8 elements in examples.';
  }
  
  const userPrompt = `Generate PATTERN RECOGNITION content for: ${args.topic}

This is for EXAM PREP - focus on instant pattern recognition and exam tricks.

DIFFICULTY LEVEL: ${args.difficulty}
${difficultyInstruction}

DEPTH: ${args.depth}
${depthInstruction}

EXAMPLE SIZE: ${args.exampleSize}
${exampleInstruction}

REQUIRED JSON SECTIONS (include ONLY these fields):

- topicIdentified: REQUIRED - The canonical name of the data structure or algorithm being taught. Use standardized naming like "Binary Search", "BFS", "Two Pointers", "Sliding Window", "Hash Map", "Binary Tree", etc.

- theTrick: REQUIRED - One-liner critical insight that makes this pattern work. Format: "PATTERN_NAME = Key insight. If you see X or Y → use this pattern." Example: "BFS = Use a queue. If you see 'level-by-level' or 'shortest path' → it's BFS."

- stepByStep: REQUIRED - Numbered explanation of how the pattern works (use \\n for line breaks)

- memorableTemplate: REQUIRED - A 5-line paper-friendly code skeleton that students can memorize and write in 2 minutes. Use simple syntax only - NO list comprehensions, NO lambda, NO fancy libraries. Include comments marking the key lines.

- code: REQUIRED - Full working Python code (5-15 lines, minimal style, no fancy syntax, paper-friendly)

- whatProfessorsTest: REQUIRED - THE #1 edge case that appears on exams for this pattern. Not a list of 3 - just THE ONE that professors love to test. Explain why it breaks basic approaches. Include a 1-2 sentence tip on how students can prepare for this edge case.

- complexity: REQUIRED - Time and space complexity in format "O(n) time, O(1) space" with brief explanation.

- difficultyScore: REQUIRED - Difficulty rating as exactly one of: "easy", "medium", or "hard" based on typical exam difficulty.

- relatedPatterns: REQUIRED - Array of 3-5 related DSA patterns that students should also study. Example: ["Two Pointers", "Sliding Window", "Binary Search"]

Return ONLY valid JSON with the required fields.`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt, 2500);
    console.log('[generateLearnContent] Raw response received, length:', response.length);
    
    const parsed = JSON.parse(response);
    console.log('[generateLearnContent] ✓ Successfully parsed JSON response');
    console.log('[generateLearnContent] Response keys:', Object.keys(parsed));
    
    // Check if LLM returned an error (invalid input detected)
    if (parsed.error === 'INVALID_INPUT') {
      console.log('[generateLearnContent] Invalid input detected by LLM:', parsed.message);
      return {
        error: 'INVALID_INPUT',
        message: parsed.message || 'Please enter a valid DSA topic, coding problem, or code snippet.'
      };
    }
    
    // Add flag indicating this is learn mode (for follow-up buttons)
    parsed.isLearnMode = true;
    
    return parsed;
  } catch (error) {
    console.error('[generateLearnContent] ❌ Failed:', error);
    if (error instanceof SyntaxError) {
      console.error('[generateLearnContent] Invalid JSON returned by API');
      console.error('[generateLearnContent] Raw response that failed to parse:', error.message);
    }
    
    // Return error fallback
    return {
      topicIdentified: args.topic,
      theTrick: "Error generating content. Please try again.",
      stepByStep: "Content generation failed.",
      memorableTemplate: "# Error occurred",
      code: "# Error occurred",
      whatProfessorsTest: "Error occurred",
      complexity: "N/A",
      difficultyScore: null,
      relatedPatterns: [],
      isLearnMode: true,
    };
  }
}

// Generate Build Mode solution
export async function generateBuildSolution(args) {
  const systemPrompt = VALIDATION_PREFIX + `You are AlgoTutor, an expert problem solver focused on EXAM SUCCESS. Your job is to help students write correct, working code under time pressure on written exams. 

CODE STYLE PRINCIPLES:
- Write paper-friendly code that students can write by hand
- Default to simple for/while loops. Exception: If a one-liner is genuinely cleaner AND commonly used for this pattern, it's fine - but add an inline comment explaining the logic.
- Use clear variable names and straightforward logic
- BUT: Use whatever data structures the problem REQUIRES (trees, linked lists, graphs, heaps, stacks, queues, etc.)
- If the problem needs recursion (trees, graphs, backtracking), USE RECURSION - don't force iterative solutions where recursion is natural
- Don't EVER use brute force - use the most efficient algorithm for the problem - consider space and time complexity when deciding which algorithm to use
- If the problem needs a TreeNode or ListNode class, define it simply
- The goal is READABLE, CORRECT code - not artificially simple code

Keep explanations direct and actionable. Avoid unnecessary filler words. Respond with valid JSON only.`;
  
  // Build code style instruction
  let codeStyleInstruction = '';
  if (args.minimalCode) {
    codeStyleInstruction = 'Use MINIMAL code style: no comments in code, no docstrings, shortest possible solution. Prioritize brevity.';
  } else {
    codeStyleInstruction = 'Include helpful comments explaining key steps in the code.';
  }
  
  // Build skeleton instruction
  let skeletonInstruction = '';
  if (args.skeletonOnly) {
    skeletonInstruction = 'IMPORTANT: Provide ONLY the function signature with TODO comments. DO NOT write any implementation code. Just the skeleton structure.';
  } else {
    skeletonInstruction = 'Provide a full working implementation with complete logic.';
  }
  
  // Build recursion instruction
  let recursionInstruction = '';
  if (args.allowRecursion) {
    recursionInstruction = 'Recursion IS allowed and PREFERRED for tree/graph problems. Use recursive approach when it provides a cleaner solution (DFS, tree traversals, backtracking, divide-and-conquer).';
  } else {
    recursionInstruction = 'DO NOT use recursion. Use ONLY iterative approaches (loops, stacks, queues). Convert recursive solutions to iterative using explicit stacks if needed.';
  }

  // Build test case tracing instruction
  let testCaseInstruction = '';
  if (args.testCases) {
    testCaseInstruction = `TEST CASES PROVIDED BY USER:
${args.testCases}

IMPORTANT: For the dryRunTable, trace through each test case step-by-step:
- Show 3-5 iterations/steps for each test case (enough to see the pattern)
- After showing the key steps, use "..." to indicate fast-forwarding
- Then show the final output/result for that test case
- Format each trace entry to match exam expectations`;
  } else {
    testCaseInstruction = `NO TEST CASES PROVIDED - Generate 3 test cases yourself:
- Include at least 1 typical case
- Include at least 1 edge case (empty input, single element, etc.)
- Include at least 1 boundary case

For the dryRunTable, trace through each generated test case.`;
  }

  // Build constraints instruction
  let constraintsInstruction = '';
  if (args.constraints) {
    constraintsInstruction = `CONSTRAINTS: ${args.constraints}
The solution MUST meet these time/space constraints. Choose the algorithm accordingly.`;
  } else {
    constraintsInstruction = `NO CONSTRAINTS PROVIDED - Use the most efficient algorithm possible.
Consider both time and space complexity when choosing the approach.`;
  }
  
  const userPrompt = `Solve this problem for a WRITTEN EXAM: ${args.problem}

${testCaseInstruction}

${constraintsInstruction}

LANGUAGE: ${args.language}
Write all code in ${args.language}.

CODE STYLE (Paper-Friendly):
- Default to simple for/while loops. Exception: If a one-liner is genuinely cleaner AND commonly used for this pattern, it's fine - but add an inline comment explaining the logic.
- Use clear variable names
- BUT: Use appropriate data structures for the problem (trees, graphs, linked lists, heaps, etc.)
- If the problem requires recursion (tree traversal, DFS, backtracking), use recursion
- Define helper classes (TreeNode, ListNode) if needed - keep them simple
- Goal: Code a student can write by hand in a reasonable time

CODE STYLE CONSTRAINTS:
${codeStyleInstruction}

SKELETON VS FULL SOLUTION:
${skeletonInstruction}

RECURSION CONSTRAINT:
${recursionInstruction}

REQUIRED JSON SECTIONS (include ONLY these fields):

- theShortcut: REQUIRED - The ONE critical thing to remember that makes this solution work. Format it as a direct instruction. Example: "Always check 'if not node:' before accessing node.left or node.right - prevents NoneType errors."

- pattern: REQUIRED - Problem pattern identification. Format: "This is a [pattern] problem because..." Example: "This is a DFS/backtracking problem because we need to explore all paths in a tree."

- stepByStep: REQUIRED - Numbered solution logic (use \\n for line breaks), 5-10 steps explaining how to arrive at the solution

- code: REQUIRED - ${args.skeletonOnly ? 'Function skeleton with TODO comments only, NO implementation' : 'Full working solution'} in ${args.language}. Include any helper classes needed (TreeNode, ListNode, etc.). Keep syntax clean but use appropriate data structures.

- dryRunTable: REQUIRED - Array of objects showing exam-format trace. Use keys: {step, variables, action, output}.
${args.testCases ? 'For EACH provided test case: Show 3-5 key iterations, then a row with "..." in step to indicate fast-forward, then final result. Clearly label which test case each trace is for.' : 'Generate 3 test cases (including at least 1 edge case). For each: Show 3-5 key iterations, then "..." to fast-forward, then final result.'}

${args.showTimeEstimate !== false ? '- timeEstimate: REQUIRED - How long to write this on paper. Format: "~X minutes to write on paper". Be realistic based on problem complexity.' : '- timeEstimate: DO NOT INCLUDE THIS FIELD'}

- dontForget: REQUIRED - The ONE line or check that students always mess up. Be specific about what and why. Example: "Line 5: Check 'if not root:' at the START of recursive function - forgetting this causes infinite recursion on empty trees."

- paperVersion: REQUIRED - Array of 4-6 steps for writing this solution on paper. Include which key lines to write first, and any helper classes needed.

- complexity: REQUIRED - Time and space complexity analysis (e.g., "O(n) time, O(h) space for recursion stack") with brief explanation

- difficultyScore: REQUIRED - Difficulty rating as exactly one of: "easy", "medium", or "hard" based on typical interview/exam difficulty.

- relatedPatterns: REQUIRED - Array of 3-5 related DSA patterns that use similar techniques. Example: ["Two Pointers", "Sliding Window", "Binary Search"]

Return ONLY valid JSON with the required fields. Do not include fields marked as "DO NOT INCLUDE".`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt, 3000);
    console.log('[generateBuildSolution] Raw response:', response.substring(0, 200) + '...');
    const parsed = JSON.parse(response);
    
    // Check if LLM returned an error (invalid input detected)
    if (parsed.error === 'INVALID_INPUT') {
      console.log('[generateBuildSolution] Invalid input detected by LLM:', parsed.message);
      return {
        error: 'INVALID_INPUT',
        message: parsed.message || 'Please enter a valid coding problem or algorithm description.'
      };
    }
    
    return parsed;
  } catch (error) {
    console.error('[generateBuildSolution] Failed:', error);
    if (error instanceof SyntaxError) {
      console.error('[generateBuildSolution] Invalid JSON returned by API');
    }
    return {
      theShortcut: "Error generating solution. Please try again.",
      pattern: "Error generating solution. Please try again.",
      stepByStep: "Solution generation failed.",
      code: "# Error occurred",
      dryRunTable: [],
      timeEstimate: "N/A",
      dontForget: "Error occurred",
      paperVersion: ["Error occurred"],
      complexity: "N/A",
      difficultyScore: null,
      relatedPatterns: [],
    };
  }
}

// Generate Debug Mode analysis
export async function generateDebugAnalysis(args) {
  // Detect if this is fill-in-the-blank mode
  const hasBlanks = args.code && (
    args.code.includes('___') || 
    args.code.includes('// TODO') || 
    args.code.includes('# TODO') ||
    args.code.includes('# ???') ||
    args.code.includes('// ???') ||
    args.code.includes('/* TODO */') ||
    args.code.includes('BLANK')
  );
  const isFillInBlank = args.debugMode === 'fill-in-blank' || hasBlanks;
  
  const systemPrompt = VALIDATION_PREFIX + `You are AlgoTutor, an expert code debugger focused on EXAM SUCCESS. Your job is to help students understand what's wrong with code and trace through it step-by-step like they would on a written exam. ${isFillInBlank ? 'This is a FILL-IN-THE-BLANK exercise - identify what goes in each blank and explain WHY based on the algorithm pattern.' : 'Identify bugs and provide fixes with clear explanations.'} Keep explanations direct and actionable. Avoid unnecessary filler words. Respond with valid JSON only.`;
  
  let userPrompt;
  
  if (isFillInBlank) {
    userPrompt = `This is a FILL-IN-THE-BLANK code exercise in ${args.language}:
\`\`\`${args.language}
${args.code}
\`\`\`

${args.problemDescription ? `PROBLEM DESCRIPTION: ${args.problemDescription}` : 'Analyze the code structure to determine what should fill each blank.'}

REQUIRED JSON SECTIONS (include ONLY these fields):

- theTrick: REQUIRED - One-line explanation of the algorithm pattern being used. Format: "This is [PATTERN] - [key insight]". Example: "This is BFS - we process nodes level-by-level using a queue."

- whatCodeDoes: REQUIRED - Plain English explanation of what this code is trying to accomplish. 1-2 sentences.

- fillInBlankAnswers: REQUIRED - Array of objects for each blank. Format: [{blank: "Blank 1 (line X)", answer: "the code that goes here", reason: "why this is correct based on the pattern"}]. Be specific about WHY based on the algorithm logic.

${args.showTraceTable !== false ? '- traceTable: REQUIRED - Array of 3-4 objects showing step-by-step execution with blanks filled in. Use keys: {step, variables, state, action}. Match exam format.' : '- traceTable: DO NOT INCLUDE THIS FIELD'}

- afterCode: REQUIRED - The complete code with all blanks filled in correctly. Add "${args.language === 'python' ? '# FILLED' : '// FILLED'}" comments on filled lines.

${args.generateTests ? '- testCases: REQUIRED - Array of exactly 3 test case strings that verify the completed code works' : '- testCases: DO NOT INCLUDE THIS FIELD'}

- ifOnExam: REQUIRED - What variation of this problem a professor might test. Example: "Professor might ask you to modify this to return the path instead of just true/false."

Return ONLY valid JSON with the required fields. Do not include fields marked as "DO NOT INCLUDE".`;
  } else {
    // Build test case instruction for debug mode
    let debugTestCaseInstruction = '';
    if (args.testCases) {
      debugTestCaseInstruction = `TEST CASES PROVIDED:
${args.testCases}

Use these test cases to demonstrate the bug in the trace table.`;
    } else {
      debugTestCaseInstruction = `NO TEST CASES PROVIDED - Generate up to 3 test cases yourself (at least 1 edge case) to demonstrate the bug.`;
    }

    // Build constraints instruction for debug mode
    let debugConstraintsInstruction = '';
    if (args.constraints) {
      debugConstraintsInstruction = `CONSTRAINTS: ${args.constraints}
Consider these constraints when suggesting the fix.`;
    }

    userPrompt = `Debug this ${args.language} code for EXAM PREP:
\`\`\`${args.language}
${args.code}
\`\`\`

${args.problemDescription ? `PROBLEM DESCRIPTION: ${args.problemDescription}` : 'No problem description provided. Analyze the code for common bugs.'}

${debugTestCaseInstruction}

${debugConstraintsInstruction}

IMPORTANT: Check for ALL bugs in the code. If there are multiple bugs, list ALL of them.

REQUIRED JSON SECTIONS (include ONLY these fields):

- theTrick: REQUIRED - DO NOT just repeat the bug description. Instead, provide a memorable principle to avoid this mistake in the future. Format: "Remember: [principle that prevents this bug]". Example: "Remember: Always handle the empty case FIRST - check 'if not arr: return' before accessing arr[0]."

- whatCodeDoes: REQUIRED - Plain English explanation of what algorithm/pattern this code is trying to implement. 1-2 sentences.

- exactBugLine: REQUIRED - If there's ONE bug: Object with {lineNumber: number, code: "the buggy line", issue: "specific explanation"}. If there are MULTIPLE bugs: Array of objects, each with {lineNumber, code, issue}. Number them in order found.

${args.showPatternExplanation !== false ? '- bugDiagnosis: REQUIRED - Detailed analysis explaining the bug(s) in context of the algorithm pattern. Why does this specific bug break the algorithm? (use \\n for line breaks)' : '- bugDiagnosis: DO NOT INCLUDE THIS FIELD'}

${args.showTraceTable !== false ? `- traceTable: REQUIRED - Array of objects showing step-by-step execution. Use keys: {section, step, variables, state, action}.
  - Include a "section" field with value "BEFORE" for traces showing the bug, and "AFTER" for traces with the fixed code.
  - BEFORE section: Show 3-5 steps where the bug causes incorrect behavior or failure.
  - AFTER section: Show 3-5 steps with the fixed code working correctly.
  ${args.testCases ? '- Trace through the provided test cases.' : '- Use your generated test cases.'}` : '- traceTable: DO NOT INCLUDE THIS FIELD'}

- beforeCode: REQUIRED - The original code with "${args.language === 'python' ? '# BUG HERE' : '// BUG HERE'}" comment on the problematic line(s). If multiple bugs, number them like "${args.language === 'python' ? '# BUG 1' : '// BUG 1'}", "${args.language === 'python' ? '# BUG 2' : '// BUG 2'}", etc.

- afterCode: REQUIRED - The fixed code with "${args.language === 'python' ? '# FIXED' : '// FIXED'}" comment on the corrected line(s). Show ONLY the minimal changes needed.

- testCases: REQUIRED - Array of exactly 3 test case strings that verify the fix works. Include at least 1 edge case.

- ifOnExam: REQUIRED - What variation of this bug a professor might test. Include a 1-2 sentence prep tip on how students can practice spotting this type of bug. Example: "Professor might give working code and ask what happens if you change '<' to '<='. Prep tip: Practice tracing loops with boundary values (0, 1, n-1, n) to catch off-by-one errors."

${args.showEdgeWarnings ? '- edgeCases: REQUIRED - Array of exactly 3 objects with {case: "edge case name", hint: "1-2 sentence tip on how to handle this in code"}. Example: [{case: "Empty array", hint: "Add if not arr: return early at the start before accessing any elements."}]' : '- edgeCases: DO NOT INCLUDE THIS FIELD'}

- difficultyScore: REQUIRED - Difficulty rating as exactly one of: "easy", "medium", or "hard" based on how tricky this bug is to spot.

- relatedPatterns: REQUIRED - Array of 3-5 related bug patterns or DSA concepts. Example: ["Off-by-one errors", "Loop boundary conditions", "Array indexing"]

Return ONLY valid JSON with the required fields. Do not include fields marked as "DO NOT INCLUDE".`;
  }

  try {
    const response = await callOpenAI(systemPrompt, userPrompt, 3000);
    console.log('[generateDebugAnalysis] Raw response:', response.substring(0, 200) + '...');
    const parsed = JSON.parse(response);
    
    // Check if LLM returned an error (invalid input detected)
    if (parsed.error === 'INVALID_INPUT') {
      console.log('[generateDebugAnalysis] Invalid input detected by LLM:', parsed.message);
      return {
        error: 'INVALID_INPUT',
        message: parsed.message || 'Please enter valid code to debug or analyze.'
      };
    }
    
    return parsed;
  } catch (error) {
    console.error('[generateDebugAnalysis] Failed:', error);
    if (error instanceof SyntaxError) {
      console.error('[generateDebugAnalysis] Invalid JSON returned by API');
    }
    
    if (isFillInBlank) {
      return {
        theTrick: "Error analyzing code. Please try again.",
        whatCodeDoes: "Error occurred",
        fillInBlankAnswers: [],
        traceTable: args.showTraceTable !== false ? [] : null,
        afterCode: "# Error occurred",
        testCases: args.generateTests ? [] : null,
        ifOnExam: "Error occurred",
      };
    }
    
    return {
      theTrick: "Error analyzing code. Please try again.",
      whatCodeDoes: "Error occurred",
      exactBugLine: { lineNumber: 0, code: "Error", issue: "Error occurred" },
      bugDiagnosis: args.showPatternExplanation !== false ? "Error analyzing code. Please try again." : null,
      traceTable: args.showTraceTable !== false ? [] : null,
      beforeCode: args.code,
      afterCode: "# Error occurred during debugging",
      testCases: [],
      ifOnExam: "Error occurred",
      edgeCases: args.showEdgeWarnings ? [] : null,
      difficultyScore: null,
      relatedPatterns: [],
    };
  }
}

// Generate Trace Table and Example Walkthrough (on-demand for Learn Mode)
export async function generateTraceAndWalkthrough(args) {
  console.log('[generateTraceAndWalkthrough] Starting for topic:', args.topic);
  console.log('[generateTraceAndWalkthrough] Args:', JSON.stringify(args, null, 2));
  
  const systemPrompt = VALIDATION_PREFIX + `You are AlgoTutor, an expert CS educator. Generate a detailed trace table and example walkthrough for the given algorithm/data structure. This is for EXAM PREP - format everything like professors expect on written exams. Respond with valid JSON only.`;
  
  const userPrompt = `Generate a TRACE TABLE and EXAMPLE WALKTHROUGH for: ${args.topic}

${args.code ? `REFERENCE CODE:\n\`\`\`python\n${args.code}\n\`\`\`` : ''}

CRITICAL: Pick ONE specific test case first. ALL sections below MUST use this EXACT SAME test case.

REQUIRED JSON SECTIONS (include ONLY these fields):

- exampleInput: REQUIRED - The specific input for the test case. Example: "[1, 3, 5, 7, 9], target=5"

- exampleOutput: REQUIRED - The expected output for the test case. Example: "2 (index where 5 is found)"

- dryRunTable: REQUIRED - Array of 4-6 objects tracing the algorithm with the EXACT input from exampleInput. Use these exact keys: {iteration, variables, state, action}. Each row should show one step of the algorithm executing with the actual values from the test case.

- exampleWalkthrough: REQUIRED - Step-by-step trace using the EXACT SAME input from exampleInput. Format as a STRING with each step on a NEW LINE using \\n. Use this EXACT format:
  "Step 1: [What happens in this iteration, showing actual values]\\nStep 2: [Next iteration with actual values]\\nStep 3: [Continue...]\\n..."
  
  Example format:
  "Step 1: Initialize left=0, right=4. Array is [1,3,5,7,9], looking for target=5\\nStep 2: Calculate mid=(0+4)//2=2. arr[2]=5 equals target!\\nStep 3: Return index 2. Found!"

  IMPORTANT: Each step MUST be on its own line (use \\n). Do NOT write as a paragraph.

Return ONLY valid JSON with the required fields.`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt, 2000);
    console.log('[generateTraceAndWalkthrough] Raw response received, length:', response.length);
    
    const parsed = JSON.parse(response);
    console.log('[generateTraceAndWalkthrough] ✓ Successfully parsed JSON response');
    
    // Check if LLM returned an error (invalid input detected)
    if (parsed.error === 'INVALID_INPUT') {
      return {
        error: 'INVALID_INPUT',
        message: parsed.message || 'Please enter a valid DSA topic.'
      };
    }
    
    // Add flag indicating this is trace/walkthrough response
    parsed.isTraceWalkthrough = true;
    parsed.topicIdentified = args.topic;
    
    return parsed;
  } catch (error) {
    console.error('[generateTraceAndWalkthrough] ❌ Failed:', error);
    return {
      dryRunTable: [],
      exampleWalkthrough: "Error generating walkthrough. Please try again.",
      exampleInput: "N/A",
      exampleOutput: "N/A",
      isTraceWalkthrough: true,
      topicIdentified: args.topic,
    };
  }
}

// Data structure and algorithm rankings for complexity-appropriate problem generation
const DSA_RANKINGS = {
  // Data Structures (1-15)
  'arrays': 1, 'array': 1, 'strings': 1, 'string': 1,
  'linked lists': 2, 'linked list': 2, 'linkedlist': 2, 'singly linked list': 2, 'doubly linked list': 2,
  'stacks': 3, 'stack': 3, 'queues': 3, 'queue': 3,
  'hash maps': 4, 'hash map': 4, 'hashmap': 4, 'hash tables': 4, 'hash table': 4, 'hashtable': 4, 'dictionary': 4, 'dict': 4,
  'sets': 5, 'set': 5, 'hashset': 5,
  'binary trees': 6, 'binary tree': 6, 'trees': 6, 'tree': 6,
  'bst': 7, 'binary search tree': 7, 'binary search trees': 7,
  'heaps': 8, 'heap': 8, 'min heap': 8, 'max heap': 8, 'priority queue': 8,
  'graphs': 9, 'graph': 9,
  'tries': 10, 'trie': 10, 'prefix tree': 10,
  'avl': 11, 'avl tree': 11, 'red-black tree': 11, 'b-tree': 11, 'advanced trees': 11,
  'union find': 12, 'union-find': 12, 'disjoint set': 12,
  'segment tree': 13, 'segment trees': 13,
  'fenwick tree': 14, 'fenwick trees': 14, 'binary indexed tree': 14,
  
  // Algorithms & Techniques (15-32)
  'two pointers': 15, 'two pointer': 15,
  'sliding window': 16,
  'binary search': 17,
  'sorting': 18, 'bubble sort': 18, 'selection sort': 18, 'insertion sort': 18, 'merge sort': 18, 'quick sort': 18, 'heap sort': 18,
  'recursion': 19, 'recursive': 19,
  'backtracking': 20, 'backtrack': 20,
  'bfs': 21, 'breadth first search': 21, 'breadth-first search': 21,
  'dfs': 22, 'depth first search': 22, 'depth-first search': 22,
  'tree traversal': 23, 'tree traversals': 23, 'inorder': 23, 'preorder': 23, 'postorder': 23,
  'greedy': 24, 'greedy algorithm': 24,
  'dynamic programming': 25, 'dp': 25, 'memoization': 25,
  'topological sort': 26, 'cycle detection': 26, 'bipartite': 26,
  'dijkstra': 27, 'bellman-ford': 27, 'floyd-warshall': 27, 'shortest path': 27,
  'kruskal': 28, 'prim': 28, 'minimum spanning tree': 28, 'mst': 28,
  'bit manipulation': 29, 'bitwise': 29,
  'kmp': 30, 'rabin-karp': 30, 'z-algorithm': 30, 'string matching': 30,
  'bitmask dp': 31, 'digit dp': 31, 'dp on trees': 31,
  'scc': 32, 'strongly connected components': 32, 'articulation points': 32, 'bridges': 32,
};

function getTopicRanking(topic) {
  const lowerTopic = topic.toLowerCase();
  for (const [key, rank] of Object.entries(DSA_RANKINGS)) {
    if (lowerTopic.includes(key)) {
      return rank;
    }
  }
  return 10; // Default to middle ranking if not found
}

// Generate Real World Example with Fill-in-the-Blank (on-demand for Learn Mode)
export async function generateRealWorldExample(args) {
  console.log('[generateRealWorldExample] Starting for topic:', args.topic);
  console.log('[generateRealWorldExample] Args:', JSON.stringify(args, null, 2));
  
  const topicRanking = getTopicRanking(args.topic);
  console.log('[generateRealWorldExample] Topic ranking:', topicRanking);
  
  // Build list of allowed data structures/algorithms based on ranking
  const allowedConcepts = Object.entries(DSA_RANKINGS)
    .filter(([_, rank]) => rank <= topicRanking)
    .map(([name, _]) => name)
    .join(', ');
  
  const systemPrompt = VALIDATION_PREFIX + `You are AlgoTutor, an expert CS educator. Generate a LeetCode-style fill-in-the-blank coding problem that tests understanding of the given algorithm/data structure. The problem should test CRITICAL understanding, not trivial syntax. Respond with valid JSON only.`;
  
  const userPrompt = `Generate a REAL WORLD EXAMPLE fill-in-the-blank problem for: ${args.topic}

CRITICAL CONSTRAINT: The problem must ONLY use data structures and algorithms at or BELOW this ranking level: ${topicRanking}
ALLOWED concepts: ${allowedConcepts}
DO NOT use any advanced concepts not in the allowed list.

REQUIRED JSON SECTIONS (include ONLY these fields):

- problemTitle: REQUIRED - A concise title for the problem. Example: "Two Sum" or "Valid Parentheses"

- problemDescription: REQUIRED - A clear problem description in LeetCode style. Include:
  - What the function should do
  - Input format
  - Output format
  - 2-3 example test cases showing input → output (include these IN the description text)
  - Any constraints

- codeWithBlanks: REQUIRED - Python code with EXACTLY 2 or 3 blanks marked as ___BLANK_1___, ___BLANK_2___, ___BLANK_3___. 

**CRITICAL BLANK RULES:**
1. The number of ___BLANK_X___ placeholders in codeWithBlanks MUST EXACTLY match the number of objects in the blanks array
2. If you have 2 blanks in the array, codeWithBlanks must have ___BLANK_1___ and ___BLANK_2___
3. If you have 3 blanks in the array, codeWithBlanks must have ___BLANK_1___, ___BLANK_2___, and ___BLANK_3___
4. Each blank tests a DIFFERENT part of the algorithm - NO DUPLICATES
5. Blanks should test CRITICAL algorithm logic (e.g., don't blank out variable names or simple syntax)
6. When ALL blanks are filled with correct answers, the code MUST produce correct output
7. The code must be in ${args.language} with valid ${args.language} syntax
8. For TEXT INPUT blanks (where user types): The blank MUST be SUBSTANTIAL - blank out the ENTIRE LINE or a significant portion of code (at least 15+ characters). Do NOT make tiny blanks where user only types a single argument, variable name, or small expression. Example: if it's a recursive call, blank out the ENTIRE line like "return ___BLANK_2___" not just one argument. MCQ blanks can be smaller since user selects from options.

- blanks: REQUIRED - Array of EXACTLY 2 or 3 blank objects (must match codeWithBlanks). Format:
  [
    {
      "id": 1,
      "type": "multiple_choice",
      "placeholder": "___BLANK_1___",
      "lineContext": "the EXACT line of code containing ___BLANK_1___",
      "options": ["option1", "option2", "option3", "option4"],
      "correctAnswer": "the correct option (must be one of the 4 options)",
      "hint": "A helpful hint that guides thinking WITHOUT revealing the answer",
      "explanation": "Why this is correct - explain the algorithm logic"
    },
    {
      "id": 2,
      "type": "text_input",
      "placeholder": "___BLANK_2___",
      "lineContext": "the EXACT line of code containing ___BLANK_2___",
      "correctAnswer": "exact code that goes in this blank",
      "hint": "A helpful hint that guides thinking WITHOUT revealing the answer",
      "explanation": "Why this is correct - explain the algorithm logic"
    }
  ]
  
  **BLANK REQUIREMENTS:**
  - Blank 1: MUST be multiple_choice - test a CRITICAL decision point (e.g., comparison operator, data structure choice). Can be smaller pieces of code.
  - Blank 2-3: MUST be text_input - MUST be SUBSTANTIAL (entire line or significant code chunk, 15+ characters). Examples of GOOD text_input blanks: "return helper(n-1) + helper(n-2)", "left, right = 0, len(nums)-1", "result.append(current[:])". Examples of BAD text_input blanks: "n-1", "left", "append" (too small!)
  - Each blank MUST test a DIFFERENT concept - DO NOT ask the same question twice
  - Each blank MUST have a hint that helps WITHOUT giving away the answer
  - All 4 options in multiple choice should be plausible

- fullSolution: REQUIRED - The complete code with all blanks filled in correctly. This code MUST work and produce correct output.

- whyThisTests: REQUIRED - One sentence explaining what understanding this problem tests.

Return ONLY valid JSON with the required fields. Do NOT include a separate testCases field.`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt, 3000);
    console.log('[generateRealWorldExample] Raw response received, length:', response.length);
    
    const parsed = JSON.parse(response);
    console.log('[generateRealWorldExample] ✓ Successfully parsed JSON response');
    
    // Check if LLM returned an error (invalid input detected)
    if (parsed.error === 'INVALID_INPUT') {
      return {
        error: 'INVALID_INPUT',
        message: parsed.message || 'Please enter a valid DSA topic.'
      };
    }
    
    // Add flag indicating this is real world example response
    parsed.isRealWorldExample = true;
    parsed.topicIdentified = args.topic;
    
    return parsed;
  } catch (error) {
    console.error('[generateRealWorldExample] ❌ Failed:', error);
    return {
      problemTitle: "Error",
      problemDescription: "Error generating problem. Please try again.",
      codeWithBlanks: "# Error occurred",
      blanks: [],
      fullSolution: "# Error occurred",
      whyThisTests: "Error occurred",
      isRealWorldExample: true,
      topicIdentified: args.topic,
    };
  }
}