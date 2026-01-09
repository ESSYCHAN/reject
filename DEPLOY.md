# REJECT - Deployment Guide

## Quick Start (Development)

```bash
# Install all dependencies
npm run install:all

# Copy environment file and add your OpenAI API key
cp .env.example server/.env
# Edit server/.env and add your OPENAI_API_KEY

# Run both client and server
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8787

---

## Production Deployment

### Option A: Deploy to Render (Recommended)

Render offers a free tier and easy deployment.

#### 1. Prepare Repository

```bash
# Ensure everything builds
npm run build

# Commit all changes
git add .
git commit -m "Prepare for deployment"
git push origin main
```

#### 2. Create Render Web Service

1. Go to [render.com](https://render.com) and sign up/login
2. Click **New > Web Service**
3. Connect your GitHub repository
4. Configure the service:

| Setting | Value |
|---------|-------|
| Name | `reject` |
| Region | Choose closest to your users |
| Branch | `main` |
| Root Directory | (leave blank) |
| Runtime | `Node` |
| Build Command | `npm run install:all && npm run build` |
| Start Command | `npm start` |

5. Add Environment Variables:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `8787` |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `CONVERTKIT_API_KEY` | (optional) Your ConvertKit key |
| `CONVERTKIT_FORM_ID` | (optional) Your form ID |

6. Click **Create Web Service**

#### 3. Persistent Storage (For SQLite)

On Render free tier, the filesystem resets on deploys. To persist subscriber data:

1. Go to your service settings
2. Add a **Disk**:
   - Name: `data`
   - Mount Path: `/opt/render/project/src/server/data`
   - Size: 1 GB (free tier)

---

### Option B: Deploy to Fly.io

#### 1. Install Fly CLI

```bash
# macOS
brew install flyctl

# Or download from https://fly.io/docs/hands-on/install-flyctl/
```

#### 2. Create fly.toml

```toml
app = "reject-app"
primary_region = "sjc"

[build]
  [build.args]
    NODE_VERSION = "20"

[env]
  PORT = "8787"
  NODE_ENV = "production"

[http_service]
  internal_port = 8787
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[mounts]
  source = "reject_data"
  destination = "/app/server/data"
```

#### 3. Deploy

```bash
# Login to Fly
fly auth login

# Launch app (first time)
fly launch

# Set secrets
fly secrets set OPENAI_API_KEY=your-key-here

# Create persistent volume
fly volumes create reject_data --size 1

# Deploy
fly deploy
```

---

### Option C: Deploy to Railway

1. Go to [railway.app](https://railway.app)
2. Click **New Project > Deploy from GitHub repo**
3. Select your repository
4. Add environment variables in the **Variables** tab
5. Railway auto-detects Node.js and deploys

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` in production |
| `PORT` | No | Server port (default: 8787) |
| `OPENAI_API_KEY` | Yes | Your OpenAI API key |
| `CONVERTKIT_API_KEY` | No | ConvertKit API key for email capture |
| `CONVERTKIT_FORM_ID` | No | ConvertKit form ID |

---

## Post-Deployment Checklist

- [ ] App loads at your domain
- [ ] Decoder works (test with a rejection email)
- [ ] Email capture saves successfully
- [ ] Rate limiting works (try rapid requests)
- [ ] Health check returns OK: `GET /api/health`

---

## Monitoring

### Health Check

```bash
curl https://your-domain.com/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Check Subscriber Count

The subscribers are stored in SQLite at `server/data/subscribers.db`. You can query it:

```bash
# SSH into your server (Render/Fly/Railway all support this)
sqlite3 server/data/subscribers.db "SELECT COUNT(*) FROM subscribers;"
```

---

## Troubleshooting

### "Service temporarily unavailable" error
- Check that `OPENAI_API_KEY` is set correctly
- Verify your OpenAI account has credits

### Email capture fails
- Ensure the `data/` directory exists and is writable
- Check disk mount is configured (on Render/Fly)

### Build fails
- Ensure Node.js 20+ is being used
- Check that all dependencies are in package.json
- Run `npm run build` locally to verify

---

## Cost Estimate

| Service | Cost |
|---------|------|
| Render (free tier) | $0/month |
| Fly.io (free tier) | $0/month |
| Railway (free tier) | $5/month credit |
| OpenAI API | ~$0.01-0.05 per decode |

For a beta with <1000 users, expect ~$5-20/month in OpenAI costs.
