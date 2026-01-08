---
name: Fix Session Validation
overview: Replace getSession() with getUser() across all auth pages to ensure sessions are validated with Supabase servers, not just read from cached localStorage.
todos:
  - id: fix-login-session
    content: Update login.html to use getUser() instead of getSession()
    status: completed
  - id: fix-signup-session
    content: Update signup.html to use getUser() instead of getSession()
    status: completed
  - id: fix-dashboard-session
    content: Update dashboard.html to use getUser() instead of getSession()
    status: completed
---

# Fix Session Validation Across All Auth Pages

## Problem

Multiple pages use `getSession()` which only reads from cached localStorage without validating the session with Supabase servers. This causes:

- Deleted users to appear "logged in" due to stale tokens
- Sessions to persist even after account deletion
- Inconsistent authentication behavior

## Solution

Replace `getSession()` with `getUser()` on all pages that need to verify authentication. `getUser()` actually validates the session token with Supabase servers.

## Files to Update

### 1. `web/login.html` (line 504)

Currently checks if already logged in with `getSession()`. Change to `getUser()`.

### 2. `web/signup.html` (lines 436, 494)

Uses `getSession()` to check login state. Change to `getUser()`.

### 3. `web/dashboard.html` (line 392)

Uses `getSession()` to verify user before showing dashboard. Change to `getUser()`.

### 4. `web/auth-callback.html` (line 173)

Uses `getSession()` after OAuth callback. This one may need to stay as `getSession()` since it's reading the newly created session right after OAuth redirect.

### 5. `web/reset-password.html` (lines 330, 346)

Uses `getSession()` for password reset flow. This also involves token handling from URL hash, so may need careful handling.

## Note on auth-callback.html and reset-password.html

These pages handle special token flows (OAuth callback and password reset tokens) where the session is being established from URL parameters. These may need to keep `getSession()` for the initial token exchange, but subsequent checks should use `getUser()`.

## Expected Outcome

After changes:

- Deleted users will be properly logged out
- Stale sessions will be invalidated
- Users must have a valid Supabase account to access authenticated features