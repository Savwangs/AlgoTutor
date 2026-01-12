# 🚀 AlgoTutor

**Learn Data Structures & Algorithms in small steps with minimal code, dry-runs, and clear explanations.**

AlgoTutor is a ChatGPT App built with the Model Context Protocol (MCP) that helps you master DSA concepts through:
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
- Test cases (optional) - doctests or examples the solution should pass
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
- Problem description (optional) - what the code should do
- Language: Python / Java / C++
- Toggles: Generate tests, Show edge warnings

## 🛠️ Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file with the following:

```bash
# Required
OPENAI_API_KEY=sk-...          # OpenAI API key for content generation

# Optional - Authentication (Supabase)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
REQUIRE_AUTH=true              # Set to 'true' to enable auth
FREE_TIER_LIMIT=1              # Daily usage limit for free users

# Optional - Payments (Stripe)
STRIPE_SECRET_KEY=sk_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Start the Server

```bash
npm start
# Or for development with auto-reload:
npm run dev
```

The server runs on `http://localhost:8787/mcp` by default.

### 4. Connect to ChatGPT

1. Open ChatGPT Settings → Apps & Connectors → Create
2. Name: **AlgoTutor**
3. Description: **Learn DSA in small steps**
4. MCP Server URL: Your public URL (use ngrok for local testing, or deploy to Render)
5. Click **Create**

### 5. Enable Developer Mode

- Settings → Apps & Connectors → Advanced Settings
- Toggle **Developer Mode** on

### 6. Test the App

Open a new chat, select **AlgoTutor** from the tools menu, and try:

```
Learn Mode: Explain binary search with dry-run
Build Mode: Solve "Two Sum" in Python with minimal code
Debug Mode: Find the bug in [paste code]
```

## 📁 Project Structure

```
algo-tutor/
├── server.js              # MCP server with 4 tools + API endpoints
├── llm.js                 # OpenAI integration (gpt-4o-mini)
├── auth.js                # Authentication & subscription management
├── public/
│   └── algo-tutor.html    # Interactive widget UI
├── web/                   # Marketing & account pages
│   ├── index.html         # Landing page
│   ├── pricing.html       # Subscription plans
│   ├── login.html         # User login
│   ├── signup.html        # User registration
│   ├── dashboard.html     # User dashboard
│   ├── success.html       # Payment success
│   └── cancel.html        # Subscription cancellation
├── migrations/            # Database schema migrations
├── examples/              # Example tool inputs/outputs
├── package.json           # Dependencies
└── README.md              # This file
```

## 🔧 Development

### MCP Tools

1. **learn_mode** - Explains DSA topics with dry-runs and examples
2. **build_mode** - Generates coding solutions (premium only)
3. **debug_mode** - Diagnoses and fixes bugs (premium only)
4. **list_algo_sessions** - Lists recent sessions

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP protocol endpoint |
| `/health` | GET | Health check |
| `/api/create-checkout` | POST | Create Stripe checkout session |
| `/api/stripe-webhook` | POST | Handle Stripe webhooks |
| `/api/get-premium-code` | GET | Get premium code by session ID |
| `/api/lookup-code` | GET | Lookup premium code by email |
| `/api/activate-premium` | POST | Activate premium with code |
| `/api/register-session` | POST | Register widget session |
| `/api/cancel-subscription` | POST | Cancel subscription |

### Widget Components

- Mode selector (Learn / Build / Debug)
- Input forms with toggles
- Output panels with structured blocks
- Real-time state updates from ChatGPT
- Premium code activation UI

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
- User data and usage logs are stored in Supabase (persistent across restarts)
- The widget automatically updates when tools return new data

## 💰 Subscription Tiers

| Feature | Free | Premium |
|---------|------|---------|
| Learn Mode | ✅ 1/day | ✅ Unlimited |
| Build Mode | ❌ | ✅ Unlimited |
| Debug Mode | ❌ | ✅ Unlimited |

- Free tier users get 1 use per 24-hour rolling window (Learn Mode only)
- Premium users have unlimited access to all modes
- Premium codes are generated after Stripe payment and can be activated in the widget

## 🔗 Resources

- [Model Context Protocol (MCP) SDK](https://github.com/modelcontextprotocol/sdk)
- [Supabase Documentation](https://supabase.com/docs)
- [Stripe API Reference](https://stripe.com/docs/api)
- [OpenAI API Documentation](https://platform.openai.com/docs)

## 📄 License

MIT

---

**Built with ❤️ for learners who want small steps, not giant leaps.**

