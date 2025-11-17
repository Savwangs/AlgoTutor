# 🚀 AlgoTutor Quick Start Guide

## Step 1: Install & Run

```bash
# Install dependencies
npm install

# Start the server
npm start
```

You should see:
```
🚀 AlgoTutor MCP Server running at http://localhost:8787/mcp

📚 Learn Mode: Explain DSA topics in small steps
🔨 Build Mode: Generate solutions with dry-runs
🐛 Debug Mode: Find and fix bugs line-by-line
```

## Step 2: Expose Your Server (For Testing)

If you're testing locally, you have several options:

### Option A: localhost.run (Easiest - No Signup!)

```bash
ssh -R 80:localhost:8787 nokey@localhost.run
```

Copy the HTTPS URL it gives you (e.g., `https://random-name.lhr.life`)

### Option B: Cloudflare Tunnel (Fast & Reliable)

```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Start tunnel
cloudflared tunnel --url http://localhost:8787
```

Copy the HTTPS URL (e.g., `https://random-words.trycloudflare.com`)

### Option C: Ngrok (Requires Free Account)

```bash
# Sign up at: https://dashboard.ngrok.com/signup
# Get authtoken at: https://dashboard.ngrok.com/get-started/your-authtoken
ngrok config add-authtoken YOUR_TOKEN_HERE
ngrok http 8787
```

Copy the HTTPS forwarding URL (e.g., `https://abc123.ngrok.io`)

**💡 See `NGROK_SETUP.md` for detailed setup instructions.**

## Step 3: Connect to ChatGPT

1. Open **ChatGPT** (web or desktop app)
2. Go to **Settings** → **Apps & Connectors** → **Create**
3. Fill in:
   - **Name**: AlgoTutor
   - **Description**: Learn DSA in small steps with minimal code and dry-runs
   - **MCP Server URL**: `https://your-ngrok-url.ngrok.io/mcp`
4. Click **Create**

## Step 4: Enable Developer Mode

1. Settings → Apps & Connectors → **Advanced Settings**
2. Toggle **Developer Mode** ON

## Step 5: Test the App

Open a new chat in ChatGPT and try these examples:

### 📚 Learn Mode Example

```
Use AlgoTutor to explain binary search with a dry-run table.
Use "Dumb-It-Down" difficulty and "Tiny" depth.
```

The app will show:
- Pattern identification
- 5-step explanation
- Minimal code
- Dry-run table
- Edge cases
- Paper summary

### 🔨 Build Mode Example

```
Use AlgoTutor to build a solution for the Two Sum problem in Python.
Use minimal code and include a dry-run.
```

The app will show:
- Pattern (hash map)
- Step-by-step logic
- Minimal Python code
- Dry-run with example input
- Complexity analysis
- Paper version

### 🐛 Debug Mode Example

```python
Use AlgoTutor to debug this code:

def binary_search(arr, target):
    low = 0
    high = len(arr)  # Bug here!
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1
```

The app will show:
- Bug classification (off-by-one error)
- Exact line causing the issue
- Clear explanation
- Before/After code
- Test cases to verify the fix
- Edge case warnings

## 🎯 Tips for Best Results

### Learn Mode
- **Be specific**: "Explain DFS on graphs" is better than "Explain DFS"
- **Choose Tiny depth** for quick overviews (5 steps only)
- **Use Dumb-It-Down** for ultra-simple explanations

### Build Mode
- **Paste the full problem**: Include constraints and examples
- **Enable "Minimal Code"** to avoid fancy syntax
- **Use "Skeleton Only"** if you want to fill in the logic yourself

### Debug Mode
- **Paste complete functions**: Include the full context
- **Provide input samples** to help with debugging
- **Enable test case generation** to verify fixes

## 🔧 Troubleshooting

### Server won't start
```bash
# Check if port 8787 is already in use
lsof -ti:8787 | xargs kill -9

# Then restart
npm start
```

### Widget not showing in ChatGPT
- Make sure your ngrok URL includes `/mcp` at the end
- Check that the server is running (`npm start`)
- Try recreating the connector in ChatGPT settings

### Outputs not appearing
- Check the **AlgoTutor panel** (not the chat)
- All detailed outputs appear in the widget, not in chat messages
- Look for the structured blocks (Pattern, Code, Dry-Run, etc.)

### ChatGPT says "Tool not available"
- Enable **Developer Mode** in ChatGPT settings
- Make sure you selected **AlgoTutor** from the tools menu in chat

## 📝 Example Chat Flow

**You:** Use AlgoTutor Learn Mode to explain quicksort with dumb-it-down difficulty.

**ChatGPT:** *Calls learn_mode tool*

**AlgoTutor Panel Shows:**
```
▸ Pattern Detection
Divide-and-conquer sorting algorithm

▸ Step-by-Step Reasoning
1. Pick a pivot element
2. Put smaller elements on left
3. Put larger elements on right
4. Repeat for left side
5. Repeat for right side

▸ Code Solution
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[0]
    left = [x for x in arr[1:] if x < pivot]
    right = [x for x in arr[1:] if x >= pivot]
    return quicksort(left) + [pivot] + quicksort(right)

▸ Dry-Run Table
[Table with step-by-step execution]

▸ Paper Version
• Pick pivot
• Partition array
• Recurse on both sides

▸ Edge Cases
• Empty array
• Single element
• All duplicates
```

**ChatGPT in Chat:** "Check the AlgoTutor panel for a complete explanation of quicksort."

---

## 🚀 You're Ready!

Start learning DSA the way **you** learn best:
- Small steps
- Minimal code
- Clear examples
- Dry-runs
- Edge cases

Happy coding! 🎉

