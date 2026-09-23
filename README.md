# Revozi — Social Automation Platform

> Internal team documentation. Not for public distribution.  
> Built on [Postiz](https://github.com/gitroomhq/postiz-app) with custom automation extensions.

---

## Table of Contents

1. [What is Revozi](#1-what-is-revozi)
2. [Architecture Overview](#2-architecture-overview)
3. [Getting Started](#3-getting-started)
4. [Environment Variables](#4-environment-variables)
5. [How the Automation Features Work](#5-how-the-automation-features-work)
6. [Deployment on Railway](#6-deployment-on-railway)
7. [Known Limitations](#7-known-limitations)
8. [Security Notes](#8-security-notes)
9. [Repo Structure](#9-repo-structure)

---

## 1. What is Revozi

Revozi is a multi-tenant social media scheduling and automation platform. It lets teams schedule posts across platforms (LinkedIn, X, Instagram, Facebook, YouTube, TikTok, etc.), automate AI-generated blog content, and publish directly to Blogger, Hashnode, and Beehiiv.

The core scheduling engine is Postiz (open source). Revozi adds:

- An AI-powered daily blog writer that generates and publishes posts automatically
- A Blogger OAuth integration for connecting Google accounts
- A frontend automation page for one-click multi-platform publishing
- A Railway-optimised deployment pipeline

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                │
│  - Postiz scheduling UI                             │
│  - /automation page (direct publish, session-only)  │
└───────────────────────┬─────────────────────────────┘
                        │ REST
┌───────────────────────▼─────────────────────────────┐
│                  Backend (NestJS)                    │
│  - Post scheduling API                              │
│  - Blogger OAuth controller                         │
│  - AI Writer Service (daily cron)                   │
│  - Internal scheduling endpoint                     │
└────────────┬──────────────────────┬─────────────────┘
             │ Prisma               │ Temporal SDK
┌────────────▼──────┐    ┌──────────▼─────────────────┐
│   PostgreSQL DB   │    │   Temporal Worker           │
│   (Railway)       │    │   (post activities)         │
└───────────────────┘    └────────────────────────────┘
```

**Package manager:** pnpm (monorepo)  
**Runtime:** Node.js 22  
**ORM:** Prisma  
**Job scheduling:** Temporal  
**Cron:** `@nestjs/schedule`

---

## 3. Getting Started

### Prerequisites

- Node.js 22+
- pnpm 8+
- PostgreSQL database (local or Railway)
- Redis (for Postiz queues)

### Install

```bash
git clone https://github.com/Sandy568888/Social-Automation-2026
cd Social-Automation-2026
pnpm install
```

### Apply the database schema

```bash
cd libraries/nestjs-libraries
npx prisma db push
npx prisma generate
```

### Run locally

```bash
# Backend
cd apps/backend
pnpm dev

# Frontend (separate terminal)
cd apps/frontend
pnpm dev
```

Frontend: `http://localhost:4200`  
Backend: `http://localhost:3000`

---

## 4. Environment Variables

Copy `.env.example` to `.env` and fill in the values below. **Never commit real secrets.**

### Backend (`apps/backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `ENCRYPTION_SECRET` | ✅ | Min 32-char random string for encrypting stored tokens. App will refuse to start if unset. |
| `INTERNAL_SECRET` | ✅ | Shared secret for internal service-to-service calls (cron → publish endpoint). Must be set — endpoints reject requests when unset. |
| `BACKEND_INTERNAL_URL` | ✅ | Full internal URL of the backend, e.g. `http://localhost:3000`. Used by the AI cron to call the publish endpoint. |
| `PORT` | ✅ | Port the backend listens on (Railway sets this automatically) |
| `OPENAI_API_KEY` | ✅ | OpenAI key for AI blog post generation |
| `BLOGGER_CLIENT_ID` | ✅ | Google OAuth client ID for Blogger |
| `BLOGGER_CLIENT_SECRET` | ✅ | Google OAuth client secret for Blogger |
| `BLOGGER_REFRESH_TOKEN` | ✅ | Refresh token obtained via the `/automation/blogger/connect` OAuth flow |
| `BLOGGER_BLOG_ID` | ✅ | Target Blogger blog ID |
| `HASHNODE_API_KEY` | ⚠️ | Hashnode personal access token. **Never hardcode in source — use this env var only.** |
| `HASHNODE_PUBLICATION_ID` | ⚠️ | Hashnode publication ID |
| `RAILWAY_REPLICA_ID` | — | Set automatically by Railway. Used to elect the primary cron replica (`0` = primary). |
| `TEMPORAL_ADDRESS` | — | Temporal server address if using a remote cluster |
| `PRODUCT_TAG` | — | Identifies this deployment's product in a shared-database setup |

### Frontend (`apps/frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | ✅ | Public URL of the backend API |
| `NEXTAUTH_SECRET` | ✅ | NextAuth session secret |
| `NEXTAUTH_URL` | ✅ | Public URL of the frontend |

---

## 5. How the Automation Features Work

### AI Daily Blog Writer

The `AiWriterService` runs a cron job at **9 AM daily**. On Railway with multiple replicas, only the replica with `RAILWAY_REPLICA_ID=0` executes the job — others skip it immediately.

Flow:
1. Picks a random topic from a curated list
2. Calls the OpenAI API to generate a `{ title, content }` JSON object
3. POSTs to `/platforms/blogger/publish-email` with the `x-internal-secret` header
4. If OpenAI returns an error or empty content, the job **aborts** — it does not publish fallback copy

To trigger manually during development:
```bash
curl -X POST http://localhost:3000/platforms/blogger/publish-email \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: YOUR_INTERNAL_SECRET" \
  -d '{"title":"Test Post","content":"<p>Hello world</p>"}'
```

### Blogger OAuth Flow

1. User visits `/automation/blogger/connect` → redirected to Google OAuth
2. Google redirects to `/automation/blogger/callback` with an auth code
3. Backend exchanges the code for a refresh token
4. **Store the refresh token** in `BLOGGER_REFRESH_TOKEN` env var (it is not auto-persisted)

> The Blogger integration is currently deployment-wide (one blog per deployment). Per-workspace Blogger connections are a planned improvement — see Known Limitations.

### Frontend Automation Page (`/automation`)

The automation page allows one-click publishing to multiple platforms (Blogger, Hashnode, Beehiiv) directly from the browser.

**Important:** Posts published from this page are **session-only**. They do not create Postiz calendar records, scheduling history, or queued jobs. If you refresh the page, draft state is lost. For tracked, persistent publishing use the main Postiz calendar instead.

### Internal Scheduling Endpoint

`POST /internal/schedule` allows the AI writer and other internal services to create and schedule posts programmatically. Requires the `x-internal-secret` header.

If `integration_id` is omitted, the endpoint auto-selects the first active matching integration. If more than one active integration exists for the platform, the endpoint returns `409 Conflict` — pass `integration_id` explicitly to resolve this.

---

## 6. Deployment on Railway

### Services

| Service | Source | Start command |
|---|---|---|
| Backend | `Dockerfile` | `npx prisma db push && node dist/main.js` |
| Frontend | `apps/frontend` | `pnpm build && pnpm start` |
| PostgreSQL | Railway plugin | — |
| Redis | Railway plugin | — |

### Deploy steps

1. Push to `main` — Railway auto-deploys from GitHub
2. On first deploy (or after schema changes), the Dockerfile runs `prisma db push` automatically before starting the server
3. Set all required environment variables in the Railway dashboard (see Section 4)
4. If running multiple backend replicas, Railway sets `RAILWAY_REPLICA_ID` automatically — no extra config needed for cron deduplication

### Scaling note

The cron job is replica-safe: only `RAILWAY_REPLICA_ID=0` runs it. All other replicas skip the job and serve API traffic normally.

---

## 7. Known Limitations

These are confirmed architectural limitations. They are documented here so the team knows what to expect — fixes are planned but not yet implemented.

| ID | Area | Limitation |
|---|---|---|
| M-04 | Cron | The replica guard (`RAILWAY_REPLICA_ID=0`) prevents duplicate runs but does not provide durable catch-up if the primary is down at 9 AM. A missed run is lost until the next day. |
| M-12 | Automation page | Posts published from `/automation` bypass the Postiz scheduler entirely. No calendar record, no history, no retry. Use the main calendar for anything that needs to be tracked. |
| M-02 | Blogger | Blogger credentials are deployment-wide. Multiple workspaces cannot have separate Blogger accounts in the same deployment. |
| L-02 | Database | The `ScheduledPost` model has been removed from the schema. If any custom scripts referenced it, update them to use the standard `Post` model. |
| L-03 | Git | The `revozi-automation-build` submodule reference has been removed. If you had it checked out locally, run `git submodule deinit revozi-automation-build && git rm revozi-automation-build`. |

---

## 8. Security Notes

These practices are enforced in the codebase. Keep them in mind when making changes.

- **`INTERNAL_SECRET`** must always be set. Both Blogger endpoints reject all requests if the variable is missing or empty — they do not fail open.
- **`ENCRYPTION_SECRET`** must always be set. The app refuses to use the `change-me` fallback — set a real 32+ character random string.
- **Never hardcode API keys** in source files. The Hashnode key previously committed to `blog-automation-poc.js` has been removed. Use environment variables only.
- **Blogger refresh tokens** are no longer logged. If you need to rotate the token, run the OAuth connect flow and copy the token from the callback response — not from logs.
- **Cross-organization post access** is scoped at the database layer. All post mutations and group lookups are filtered by `organizationId`.
- **OAuth CSRF state** is required on the Blogger connect flow. Do not remove it.

---

## 9. Repo Structure

```
Social-Automation-2026/
├── apps/
│   ├── backend/                  # NestJS API server
│   │   └── src/
│   │       ├── automation/       # Blogger OAuth, AI writer (Revozi custom)
│   │       ├── api/routes/       # REST controllers incl. internal scheduler
│   │       └── utils/            # Crypto util (encryption)
│   └── frontend/                 # Next.js UI
│       └── src/components/
│           └── automation/       # Automation page (direct publish)
├── libraries/
│   └── nestjs-libraries/
│       └── src/database/prisma/  # Prisma schema, posts/users repositories
├── apps/orchestrator/            # Temporal worker activities
├── Dockerfile                    # Backend container (Railway)
├── railway.toml                  # Railway deployment config
├── revozi_poc_demo.py            # ⚠️ Simulation only — not real publishing
└── blog-automation-poc.js        # Manual Blogger/Hashnode test script
```

---

> Last updated: September 23, 2026  
> Audit remediation: all 26 findings resolved — commits `ac8d880`, `7a99b78`, `40eaade`  
> Maintainer: ATERE EMMANUEL OLUWASEYI