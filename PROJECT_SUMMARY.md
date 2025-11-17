# 🚀 AlgoTutor - Complete Project Summary

## Overview

**AlgoTutor** is a ChatGPT App built with the OpenAI Apps SDK and MCP (Model Context Protocol) that helps users learn Data Structures & Algorithms in their preferred learning style: small steps, minimal code, dry-runs, and clear explanations.

### Key Features
- **📚 Learn Mode**: Explains any DSA topic with customizable difficulty and depth
- **🔨 Build Mode**: Generates coding solutions with step-by-step logic
- **🐛 Debug Mode**: Diagnoses bugs line-by-line with fixes and test cases

---

## Architecture

### Technology Stack
- **Backend**: Node.js (ES Modules)
- **MCP SDK**: @modelcontextprotocol/sdk v1.0.0
- **Validation**: Zod v3.23.8
- **Transport**: StreamableHTTPServerTransport
- **Frontend**: Vanilla JavaScript + HTML5 + CSS3
- **State Management**: OpenAI Skybridge protocol

### Components

#### 1. MCP Server (`server.js`)
- Hosts three main tools: `learn_mode`, `build_mode`, `debug_mode`
- Registers widget resource at `ui://widget/algo-tutor.html`
- Handles HTTP requests with CORS support
- Manages in-memory session storage
- Validates inputs with Zod schemas

#### 2. Interactive Widget (`public/algo-tutor.html`)
- Mode selector (Learn/Build/Debug)
- Dynamic input forms with toggles
- Structured output panels (Pattern, Code, Dry-Run, etc.)
- Real-time state sync with ChatGPT
- Dark-themed, responsive UI

#### 3. Tool Definitions

**learn_mode**
- Input: topic, difficulty, depth, exampleSize, toggles
- Output: pattern, stepByStep, code, dryRunTable, paperVersion, edgeCases

**build_mode**
- Input: problem, language, allowRecursion, skeletonOnly, includeDryRun, minimalCode
- Output: pattern, stepByStep, code, dryRunTable, paperVersion, complexity

**debug_mode**
- Input: code, inputSample, language, generateTests, showEdgeWarnings
- Output: bugDiagnosis, beforeCode, afterCode, testCases, edgeCases

---

## File Structure

```
algo-tutor/
├── server.js                              # MCP server with 3 tools
├── package.json                           # Dependencies & metadata
├── .gitignore                            # Git ignore patterns
├── .env.example                          # Environment variable template
│
├── public/
│   └── algo-tutor.html                   # Interactive widget UI
│
├── examples/
│   ├── learn-mode-binary-search.json     # Learn Mode example
│   ├── build-mode-two-sum.json           # Build Mode example
│   └── debug-mode-off-by-one.json        # Debug Mode example
│
├── README.md                             # Main documentation
├── QUICKSTART.md                         # Getting started guide
├── DEPLOYMENT.md                         # Production deployment guide
├── CHANGELOG.md                          # Version history
└── PROJECT_SUMMARY.md                    # This file
```

---

## Core Design Philosophy

AlgoTutor is built around these learning principles:

1. **Small Steps** - Never overwhelming, always digestible
2. **Minimal Code** - No list comprehensions, no abstraction
3. **Dry-Runs** - See exactly what happens at each step
4. **Examples First** - Always show concrete examples
5. **Paper-Friendly** - What to write during interviews
6. **Clear Language** - Spartan English, no jargon
7. **Edge Cases** - Cover the tricky scenarios

---

## Tool Workflows

### Learn Mode Workflow

```
User in ChatGPT: "Use AlgoTutor to explain BFS with dumb-it-down difficulty"
     ↓
ChatGPT calls: learn_mode({ topic: "BFS", difficulty: "dumb-it-down", ... })
     ↓
Server creates session, returns tool output
     ↓
Widget receives state update via openai:set_globals
     ↓
Widget renders structured blocks:
  - Pattern Detection
  - Step-by-Step Reasoning
  - Code Solution
  - Dry-Run Table
  - Paper Version
  - Edge Cases
```

