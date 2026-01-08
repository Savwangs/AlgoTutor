---
name: Fix Cancel Page Loading
overview: Fix the cancel.html page that gets stuck on loading by adding proper error handling and ensuring the sign-in state is shown when no session exists.
todos:
  - id: fix-checkauth-error-handling
    content: Add try-catch and error handling to checkAuth() in cancel.html
    status: completed
---

# Fix Cancel Page Loading Issue

## Problem

The cancel page (`web/cancel.html`) gets stuck on the loading state because:

1. The `checkAuth()` function has no error handling
2. If `supabase.auth.getUser()` throws an exception or fails, the function exits without transitioning to another state
3. The page remains showing the loading spinner indefinitely

## Solution

Update the `checkAuth()` function in `web/cancel.html` to:

1. Add proper try-catch error handling
2. Always transition to sign-in state if anything goes wrong
3. Add console logging for debugging

## Code Change

In [`web/cancel.html`](web/cancel.html), update the `checkAuth()` function:

```javascript
// Check auth state on load
async function checkAuth() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.log('Auth check error:', error.message);
      showSigninState();
      return;
    }
    
    if (user) {
      console.log('User found:', user.email);
      currentUser = user;
      showCancelState();
    } else {
      console.log('No user session found');
      showSigninState();
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    showSigninState(); // Always show sign-in as fallback
  }
}
```

This ensures that:

- If there's a Supabase error, show sign-in
- If there's no user, show sign-in
- If there's an exception, show sign-in (fallback)
- The page will never stay stuck on loading