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
async function callOpenAI(systemPrompt, userPrompt, maxTokens = 2048, temperature = 0.7) {
  console.log('\n' + '='.repeat(80));
  console.log('[LLM] CALLING OPENAI API');
  console.log('='.repeat(80));
  console.log('[LLM] Model:', MODEL);
  console.log('[LLM] Max tokens:', maxTokens);
  console.log('[LLM] Temperature:', temperature);
  console.log('[LLM] System prompt length:', systemPrompt.length, 'chars');
  console.log('[LLM] User prompt length:', userPrompt.length, 'chars');
  console.log('[LLM] User prompt preview:', userPrompt.substring(0, 150) + '...');
  
  try {
    const startTime = Date.now();
    console.log('[LLM] Sending request to OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: maxTokens,
      temperature: temperature,
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

- stepByStep: REQUIRED - Numbered explanation of how the pattern works (use \\n for line breaks). Adjust the number of steps based on the DEPTH setting above.

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

CRITICAL: Parse the problem description carefully to detect:
1. TEST CASES - Look for "Example:", "Input:", "Output:", "Test Case 1:", etc.
2. CONSTRAINTS - Look for "O(n) time", "O(1) space", "must use recursion", "no extra data structures", etc.

The generated code MUST respect any detected constraints!

Keep explanations direct and actionable. Avoid unnecessary filler words. Respond with valid JSON only.`;
  
  // Build code style instruction
  let codeStyleInstruction = '';
  if (args.minimalCode) {
    codeStyleInstruction = 'Use MINIMAL code style: no comments in code, no docstrings, shortest possible solution. Prioritize brevity.';
  } else {
    codeStyleInstruction = 'Include helpful comments explaining key steps in the code.';
  }
  
  // Build recursion instruction
  let recursionInstruction = '';
  if (args.allowRecursion) {
    recursionInstruction = 'Recursion IS allowed and PREFERRED for tree/graph problems. Use recursive approach when it provides a cleaner solution (DFS, tree traversals, backtracking, divide-and-conquer).';
  } else {
    recursionInstruction = 'DO NOT use recursion. Use ONLY iterative approaches (loops, stacks, queues). Convert recursive solutions to iterative using explicit stacks if needed.';
  }
  
  const userPrompt = `Solve this problem for a WRITTEN EXAM: ${args.problem}

LANGUAGE: ${args.language}
Write all code in ${args.language}.

IMPORTANT: First, analyze the problem description to extract:
1. Any TEST CASES mentioned (look for "Example:", "Input/Output:", etc.)
2. Any CONSTRAINTS mentioned (look for time/space complexity, restrictions like "no extra space", "must use X approach", etc.)

The solution MUST respect any detected constraints. If O(n) time is required, don't use O(n²) algorithms. If O(1) space is required, don't create large data structures.

CODE STYLE (Paper-Friendly):
- Default to simple for/while loops. Exception: If a one-liner is genuinely cleaner AND commonly used for this pattern, it's fine - but add an inline comment explaining the logic.
- Use clear variable names
- BUT: Use appropriate data structures for the problem (trees, graphs, linked lists, heaps, etc.)
- If the problem requires recursion (tree traversal, DFS, backtracking), use recursion
- Define helper classes (TreeNode, ListNode) if needed - keep them simple
- Goal: Code a student can write by hand in a reasonable time

CODE STYLE CONSTRAINTS:
${codeStyleInstruction}

RECURSION CONSTRAINT:
${recursionInstruction}

REQUIRED JSON SECTIONS (include ONLY these fields):

- theShortcut: REQUIRED - The ONE critical thing to remember that makes this solution work. Format it as a direct instruction. Example: "Always check 'if not node:' before accessing node.left or node.right - prevents NoneType errors."

- pattern: REQUIRED - Problem pattern identification. Format: "This is a [pattern] problem because..." Example: "This is a DFS/backtracking problem because we need to explore all paths in a tree."

- stepByStep: REQUIRED - Numbered solution logic (use \\n for line breaks), 5-10 steps explaining how to arrive at the solution

- code: REQUIRED - Full working solution in ${args.language}. Include any helper classes needed (TreeNode, ListNode, etc.). Keep syntax clean but use appropriate data structures.

- dontForget: REQUIRED - The ONE line or check that students always mess up. Be specific about what and why. Example: "Line 5: Check 'if not root:' at the START of recursive function - forgetting this causes infinite recursion on empty trees."

- complexity: REQUIRED - Time and space complexity analysis (e.g., "O(n) time, O(h) space for recursion stack") with brief explanation

- difficultyScore: REQUIRED - Difficulty rating as exactly one of: "easy", "medium", or "hard" based on typical interview/exam difficulty.

- relatedPatterns: REQUIRED - Array of 3-5 related DSA patterns that use similar techniques. Example: ["Two Pointers", "Sliding Window", "Binary Search"]

- testCasesDetected: REQUIRED - If you found test cases in the problem description, include them as a string here. If no test cases found, set to null. Example: "Input: [1,2,3], Output: 6" or null

- constraintsDetected: REQUIRED - If you found constraints in the problem description, include them as a string here. If no constraints found, set to null. Example: "O(n) time, O(1) space" or null

Return ONLY valid JSON with the required fields.`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt, 2500);
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
      dontForget: "Error occurred",
      complexity: "N/A",
      difficultyScore: null,
      relatedPatterns: [],
      testCasesDetected: null,
      constraintsDetected: null,
    };
  }
}

// Generate Debug Mode analysis
export async function generateDebugAnalysis(args) {
  const systemPrompt = VALIDATION_PREFIX + `You are AlgoTutor, an expert code debugger focused on EXAM SUCCESS. Your job is to analyze code and determine if it has bugs or is correct.

CRITICAL: First, CAREFULLY analyze if the code is CORRECT or has BUGS.
- If the code is CORRECT: Set codeIsCorrect to true and provide an alternative approach
- If the code has BUGS: Set codeIsCorrect to false and identify all bugs

Be ABSOLUTELY CERTAIN about correctness. Check:
1. Logic errors (wrong conditions, operators, etc.)
2. Off-by-one errors (array bounds, loop conditions)
3. Edge cases (empty input, single element, null/undefined)
4. Algorithm correctness (does it solve the problem correctly?)
5. Time/space complexity (is it efficient?)

Keep explanations direct and actionable. Avoid unnecessary filler words. Respond with valid JSON only.`;
  
  const userPrompt = `Analyze this ${args.language} code for EXAM PREP:
\`\`\`${args.language}
${args.code}
\`\`\`

STEP 1: Carefully determine if this code is CORRECT or has BUGS.
- Execute the code mentally with various inputs
- Check all edge cases (empty, single element, boundaries)
- Verify the algorithm logic is sound

STEP 2: Respond based on your analysis.

REQUIRED JSON SECTIONS:

- codeIsCorrect: REQUIRED - Boolean. Set to true ONLY if the code is completely correct with no bugs. Set to false if ANY bugs exist.

- theTrick: REQUIRED
  - If code has bugs: Provide a memorable principle to avoid this mistake. Format: "Remember: [principle that prevents this bug]". Example: "Remember: Always handle the empty case FIRST - check 'if not arr: return' before accessing arr[0]."
  - If code is correct: Provide the key insight that makes this solution work. Format: "Your code is correct! Key insight: [what makes this approach work]". Example: "Your code is correct! Key insight: Using two pointers from both ends efficiently finds the pair in O(n) time."

- whatCodeDoes: REQUIRED - Plain English explanation of what algorithm/pattern this code implements. 1-2 sentences.

- complexity: REQUIRED - Time and space complexity analysis. Format: "O(n) time, O(1) space - [brief explanation]"

IF CODE HAS BUGS (codeIsCorrect = false), also include:

- exactBugLine: REQUIRED - If ONE bug: Object with {lineNumber: number, code: "the buggy line", issue: "specific explanation"}. If MULTIPLE bugs: Array of objects, each with {lineNumber, code, issue}.

- bugDiagnosis: REQUIRED - Detailed analysis explaining the bug(s) in context of the algorithm pattern. Why does this specific bug break the algorithm? (use \\n for line breaks)

- beforeCode: REQUIRED - The original code with "${args.language === 'python' ? '# BUG HERE' : '// BUG HERE'}" comment on the problematic line(s). If multiple bugs, number them like "${args.language === 'python' ? '# BUG 1' : '// BUG 1'}", "${args.language === 'python' ? '# BUG 2' : '// BUG 2'}", etc.

- afterCode: REQUIRED - The fixed code with "${args.language === 'python' ? '# FIXED' : '// FIXED'}" comment on the corrected line(s). Show ONLY the minimal changes needed.

IF CODE IS CORRECT (codeIsCorrect = true), also include:

- beforeCode: REQUIRED - The original code (unchanged, as it's already correct)

- afterCode: REQUIRED - An ALTERNATIVE approach to solve the same problem. This should be a DIFFERENT algorithm or technique. Add "${args.language === 'python' ? '# ALTERNATIVE APPROACH' : '// ALTERNATIVE APPROACH'}" comment at the top.

- alternativeApproach: REQUIRED - Object with:
  - explanation: Why this alternative approach is worth knowing
  - complexityComparison: Compare time/space complexity of both approaches. Format: "Original: O(n) time, O(1) space. Alternative: O(n log n) time, O(1) space. [Which is better and why, or if original is already optimal, explain what edge cases the alternative handles better]"
  - edgeCaseImprovements: If the original code is already optimal, suggest any edge cases it could handle better or defensive coding improvements (can be null if truly perfect)

ALWAYS INCLUDE (for both correct and buggy code):

- ifOnExam: REQUIRED - What variation a professor might test. Include a 1-2 sentence prep tip.

- difficultyScore: REQUIRED - Difficulty rating as exactly one of: "easy", "medium", or "hard"

- relatedPatterns: REQUIRED - Array of 3-5 related DSA patterns or concepts.

Return ONLY valid JSON with the required fields.`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt, 3000);
    console.log('[generateDebugAnalysis] Raw response:', response.substring(0, 200) + '...');
    const parsed = JSON.parse(response);
    
    // Check if LLM returned an error (invalid input detected)
    if (parsed.error === 'INVALID_INPUT') {
      console.log('[generateDebugAnalysis] Invalid input detected by LLM:', parsed.message);
      return {
        error: 'INVALID_INPUT',
        message: parsed.message || 'Please enter valid code to debug.'
      };
    }
    
    // Add flag for debug mode identification
    parsed.isDebugMode = true;
    
    return parsed;
  } catch (error) {
    console.error('[generateDebugAnalysis] Failed:', error);
    if (error instanceof SyntaxError) {
      console.error('[generateDebugAnalysis] Invalid JSON returned by API');
    }
    
    return {
      codeIsCorrect: false,
      theTrick: "Error analyzing code. Please try again.",
      whatCodeDoes: "Error occurred",
      exactBugLine: { lineNumber: 0, code: "Error", issue: "Error occurred" },
      bugDiagnosis: "Error analyzing code. Please try again.",
      beforeCode: args.code,
      afterCode: "# Error occurred during debugging",
      ifOnExam: "Error occurred",
      complexity: "N/A",
      difficultyScore: null,
      relatedPatterns: [],
      isDebugMode: true,
    };
  }
}

