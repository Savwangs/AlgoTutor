# 🔐 Ngrok Setup Guide

## The Issue

Ngrok now requires a verified account and authtoken. You'll see this error:
```
ERROR: authentication failed: Usage of ngrok requires a verified account and authtoken.
```

## Solution 1: Set Up Ngrok (Free Account)

### Steps:

1. **Sign up for free ngrok account**
   ```
   https://dashboard.ngrok.com/signup
   ```

2. **Get your authtoken**
   ```
   https://dashboard.ngrok.com/get-started/your-authtoken
   ```

3. **Install authtoken**
   ```bash
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```
   
   Example:
   ```bash
   ngrok config add-authtoken 2abc123def456ghi789jkl
   ```

4. **Start ngrok**
   ```bash
   ngrok http 8787
   ```

5. **Copy the HTTPS URL**
   ```
   Forwarding: https://abc123.ngrok.io -> http://localhost:8787
   ```

6. **Use in ChatGPT**
   ```
   https://abc123.ngrok.io/mcp
   ```

---

## Solution 2: Localhost.run (No Signup Required!)

**Easiest alternative - works immediately!**

```bash
ssh -R 80:localhost:8787 nokey@localhost.run
```

You'll get a URL like:
```
https://random-name-12345.lhr.life -> http://localhost:8787
```

Use in ChatGPT: `https://random-name-12345.lhr.life/mcp`

**Pros:**
- ✅ No signup required
- ✅ Works immediately
- ✅ Free

**Cons:**
- ❌ URL changes every time
- ❌ Must keep terminal open

---

## Solution 3: Cloudflare Tunnel (Free, No Signup)

```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Start tunnel
cloudflared tunnel --url http://localhost:8787
```

You'll get a URL like:
```
https://random-word-another-word.trycloudflare.com
```

Use in ChatGPT: `https://random-word-another-word.trycloudflare.com/mcp`

**Pros:**
- ✅ No signup for basic use
- ✅ Reliable
- ✅ Fast

**Cons:**
- ❌ URL changes each time
- ❌ Requires cloudflared installation

---

## Solution 4: Deploy to Railway (Best for Production)

**Skip local tunneling entirely!**

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub (free)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your AlgoTutor repo
5. Railway auto-deploys
6. Get permanent URL: `https://your-app.railway.app`
7. Use in ChatGPT: `https://your-app.railway.app/mcp`

**Pros:**
- ✅ Permanent URL
- ✅ Always online
- ✅ Free tier (500 hours/month)
- ✅ Auto-deploys on git push

**Cons:**
- ❌ Requires GitHub repo
- ❌ Takes ~2 minutes to deploy

---

## Solution 5: Expose.dev (Alternative to Ngrok)

```bash
# Install
npm install -g @expo/expose

# Start tunnel
expose 8787
```

**Note:** Also requires signup, but easier than ngrok.

---

## Recommended Approach

### For Quick Testing (Right Now)
**Use localhost.run** - works instantly, no signup:
```bash
ssh -R 80:localhost:8787 nokey@localhost.run
```

### For Development (This Week)
**Use Cloudflare Tunnel** - reliable, fast:
```bash
cloudflared tunnel --url http://localhost:8787
```

### For Production (Long-term)
**Deploy to Railway** - permanent URL, always online:
1. Push code to GitHub
2. Deploy on Railway
3. Use permanent URL in ChatGPT

---

## Quick Command Reference

```bash
# Ngrok (after auth setup)
ngrok http 8787

# Localhost.run (no setup needed)
ssh -R 80:localhost:8787 nokey@localhost.run

# Cloudflare Tunnel
cloudflared tunnel --url http://localhost:8787

# Expose.dev
expose 8787
```

---

## Troubleshooting

### "Connection refused" errors
- Make sure server is running: `npm start` in another terminal
- Check server is on port 8787: `lsof -ti:8787`

### "SSH connection failed" (localhost.run)
- Check SSH is working: `ssh -V`
- Try again - sometimes the service is busy

### "Tunnel not accessible" (Cloudflare)
- Check firewall settings
- Try different terminal
- Restart cloudflared

---

## Next Steps

1. **Choose your solution** (I recommend localhost.run for quick testing)
2. **Start your AlgoTutor server**: `npm start`
3. **Start the tunnel** (using one of the methods above)
4. **Copy the HTTPS URL**
5. **Add `/mcp` to the end**
6. **Use in ChatGPT Settings → Apps & Connectors**

---

## Still Having Issues?

If none of these work, you can:
1. Deploy to Railway right away (skip tunneling)
2. Use the OpenAI Apps SDK local testing (if available)
3. Wait for ngrok authentication to process

---

**Recommended Right Now:**
```bash
# Terminal 1: Start server
npm start

# Terminal 2: Start tunnel (no signup!)
ssh -R 80:localhost:8787 nokey@localhost.run
```

Then use the URL it gives you + `/mcp` in ChatGPT! 🚀