### Build Mode Workflow

```
User in ChatGPT: "Use AlgoTutor to solve 'Two Sum' in Python with minimal code"
     ↓
ChatGPT calls: build_mode({ problem: "Two Sum...", language: "python", ... })
     ↓
Server generates solution structure
     ↓
Widget displays:
  - Pattern identification (hash map)
  - Step-by-step logic
  - Minimal Python code
  - Dry-run with example
  - Complexity analysis
```

### Debug Mode Workflow

```
User in ChatGPT: "Use AlgoTutor to debug: [paste code]"
     ↓
ChatGPT calls: debug_mode({ code: "...", language: "python", ... })
     ↓
Server analyzes code
     ↓
Widget shows:
  - Bug classification
  - Exact line with error
  - Before/After code
  - Test cases
  - Edge case warnings
```

---

## ChatGPT Integration

### Model Instructions (Embedded in Tools)

Each tool has `openai/instruction` metadata that guides ChatGPT on:
- When to call the tool
- What outputs to generate
- How to structure the response
- Where to place detailed content (widget vs. chat)

### Output Templates

All tools use `openai/outputTemplate: "ui://widget/algo-tutor.html"` to:
- Link tool responses to the widget
- Trigger widget re-rendering on state updates
- Persist state across conversation turns

### State Synchronization

```javascript
// Server sends state
return {
  state: "update",
  content: [...],
  toolOutput: {
    mode: "learn",
    outputs: { ... }
  }
}

// Widget receives state
window.addEventListener("openai:set_globals", (ev) => {
  currentState = ev.detail.globals.toolOutput;
  renderOutputs(currentState.outputs);
});
```

---

## Key Implementation Details

### Input Validation

Using Zod schemas:
```javascript
const learnModeInputSchema = z.object({
  topic: z.string().min(1),
  difficulty: z.enum(["basic", "normal", "dumb-it-down"]),
  depth: z.enum(["tiny", "normal", "full"]),
  // ...
});
```

### Session Management

```javascript
let sessions = [];
let nextId = 1;

// Create session
const session = {
  id: `session-${nextId++}`,
  mode: "learn",
  timestamp: new Date().toISOString(),
  input: args,
};
sessions.push(session);
```

### Widget-to-Tool Communication

```javascript
// Call tool from widget
const callToolFromWidget = async (name, args) => {
  if (window.openai?.tools?.call) {
    return await window.openai.tools.call({ name, arguments: args });
  }
  throw new Error("OpenAI API not available");
};

// Usage
await callToolFromWidget("learn_mode", {
  topic: "binary search",
  difficulty: "normal",
  // ...
});
```

---

## Customization Points

### Adding New Modes

1. Define schema in `server.js`:
   ```javascript
   const newModeInputSchema = z.object({ ... });
   ```

2. Register tool:
   ```javascript
   server.registerTool("new_mode", { ... }, async (args) => { ... });
   ```

3. Add UI in `algo-tutor.html`:
   ```html
   <form id="new-mode-form" class="mode-content">
     <!-- inputs -->
   </form>
   ```

4. Handle form submission:
   ```javascript
   modeForms.newMode.addEventListener("submit", async (e) => {
     await callToolFromWidget("new_mode", payload);
   });
   ```

### Customizing Output Blocks

Edit `renderOutputs()` in `algo-tutor.html`:
```javascript
if (outputs.yourNewField) {
  blocks.push({
    title: "Your New Section",
    content: outputs.yourNewField,
    type: "text", // or "code", "table", "list"
  });
}
```

### Styling Changes

CSS variables in `:root` (line 14-32 in `algo-tutor.html`):
```css
--accent: #3b82f6;        /* Primary color */
--bg-panel: #0f1629;      /* Panel background */
--text-main: #e5e7eb;     /* Main text */
```

---

## Testing

### Local Testing

1. Start server:
   ```bash
   npm start
   ```

2. Check health:
   ```bash
   curl http://localhost:8787/
   ```

