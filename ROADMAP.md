# REJECT Platform - 10B Roadmap

**Started:** March 10, 2026
**Goal:** Build an intelligent career platform with a self-improving knowledge flywheel

---

## Current State (What Exists)

### Working
- [x] React frontend with tracker, decoder, insights
- [x] TypeScript server (Express) on Railway
- [x] PostgreSQL database with rejection patterns
- [x] 8 Python agents (ADK/Gemini) - but routing is broken
- [x] ElevenLabs voice for Maya
- [x] Pinecone Vector DB (5 test records)
- [x] Clerk auth + Stripe payments

### Problems
- [ ] Agents don't talk to each other properly
- [ ] No user profile/CV storage
- [ ] Agents don't know WHO the user is
- [ ] Vector DB not synced with PostgreSQL
- [ ] No CI/CD pipeline
- [ ] Docker not configured

---

## Phase 1: Foundation (Current Sprint)

### 1.1 User Profile System
**Status:** ✅ COMPLETE
**Goal:** Agents know WHO the user is

Completed:
- [x] `user_profiles` table in PostgreSQL
- [x] `upsertUserProfile()` and `getUserProfile()` functions
- [x] Profile API routes: GET/PUT `/api/user/profile`, POST `/api/user/profile/cv`
- [x] UserProfile.tsx - form with skills picker, CV upload
- [x] `get_user_profile` tool in reject_coach.py
- [x] CV upload (.txt for now, PDF parsing future)

### 1.2 Simplify to One Super Agent
**Status:** ✅ COMPLETE
**Goal:** One agent with tools, not 8 agents that don't talk

Completed:
- [x] Created `agents/agents/reject_coach.py` - single super agent
- [x] 8 FunctionTools: get_user_profile, decode_rejection, analyze_job, search_jobs, query_company_intel, analyze_cv, generate_interview_prep, emotional_support
- [x] Updated server.py - reject_coach is now the default
- [x] Removed agent picker from UI - one agent does everything
- [x] Voice toggle works for any response (Maya's ElevenLabs voice)
- [x] Fixed TTS proxy routing for reliable voice

Architecture:
```
BEFORE: User → Router → Maya/CV/Interview/etc (broken)
AFTER:  User → REJECT Coach → uses tools as needed ✓
```

---

## Phase 2: Knowledge Flywheel

### 2.1 Auto-Learn from Decodes
**Status:** ✅ COMPLETE
**Goal:** Every decoded rejection makes system smarter

Flow:
```
User decodes → Save to PostgreSQL → Sync to Pinecone → Agents search patterns ✓
```

Completed:
- [x] `storeDecodedRejection()` in vectordb.ts - embeds rejection patterns
- [x] Hooked into decode.ts - auto-syncs on every decode
- [x] `searchSimilarRejections()` - semantic search for patterns
- [x] `/api/knowledge/search` endpoint for agents
- [x] `search_rejection_patterns` tool in reject_coach.py
- [x] Agent can now answer: "Why do I keep getting rejected at Google?"

### 2.2 Proactive Warnings
**Status:** Not Started
**Goal:** Warn users BEFORE they apply

Tasks:
- [ ] Create `get_company_risk` tool
- [ ] Query knowledge base for company stats
- [ ] In Job Advisor flow, check company risk
- [ ] Show: "Warning: This company ghosts 60% of applicants"

---

## Phase 3: Infrastructure

### 3.1 Docker
**Status:** Not Started
**Goal:** Consistent environments

Tasks:
- [ ] Dockerfile for `server/` (TypeScript)
- [ ] Dockerfile for `agents/` (Python)
- [ ] docker-compose.yml for local dev
- [ ] Test: `docker-compose up` runs everything

### 3.2 CI/CD
**Status:** Not Started
**Goal:** Auto-deploy on git push

Tasks:
- [ ] GitHub Actions workflow
- [ ] Run tests on PR
- [ ] Deploy to Railway on merge to main
- [ ] Deploy agents to Railway/Render

### 3.3 Kubernetes (Later)
**Status:** Not Started
**Goal:** Scale to millions

Tasks:
- [ ] Kubernetes manifests
- [ ] Helm charts
- [ ] Auto-scaling policies
- [ ] This is for when you have real traffic

---

## Progress Log

### March 10, 2026

**Session 1: Voice + Vector DB**
- [x] Integrated ElevenLabs TTS for Maya
- [x] Set up Pinecone Vector DB
- [x] Created `vectordb.ts` service
- [x] Seeded 5 pivot stories + rejection wisdom
- [x] Created Python `vectordb_tools.py`
- [x] Fixed agent routing (each agent has own runner)
- [x] Tested Maya searching Vector DB successfully!

**Key Learning:**
- TypeScript imports use `.js` extension even for `.ts` files
- Pinecone SDK v8 uses `Index()` not `index()`
- Need `namespace="__default__"` for searches
- Lazy initialization prevents import-time errors

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         REJECT PLATFORM                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    USER PROFILE (Phase 1)                    │   │
│  │  CV + Skills + Experience + Goals                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    REJECT AI (Phase 1)                       │   │
│  │  One super agent with tools:                                 │   │
│  │  • analyze_cv        • decode_rejection                      │   │
│  │  • search_jobs       • interview_prep                        │   │
│  │  • company_intel     • pivot_stories                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 KNOWLEDGE BRAIN (Phase 2)                    │   │
│  │                                                              │   │
│  │   PostgreSQL              Pinecone                          │   │
│  │   (Stats & Records)       (Semantic Search)                 │   │
│  │        │                        │                           │   │
│  │        └────────────────────────┘                           │   │
│  │              Auto-sync on decode                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 INFRASTRUCTURE (Phase 3)                     │   │
│  │  Docker → CI/CD → Kubernetes                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Quick Reference

**Start servers:**
```bash
# TypeScript server
cd server && npm run dev

# Python agents
cd agents && source venv/bin/activate && python server.py

# React frontend
cd client && npm run dev
```

**Test Maya:**
```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I feel lost as a teacher wanting tech", "agent": "maya"}'
```

**Seed Vector DB:**
```bash
cd server && npx tsx src/scripts/seedVectorDB.ts
```

---

## Next Session

Start with: **2.1 Knowledge Flywheel**

Why: Phase 1.2 done. Now make the system learn from every decode.