// Generate Debug Mode Trace Table & Walkthrough (on-demand follow-up)
export async function generateDebugTraceWalkthrough(args) {
  console.log('[generateDebugTraceWalkthrough] Starting');
  console.log('[generateDebugTraceWalkthrough] Args:', JSON.stringify(args, null, 2));
  
  const systemPrompt = VALIDATION_PREFIX + `You are AlgoTutor, an expert CS educator. Generate a detailed trace table and example walkthrough for the given code. This is for EXAM PREP - format everything like professors expect on written exams. Respond with valid JSON only.`;
  
  const userPrompt = `Generate a TRACE TABLE and EXAMPLE WALKTHROUGH for this ${args.language || 'python'} code.

CODE:
\`\`\`${args.language || 'python'}
${args.code}
\`\`\`

${args.problem ? `CONTEXT: ${args.problem}` : 'Analyze the code to understand what it does.'}

CRITICAL: Pick ONE specific test case first. ALL sections below MUST use this EXACT SAME test case.

REQUIRED JSON SECTIONS:

IMPORTANT FORMATTING RULES:
- The "variables" field MUST be a simple STRING showing current variable values, NOT an object
- Format variables as: "i=0, sum=0, arr=[1,2,3]" - a readable string
- The trace table should trace through the EXACT exampleInput until reaching exampleOutput
- If the code uses RECURSION: Use a SMALL test case (2-3 elements max) so the trace fits, OR show the call stack as text in the walkthrough instead of a table

- exampleInput: REQUIRED - The specific input for the test case. For recursive code, use a SMALL input (2-3 elements).

- exampleOutput: REQUIRED - The expected output for the test case

- dryRunTable: REQUIRED - Array of 4-6 objects tracing the algorithm with the EXACT input from exampleInput until reaching exampleOutput. Use these exact keys: {iteration, variables, state, action}
  CRITICAL: The "variables" field MUST be a STRING like "i=0, left=0, right=4" - NOT an object!
  Each row should show the state at that iteration using the exampleInput values.

- exampleWalkthrough: REQUIRED - Step-by-step trace using the EXACT SAME input from exampleInput. Format as a STRING with each step on a NEW LINE using \\n. For recursive code, show the call stack like:
  "Step 1: Call func([1,2,3])\\nStep 2: Recurse with func([2,3])\\nStep 3: Base case reached..."

- testCases: REQUIRED - Array of exactly 3 test case strings that verify the code works. Include at least 1 edge case. Format: ["input → expected output", ...]

- isDebugTraceWalkthrough: REQUIRED - Set to true

Return ONLY valid JSON with the required fields.`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt, 2000);
    console.log('[generateDebugTraceWalkthrough] Raw response received, length:', response.length);
    
    const parsed = JSON.parse(response);
    console.log('[generateDebugTraceWalkthrough] ✓ Successfully parsed JSON response');
    
    if (parsed.error === 'INVALID_INPUT') {
      return {
        error: 'INVALID_INPUT',
        message: parsed.message || 'Unable to generate trace table.'
      };
    }
    
    // Ensure the flag is set
    parsed.isDebugTraceWalkthrough = true;
    
    // Echo back input context so new widget instances can populate follow-up buttons
    parsed._debugContext = {
      code: args.code,
      language: args.language,
      problem: args.problem || '',
      topic: args.topic || '',
      bugInfo: args.bugInfo || ''
    };
    
    return parsed;
  } catch (error) {
    console.error('[generateDebugTraceWalkthrough] ❌ Failed:', error);
    return {
      exampleInput: "N/A",
      exampleOutput: "N/A",
      dryRunTable: [],
      exampleWalkthrough: "Error generating walkthrough. Please try again.",
      testCases: [],
      isDebugTraceWalkthrough: true,
      _debugContext: {
        code: args.code,
        language: args.language,
        problem: args.problem || '',
        topic: args.topic || '',
        bugInfo: args.bugInfo || ''
      },
    };
  }
}

