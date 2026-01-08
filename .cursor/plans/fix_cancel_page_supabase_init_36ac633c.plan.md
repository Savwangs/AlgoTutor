---
name: Fix Cancel Page Supabase Init
overview: Fix the cancel.html page that crashes before checkAuth() runs because the Supabase CDN may not have loaded when the script tries to use window.supabase.
todos:
  - id: wrap-supabase-init
    content: Wrap cancel.html script in DOMContentLoaded with Supabase existence check
    status: completed
---

# Fix Cancel Page Supabase Initialization

## Problem

The JavaScript on cancel.html crashes before `checkAuth()` runs because:

1. Line 396 runs immediately: `const supabase = window.supabase.createClient(...)`
2. The Supabase CDN script may not have finished loading yet
3. `window.supabase` is undefined, causing a crash
4. All subsequent JavaScript (including `checkAuth()`) never executes
5. The page stays stuck on loading forever

## Solution

Wrap the entire Supabase initialization and app logic in a function that:

1. Waits for the DOM to be ready
2. Checks if `window.supabase` exists
3. Shows an error message if Supabase fails to load
4. Falls back to sign-in state with error message

## Code Changes

In [`web/cancel.html`](web/cancel.html), wrap lines 393-542 in a safer initialization pattern:

```javascript
// Wait for DOM and Supabase to be ready
document.addEventListener('DOMContentLoaded', () => {
  // Check if Supabase loaded
  if (!window.supabase) {
    console.error('Supabase SDK failed to load');
    // Show signin state with error
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('signin-state').classList.remove('hidden');
    const msg = document.getElementById('signin-message');
    msg.textContent = 'Failed to load authentication. Please refresh the page.';
    msg.className = 'message error';
    return;
  }

  // Initialize Supabase
  const SUPABASE_URL = '...';
  const SUPABASE_ANON_KEY = '...';
  let supabase;
  
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('signin-state').classList.remove('hidden');
    return;
  }

  // ... rest of the code using supabase ...
  
  checkAuth();
});
```

This ensures:

- The script waits for DOM to be ready
- Checks if Supabase SDK loaded before using it
- Shows a user-friendly error if something fails
- Never leaves the page stuck on loading