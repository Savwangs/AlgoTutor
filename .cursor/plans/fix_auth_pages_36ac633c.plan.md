---
name: Fix Auth Pages
overview: Fix "Not Found" errors for reset-password and auth-callback pages by adding them to the server's webPages array and creating the missing reset-password.html page.
todos:
  - id: fix-webpages-array
    content: Add auth-callback.html and reset-password.html to server.js webPages array
    status: completed
  - id: create-reset-password
    content: Create reset-password.html page with password reset form
    status: completed
  - id: fix-signup-message
    content: Update signup.html success message to mention email confirmation
    status: completed
---

# Fix Authentication Page Issues

## Root Cause

The server in [server.js](server.js) only serves specific pages listed in the `webPages` array (line 962):

```javascript
const webPages = ['/', '/index.html', '/login.html', '/signup.html', '/dashboard.html', '/pricing.html', '/success.html'];
```

The following pages are missing:

- `/auth-callback.html` (we just created this)
- `/reset-password.html` (doesn't exist yet)

---

## Fixes Required

### 1. Update server.js webPages array

Add the missing pages to the `webPages` array in [server.js](server.js):

```javascript
const webPages = ['/', '/index.html', '/login.html', '/signup.html', '/dashboard.html', '/pricing.html', '/success.html', '/auth-callback.html', '/reset-password.html'];
```

### 2. Create reset-password.html

Create a new page at `web/reset-password.html` that:

- Accepts the password reset token from Supabase (passed in URL hash)
- Shows two password fields (new password + confirm password)
- Validates passwords match
- Calls Supabase `updateUser()` to set the new password
- Redirects to login page on success

### 3. Fix signup.html message

Change the success message in [web/signup.html](web/signup.html) to always show "Check your email for confirmation" since the user has email confirmation enabled.

---

## Email Delay Issue

The slow email delivery is a limitation of Supabase's built-in email service. For production, you should:

1. Go to Supabase Dashboard -> Project Settings -> Auth -> SMTP Settings
2. Configure a custom SMTP provider like:

   - **Resend** (free tier: 100 emails/day)
   - **SendGrid** (free tier: 100 emails/day)
   - **Mailgun** (free tier available)

This is a manual configuration step in Supabase, not a code change.

---

## Summary of Changes

| File | Change |

|------|--------|

| [server.js](server.js) | Add `/auth-callback.html` and `/reset-password.html` to webPages array |

| [web/reset-password.html](web/reset-password.html) | Create new password reset page |

| [web/signup.html](web/signup.html) | Update success message to "Check your email for confirmation" |