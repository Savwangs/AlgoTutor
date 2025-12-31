---
name: Implement Subscription Cancellation
overview: Add subscription cancellation flow with a Cancel button in the widget, a web cancel page, and server-side code revocation that causes the widget to auto-clear localStorage on next session.
todos:
  - id: add-revoked-column
    content: Add 'revoked' column to premium_codes table in Supabase
    status: pending
  - id: update-activate-check-revoked
    content: Update /api/activate-premium to reject revoked codes
    status: pending
  - id: widget-cancel-button
    content: Add Cancel Subscription button to widget that opens cancel page
    status: pending
  - id: widget-check-revoked
    content: Update widget auto-activate to clear localStorage on 'revoked' error
    status: pending
  - id: create-cancel-page
    content: Create web/cancel.html with sign-in and cancel subscription UI
    status: pending
  - id: add-cancel-endpoint
    content: Add /api/cancel-subscription endpoint to cancel Stripe and revoke code
    status: pending
  - id: add-cancel-to-webpages
    content: Add cancel.html to server.js webPages array
    status: pending
---

# Implement Subscription Cancellation

## Flow Overview

1. User clicks "Cancel Premium" button in widget
2. Redirects to `cancel.html` on website
3. User signs in with their account (the email used for payment)
4. User confirms cancellation
5. Server cancels Stripe subscription and marks code as revoked
6. Next widget session: auto-activate fails → localStorage cleared → free tier

## Implementation

### 1. Widget: Add Cancel Button (`public/algo-tutor.html`)

Add a "Cancel Subscription" button next to "Activate Premium":

- Only visible when premium code is stored in localStorage
- Clicking opens the cancel page in a new tab
- Button styled as a subtle text link (not prominent like the activate button)
```html
<button class="cancel-premium-btn" id="cancel-premium-btn" style="display: none;">
  Cancel Subscription
</button>
```


On load, show the cancel button if there's a stored code:

```javascript
if (storedPremiumCode) {
  document.getElementById('cancel-premium-btn').style.display = 'inline';
}
```

### 2. Web Page: Create `web/cancel.html`

A simple page that:

1. Shows "Cancel Your Subscription" heading
2. Requires sign-in (use Supabase auth)
3. Fetches user's subscription info
4. Has a "Cancel Subscription" button that:

   - Calls `/api/cancel-subscription`
   - Shows confirmation message
   - Instructs user that premium will end on next ChatGPT session

### 3. Server: Add `/api/cancel-subscription` endpoint (`server.js`)

1. Authenticate the request (user must be signed in)
2. Look up user's Stripe subscription ID
3. Cancel the Stripe subscription via API
4. Mark the premium code as `revoked = true` in database
5. Return success

### 4. Database: Add `revoked` column to `premium_codes`

```sql
ALTER TABLE premium_codes ADD COLUMN revoked BOOLEAN DEFAULT false;
```

### 5. Update `/api/activate-premium` to check for revoked codes

When validating a code, if `revoked = true`, return error "Code has been revoked".

### 6. Widget: Already handles this!

The existing auto-activate code clears localStorage when activation fails:

```javascript
if (data.error.includes('Invalid') || data.error.includes('not found')) {
  localStorage.removeItem('algotutor_premium_code');
}
```

Just need to add check for 'revoked':

```javascript
if (data.error.includes('Invalid') || data.error.includes('revoked')) {
  localStorage.removeItem('algotutor_premium_code');
}
```

## Files to Modify/Create

| File | Changes |

|------|---------|

| `public/algo-tutor.html` | Add Cancel button, show/hide logic, add 'revoked' check |

| `web/cancel.html` | New page for cancellation flow |

| `server.js` | Add `/api/cancel-subscription` endpoint, update activate endpoint |

| `supabase-setup.sql` | Add `revoked` column to premium_codes |

## User Experience

**Before cancellation:**

- Widget shows "✓ Premium Active" button
- Small "Cancel Subscription" link visible

**Cancellation flow:**

1. Click "Cancel Subscription" → Opens cancel.html
2. Sign in (if not already)
3. See subscription details, click "Cancel"
4. See confirmation: "Subscription cancelled. Premium access will end on your next ChatGPT session."

**After cancellation (next session):**

- Widget tries to auto-activate
- Server returns "Code has been revoked"
- Widget clears localStorage, removes cancel button
- User sees "Activate Premium" button again
- Free tier limits apply