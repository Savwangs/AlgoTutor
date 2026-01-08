---
name: Fix Auth Flow Issues
overview: Add Google sign-in to cancel page and fix pricing page to properly validate authentication before going to checkout.
todos:
  - id: add-google-signin-cancel
    content: Add Google OAuth button and handler to cancel.html
    status: completed
  - id: fix-pricing-auth-check
    content: Change pricing.html from getSession() to getUser() for proper validation
    status: completed
---

# Fix Authentication Flow Issues

## Problem 1: Cancel Page Missing Google Sign-In

The cancel.html page only has email/password sign-in, but users who signed up with Google cannot access it.

**Solution:** Add the Google OAuth button and handler to cancel.html, matching the pattern used in login.html.

## Problem 2: Pricing Page Skipping Authentication

The pricing page uses `getSession()` which returns cached/stale sessions from localStorage without validating them with Supabase. This causes users to skip authentication and go straight to checkout, but they're not actually saved in Supabase Auth.

**Solution:** Change from `getSession()` to `getUser()` which actually validates the session with Supabase servers. If the session is invalid/stale, `getUser()` will return an error and we'll redirect to login.

---

## Changes

### 1. Add Google Sign-In to Cancel Page (`web/cancel.html`)

Add the Google button HTML in the signin-state section:

```html
<div class="divider"><span>or</span></div>
<button type="button" class="btn btn-google" id="google-btn">
  <svg>...</svg>
  Continue with Google
</button>
```

Add the CSS for `.btn-google` styles.

Add the JavaScript handler for Google OAuth:

```javascript
document.getElementById('google-btn').addEventListener('click', async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/cancel.html'
    }
  });
  if (error) {
    signinMessage.textContent = error.message;
    signinMessage.className = 'message error';
  }
});
```

### 2. Fix Pricing Page Session Check (`web/pricing.html`)

Change line 325 from:

```javascript
const { data: { session } } = await supabaseClient.auth.getSession();
if (!session) {
```

To:

```javascript
const { data: { user }, error } = await supabaseClient.auth.getUser();
if (error || !user) {
```

And update line 345 to use `user.email` instead of `session.user.email`.

This ensures:

- The session is validated with Supabase servers
- Stale/invalid sessions don't skip authentication
- Users must be properly authenticated before checkout