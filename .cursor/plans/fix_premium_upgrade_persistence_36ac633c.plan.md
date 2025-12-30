---
name: Fix Premium Upgrade Persistence
overview: Fix the issue where premium status is not persisting to the database after code activation, causing users to revert to free tier on subsequent requests.
todos:
  - id: fix-supabase-config
    content: Configure Supabase client with admin auth options in auth.js
    status: completed
  - id: add-update-logging
    content: Add .select() and logging to verify UPDATE actually persists
    status: completed
  - id: test-premium-flow
    content: Test full premium activation flow to verify persistence
    status: completed
---

# Fix Premium Upgrade Not Persisting

## Root Cause Analysis

The `linkPendingPremiumCode` function updates the user to premium, but the database UPDATE is not persisting. The logs show:

- First request: User upgraded to premium successfully (in-memory)
- Second request: User is still `tier: 'free'` in database

The UPDATE query runs without error but affects 0 rows. This is likely due to **RLS (Row Level Security)** blocking the update even with the service key.

## Solution

### 1. Fix Supabase Client Configuration in auth.js

Configure the Supabase client to properly use the service role key with admin privileges:

```javascript
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });
}
```

### 2. Add Logging to Verify UPDATE Success

Add `.select()` after the update to verify rows were actually updated:

```javascript
const { data: updatedData, error: upgradeError } = await supabase
  .from('users')
  .update({
    subscription_tier: 'premium',
    subscription_status: 'active'
  })
  .eq('id', user.id)
  .select();

console.log('[Auth] Update result:', { updatedData, error: upgradeError, rowsUpdated: updatedData?.length });
```

### 3. Alternative: Disable RLS Temporarily for Testing

If the above doesn't work, run this in Supabase SQL Editor to verify RLS is the issue:

```sql
-- Temporarily disable RLS on users table
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
```

Then test again. If it works, re-enable RLS and fix the policies:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop and recreate the update policy with WITH CHECK
DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
```

## Files to Modify

| File | Changes |

|------|---------|

| [`auth.js`](auth.js) | Fix Supabase client config and add update verification logging |

## Verification

After implementing, check the logs for:

```
[Auth] Update result: { updatedData: [...], error: null, rowsUpdated: 1 }
```

If `rowsUpdated: 0`, the RLS policy is blocking the update.