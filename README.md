# 🚀 AlgoTutor

**Learn Data Structures & Algorithms in small steps with minimal code, dry-runs, and clear explanations.**

AlgoTutor is a ChatGPT App built with the GPT Apps SDK that helps you master DSA concepts through:
- Small, slow steps (no overwhelming explanations)
- Minimal code (no abstraction, no fancy syntax)
- Dry-run tables (see exactly what happens at each step)
- Clear examples and edge cases
- "What to write on paper" summaries

## 🎯 Features

### 📚 Learn Mode
Explains any DSA topic (BFS, heaps, linked lists, DP, etc.) with:
- 5-10 line simple English explanation
- One short code sample
- Dry-run table
- Example walkthrough
- 3 edge cases
- Paper summary

**Inputs:**
- Topic (e.g., "binary search", "DFS", "merge sort")
- Difficulty: Basic / Normal / Dumb-It-Down
- Depth: Tiny (5 steps) / Normal / Full Walkthrough
- Example size: Small / Medium
- Toggles: Show edge cases, Show dry-run, Show paper version

### 🔨 Build Mode
Generates solutions for coding problems with:
- Pattern identification
- Step-by-step logic
- Minimal code solution (or skeleton only)
- Dry-run demonstration
- Time & space complexity
- Paper version

**Inputs:**
- Problem description
- Language: Python / Java / C++
- Toggles: Allow recursion, Skeleton only, Include dry-run, Minimal code

### 🐛 Debug Mode
Diagnoses bugs in your code with:
- Problem classification (logic error, off-by-one, infinite loop, etc.)
- Exact line causing the bug
- Clear explanation in small steps
- Before + After code
- 3 test cases to confirm fix
- Edge case warnings

**Inputs:**
- Code snippet
- Input sample (optional)
- Language: Python / Java / C++
- Toggles: Generate tests, Show edge warnings

## 🛠️ Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
```

The server runs on `http://localhost:8787/mcp` by default.

### 3. Connect to ChatGPT

1. Open ChatGPT Settings → Apps & Connectors → Create
2. Name: **AlgoTutor**
3. Description: **Learn DSA in small steps**
4. MCP Server URL: Your public URL (use ngrok for local testing)
5. Click **Create**

### 4. Enable Developer Mode

- Settings → Apps & Connectors → Advanced Settings
- Toggle **Developer Mode** on

### 5. Test the App

Open a new chat, select **AlgoTutor** from the tools menu, and try:

```
Learn Mode: Explain binary search with dry-run
Build Mode: Solve "Two Sum" in Python with minimal code
Debug Mode: Find the bug in [paste code]
```

## 📁 Project Structure

```
algo-tutor/
├── server.js              # MCP server with 3 tools (learn, build, debug)
├── public/
│   └── algo-tutor.html    # Interactive widget UI
├── package.json           # Dependencies
└── README.md              # This file
```

## 🔧 Development

### Server Tools

1. **learn_mode** - Explains DSA topics
2. **build_mode** - Generates coding solutions
3. **debug_mode** - Diagnoses and fixes bugs
4. **list_algo_sessions** - Lists recent sessions

### Widget Components

- Mode selector (Learn / Build / Debug)
- Input forms with toggles
- Output panels with structured blocks
- Real-time state updates from ChatGPT

## 🎨 Design Philosophy

AlgoTutor follows these core principles:

✅ **Small steps** - Never overwhelming, always digestible  
✅ **Minimal code** - No list comprehensions, no abstraction  
✅ **Dry-runs** - See exactly what happens at each step  
✅ **Examples first** - Always show concrete examples  
✅ **Paper-friendly** - What to write during interviews  
✅ **Clear language** - Spartan English, no jargon  
✅ **Edge cases** - Cover the tricky scenarios  

## 🚀 Usage Examples

### Learn Mode

```
Topic: BFS
Difficulty: Dumb-It-Down
Depth: Tiny
Output: 5-step explanation + minimal code + dry-run table
```

### Build Mode

```
Problem: Find the kth largest element in an array
Language: Python
Minimal Code: ✓
Output: Pattern (heap), step-by-step logic, code, dry-run, complexity
```

### Debug Mode

```
Code: [paste buggy binary search]
Output: "Off-by-one error on line 5. You wrote 'high = mid' instead of 'high = mid - 1'"
```

## 📝 Notes

- All tool responses are rendered in the **AlgoTutor panel** (not in chat)
- Chat responses are kept minimal (e.g., "Check the panel for details")
- Sessions are stored in memory (resets on server restart)
- The widget automatically updates when tools return new data

## 🔗 Resources

- [OpenAI Apps SDK Documentation](https://developers.openai.com/apps-sdk)
- [MCP Server Guide](https://developers.openai.com/apps-sdk/build/mcp-server)

## 📄 License

MIT

---

**Built with ❤️ for learners who want small steps, not giant leaps.**

