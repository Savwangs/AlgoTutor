# 🚀 AlgoTutor

**Learn Data Structures & Algorithms in small steps with minimal code, dry-runs, and clear explanations.**

AlgoTutor is a free ChatGPT App built with the Model Context Protocol (MCP) that helps you master DSA concepts through:
- Small, slow steps (no overwhelming explanations)
- Minimal code (no abstraction, no fancy syntax)
- Dry-run tables (see exactly what happens at each step)
- Personalized follow-up questions that adapt to your understanding
- Clear examples and edge cases
- "What to write on paper" summaries

## 🎯 How to Use AlgoTutor

1. **Sign up** at [algo-tutor.org](https://algo-tutor.org) for a free account
2. Open **ChatGPT** and type **@AlgoTutor** in any chat
3. Ask for help with a coding problem or to learn a new topic

That's it — you're all set!

## 📚 Three Learning Modes

### 📚 Learn Mode
Explains any DSA topic (BFS, heaps, linked lists, DP, etc.) with:
- 5-10 line simple English explanation
- One short code sample
- Dry-run table
- Example walkthrough
- Edge cases
- Paper summary
- Follow-up questions that adapt to what you already know

### 🔨 Build Mode
Generates guided solutions for coding problems with:
- Pattern identification
- Step-by-step logic
- Minimal code solution (or skeleton only)
- Dry-run demonstration
- Time & space complexity
- Follow-up questions that probe your understanding and tailor explanations to how you think

### 🐛 Debug Mode
Diagnoses bugs in your code with:
- Problem classification (logic error, off-by-one, infinite loop, etc.)
- Exact line causing the bug
- Clear explanation in small steps
- Before + After code
- Test cases to confirm fix
- Follow-up questions that help you understand *why* a bug happened, not just the fix

## 🎨 Design Philosophy

AlgoTutor follows these core principles:

✅ **Small steps** - Never overwhelming, always digestible  
✅ **Minimal code** - No list comprehensions, no abstraction  
✅ **Dry-runs** - See exactly what happens at each step  
✅ **Examples first** - Always show concrete examples  
✅ **Paper-friendly** - What to write during interviews  
✅ **Clear language** - Spartan English, no jargon  
✅ **Personalized** - Follow-up questions adapt to your level  

## 💡 Usage Examples

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

## 📁 Project Structure

```
algo-tutor/
├── server.js              # MCP server with tools + API endpoints
├── llm.js                 # OpenAI integration (gpt-4o-mini)
├── auth.js                # Authentication management
├── public/
│   └── algo-tutor.html    # Interactive widget UI
├── web/                   # Website pages
│   ├── index.html         # Landing page
│   ├── login.html         # User login
│   ├── signup.html        # User registration
│   ├── dashboard.html     # User dashboard with setup instructions
│   ├── support.html       # Customer support & FAQs
│   ├── privacy.html       # Privacy policy
│   ├── terms.html         # Terms of service
│   └── ...                # Auth callback, password reset, etc.
├── migrations/            # Database schema migrations
├── examples/              # Example tool inputs/outputs
├── package.json           # Dependencies
└── README.md              # This file
```

## 📝 Notes

- AlgoTutor runs as a ChatGPT App — you need a free ChatGPT account to use it
- All tool responses are rendered in the **AlgoTutor panel** (not in chat)
- User accounts and sessions are managed via Supabase
- The MCP server is deployed on Render

## 📄 License

MIT

---

**Built with ❤️ for learners who want small steps, not giant leaps.**
