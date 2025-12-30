---
name: Reset Database for Testing
overview: Reset all users to free tier, clear all premium codes, and reset usage logs in Supabase to enable a complete end-to-end test of the authentication and billing flow.
todos:
  - id: run-reset-sql
    content: Run SQL reset queries in Supabase SQL Editor
    status: pending
  - id: verify-reset
    content: Verify tables are reset correctly in Table Editor
    status: pending
  - id: test-flow
    content: Test complete end-to-end flow from widget to premium activation
    status: pending
---

# Reset Database for End-to-End Testing

This plan provides SQL queries to run in the **Supabase Dashboard > SQL Editor** to completely reset your test environment.

## Steps

### 1. Open Supabase SQL Editor

- Go to your Supabase project dashboard
- Click **SQL Editor** in the left sidebar
- Click **New query**

### 2. Run the Reset Queries

Paste and run the following SQL commands:

```sql
-- 1. Reset ALL users to free tier
UPDATE users 
SET subscription_tier = 'free', 
    subscription_status = 'active',
    usage_count = 0;

-- 2. Delete ALL premium codes (new ones will be generated on checkout)
DELETE FROM premium_codes;

-- 3. Clear ALL usage logs (so daily limit counter starts fresh)
DELETE FROM usage_logs;
```

### 3. Verify the Reset

After running, check each table in the **Table Editor** to confirm:

- `users` table: All rows show `subscription_tier = 'free'`
- `premium_codes` table: Should be empty (0 rows)
- `usage_logs` table: Should be empty (0 rows)

### 4. Test the Full Flow

With the free tier limit set to 1 (as configured), your end-to-end test should be:

1. Use AlgoTutor widget once -> Works, shows content
2. Use AlgoTutor widget again -> Shows "Upgrade to Premium" button
3. Click upgrade -> Routes to pricing page
4. Click "Upgrade to Premium" on pricing -> Goes to login/signup
5. Create account or sign in -> Redirects to Stripe checkout
6. Complete payment with test card `4242 4242 4242 4242` -> Shows success page with activation code
7. Copy code -> Click "Activate Premium" in widget -> Enter code
8. Use AlgoTutor again -> Works with premium (no usage limit)

---

**Note**: No code changes are required - this is purely a database reset operation in Supabase.