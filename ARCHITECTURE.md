# AAF Refactoring Architecture Overview

> This document is the architecture overview for refactoring the AAF (Anteater Acing the Future) project from a monolithic Flask application into an industrial-grade, full-stack application.
> The directory structure, technical decisions, and engineering conventions for all refactoring phases are governed by this document.
>
> **Last updated:** 2026-07-12 (Added the registration welcome email: `BackgroundTasks` + Jinja2 templating + Resend `send_async()` native async sending — see [extensions.md](extensions.md) for details)
> **Status:** Phase 2 completed, Phase 3 in planning

---

## Table of Contents

1. [Final Technology Stack Decisions](#1-final-technology-stack-decisions)
2. [Target Project Directory Tree](#2-target-project-directory-tree)
3. [Local Development CORS Solution](#3-local-development-cors-solution)
4. [FastAPI Dependency Injection Organization](#4-fastapi-dependency-injection-organization)
5. [Database Schema Planning](#5-database-schema-planning)
6. [Core API Endpoint Contracts](#6-core-api-endpoint-contracts)
7. [Deployment Architecture](#7-deployment-architecture)

---

## 1. Final Technology Stack Decisions

| Layer | Technology Choice | Notes |
|---|---|---|
| Backend framework | FastAPI + Uvicorn | Fully async, automatic OpenAPI docs, Pydantic v2 data validation |
| Backend language | Python 3.12 | |
| Relational database | Supabase (PostgreSQL) | Cloud-hosted, connected via async SQLAlchemy + asyncpg |
| Vector database | ChromaDB (local persistence) | Keeps the existing `chroma_db/` directory, not migrated |
| AI model | Anthropic Claude Sonnet | Async httpx client, 90s timeout |
| Web search | Tavily Search API | Async call, only triggered in student mode |
| Rate limiting | In-memory sliding window (asyncio.Lock) | No Redis dependency, sufficient for single-instance Render deployment |
| Frontend framework | React 18 + Vite + TypeScript | Fully standalone project, located in `frontend/` |
| Frontend state management | Zustand | Wizard steps and form fields |
| Frontend data fetching | TanStack Query | API calls, caching, loading/error state |
| Frontend UI | Tailwind CSS | Preserves the existing visual style |
| Markdown rendering | react-markdown | Replaces the current marked.js |
| Backend deployment | Render | Direct push, render.yaml configures the start command |
| Frontend deployment | Vercel | Direct push, vercel.json configures the SPA fallback route |

---

## 2. Target Project Directory Tree

```
AAF_Product/                              ← Git Monorepo root directory
│
├── backend/                              ← FastAPI backend (deployed to Render)
│   │
│   ├── app/
│   │   ├── main.py                       ← FastAPI instance creation, CORS middleware registration, route mounting
│   │   │
│   │   ├── api/
│   │   │   ├── deps.py                   ← Global dependency injection (DB session, current-user resolution)
│   │   │   └── v1/
│   │   │       ├── router.py             ← Aggregates all v1 sub-routers
│   │   │       └── routes/
│   │   │           ├── guide.py          ← POST /guide/generate (core AI guide generation)
│   │   │           ├── auth.py           ← POST /auth/register, /auth/login, /auth/refresh
│   │   │           ├── ratings.py        ← POST /ratings (satisfaction-rating persistence)
│   │   │           ├── contributions.py  ← POST /contributions (submission) + admin review (GET list / approve / delete, requires admin role)
│   │   │           ├── courses.py        ← GET /courses (static course-list endpoint)
│   │   │           └── calendar.py           ← GET /calendar/{token}.ics (subscription feed) + GET /calendar/me/url
│   │   │
│   │   ├── core/
│   │   │   ├── config.py                 ← Pydantic BaseSettings (reads all environment variables)
│   │   │   ├── security.py               ← JWT issuing/verification, bcrypt password hashing
│   │   │   └── rate_limit.py             ← In-memory sliding-window rate limiting (asyncio.Lock ensures concurrency safety)
│   │   │
│   │   ├── db/
│   │   │   ├── base.py                   ← SQLAlchemy declarative_base()
│   │   │   └── session.py                ← async engine (connects to Supabase) + AsyncSession factory
│   │   │
│   │   ├── models/                       ← SQLAlchemy ORM models (mapped to Supabase table structures)
│   │   │   ├── user.py                   ← users table
│   │   │   ├── guide.py                  ← guides table (AI generation history)
│   │   │   └── rating.py                 ← ratings table
│   │   │
│   │   ├── schemas/                      ← Pydantic v2 request/response schemas (API contract layer)
│   │   │   ├── auth.py                   ← RegisterRequest, LoginRequest, TokenResponse
│   │   │   ├── guide.py                  ← GuideRequest, GuideResponse
│   │   │   ├── calendar.py               ← CalendarUrlResponse
│   │   │   ├── export.py                ← DocxExportResponse
│   │   │   └── rating.py                 ← RatingRequest, RatingResponse
│   │   │
│   │   ├── services/                     ← Pure business-logic layer (holds no Request/Response objects)
│   │       ├── ai_service.py             ← Prompt assembly + async Claude calls + <thinking> tag stripping
│   │       ├── rag_service.py            ← ChromaDB semantic retrieval (wrapped via asyncio.to_thread)
│   │       ├── search_service.py         ← Async Tavily wrapper (includes bug fixes + source tagging)
│   │       ├── calendar_service.py       ← Markdown task parsing + RFC 5545 .ics generation
│   │       ├── docs_export_service.py  ← python-docx generation + Supabase Storage upload + presigned URL
│   │       └── email_service.py          ← Jinja2 template rendering + Resend send_async() sending
│   │
│   │   └── templates/
│   │       └── welcome_email.html        ← Jinja2 welcome-email template
│   │
│   ├── chroma_db/                        ← ChromaDB local persistence directory (data files excluded via .gitignore)
│   │
│   ├── data/
│   │   └── AAF_responses.csv             ← Raw senior-student feedback data (exported from Google Forms)
│   │
│   ├── scripts/
│   │   └── load_rag_data.py              ← One-time CSV → ChromaDB import script (not a web service)
│   │
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── test_ai_service.py
│   │   │   └── test_security.py
│   │   └── integration/
│   │       └── test_guide_route.py
│   │
│   ├── .env                              ← Local secrets (git-ignored)
│   ├── .env.example                      ← Secrets template (committed to Git)
│   ├── requirements.txt
│   └── render.yaml                       ← Render platform deployment config (start command, environment variable declarations)
│
├── frontend/                             ← React 18 + Vite frontend (deployed to Vercel)
│   │
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts                 ← axios instance (baseURL switches based on environment variable)
│   │   │   ├── guide.ts                  ← generateGuide() call wrapper
│   │   │   ├── auth.ts                   ← login(), register(), refresh() wrappers
│   │   │   └── ratings.ts                ← submitRating() wrapper
│   │   │
│   │   ├── components/
│   │   │   ├── wizard/
│   │   │   │   ├── StepIdentity.tsx      ← Step 1: role selection
│   │   │   │   ├── StepCourses.tsx       ← Step 2: course selection + search engine
│   │   │   │   └── StepGoals.tsx         ← Step 3: goals + confidence + free text
│   │   │   ├── result/
│   │   │   │   ├── GuideCard.tsx         ← Markdown rendering (react-markdown)
│   │   │   │   ├── RatingBar.tsx         ← Satisfaction emoji rating (calls the real API)
│   │   │   │   └── ExportMenu.tsx        ← .ics / PDF / Google Docs export
│   │   │   └── ui/
│   │   │       ├── AtomLoader.tsx        ← SVG atom animation (migrated from index.html)
│   │   │       ├── CourseChip.tsx        ← Course tag card
│   │   │       └── ProgressBar.tsx       ← Three-step progress bar
│   │   │
│   │   ├── hooks/
│   │   │   ├── useGuide.ts               ← TanStack Query: useMutation wrapping AI generation
│   │   │   └── useAuth.ts                ← Login state, token-refresh logic
│   │   │
│   │   ├── store/
│   │   │   └── wizardStore.ts            ← Zustand: current step, form fields, role state
│   │   │
│   │   ├── types/
│   │   │   └── index.ts                  ← TypeScript types aligned with the backend's Pydantic schemas
│   │   │
│   │   ├── data/
│   │   │   └── courses.ts                ← 80+ UCI course list (migrated here from index.html)
│   │   │
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   │
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts                    ← Includes the dev-environment proxy config (the core of the CORS solution)
│   ├── tsconfig.json
│   ├── package.json
│   └── vercel.json                       ← Vercel SPA route fallback config
│
├── templates/
│   └── welcome_email.html    ← Jinja2 welcome-email template
│
├── .gitignore                            ← Covers .env, chroma_db/, node_modules/, venv/, __pycache__/
├── ARCHITECTURE.md                       ← This file: architecture overview
└── README.md
```

---

## 3. Local Development CORS Solution

During local development, the Vite dev server runs on `http://localhost:5173` and FastAPI runs on `http://localhost:8000`. A **dual-safeguard strategy** is used, configured once on each side, each backing up the other.

### Strategy A: Vite Dev Proxy (the primary approach during development)

Configure the proxy in `frontend/vite.config.ts`. All `/api/*` requests are **forwarded at the Node layer** by the Vite dev server to the backend — from the browser's perspective, every request is always same-origin, so the CORS problem fundamentally doesn't exist.

```
Browser
  └── localhost:5173/api/v1/guide/generate
            ↓ (transparent proxying at Vite's Node layer, invisible to the browser)
      localhost:8000/api/v1/guide/generate
```

The `baseURL` configuration rule in `frontend/src/api/client.ts`:

| Environment | `VITE_API_BASE_URL` value | Actual effect |
|---|---|---|
| Local development | `/api` (relative path) | Hits the Vite proxy, forwarded to `localhost:8000` |
| Production deployment | `https://aaf-api.onrender.com` | Requests the Render backend domain directly |

### Strategy B: FastAPI CORSMiddleware (required in production + a fallback during development)

Register `CORSMiddleware` in `backend/app/main.py`; the allowed Origin list is read from `config.py`'s environment variables:

| Environment | `ALLOWED_ORIGINS` value |
|---|---|
| Local `.env` | `http://localhost:5173` |
| Render production environment variable | `https://aaf-product.vercel.app` |

Combined, the two mean: local development doesn't depend on the backend's CORS configuration (the proxy already intercepts everything); production deployment doesn't depend on Vite (the allowlist is precisely governed by CORSMiddleware). The wildcard `"*"` is never used.

---

## 4. FastAPI Dependency Injection Organization

All reusable "resource acquisition" logic is centralized in `backend/app/api/deps.py`, and injected into route functions via FastAPI's `Depends()` mechanism.

### Dependency Chain

```
get_db()
    └── get_current_user()   ← Returns a User ORM object; 401 if the token is invalid
            └── get_optional_user()  ← Returns User | None; no error when the token is missing
```

### `get_db()` — Async DB Session Lifecycle

Each request gets its own dedicated `AsyncSession`; regardless of success or failure, it's automatically closed once the request ends, with no connection-pool resource leaks.

```
Request comes in
  → yield AsyncSession (obtained from the connection pool)
    → route function executes
      → completes normally: await session.commit()
      → raises an exception: await session.rollback()
  → finally: await session.close()
```

### `get_current_user()` — JWT Verification + User Lookup

```
1. Extract the Bearer token from the Authorization header
2. Verify the JWT signature + expiration using core/security.py
3. Take user_id from the token payload
4. Query the users table using the Session provided by get_db()
5. User doesn't exist or the token is invalid → HTTP 401 (the route function does not execute)
6. Verification passes → return the User ORM object
```

### `get_optional_user()` — Supports Anonymous Access

Behaves exactly the same as `get_current_user()`, with one difference: returns `None` instead of 401 when the token is missing or invalid. Used for endpoints that support anonymous access (Guide generation — usable by anonymous users, but history is not saved).

### Usage Patterns in Route Functions

```python
# Endpoints that require login (e.g. viewing personal history)
async def get_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ...

# Endpoints usable both anonymously and logged in (e.g. generating an AI guide)
async def generate_guide(
    request: GuideRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    ...
```

> **Important**: FastAPI automatically resolves the dependency graph — the `get_db()` that `get_current_user` depends on internally and the `get_db()` explicitly declared in the route function's signature **share the same Session instance** (within the same request lifecycle); no manual passing is needed, and no second database connection is created.

---

## 5. Database Schema Planning

The following table structures will be created in the Supabase console, and mapped by SQLAlchemy ORM models at the same time.

### `users` table

| Field | Type | Constraint |
|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL |
| `hashed_pw` | VARCHAR(255) | NOT NULL |
| `display_name` | VARCHAR(100) | |
| `role` | ENUM | `('student', 'senior', 'admin')` |
| `is_verified` | BOOLEAN | DEFAULT FALSE |
| `calendar_token` | VARCHAR(64) | UNIQUE, NULLABLE (lazily generated on the first request to `/calendar/me/url`) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

### `guides` table (AI generation history)

| Field | Type | Constraint |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users, **nullable** (supports anonymous) |
| `role` | VARCHAR(10) | |
| `courses` | TEXT[] | |
| `confidence` | FLOAT | |
| `goals` | TEXT[] | |
| `user_query` | TEXT | |
| `response_md` | TEXT | Full AI-generated Markdown text |
| `tokens_used` | INT | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

### `ratings` table (satisfaction-rating persistence, solving the current data-loss problem)

| Field | Type | Constraint |
|---|---|---|
| `id` | UUID | PK |
| `guide_id` | UUID | FK → guides |
| `user_id` | UUID | FK → users, **nullable** |
| `score` | SMALLINT | CHECK (score IN (1, 0, -1)), corresponding to good/neutral/bad |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

### `contributions` table (senior-experience submission records)

| Field | Type | Constraint |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users, **nullable** |
| `course` | VARCHAR(50) | |
| `danger_zone` | TEXT | |
| `setup_tips` | TEXT | |
| `career_value` | TEXT | |
| `is_approved` | BOOLEAN | DEFAULT FALSE (synced to ChromaDB pending admin review) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

---

## 6. Core API Endpoint Contracts

All endpoints are mounted under the `/api/v1/` prefix. FastAPI automatically generates complete OpenAPI documentation, accessible at `/docs` (Swagger UI) or `/redoc`.

| Endpoint | Method | Description | Auth Requirement |
|---|---|---|---|
| `/api/v1/guide/generate` | POST | Generate an AI-personalized guide (core) | Optional |
| `/api/v1/guide/history` | GET | Get the current user's history | Required |
| `/api/v1/guide/{id}` | GET | Get a single guide's detail | Optional |
| `/api/v1/ratings` | POST | Submit a satisfaction rating | Optional |
| `/api/v1/contributions` | POST | Senior submits course experience | Optional |
| `/api/v1/contributions` | GET | Admin views the pending-review list (`is_approved=false`) | Required (admin) |
| `/api/v1/contributions/{id}/approve` | POST | Admin approves, synced into ChromaDB | Required (admin) |
| `/api/v1/contributions/{id}` | DELETE | Admin rejects (deletes the record directly) | Required (admin) |
| `/api/v1/courses` | GET | Get the list of supported UCI courses | None |
| `/api/v1/auth/register` | POST | Email registration (dispatches the welcome email asynchronously in the background, doesn't block the response) | None |
| `/api/v1/auth/login` | POST | Email login, returns a token | None |
| `/api/v1/auth/refresh` | POST | Refresh the access token | None |
| `/api/v1/auth/logout` | POST | Invalidates the refresh token | Required |
| `/api/v1/auth/me` | GET | Get the current user's info | Required |
| `/api/v1/calendar/{token}.ics` | GET | Calendar subscription feed (RFC 5545, includes tasks from the user's latest guide) | Token in URL (not JWT) |
| `/api/v1/calendar/me/url` | GET | Get the current user's subscription link (`ics_url` / `webcal_url`) | Required |
| `/api/v1/guide/{guide_id}/export/docx` | POST | Generate a `.docx` (generated in-memory, uploaded to Supabase Storage), returns a presigned URL | Optional |
| `/api/v1/health` | GET | Health check (DB + ChromaDB connectivity) | None |

### Guide Generation Endpoint Schema

**Request `GuideRequest`**

```json
{
  "role": "student",
  "courses": ["ICS 32", "MATH 2B"],
  "confidence": 6.0,
  "goals": ["ace_grade", "career"],
  "user_query": "I just finished ICS 31 with B+..."
}
```

**Response `GuideResponse`**

```json
{
  "guide_id": "uuid-...",
  "guide_markdown": "### 🔥 ICS 32 + MATH 2B...",
  "sources_used": ["https://reddit.com/r/UCI/..."],
  "tips_count": 3,
  "tokens_used": 1423
}
```

---

## 7. Deployment Architecture

```
User's Browser
    │
    ├── Vercel CDN
    │     └── React static build output (HTML/JS/CSS)
    │           └── VITE_API_BASE_URL → Render backend domain
    │
    └── Render (FastAPI + Uvicorn)
          ├── Supabase PostgreSQL (cloud-hosted, connection pool via asyncpg)
          ├── ChromaDB (persisted on the Render instance's local filesystem)
          ├── Anthropic Claude API (external call)
          └── Tavily Search API (external call)
```

### Key Configuration Files

**`backend/render.yaml`**
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health-check path: `/api/v1/health`
- Environment variables configured in the Render console (`.env` is never committed)

**`frontend/vercel.json`**
- Configures the SPA fallback route: every path returns `index.html` (supports React Router's client-side routing)

### Local Development Start Commands

```bash
# Backend (from the backend/ directory)
uvicorn app.main:app --reload --port 8000

# Frontend (from the frontend/ directory)
npm run dev   # Starts on localhost:5173 by default; the proxy automatically forwards /api/* to :8000
```

---

*This file was generated by the architect before the project refactor began. Code implementation must strictly follow the directory structure and interface contracts in this document.*
