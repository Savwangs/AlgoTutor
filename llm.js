import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = 'gpt-4o-mini'; // Cheapest GPT-4 model (~$0.00015/1K input tokens)

// Helper function to call OpenAI
async function callOpenAI(systemPrompt, userPrompt, maxTokens = 1024) {
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

// Generate Learn Mode content
export async function generateLearnContent(args) {
  console.log('[generateLearnContent] Starting content generation for:', args.topic);
  console.log('[generateLearnContent] Args:', JSON.stringify(args, null, 2));
  
  const systemPrompt = `You are AlgoTutor, an expert CS educator. Generate clear, educational content about data structures and algorithms. You MUST follow the difficulty, depth, and content settings exactly as specified. Respond with valid JSON only.`;
  
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
  
  const userPrompt = `Generate educational content for: ${args.topic}

DIFFICULTY LEVEL: ${args.difficulty}
${difficultyInstruction}

DEPTH: ${args.depth}
${depthInstruction}

EXAMPLE SIZE: ${args.exampleSize}
${exampleInstruction}

REQUIRED JSON SECTIONS (include ONLY these fields):
- pattern: REQUIRED - 1-2 sentences identifying the algorithm pattern
- stepByStep: REQUIRED - Numbered explanation (use \\n for line breaks)
- code: REQUIRED - Working Python code (5-15 lines, minimal style, no fancy syntax)
${args.showDryRun ? '- dryRunTable: REQUIRED - Array of {step, variable, value, action} objects showing execution trace' : '- dryRunTable: DO NOT INCLUDE THIS FIELD'}
${args.showPaperVersion ? '- paperVersion: REQUIRED - Array of 3-5 interview tips for solving on paper' : '- paperVersion: DO NOT INCLUDE THIS FIELD'}
${args.showEdgeCases ? '- edgeCases: REQUIRED - Array of 3 specific edge cases to consider' : '- edgeCases: DO NOT INCLUDE THIS FIELD'}

Return ONLY valid JSON with the required fields. Do not include fields marked as "DO NOT INCLUDE".`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt);
    console.log('[generateLearnContent] Raw response received, length:', response.length);
    
    const parsed = JSON.parse(response);
    console.log('[generateLearnContent] ✓ Successfully parsed JSON response');
    console.log('[generateLearnContent] Response keys:', Object.keys(parsed));
    
    return parsed;
  } catch (error) {
    console.error('[generateLearnContent] ❌ Failed:', error);
    if (error instanceof SyntaxError) {
      console.error('[generateLearnContent] Invalid JSON returned by API');
      console.error('[generateLearnContent] Raw response that failed to parse:', error.message);
    }
    
    // Return error fallback
    return {
      pattern: "Error generating content. Please try again.",
      stepByStep: "Content generation failed.",
      code: "# Error occurred",
      dryRunTable: args.showDryRun ? [] : null,
      paperVersion: args.showPaperVersion ? [] : null,
      edgeCases: args.showEdgeCases ? [] : null,
    };
  }
}

// Generate Build Mode solution
export async function generateBuildSolution(args) {
  const systemPrompt = `You are AlgoTutor, an expert problem solver. Generate coding solutions following the exact constraints specified. You MUST follow the code style, recursion, and content settings exactly as specified. Respond with valid JSON only.`;
  
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
    recursionInstruction = 'Recursion IS allowed. Use recursive approach if it provides a cleaner or more elegant solution.';
  } else {
    recursionInstruction = 'DO NOT use recursion. Use ONLY iterative approaches (loops, stacks, queues). No recursive function calls allowed.';
  }
  
  const userPrompt = `Solve this problem: ${args.problem}

LANGUAGE: ${args.language}
Write all code in ${args.language}.

CODE STYLE CONSTRAINTS:
${codeStyleInstruction}

SKELETON VS FULL SOLUTION:
${skeletonInstruction}

RECURSION CONSTRAINT:
${recursionInstruction}

REQUIRED JSON SECTIONS (include ONLY these fields):
- pattern: REQUIRED - Problem pattern identification (1-2 sentences)
- stepByStep: REQUIRED - Numbered solution logic (use \\n for line breaks), 5-10 steps
- code: REQUIRED - ${args.skeletonOnly ? 'Function skeleton with TODO comments only, NO implementation' : 'Full working solution'} in ${args.language}
${args.includeDryRun ? '- dryRunTable: REQUIRED - Array of {step, state, action} objects showing execution trace' : '- dryRunTable: DO NOT INCLUDE THIS FIELD'}
- paperVersion: REQUIRED - Array of 4-6 steps for solving on paper in an interview
- complexity: REQUIRED - Time and space complexity analysis (e.g., "O(n) time, O(1) space")

Return ONLY valid JSON with the required fields. Do not include fields marked as "DO NOT INCLUDE".`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt);
    console.log('[generateBuildSolution] Raw response:', response.substring(0, 200) + '...');
    return JSON.parse(response);
  } catch (error) {
    console.error('[generateBuildSolution] Failed:', error);
    if (error instanceof SyntaxError) {
      console.error('[generateBuildSolution] Invalid JSON returned by API');
    }
    return {
      pattern: "Error generating solution. Please try again.",
      stepByStep: "Solution generation failed.",
      code: "# Error occurred",
      dryRunTable: args.includeDryRun ? [] : null,
      paperVersion: ["Error occurred"],
      complexity: "N/A",
    };
  }
}

// Generate Debug Mode analysis
export async function generateDebugAnalysis(args) {
  const systemPrompt = `You are AlgoTutor, an expert code debugger. Identify bugs and provide fixes. You MUST follow the content settings exactly as specified. Respond with valid JSON only.`;
  
  const userPrompt = `Debug this ${args.language} code:
\`\`\`${args.language}
${args.code}
\`\`\`

${args.problemDescription ? `PROBLEM DESCRIPTION: ${args.problemDescription}` : 'No problem description provided. Analyze the code for common bugs.'}

REQUIRED JSON SECTIONS (include ONLY these fields):
- bugDiagnosis: REQUIRED - Detailed analysis with problem type, location, and explanation (use \\n for line breaks). Be specific about what's wrong and why.
- beforeCode: REQUIRED - The original code with "${args.language === 'python' ? '# BUG HERE' : '// BUG HERE'}" comment on the problematic line(s)
- afterCode: REQUIRED - The fixed code with "${args.language === 'python' ? '# FIXED' : '// FIXED'}" comment on the corrected line(s)
${args.generateTests ? '- testCases: REQUIRED - Array of exactly 3 test case strings that verify the fix works' : '- testCases: DO NOT INCLUDE THIS FIELD'}
${args.showEdgeWarnings ? '- edgeCases: REQUIRED - Array of exactly 3 edge case warnings the user should be aware of' : '- edgeCases: DO NOT INCLUDE THIS FIELD'}

Return ONLY valid JSON with the required fields. Do not include fields marked as "DO NOT INCLUDE".`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt);
    console.log('[generateDebugAnalysis] Raw response:', response.substring(0, 200) + '...');
    return JSON.parse(response);
  } catch (error) {
    console.error('[generateDebugAnalysis] Failed:', error);
    if (error instanceof SyntaxError) {
      console.error('[generateDebugAnalysis] Invalid JSON returned by API');
    }
    return {
      bugDiagnosis: "Error analyzing code. Please try again.",
      beforeCode: args.code,
      afterCode: "# Error occurred during debugging",
      testCases: args.generateTests ? [] : null,
      edgeCases: args.showEdgeWarnings ? [] : null,
    };
  }
}

