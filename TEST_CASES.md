# AlgoTutor Test Cases

## Positive Test Cases

---

### Test Case 1: Learn a DSA Topic

**Scenario**
User wants to learn a core DSA concept via Learn Mode.

**User Prompt**
```
Teach me how binary search works
```

**Tool Triggered**
`learn_mode`

**Expected Output**
Widget panel displays a structured lesson with: "THE TRICK" callout, "Pattern Signature" keywords, "Step-by-Step" explanation, "Code Solution" block, "Trace Table (Exam Format)", "WHAT PROFESSORS TEST" warning box, feedback thumbs up/down buttons, and two follow-up buttons ("See a trace table and example walkthrough", "Try a real-world practice problem"). ChatGPT text response is a brief 1–2 sentence acknowledgment only.

---

### Test Case 2: Build a Solution for a Coding Problem

**Scenario**
User submits a coding problem and wants a complete solution via Build Mode.

**User Prompt**
```
Solve this problem: Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.
```

**Tool Triggered**
`build_mode`

**Expected Output**
Widget panel displays: "THE SHORTCUT" callout, "Pattern Detection" section, "Code Solution" with commented Python code, "DON'T FORGET" warning box, "Time & Space Complexity" section, feedback buttons, and two follow-up buttons ("See example walkthrough and trace table", "Try a similar practice problem"). ChatGPT text response is a brief acknowledgment without any code.

---

### Test Case 3: Debug Buggy Code

**Scenario**
User pastes buggy code for analysis via Debug Mode.

**User Prompt**
```
Debug this Python code:

def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []
```

**Tool Triggered**
`debug_mode`

**Expected Output**
Widget panel displays: "THE TRICK" callout explaining the bug, "Exact Bug Location" highlighting the inner loop line, "Before & After Fix" code comparison, "IF THIS APPEARS ON EXAM" warning box with variations, "Time & Space Complexity" section, feedback buttons, and two follow-up buttons ("See example walkthrough and trace table", "Try a similar practice problem"). ChatGPT text response is a brief acknowledgment without showing corrected code.

---

### Test Case 4: Learn Mode Follow-Up — Real-World Practice Problem

**Scenario**
After a Learn Mode lesson, user requests an interactive fill-in-the-blank quiz via the follow-up button.

**User Prompt**
First: `Teach me about linked lists`
Then click the **"Try a real-world practice problem"** button in the widget.

**Tool Triggered**
1. `learn_mode` (initial)
2. `learn_real_world_example` (follow-up)

**Expected Output**
Widget updates to show an interactive fill-in-the-blank problem: code with 2–3 blanks, Blank 1 as multiple choice (4 options), remaining blanks as text input, each with a "Show Hint" button, a "Check Answers" button that gives green/red per-blank feedback, a "Show Solution" button, and an "AI Recommendation" button after quiz completion. Feedback buttons and learn follow-up buttons persist.

---

### Test Case 5: Build Mode Follow-Up — Trace Table Walkthrough

**Scenario**
After a Build Mode solution, user requests a step-by-step trace via the follow-up button.

**User Prompt**
First: `Solve: Given a sorted array, find if there exist two numbers that sum to a target.`
Then click the **"See example walkthrough and trace table"** button in the widget.

**Tool Triggered**
1. `build_mode` (initial)
2. `build_trace_walkthrough` (follow-up)

**Expected Output**
Widget updates to show: a specific example input/output, a step-by-step "Walkthrough" section narrating the algorithm with actual values, and a "Dry-Run Table" with columns (iteration, variables, state, action) tracing execution. Feedback buttons and build follow-up buttons persist.

---

### Test Case 6: Debug Correct Code — Alternative Approach

**Scenario**
User submits correct code. Debug Mode should confirm correctness and suggest an alternative approach.

**User Prompt**
```
Debug this Python code:

def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
```

**Tool Triggered**
`debug_mode`

**Expected Output**
Widget panel displays: "THE TRICK" callout confirming the code is correct, no "Exact Bug Location" section (no bugs), an "Alternative Approach" section with a different implementation and complexity comparison, "Time & Space Complexity" section, feedback buttons, and debug follow-up buttons.

---

### Test Case 7: Invalid Input Rejection

**Scenario**
User submits a prompt clearly unrelated to DSA/coding. The tool triggers but returns a validation error.

**User Prompt**
```
Teach me how to bake a chocolate cake
```

**Tool Triggered**
`learn_mode`

**Expected Output**
Widget displays a validation error message: "Please enter a valid DSA topic (e.g., binary search, BFS, linked lists)." No lesson content is generated. No follow-up buttons appear.

---

## Negative Test Cases

These are prompts where AlgoTutor should **NOT** trigger.

---

### Negative Test Case 1: General Knowledge Question

**Scenario**
User asks a general knowledge question unrelated to coding, algorithms, or data structures. AlgoTutor should not be invoked.

**User Prompt**
```
What is the capital of France?
```

---

### Negative Test Case 2: Creative Writing Request

**Scenario**
User asks for creative content. AlgoTutor is designed for hands-on DSA learning with code, not prose.

**User Prompt**
```
Write me a short story about a robot who dreams of becoming a chef
```

---

### Negative Test Case 3: Math Homework (Non-CS)

**Scenario**
User asks for pure mathematics help with no programming or data structure component. AlgoTutor teaches DSA with code, not general math.

**User Prompt**
```
Solve this integral: the integral of x^2 * sin(x) dx
```