3. Test MCP endpoint:
   ```bash
   curl -X OPTIONS http://localhost:8787/mcp
   ```

### ChatGPT Testing

1. Use ngrok:
   ```bash
   ngrok http 8787
   ```

2. Create connector in ChatGPT:
   - Settings → Apps & Connectors → Create
   - URL: `https://your-ngrok-url.ngrok.io/mcp`

3. Test queries:
   ```
   Use AlgoTutor Learn Mode to explain quicksort
   Use AlgoTutor Build Mode to solve "Valid Parentheses" in Python
   Use AlgoTutor Debug Mode to find bugs in [code]
   ```

---

## Performance Considerations

### Current Implementation
- **In-memory sessions**: Fast but not persistent
- **Synchronous tool handlers**: Simple but could block
- **No caching**: Every request generates fresh output

### Optimization Opportunities
1. **Add Redis** for session persistence
2. **Implement caching** for common topics (e.g., "binary search")
3. **Use async/await** throughout
4. **Add request queuing** for high traffic
5. **Implement rate limiting** per user

---

## Security Considerations

### Current Implementation
- ✅ Input validation with Zod
- ✅ CORS enabled (allow all for development)
- ✅ No sensitive data storage
- ❌ No authentication
- ❌ No rate limiting
- ❌ No request logging

### Production Recommendations
1. **Restrict CORS** to ChatGPT domains only
2. **Add rate limiting** (express-rate-limit)
3. **Implement logging** (Winston, Pino)
4. **Add authentication** if exposing publicly
5. **Sanitize outputs** to prevent XSS
6. **Use environment variables** for secrets

---

## Troubleshooting Common Issues

### Widget not showing in ChatGPT
- ✅ Check server is running (`npm start`)
- ✅ Verify connector URL ends with `/mcp`
- ✅ Enable Developer Mode in ChatGPT settings
- ✅ Check browser console for errors

### Tool outputs not appearing
- ✅ Check widget is rendering (inspect element)
- ✅ Look for state updates in console
- ✅ Verify tool response includes `toolOutput` field
- ✅ Check ChatGPT selected AlgoTutor from tools menu

### CORS errors
- ✅ Verify CORS headers in server.js
- ✅ Check browser network tab for OPTIONS request
- ✅ Ensure server responds with 204 to preflight

### Server crashes
- ✅ Check Node.js version (20+ recommended)
- ✅ Verify all dependencies installed (`npm install`)
- ✅ Check server logs for stack traces
- ✅ Ensure port 8787 is available

---

## Future Roadmap

### v1.1.0 (Next Release)
- [ ] Persistent session storage (Redis)
- [ ] Rate limiting
- [ ] Request logging
- [ ] Export dry-run tables as images
- [ ] Support for JavaScript, Go, Rust

### v1.2.0
- [ ] Interactive code editor in widget
- [ ] Animated visualizations
- [ ] Practice problem generator
- [ ] Progress tracking

### v2.0.0 (Long-term)
- [ ] Collaborative learning
- [ ] Mobile app
- [ ] VSCode extension
- [ ] Integration with LeetCode/HackerRank

---

## Contributing

We welcome contributions! Areas that need help:
- **Documentation**: More examples, tutorials
- **Languages**: Add support for Go, Rust, TypeScript
- **Visualizations**: Algorithm animations
- **Testing**: Unit tests, integration tests
- **Performance**: Caching, optimization

See CONTRIBUTING.md for guidelines.

---

## License

MIT License - See LICENSE file for details.

---

## Credits

Built with:
- [OpenAI Apps SDK](https://developers.openai.com/apps-sdk)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- [Zod](https://zod.dev) for validation
- Inspired by learners who prefer small steps over giant leaps

---

## Support

- **Documentation**: See README.md, QUICKSTART.md, DEPLOYMENT.md
- **Examples**: Check `examples/` directory
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: support@algotutor.dev

---

**Built with ❤️ for learners who want clarity over complexity.**

Last Updated: November 16, 2025
Version: 1.0.0