// Generate Debug Mode Similar Problem (on-demand follow-up)
export async function generateDebugSimilarProblem(args) {
  console.log('[generateDebugSimilarProblem] Starting');
  console.log('[generateDebugSimilarProblem] Args:', JSON.stringify(args, null, 2));
  
  const topicRanking = args.topic ? getTopicRanking(args.topic) : 15; // Default to mid-level
  
  // Build list of allowed data structures/algorithms based on ranking
  const allowedConcepts = Object.entries(DSA_RANKINGS)
    .filter(([_, rank]) => rank <= topicRanking)
    .map(([name, _]) => name)
    .join(', ');
  
  // Dynamic blank count based on code length
  const codeLines = (args.code || '').split('\n').length;
  const requiredBlankCount = codeLines > 10 ? 3 : 2;
  console.log('[generateDebugSimilarProblem] Code lines:', codeLines, '→ Required blanks:', requiredBlankCount);
  
  // Build bug-focused instruction if bug info is provided
  let bugFocusInstruction = '';
  if (args.bugInfo) {
    bugFocusInstruction = `
**CRITICAL - BUG-FOCUSED BLANKS:**
The user previously debugged code with this issue: "${args.bugInfo}"

Your blanks MUST test the SAME TYPE of mistake/concept. For example:
- If the bug was an off-by-one error → blank out loop bounds or array indices
- If the bug was a wrong comparison operator → blank out a comparison (< vs <= vs > vs >=)
- If the bug was missing base case → blank out the base case condition or return
- If the bug was wrong data structure usage → blank out the data structure operation

The blanks should help the user practice and reinforce understanding of exactly what they got wrong.
`;
  }
  
  const systemPrompt = VALIDATION_PREFIX + `You are AlgoTutor, an expert CS educator. Generate a LeetCode-style fill-in-the-blank coding problem that is RELATED to but DIFFERENT from the given code. The problem should test the same algorithm/data structure pattern but with a different scenario or twist. Respond with valid JSON only.`;
  
  const userPrompt = `Generate a SIMILAR but DIFFERENT fill-in-the-blank problem based on this code:

ORIGINAL CODE:
\`\`\`${args.language || 'python'}
${args.code}
\`\`\`

${args.problem ? `ORIGINAL PROBLEM CONTEXT: ${args.problem}` : ''}
${args.topic ? `ALGORITHM/PATTERN: ${args.topic}` : 'Analyze the code to determine the pattern.'}
${bugFocusInstruction}

REQUIREMENTS:
1. The new problem should use the SAME algorithm/data structure pattern
2. But have a DIFFERENT scenario, twist, or variation
3. Should be a fresh, creative problem - not a copy of the original
4. Blanks should NOT be straightforward or trivial - they should test CRITICAL understanding

CRITICAL CONSTRAINT: The problem must ONLY use data structures and algorithms at or BELOW this ranking level: ${topicRanking}
ALLOWED concepts: ${allowedConcepts}
DO NOT use any advanced concepts not in the allowed list.

REQUIRED JSON SECTIONS:

- problemTitle: REQUIRED - A concise title for the problem. Example: "Two Sum" or "Valid Parentheses"

- problemDescription: REQUIRED - A clear problem description in LeetCode style. Include:
  - What the function should do
  - Input format
  - Output format
  - 2-3 example test cases showing input → output (include these IN the description text)
  - Any constraints

- codeWithBlanks: REQUIRED - ${args.language || 'Python'} code with EXACTLY ${requiredBlankCount} blanks marked as ___BLANK_1___, ___BLANK_2___${requiredBlankCount === 3 ? ', ___BLANK_3___' : ''}. 

**CRITICAL BLANK RULES:**
1. You MUST include EXACTLY ${requiredBlankCount} blanks - no more, no less
2. The number of ___BLANK_X___ placeholders in codeWithBlanks MUST EXACTLY match the number of objects in the blanks array
3. Each blank tests a DIFFERENT part of the algorithm - NO DUPLICATES
4. Blanks should test CRITICAL algorithm logic (e.g., don't blank out variable names or simple syntax)
5. When ALL blanks are filled with correct answers, the code MUST produce correct output
6. The code must be in ${args.language || 'Python'} with valid syntax
7. For TEXT INPUT blanks (where user types): The blank placeholder MUST replace the ENTIRE LINE of code, not just part of it. The user types the full line as the answer.
   CRITICAL - DO NOT leave part of the line visible and only blank part of it:
   BAD: "current = ___BLANK_1___" (partial line - user only fills "current.next", too easy)
   BAD: "current.next = ___BLANK_2___" (partial line - gives away the left side)
   GOOD: "    ___BLANK_1___" (full line blanked - user must type "current = current.next")
   GOOD: "        ___BLANK_2___" (full line blanked - user must type "current.next = ListNode(arr[index])")
   The blank should be indented to match the code's indentation level, but the ENTIRE line of code must be replaced by the blank.
   MCQ blanks can be smaller pieces of code since user selects from options.
8. For COMPOUND EXPRESSIONS with "and" or "or" between two function calls/operations: SPLIT into SEPARATE blanks!
   BAD: "___BLANK_2___" = "helper(left) and helper(right)" (too complex for one blank)
   GOOD: "___BLANK_2___ and ___BLANK_3___" where BLANK_2 = "helper(left)" and BLANK_3 = "helper(right)"
   Each recursive call or distinct operation should be its own blank.
9. TEXT INPUT BLANK CHARACTER LIMITS:
    - MINIMUM: 10 characters (no trivial blanks like "n-1", "left", "append")
    - MAXIMUM: 40 characters (anything longer MUST be split into multiple blanks)
    GOOD examples (10-40 chars): "helper(node.left)" (17), "left, right = 0, len(nums)-1" (29), "return helper(n-1) + helper(n-2)" (32)
    BAD examples: "node.left" (9 chars - TOO SHORT), "helper(a, b, c) and helper(d, e, f)" (70+ chars - TOO LONG, must split)
10. LONG LINE SPLITTING: If a single line of code is longer than 40 characters OR contains logical operators like "and"/"or"/"&&"/"||" joining two distinct operations, split that line into 2 blanks instead of 1.
    Example: \`return helper(left) and helper(right)\` becomes \`return ___BLANK_2___ and ___BLANK_3___\` where BLANK_2 = "helper(left)" and BLANK_3 = "helper(right)"
    Example: \`if left_valid and right_valid and root.val > min_val:\` becomes \`if ___BLANK_2___ and ___BLANK_3___:\` 

VERIFICATION STEP: Before outputting, COUNT the ___BLANK_X___ placeholders in your codeWithBlanks and VERIFY it equals ${requiredBlankCount}. If they don't match, FIX IT.

- blanks: REQUIRED - Array of EXACTLY ${requiredBlankCount} blank objects (must match codeWithBlanks). Format:
  [
    {
      "id": 1,
      "type": "multiple_choice",
      "placeholder": "___BLANK_1___",
      "lineContext": "the EXACT line of code containing ___BLANK_1___",
      "options": ["option1", "option2", "option3", "option4"],
      "correctAnswer": "the correct option (must be one of the 4 options)",
      "hint": "A helpful hint that guides thinking WITHOUT revealing the answer",
      "explanation": "Why this is correct - explain the algorithm logic",
      "reviewTip": "Brief tip on what pattern/concept to review (e.g., 'Review: BST property - left < root < right')"
    },
    {
      "id": 2,
      "type": "text_input",
      "placeholder": "___BLANK_2___",
      "lineContext": "the EXACT line of code containing ___BLANK_2___",
      "correctAnswer": "exact code that goes in this blank (10-40 chars)",
      "hint": "A helpful hint that guides thinking WITHOUT revealing the answer",
      "explanation": "Why this is correct - explain the algorithm logic",
      "reviewTip": "Brief tip on what pattern/concept to review"
    }${requiredBlankCount === 3 ? `,
    {
      "id": 3,
      "type": "text_input",
      "placeholder": "___BLANK_3___",
      "lineContext": "the EXACT line of code containing ___BLANK_3___",
      "correctAnswer": "exact code that goes in this blank (10-40 chars)",
      "hint": "A helpful hint",
      "explanation": "Why this is correct",
      "reviewTip": "Brief tip on what to review"
    }` : ''}
  ]
  
  **BLANK REQUIREMENTS:**
  - Blank 1: MUST be multiple_choice - test a CRITICAL decision point (e.g., comparison operator, data structure choice). Can be smaller pieces of code.
  - Blank 2${requiredBlankCount === 3 ? '-3' : ''}: MUST be text_input - MUST be SUBSTANTIAL (entire line or significant code chunk, 15+ characters). Examples of GOOD text_input blanks: "return helper(n-1) + helper(n-2)", "left, right = 0, len(nums)-1", "result.append(current[:])". Examples of BAD text_input blanks: "n-1", "left", "append" (too small!)
  - Each blank MUST test a DIFFERENT concept - DO NOT ask the same question twice
  - Each blank MUST have a hint that helps WITHOUT giving away the answer
  - Each blank MUST have a reviewTip: a brief 1-line tip (10-20 words max) pointing out what pattern/concept to review. Format: "Review: [concept] - [key insight]". Examples: "Review: Two pointers - move inward when sum too large", "Review: Recursion base case - always handle empty/null first"
  - All 4 options in multiple choice should be plausible

- fullSolution: REQUIRED - The complete code with all blanks filled in correctly. This code MUST work and produce correct output.

- whyThisTests: REQUIRED - One sentence explaining what understanding this problem tests and how it relates to the original code.

- isDebugSimilarProblem: REQUIRED - Set to true

Return ONLY valid JSON with the required fields.`;

  try {
    // Use higher temperature for variety
    const response = await callOpenAI(systemPrompt, userPrompt, 3000, 0.95);
    console.log('[generateDebugSimilarProblem] Raw response received, length:', response.length);
    
    const parsed = JSON.parse(response);
    console.log('[generateDebugSimilarProblem] ✓ Successfully parsed JSON response');
    
    if (parsed.error === 'INVALID_INPUT') {
      return {
        error: 'INVALID_INPUT',
        message: parsed.message || 'Unable to generate similar problem.'
      };
    }
    
    // POST-VALIDATION: Verify blank count matches
    if (parsed.codeWithBlanks && parsed.blanks) {
      const blankMatches = parsed.codeWithBlanks.match(/___BLANK_\d+___/g) || [];
      const codeBlankCount = blankMatches.length;
      const arrayBlankCount = parsed.blanks.length;
      
      console.log('[generateDebugSimilarProblem] Blank validation:', {
        blanksInCode: codeBlankCount,
        blanksInArray: arrayBlankCount,
        matches: blankMatches
      });
      
      if (codeBlankCount !== arrayBlankCount) {
        console.warn('[generateDebugSimilarProblem] ⚠️ BLANK COUNT MISMATCH! Code has', codeBlankCount, 'blanks, array has', arrayBlankCount);
      }
    }
    
    // Ensure the flag is set
    parsed.isDebugSimilarProblem = true;
    
    // Echo back input context so new widget instances can populate follow-up buttons
    parsed._debugContext = {
      code: args.code,
      language: args.language || 'python',
      problem: args.problem || '',
      topic: args.topic || '',
      bugInfo: args.bugInfo || ''
    };
    
    return parsed;
  } catch (error) {
    console.error('[generateDebugSimilarProblem] ❌ Failed:', error);
    return {
      problemTitle: "Error",
      problemDescription: "Error generating problem. Please try again.",
      codeWithBlanks: "# Error occurred",
      blanks: [],
      fullSolution: "# Error occurred",
      whyThisTests: "Error occurred",
      isDebugSimilarProblem: true,
      _debugContext: {
        code: args.code,
        language: args.language || 'python',
        problem: args.problem || '',
        topic: args.topic || '',
        bugInfo: args.bugInfo || ''
      },
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
  
  const userPrompt = `Generate a UNIQUE and DIFFERENT fill-in-the-blank problem for: ${args.topic}

IMPORTANT: Generate a FRESH, CREATIVE problem that is DIFFERENT from common examples. Be creative with the problem scenario and approach while still testing the core concept.

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
8. For TEXT INPUT blanks (where user types): The blank placeholder MUST replace the ENTIRE LINE of code, not just part of it. The user types the full line as the answer.
   CRITICAL - DO NOT leave part of the line visible and only blank part of it:
   BAD: "current = ___BLANK_1___" (partial line - user only fills "current.next", too easy)
   BAD: "current.next = ___BLANK_2___" (partial line - gives away the left side)
   GOOD: "    ___BLANK_1___" (full line blanked - user must type "current = current.next")
   GOOD: "        ___BLANK_2___" (full line blanked - user must type "current.next = ListNode(arr[index])")
   The blank should be indented to match the code's indentation level, but the ENTIRE line of code must be replaced by the blank.
   MCQ blanks can be smaller pieces of code since user selects from options.
9. For COMPOUND EXPRESSIONS with "and" or "or" between two function calls/operations: SPLIT into SEPARATE blanks!
   BAD: "___BLANK_2___" = "helper(left) and helper(right)" (too complex for one blank)
   GOOD: "___BLANK_2___ and ___BLANK_3___" where BLANK_2 = "helper(left)" and BLANK_3 = "helper(right)"
   Each recursive call or distinct operation should be its own blank.
10. TEXT INPUT BLANK CHARACTER LIMITS:
    - MINIMUM: 10 characters (no trivial blanks like "n-1", "left", "append")
    - MAXIMUM: 40 characters (anything longer MUST be split into multiple blanks)
    GOOD examples (10-40 chars): "helper(node.left)" (17), "left, right = 0, len(nums)-1" (29), "return helper(n-1) + helper(n-2)" (32)
    BAD examples: "node.left" (9 chars - TOO SHORT), "helper(a, b, c) and helper(d, e, f)" (70+ chars - TOO LONG, must split)
11. LONG LINE SPLITTING: If a single line of code is longer than 40 characters OR contains logical operators like "and"/"or"/"&&"/"||" joining two distinct operations, split that line into 2 blanks instead of 1.
    Example: \`return helper(left) and helper(right)\` becomes \`return ___BLANK_2___ and ___BLANK_3___\` where BLANK_2 = "helper(left)" and BLANK_3 = "helper(right)"
    Example: \`if left_valid and right_valid and root.val > min_val:\` becomes \`if ___BLANK_2___ and ___BLANK_3___:\`

VERIFICATION STEP: Before outputting, COUNT the ___BLANK_X___ placeholders in your codeWithBlanks and VERIFY it matches blanks.length. If they don't match, FIX IT.

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
      "explanation": "Why this is correct - explain the algorithm logic",
      "reviewTip": "Brief tip on what pattern/concept to review (e.g., 'Review: BST property - left < root < right')"
    },
    {
      "id": 2,
      "type": "text_input",
      "placeholder": "___BLANK_2___",
      "lineContext": "the EXACT line of code containing ___BLANK_2___",
      "correctAnswer": "exact code that goes in this blank",
      "hint": "A helpful hint that guides thinking WITHOUT revealing the answer",
      "explanation": "Why this is correct - explain the algorithm logic",
      "reviewTip": "Brief tip on what pattern/concept to review"
    }
  ]
  
  **BLANK REQUIREMENTS:**
  - Blank 1: MUST be multiple_choice - test a CRITICAL decision point (e.g., comparison operator, data structure choice). Can be smaller pieces of code.
  - Blank 2-3: MUST be text_input - MUST be SUBSTANTIAL (entire line or significant code chunk, 15+ characters). Examples of GOOD text_input blanks: "return helper(n-1) + helper(n-2)", "left, right = 0, len(nums)-1", "result.append(current[:])". Examples of BAD text_input blanks: "n-1", "left", "append" (too small!)
  - Each blank MUST test a DIFFERENT concept - DO NOT ask the same question twice
  - Each blank MUST have a hint that helps WITHOUT giving away the answer
  - Each blank MUST have a reviewTip: a brief 1-line tip (10-20 words max) pointing out what pattern/concept to review. Format: "Review: [concept] - [key insight]". Examples: "Review: Two pointers - move inward when sum too large", "Review: Recursion base case - always handle empty/null first"
  - All 4 options in multiple choice should be plausible

- fullSolution: REQUIRED - The complete code with all blanks filled in correctly. This code MUST work and produce correct output.

- whyThisTests: REQUIRED - One sentence explaining what understanding this problem tests.

Return ONLY valid JSON with the required fields. Do NOT include a separate testCases field.`;

  try {
    // Use higher temperature (0.95) for variety in problem generation
    const response = await callOpenAI(systemPrompt, userPrompt, 3000, 0.95);
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
    
    // POST-VALIDATION: Verify blank count matches
    if (parsed.codeWithBlanks && parsed.blanks) {
      const blankMatches = parsed.codeWithBlanks.match(/___BLANK_\d+___/g) || [];
      const codeBlankCount = blankMatches.length;
      const arrayBlankCount = parsed.blanks.length;
      
      console.log('[generateRealWorldExample] Blank validation:', {
        blanksInCode: codeBlankCount,
        blanksInArray: arrayBlankCount,
        matches: blankMatches
      });
      
      if (codeBlankCount !== arrayBlankCount) {
        console.warn('[generateRealWorldExample] ⚠️ BLANK COUNT MISMATCH! Code has', codeBlankCount, 'blanks, array has', arrayBlankCount);
        // Log details for debugging but still return the response
        // The UI will handle any display issues
      }
      
      // Validate character limits for text_input blanks
      parsed.blanks.forEach((blank, idx) => {
        if (blank.type === 'text_input' && blank.correctAnswer) {
          const answerLength = blank.correctAnswer.length;
          if (answerLength < 10) {
            console.warn(`[generateRealWorldExample] ⚠️ Blank ${idx + 1} answer too short (${answerLength} chars): "${blank.correctAnswer}"`);
          } else if (answerLength > 40) {
            console.warn(`[generateRealWorldExample] ⚠️ Blank ${idx + 1} answer too long (${answerLength} chars): "${blank.correctAnswer}"`);
          }
        }
      });
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

// Generate Build Mode Trace Table & Walkthrough (on-demand follow-up)
export async function generateBuildTraceWalkthrough(args) {
  const isEdgeCase = args.isEdgeCase || false;
  console.log('[generateBuildTraceWalkthrough] Starting, isEdgeCase:', isEdgeCase);
  console.log('[generateBuildTraceWalkthrough] Args:', JSON.stringify(args, null, 2));
  
  const caseInstruction = isEdgeCase 
    ? `USE AN EDGE CASE:
- Use an EDGE CASE (empty input, single element, maximum values, boundary conditions)
- If constraints were detected, use them to generate appropriate edge cases
- Show how the algorithm handles the edge case correctly
- Explain WHY this edge case is important and what could go wrong`
    : `USE A NORMAL CASE:
- Use a TYPICAL/NORMAL test case (not an edge case)
- If test cases were detected in the problem, pick one that is NOT an edge case
- If no test cases detected, generate a normal-sized test case that demonstrates the main algorithm flow
- Show 4-6 step trace with the algorithm working as expected`;
  
  const systemPrompt = VALIDATION_PREFIX + `You are AlgoTutor, an expert CS educator. Generate a detailed trace table and example walkthrough for the given code solution. This is for EXAM PREP - format everything like professors expect on written exams. Respond with valid JSON only.`;
  
  const userPrompt = `Generate a TRACE TABLE and EXAMPLE WALKTHROUGH for this code solution.

PROBLEM: ${args.problem || 'Analyze the code to determine the problem'}

CODE:
\`\`\`
${args.code}
\`\`\`

${args.testCases ? `DETECTED TEST CASES FROM PROBLEM:\n${args.testCases}\n` : ''}
${args.constraints ? `DETECTED CONSTRAINTS:\n${args.constraints}\n` : ''}

${caseInstruction}

REQUIRED JSON SECTIONS:

IMPORTANT FORMATTING RULES:
- The "variables" field MUST be a simple STRING showing current variable values, NOT an object
- Format variables as: "i=0, sum=0, arr=[1,2,3]" - a readable string
- The trace table should trace through the EXACT exampleInput until reaching exampleOutput
- If the code uses RECURSION: Use a SMALL test case (2-3 elements max) so the trace fits, OR show the call stack as text in the walkthrough instead of a table

- exampleInput: REQUIRED - The specific input for the test case. For recursive code, use a SMALL input (2-3 elements).

- exampleOutput: REQUIRED - The expected output for the test case

- dryRunTable: REQUIRED - Array of 4-6 objects tracing the algorithm with the EXACT input from exampleInput until reaching exampleOutput. Use these exact keys: {iteration, variables, state, action}
  CRITICAL: The "variables" field MUST be a STRING like "i=0, left=0, right=4" - NOT an object!
  Each row should show the state at that iteration using the exampleInput values.

- exampleWalkthrough: REQUIRED - Step-by-step trace using the EXACT SAME input from exampleInput. Format as a STRING with each step on a NEW LINE using \\n. For recursive code, show the call stack like:
  "Step 1: Call func([1,2,3])\\nStep 2: Recurse with func([2,3])\\nStep 3: Base case reached..."

- isBuildTraceWalkthrough: REQUIRED - Set to true

Return ONLY valid JSON with the required fields.`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt, 2000);
    console.log('[generateBuildTraceWalkthrough] Raw response received, length:', response.length);
    
    const parsed = JSON.parse(response);
    console.log('[generateBuildTraceWalkthrough] ✓ Successfully parsed JSON response');
    
    if (parsed.error === 'INVALID_INPUT') {
      return {
        error: 'INVALID_INPUT',
        message: parsed.message || 'Unable to generate trace table.'
      };
    }
    
    // Ensure the flag is set
    parsed.isBuildTraceWalkthrough = true;
    
    return parsed;
  } catch (error) {
    console.error('[generateBuildTraceWalkthrough] ❌ Failed:', error);
    return {
      exampleInput: "N/A",
      exampleOutput: "N/A",
      dryRunTable: [],
      exampleWalkthrough: "Error generating walkthrough. Please try again.",
      isBuildTraceWalkthrough: true,
    };
  }
}

// Generate Build Mode Explain Simple (on-demand follow-up)
export async function generateBuildExplainSimple(args) {
  console.log('[generateBuildExplainSimple] Starting');
  console.log('[generateBuildExplainSimple] Args:', JSON.stringify(args, null, 2));
  
  // Check if there's previous context to explain more clearly
  const hasContext = args.previousContext && args.previousContext.length > 0;
  
  const contextInstruction = hasContext 
    ? `The user has already seen some explanation. Now explain MORE CLEARLY with:
- Even MORE detailed step-by-step breakdown
- Explain WHY each step is needed, not just what
- Use analogies and examples where helpful
- Slower pace with more context
- Include common mistakes students make`
    : `EXPLAIN IN SIMPLER TERMS:
- Explain the code step-by-step in simpler technical terms
- Break down the pattern and approach
- Include a skeleton with # comments (NOT TODO)
- Use clear language but standard CS terminology is OK`;
  
  const systemPrompt = VALIDATION_PREFIX + `You are AlgoTutor, an expert CS educator known for making complex concepts simple. Your job is to explain code solutions clearly with step-by-step breakdowns. Use clear language and avoid jargon. Respond with valid JSON only.`;
  
  const userPrompt = `Explain this code solution clearly and simply.

PROBLEM: ${args.problem || 'Analyze the code to determine the problem'}

CODE:
\`\`\`
${args.code}
\`\`\`

${hasContext ? `PREVIOUS CONTEXT (explain this more clearly):\n${args.previousContext}\n` : ''}

${contextInstruction}

REQUIRED JSON SECTIONS:

- detailedExplanation: REQUIRED - Step-by-step explanation of the code. CRITICAL FORMATTING: Each numbered step MUST be on its own line. Use \\n between EVERY step. Format like:
  "1. First step explanation\\n\\n2. Second step explanation\\n\\n3. Third step explanation"
  Add extra spacing between steps for readability. Break down each part clearly with WHY it's needed.

- patternExplanation: REQUIRED - How to recognize and approach this type of problem. Include pattern recognition tips.

- skeleton: REQUIRED - The code skeleton with # comments (NOT TODO) explaining what each part should do. Use "# Description of what goes here" format. Example:
  def function_name(params):
      # Initialize the result variable
      # Loop through the input
      # Check the condition and update result
      # Return the final result
  Do NOT use "TODO" anywhere in the skeleton.

- keyInsights: REQUIRED - Array of 3-5 key insights or "aha moments" for understanding this solution.

- commonMistakes: REQUIRED - Array of 2-3 common mistakes students make with this pattern and how to avoid them.

- isBuildExplainSimple: REQUIRED - Set to true

Return ONLY valid JSON with the required fields.`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt, 2500);
    console.log('[generateBuildExplainSimple] Raw response received, length:', response.length);
    
    const parsed = JSON.parse(response);
    console.log('[generateBuildExplainSimple] ✓ Successfully parsed JSON response');
    
    if (parsed.error === 'INVALID_INPUT') {
      return {
        error: 'INVALID_INPUT',
        message: parsed.message || 'Unable to generate explanation.'
      };
    }
    
    // Ensure the flag is set
    parsed.isBuildExplainSimple = true;
    
    return parsed;
  } catch (error) {
    console.error('[generateBuildExplainSimple] ❌ Failed:', error);
    return {
      detailedExplanation: "Error generating explanation. Please try again.",
      patternExplanation: "Error occurred",
      skeleton: "# Error occurred",
      keyInsights: [],
      isBuildExplainSimple: true,
    };
  }
}