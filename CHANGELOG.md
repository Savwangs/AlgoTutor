# Changelog

All notable changes to AlgoTutor will be documented in this file.

## [1.0.0] - 2025-11-16

### 🎉 Initial Release - Complete Transformation from CS61A Mentor to AlgoTutor

### Added

#### Core Features
- **Learn Mode** - Explains any DSA topic with small steps, minimal code, and dry-runs
- **Build Mode** - Generates coding solutions with step-by-step logic and complexity analysis
- **Debug Mode** - Diagnoses bugs line-by-line with before/after code and test cases

#### Interactive Widget
- Modern, dark-themed UI with three mode tabs
- Dynamic input forms based on selected mode
- Structured output blocks (Pattern, Code, Dry-Run, Paper Version, Edge Cases)
- Real-time state synchronization with ChatGPT
- Responsive layout with separate input/output panes

#### Server Tools
- `learn_mode` - DSA topic explanation tool with configurable difficulty and depth
- `build_mode` - Coding problem solution generator with multiple language support
- `debug_mode` - Bug diagnosis and fixing tool with test case generation
- `list_algo_sessions` - Session management utility

#### Configuration Options

**Learn Mode:**
- Difficulty levels: Basic, Normal, Dumb-It-Down
- Depth options: Tiny (5 steps), Normal, Full Walkthrough
- Example sizes: Small, Medium
- Toggles: Edge cases, Dry-run, Paper version

**Build Mode:**
- Languages: Python, Java, C++
- Toggles: Allow recursion, Skeleton only, Include dry-run, Minimal code

**Debug Mode:**
- Languages: Python, Java, C++
- Toggles: Generate tests, Show edge warnings

### Changed
- Renamed project from `cs61a-mentor-app` to `algo-tutor`
- Updated branding and UI to reflect AlgoTutor identity
- Redesigned widget HTML from CS61A-specific to general DSA learning
- Restructured server tools from CS61A context to DSA modes

### Removed
- CS61A-specific tools (`set_cs61a_context`, `update_cs61a_output`, etc.)
- CS61A-specific UI elements (env diagrams, Scheme/SQL support)
- Old widget file (`cs-61a-mentor.html`)

### Technical Details
- Built with TypeScript (via Node.js + JSDoc)
- MCP SDK version: ^1.0.0
- Zod for schema validation: ^3.23.8
- HTTP-based MCP server with CORS support
- In-memory session storage
- Streamable HTTP transport for ChatGPT integration

---

## Upgrade Notes

If you're upgrading from CS61A Mentor:

1. **Breaking Changes:**
   - All previous tools have been replaced
   - Widget URI changed from `cs-61a-mentor.html` to `algo-tutor.html`
   - Session structure completely rewritten

2. **Migration:**
   - No migration path from CS61A sessions to AlgoTutor
   - Update your ChatGPT connector to use new MCP endpoint
   - Review new tool schemas and update any integrations

3. **New Requirements:**
   - None - same dependencies

---

## Future Roadmap

### Planned Features (v1.1.0+)
- [ ] Persistent session storage (database)
- [ ] Export dry-run tables as images
- [ ] Support for more languages (JavaScript, Go, Rust)
- [ ] Interactive code editor in widget
- [ ] Side-by-side code comparison for Debug Mode
- [ ] Saved learning paths and progress tracking
- [ ] Custom difficulty settings per user
- [ ] Animated visualizations for algorithms
- [ ] Practice problem generator
- [ ] Spaced repetition for topics

### Under Consideration
- Collaborative learning (share sessions)
- Integration with LeetCode/HackerRank
- Voice mode explanations
- Mobile app companion
- VSCode extension

---

## Contributing

We welcome contributions! Please see CONTRIBUTING.md for guidelines.

## Support

- **Issues**: [GitHub Issues](https://github.com/yourname/algo-tutor/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourname/algo-tutor/discussions)
- **Email**: support@algotutor.dev

