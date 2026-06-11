# REJECT — Deployment Guide

The platform deploys as **two services**:

| Service | Host | Build | What it serves |
|---------|------|-------|----------------|
| **Client** (React/Vite) | **Vercel** | `vercel.json` → builds `client/` | The web app |
| **Server** (Express/TS) | **Railway** | `server/railway.json` → Nixpacks | The API (`/api/decode`, etc.) |

The Python `agents/` service is **not deployed** for the current decode-quality
phase — the decode path is TS-only (`server/src/routes/decode.ts` →
`services/openai.ts`), so the agents service is not on its critical path.

> The `docker/`, `docker-compose.yml`, and `k8s/` files are kept for local use
> and future container deploys but are **off the active deploy path**. The
> `.github/workflows/deploy.yml` (ghcr.io image build) is **manual-only** and is
> not the live deploy. Don't follow Docker/k8s for the current rollout.

---

## Local development

```bash
# Server
cd server && npm install
cp .env.example .env        # add OPENAI_API_KEY (minimum for decode)
npm run dev                 # http://localhost:8787

# Client (separate terminal)
cd client && npm install
npm run dev                 # http://localhost:5173
```

Decode works with **just `OPENAI_API_KEY`**. Everything else degrades
gracefully (see env table) — missing DB / Clerk / Stripe keys won't crash boot;
they just disable persistence / auth / payments.

---

## Production deploy (the live path)

### Prerequisites (one-time, needs YOUR accounts)

```bash
# Railway CLI is installed; log in (opens browser)
railway login

# Vercel CLI is NOT installed yet:
npm i -g vercel
vercel login
```

A **Postgres database** is needed for persistence (archive, tracker, knowledge
base). Railway can provision one (`New → Database → PostgreSQL`) and expose
`DATABASE_URL`. For a pure decode-quality test you *can* run without it — decode
still returns results; it just won't save them.

---

### 1. Server → Railway

```bash
cd server
railway init           # create/link a Railway project for the server
railway up             # first deploy (uses server/railway.json: build npm run build, start npm start)
```

Then set variables (Railway dashboard → service → **Variables**, or `railway variables set KEY=value`):

| Variable | Required for decode? | Notes |
|----------|:---:|-------|
| `OPENAI_API_KEY` | **YES** | The decode itself. Without it: 503. |
| `NODE_ENV` | recommended | `production` (tightens CORS — see step 3) |
| `DATABASE_URL` | no* | Postgres. Without it, decode works but nothing persists. *Required if you want archive/tracker/knowledge base. |
| `CLIENT_URL` | no | Only needed if the client calls Railway directly (not via the Vercel rewrite). With the rewrite setup in step 2, leave unset. |
| `CLERK_SECRET_KEY` | no | Enables authenticated features (archive, Pro). Decode works logged-out without it. |
| `PINECONE_API_KEY` | no | Vector flywheel. Decode works without it. |
| `ELEVENLABS_API_KEY` | no | Maya TTS voice. Not in decode path. |
| `STRIPE_SECRET_KEY` | no | Payments. Not in decode-quality test. |
| `STRIPE_WEBHOOK_SECRET` | no | Stripe webhook verification. |
| `CONVERTKIT_API_KEY` / `CONVERTKIT_FORM_ID` | no | Email capture. |

Railway sets `PORT` automatically — the server reads `process.env.PORT`. Don't hardcode it.

**Verify:** `curl https://<your-railway-domain>/health` → `{"status":"ok"}`

---

### 2. Client → Vercel

```bash
# from repo root (vercel.json builds the client/ subdir)
vercel              # first deploy, links the project (preview)
vercel --prod       # production deploy
```

**IMPORTANT — how the client reaches the API.** The client calls a **relative**
path: `client/src/utils/api.ts` hardcodes `API_BASE = '/api'` and does **not**
read `VITE_API_URL`. So on Vercel, `/api/decode` resolves to the Vercel domain,
which has no server. You must add a **Vercel rewrite** that proxies `/api/*` to
the Railway server. This is already scaffolded in `vercel.json`:

```json
"rewrites": [
  { "source": "/api/:path*", "destination": "https://REPLACE-WITH-RAILWAY-SERVER-URL/api/:path*" }
]
```

➡️ **Replace `REPLACE-WITH-RAILWAY-SERVER-URL`** with your Railway server origin
(from step 1) before deploying the client. Because the browser only ever talks
to the Vercel origin (same-origin), **CORS is a non-issue** with this approach —
you do not need `CLIENT_URL`/CORS config for the decode test.

Set variables (Vercel dashboard → Project → **Settings → Environment Variables**):

| Variable | Required? | Value |
|----------|:---:|-------|
| `VITE_CLERK_PUBLISHABLE_KEY` | for auth | Clerk publishable key. Decode works logged-out without it, but auth UI needs it. |
| `VITE_AGENTS_API_URL` | no | Only if the Maya/agents UI is exercised — not in decode test. |

> The client does **not** use `VITE_API_URL` — routing is via the rewrite above.
> (`VITE_API_URL` appears in CI only as a build-time placeholder; it has no
> runtime effect. Don't rely on it.)

---

### 3. Wire the two together

1. Deploy **server → Railway** first; copy the Railway URL.
2. Put that URL into `vercel.json`'s rewrite (`REPLACE-WITH-RAILWAY-SERVER-URL`); commit.
3. Deploy **client → Vercel**; it proxies `/api/*` → Railway via the rewrite.
4. Both auto-deploy from `main` once linked — subsequent pushes redeploy.

No `VITE_API_URL` and no `CLIENT_URL`/CORS step are needed: the rewrite keeps
the browser same-origin with Vercel. (If you later switch the client to call
Railway *directly* instead of via the rewrite, then you'd need `CLIENT_URL` on
Railway for CORS — but that's not the setup here.)

---

## Post-deploy checklist

- [ ] `GET /health` on Railway returns `{"status":"ok"}`
- [ ] Client loads at the Vercel URL
- [ ] **Decode works:** paste a real rejection, get a result (this is the test path)
- [ ] **Crisis guardrail:** paste text with distress language → helpline card, not a decode
- [ ] Browser console shows no CORS errors on the decode call
- [ ] (If `DATABASE_URL` set) decode persists — check the DB / tracker

---

## Cost estimate (decode-quality test scale, <100 users)

| Service | Cost |
|---------|------|
| Vercel (Hobby) | $0 |
| Railway | ~$5/mo credit; Postgres adds usage |
| OpenAI API | ~$0.01–0.05 per decode |

A 20-person test with ~2 decodes each is well under $5 in OpenAI cost.

---

## Troubleshooting

- **"Service temporarily unavailable" (503) on decode** → `OPENAI_API_KEY` missing/invalid on Railway, or no OpenAI credits.
- **Client loads but decode fails with network/CORS error** → `VITE_API_URL` wrong, or `CLIENT_URL` not set on the server so CORS blocks it.
- **Health check fails / Railway restarts loop** → build failed; run `cd server && npm run build` locally to reproduce. `/health` is mounted pre-auth in `index.ts`, so it should always answer if the process is up.
- **Decode works but nothing saves** → `DATABASE_URL` not set; expected if you skipped Postgres. Decode route swallows DB errors by design so the decode still returns.
