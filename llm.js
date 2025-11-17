import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = 'gpt-4o-mini'; // Cheapest GPT-4 model (~$0.00015/1K input tokens)

// Helper function to call OpenAI
async function callOpenAI(systemPrompt, userPrompt, maxTokens = 2048) {
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: maxTokens,
      response_format: { type: "json_object" }, // Force JSON mode for valid output
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
    });
    
    let content = completion.choices[0].message.content;
    
    // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    return content;
  } catch (error) {
    console.error('[OpenAI API] Error:', error);
    throw new Error(`OpenAI API failed: ${error.message}`);
  }
}

// Generate Learn Mode content
export async function generateLearnContent(args) {
  const systemPrompt = `You are AlgoTutor, an expert CS educator. Generate clear, educational content about data structures and algorithms. You must respond with valid JSON only.`;
  
  const userPrompt = `Generate educational content for: ${args.topic}
Difficulty: ${args.difficulty}
Depth: ${args.depth} (tiny=5 steps, normal=7-10, full=10-15)
Example size: ${args.exampleSize}

Provide a JSON response with these fields:
- pattern: 1-2 sentences identifying the algorithm pattern
- stepByStep: Numbered explanation (use \\n for line breaks)
- code: Working Python code (5-15 lines, minimal style, no fancy syntax)
${args.showDryRun ? '- dryRunTable: Array of {step, variable, value, action} objects showing execution' : ''}
${args.showPaperVersion ? '- paperVersion: Array of 3-5 interview tips' : ''}
${args.showEdgeCases ? '- edgeCases: Array of 3 specific edge cases' : ''}

Return ONLY valid JSON.`;

  try {
    const response = await callOpenAI(systemPrompt, userPrompt);
    console.log('[generateLearnContent] Raw response:', response.substring(0, 200) + '...');
    return JSON.parse(response);
  } catch (error) {
    console.error('[generateLearnContent] Failed:', error);
    if (error instanceof SyntaxError) {
      console.error('[generateLearnContent] Invalid JSON returned by API');
    }
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
  const systemPrompt = `You are AlgoTutor, an expert problem solver. Generate complete coding solutions. You must respond with valid JSON only.`;
  
  const userPrompt = `Solve this problem: ${args.problem}
Language: ${args.language}
Minimal code: ${args.minimalCode}
Skeleton only: ${args.skeletonOnly}
Allow recursion: ${args.allowRecursion}

Provide a JSON response with:
- pattern: Problem pattern (1-2 sentences)
- stepByStep: Numbered solution logic (use \\n for line breaks), 5-10 steps
- code: ${args.skeletonOnly ? 'Function signature with TODO comments' : 'Full working solution'} in ${args.language}
${args.includeDryRun ? '- dryRunTable: Array of {step, state, action} objects' : ''}
- paperVersion: Array of 4-6 interview steps
- complexity: Time and space complexity analysis

Return ONLY valid JSON.`;

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
  const systemPrompt = `You are AlgoTutor, an expert code debugger. Identify bugs and provide fixes. You must respond with valid JSON only.`;
  
  const userPrompt = `Debug this ${args.language} code:
\`\`\`
${args.code}
\`\`\`

${args.problemDescription ? `Problem: ${args.problemDescription}` : ''}

Provide a JSON response with:
- bugDiagnosis: Detailed analysis with problem type, location, and explanation (use \\n for line breaks)
- beforeCode: Original code with "# BUG HERE" or "// BUG HERE" comment on problematic line
- afterCode: Fixed code with "# FIXED" or "// FIXED" comment on corrected line
${args.generateTests ? '- testCases: Array of 3 test case strings' : ''}
${args.showEdgeWarnings ? '- edgeCases: Array of 3 edge case warnings' : ''}

Return ONLY valid JSON.`;

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

