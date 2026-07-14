# Phase 1 Execution Manual: FastAPI Project Scaffolding + Core Route Migration

> **Status**: Pending
> **Prerequisite**: Phase 0 completed and `git commit`ed
> **Acceptance goal**: `POST /api/v1/guide/generate` responds for real under FastAPI, with quality matching the original Flask version
> **Collaboration constraint**: Wait for confirmation before each step; after execution, wait for local tests to pass and a `git commit` before moving to the next step

---

## Current State Summary

| Item | Current State |
|---|---|
| Framework | Flask (single `app.py` file, 600+ lines) |
| Vector database | `chroma_db/` (project root) |
| Dependency manifest | root-level `requirements.txt`, includes flask/gunicorn |
| Deployment entrypoint | `Procfile` (gunicorn) |
| Target structure | layered FastAPI project under `backend/` (see ARCHITECTURE.md §2) |

---

## Milestone A: Dependency Layer

### Step 1 — Create `backend/requirements.txt`

**Stage goal**: Declare the complete FastAPI-ecosystem dependencies, fully removing Flask/Gunicorn.

**Technical details**:

Remove the following legacy dependencies:
- `flask`
- `gunicorn`

Add the following dependencies:

| Package | Version constraint | Purpose |
|---|---|---|
| `fastapi` | unpinned | Core framework, replaces Flask |
| `uvicorn[standard]` | unpinned | ASGI server, replaces gunicorn |
| `sqlalchemy[asyncio]` | unpinned | Async ORM support |
| `asyncpg` | unpinned | PostgreSQL async driver (Supabase connection) |
| `pydantic-settings` | unpinned | Pydantic v2 `BaseSettings`, reads `.env` |
| `httpx` | unpinned | Async HTTP client (Anthropic SDK async dependency) |
| `python-jose[cryptography]` | unpinned | JWT issuing/verification (pre-wired for Phase 2 auth) |
| `passlib[bcrypt]` | unpinned | bcrypt password hashing (pre-wired for Phase 2 auth) |

Keep the following existing dependencies (version constraints unchanged):
- `anthropic`
- `tavily-python`
- `chromadb==0.4.24`
- `numpy<2.0.0`
- `python-dotenv`

**File location**: `backend/requirements.txt` (a brand-new file, coexisting with the old root-level version; the old one is not deleted yet)

---

## Milestone B: Project Skeleton

### Step 2 — Batch-create all empty `__init__.py` placeholder files

**Stage goal**: Establish the complete Python package hierarchy under `backend/`, so that all subsequent import statements are valid.

**Technical details**:

The following files are all **empty files** (0 bytes), serving only to declare package boundaries:

```
backend/app/__init__.py
backend/app/api/__init__.py
backend/app/api/v1/__init__.py
backend/app/api/v1/routes/__init__.py
backend/app/core/__init__.py
backend/app/db/__init__.py
backend/app/models/__init__.py
backend/app/schemas/__init__.py
backend/app/services/__init__.py
```

> This is the only step where batch operations are allowed, since none of these files contain any real logic.

---

## Milestone C: Configuration Layer

### Step 3 — Create `backend/app/core/config.py`

**Stage goal**: Establish a single entry point for reading environment variables — all secrets/config are accessed through this module, with zero hardcoding in the code.

**Technical details**:

Uses Pydantic v2 `BaseSettings`. `model_config = SettingsConfigDict(env_file=".env", extra="ignore")`.

Declare the following fields:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | `str` | none | Supabase `postgresql+asyncpg://...` connection string |
| `ANTHROPIC_API_KEY` | `str` | none | Claude API key |
| `TAVILY_API_KEY` | `str` | none | Tavily search key |
| `JWT_SECRET_KEY` | `str` | none | JWT signing key |
| `JWT_ALGORITHM` | `str` | `"HS256"` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `int` | `60` | Access token validity period |
| `ALLOWED_ORIGINS` | `list[str]` | `["http://localhost:5173"]` | CORS allowlist |

At the bottom of the module, create a global singleton: `settings = Settings()`; all other modules uniformly call it via `from app.core.config import settings`.

---

### Step 4 — Create `backend/.env.example`

**Stage goal**: Provide a template file for all environment variables, committed to Git, for team members to reference when configuring locally.

**Technical details**:

Contains the key names of every field from Step 3; values are all left blank or filled with meaningless placeholders:

```
DATABASE_URL=postgresql+asyncpg://user:password@host:port/dbname
ANTHROPIC_API_KEY=sk-ant-...
TAVILY_API_KEY=tvly-...
JWT_SECRET_KEY=change-me-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
ALLOWED_ORIGINS=http://localhost:5173
```

> `.env` (real secrets) is already in `.gitignore` — only `.env.example` is committed to Git.

---

## Milestone D: Database Layer

### Step 5 — Create `backend/app/db/base.py`

**Stage goal**: Establish the SQLAlchemy ORM base class; all models inherit from this `Base`.

**Technical details**:

Uses SQLAlchemy 2.0+'s `DeclarativeBase` (not the legacy `declarative_base()`):

```python
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass
```

All ORM models (Steps 7-9) inherit from this `Base`.

---

### Step 6 — Create `backend/app/db/session.py`

**Stage goal**: Configure the async database engine and session factory, preparing for FastAPI dependency injection.

**Technical details**:

- Engine: `create_async_engine(settings.DATABASE_URL, pool_size=5, max_overflow=10, echo=False)`
- Session factory: `AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)`
- Expose `async_engine` for use by `main.py`'s lifespan event (for future connection-pool warmup/shutdown)

> **Important**: This step only writes configuration code — it does not actually connect to Supabase. `DATABASE_URL` can be temporarily left blank in `.env`; the engine only establishes a connection on the first real DB call. Supabase connectivity verification happens in Phase 2.

---

### Step 7 — Create `backend/app/models/user.py`

**Stage goal**: Establish the ORM mapping model for the `users` table.

**Technical details**:

Fields align with the `users` table definition in ARCHITECTURE.md §5:

| Field | SQLAlchemy Type | Constraint |
|---|---|---|
| `id` | `Uuid` | PK, `default=uuid.uuid4` |
| `email` | `String(255)` | `unique=True, nullable=False` |
| `hashed_pw` | `String(255)` | `nullable=False` |
| `display_name` | `String(100)` | nullable |
| `role` | `String(10)` | CHECK IN `('student', 'senior', 'admin')` |
| `is_verified` | `Boolean` | `default=False` |
| `created_at` | `DateTime(timezone=True)` | `server_default=func.now()` |

---

### Step 8 — Create `backend/app/models/guide.py`

**Stage goal**: Establish the ORM mapping model for the `guides` table (AI generation history).

**Technical details**:

| Field | SQLAlchemy Type | Constraint |
|---|---|---|
| `id` | `Uuid` | PK, `default=uuid.uuid4` |
| `user_id` | `Uuid` | FK → `users.id`, **nullable** (supports anonymous) |
| `role` | `String(10)` | |
| `courses` | `ARRAY(Text)` | |
| `confidence` | `Float` | |
| `goals` | `ARRAY(Text)` | |
| `user_query` | `Text` | nullable |
| `response_md` | `Text` | Full AI-generated Markdown text |
| `tokens_used` | `Integer` | |
| `created_at` | `DateTime(timezone=True)` | `server_default=func.now()` |

---

### Step 9 — Create `backend/app/models/rating.py`

**Stage goal**: Establish the ORM mapping model for the `ratings` table (satisfaction-score persistence).

**Technical details**:

| Field | SQLAlchemy Type | Constraint |
|---|---|---|
| `id` | `Uuid` | PK, `default=uuid.uuid4` |
| `guide_id` | `Uuid` | FK → `guides.id`, `nullable=False` |
| `user_id` | `Uuid` | FK → `users.id`, **nullable** |
| `score` | `SmallInteger` | CHECK IN `(1, 0, -1)`, corresponding to good/neutral/bad |
| `created_at` | `DateTime(timezone=True)` | `server_default=func.now()` |

---

## Milestone E: Schema Layer (API Contract)

### Step 10 — Create `backend/app/schemas/guide.py`

**Stage goal**: Strictly define the Guide endpoint's request/response structures with Pydantic v2, serving as the frontend/backend contract.

**Technical details**:

`GuideRequest` (request body):

| Field | Type | Description |
|---|---|---|
| `role` | `Literal["student", "senior"]` | Role |
| `courses` | `list[str]` | `min_length=1` |
| `confidence` | `float` | `ge=0, le=10` |
| `goals` | `list[str]` | |
| `user_query` | `str \| None` | `default=None` |

`GuideResponse` (response body, aligned with ARCHITECTURE.md §6):

| Field | Type | Description |
|---|---|---|
| `guide_id` | `UUID` | |
| `guide_markdown` | `str` | Full AI-generated Markdown |
| `sources_used` | `list[str]` | List of Tavily source URLs |
| `tips_count` | `int` | Number of tips matched from ChromaDB |
| `tokens_used` | `int` | Actual tokens consumed by Claude |

---

### Step 11 — Create `backend/app/schemas/rating.py`

**Stage goal**: Define the request/response schema for the rating endpoint.

**Technical details**:

`RatingRequest`:
- `guide_id: UUID`
- `score: Literal[-1, 0, 1]` (-1=bad, 0=neutral, 1=good)

`RatingResponse`:
- `id: UUID`
- `guide_id: UUID`
- `score: int`
- `created_at: datetime`

---

## Milestone F: Service Layer (Core Business Logic Migration)

### Step 12 — Create `backend/app/services/rag_service.py`

**Stage goal**: Migrate `rag.py`'s ChromaDB retrieval logic into an async interface, for the route layer to call.

**Technical details**:

The ChromaDB client is a **synchronous** library and cannot be called directly inside an `async` function (it would block the event loop). Solution: use `asyncio.to_thread()` to push the synchronous call onto a thread pool.

The core logic is ported as-is from `rag.py`'s `retrieve_tips()`, with only these changes:

1. The `PersistentClient(path=...)` path changes from the project root to `backend/chroma_db/` (in line with the directory migration in Step 20)
2. Wrapped on the outside with `asyncio.to_thread`:

```python
async def retrieve_tips_async(query: str, course: str, n: int = 3) -> list[str]:
    return await asyncio.to_thread(_retrieve_tips_sync, query, course, n)
```

The function returns `list[str]`, where each element is one piece of senior-student feedback text.

---

### Step 13 — Create `backend/app/services/search_service.py`

**Stage goal**: Extract the Tavily search logic from `app.py` into a standalone async service, including the complete source-tagging logic.

**Technical details**:

`TavilyClient.search()` is also a **synchronous** call, and is likewise wrapped with `asyncio.to_thread()`.

Core function signature:

```python
async def tavily_search(courses: list[str]) -> tuple[list[str], str]:
    # Returns: (sources_used: list[str], formatted_str: str)
```

The internal logic is migrated as-is from `app.py`:
- Only takes `courses[:1]` (the first course), to avoid timeouts
- Issues two targeted queries: `{course} UCI professor exam difficulty study tips reddit student experience` and `{course} UCI internship career relevance skills employers`
- Source-tagging logic is **fully preserved**:

| URL Pattern | Tag |
|---|---|
| `reddit.com` | 📌 r/UCI Forum |
| `uci.edu` | 🎓 UCI Official |
| `ratemyprofessors.com` | ⭐ RateMyProfessors |
| `blind.com` | 💼 Blind SWE Intel |
| `linkedin.com` | 🔗 LinkedIn |
| other | 🌐 Web |

- Deduplication logic (dedupes by a key of the first 60 characters) is preserved as-is
- On Tavily failure, `return ([], "")` — **does not affect the main flow** (consistent with the original code's `except: pass` behavior)

---

### Step 14 — Create `backend/app/services/ai_service.py`

**Stage goal**: Migrate the Claude API call logic and the complete `SYSTEM_PROMPT`, implementing an async generation interface.

**Technical details**:

1. **SYSTEM_PROMPT**: copied verbatim from `app.py` lines 41-123, with no content modified.
2. **Client initialization**: use `httpx.AsyncClient(timeout=90.0)` to create the async Anthropic client:
   ```python
   client = Anthropic(
       api_key=settings.ANTHROPIC_API_KEY,
       http_client=httpx.AsyncClient(timeout=90.0)
   )
   ```
3. **Core function signature**:
   ```python
   async def generate_guide(user_context: str) -> tuple[str, int]:
       # Returns: (cleaned_markdown: str, tokens_used: int)
   ```
4. **Stripping `<thinking>` tags**: preserved as-is via `re.sub(r"<thinking>.*?</thinking>", "", raw, flags=re.DOTALL).strip()`.
5. **User-context assembly helper function**:
   ```python
   def build_user_context(
       role: str,
       courses: list[str],
       confidence: float,
       goals: list[str],
       user_query: str | None,
       senior_tips_str: str,
       search_results: str,
   ) -> str:
       # Migrated as-is from app.py's parts[] assembly logic
   ```

---

## Milestone G: Route Layer

### Step 15 — Create `backend/app/api/deps.py`

**Stage goal**: Implement FastAPI's global dependency-injection functions, for all routes to use via `Depends()`.

**Technical details**:

Implements the three dependency chains defined in ARCHITECTURE.md §4:

**`get_db()`** — AsyncSession lifecycle management:
```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

**`get_current_user()`** — a stub in Phase 1, directly returns `None` (Phase 2 fills in full JWT verification):
```python
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Phase 2 implementation: JWT verification → query users table → return User or raise 401
    raise HTTPException(status_code=401, detail="Auth not implemented yet")
```

**`get_optional_user()`** — returns `None` when the token is missing/invalid:
```python
async def get_optional_user(...) -> User | None:
    # Phase 1 stub: directly returns None
    return None
```

---

### Step 16 — Create `backend/app/api/v1/routes/guide.py`

**Stage goal**: Implement the `POST /guide/generate` endpoint — the single most critical file in Phase 1 — running ChromaDB and Tavily concurrently.

**Technical details**:

Endpoint function signature:
```python
@router.post("/generate", response_model=GuideResponse)
async def generate_guide(
    body: GuideRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
```

Execution flow (**key concurrency optimization**):

```
1. Build a ChromaDB query list for each course
2. Decide whether to trigger Tavily based on role (skipped for the senior role)
3. Concurrent execution via asyncio.gather:
   ├── [rag_service.retrieve_tips_async(course) for course in courses]  ← ChromaDB
   └── search_service.tavily_search(courses) if role != "senior" else ("", "")  ← Tavily
   return_exceptions=True  ← a failure in either one does not block the other
4. Assemble senior_tips_str (format aligned with the original app.py's lines[] logic)
5. Call ai_service.build_user_context() to assemble user_context
6. Call ai_service.generate_guide(user_context) to get (markdown, tokens)
7. Phase 1 does not write to the database yet; guide_id is temporarily generated via uuid.uuid4()
8. Return GuideResponse
```

Compared to the original serial Flask code, the multi-course ChromaDB queries and the two targeted Tavily searches now run **concurrently at the same time**, theoretically cutting response time by 40-60%.

**Error handling**:
- Any exception at the service layer is caught, logged via `logging.error()`, and re-raised as `HTTPException(status_code=500, detail=...)`
- A Tavily failure degrades to an empty result and does not affect the main flow (consistent with the original code's behavior)

---

### Step 17 — Create `backend/app/api/v1/routes/courses.py`

**Stage goal**: Provide the static `GET /courses` endpoint, returning the list of supported UCI courses.

**Technical details**:

- Extract the list of 80+ course codes from `templates/index.html`, hardcoded as a `COURSES: list[str]` constant
- The endpoint directly returns this list (no DB query)
- Response schema: `{"courses": ["ICS 31", "ICS 32", ...]}`

---

### Step 18 — Create `backend/app/api/v1/router.py`

**Stage goal**: Aggregate all v1 sub-routers, providing a unified route-registration entry point.

**Technical details**:

```python
from fastapi import APIRouter
from app.api.v1.routes import guide, courses

api_router = APIRouter()
api_router.include_router(guide.router, prefix="/guide", tags=["guide"])
api_router.include_router(courses.router, prefix="/courses", tags=["courses"])
```

Phase 2 will append the `auth`, `ratings`, and `contributions` routers here.

---

## Milestone H: Application Entrypoint

### Step 19 — Create `backend/app/main.py`

**Stage goal**: Create the FastAPI application instance, register the CORS middleware and all routes — this is uvicorn's startup entrypoint.

**Technical details**:

1. **lifespan context manager** (application-level startup/shutdown hooks):
   ```python
   @asynccontextmanager
   async def lifespan(app: FastAPI):
       # startup: connection-pool warmup and ChromaDB connectivity checks will go here in the future
       logger.info("AAF FastAPI starting up...")
       yield
       # shutdown: dispose of async_engine
       await async_engine.dispose()
       logger.info("AAF FastAPI shut down.")
   ```

2. **FastAPI instance**:
   ```python
   app = FastAPI(
       title="AAF API",
       version="1.0.0",
       lifespan=lifespan,
   )
   ```

3. **CORSMiddleware** (aligned with ARCHITECTURE.md §3 Strategy B):
   ```python
   app.add_middleware(
       CORSMiddleware,
       allow_origins=settings.ALLOWED_ORIGINS,  # read from environment variable, never use "*"
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

4. **Route mounting**:
   ```python
   app.include_router(api_router, prefix="/api/v1")
   ```

5. **Health-check endpoint** (required for Render deployment):
   ```python
   @app.get("/api/v1/health")
   async def health():
       return {"status": "ok", "version": "1.0.0"}
   ```

6. **Startup command** (local development):
   ```bash
   cd backend && uvicorn app.main:app --reload --port 8000
   ```

---

## Milestone I: Data Directory Migration

### Step 20 — Migrate `chroma_db/` to `backend/chroma_db/`

**Stage goal**: Migrate the ChromaDB data directory under `backend/`, aligning with ARCHITECTURE.md's directory tree.

**Technical details**:

Run the shell command:
```bash
mv /path/to/AAF_Product/chroma_db /path/to/AAF_Product/backend/chroma_db
```

Also confirm that the `PersistentClient(path=...)` path in `rag_service.py` (Step 12) now points to the new location.

Migrate the data file at the same time:
```bash
mkdir -p backend/data
cp AAF_responses.csv backend/data/AAF_responses.csv
```

Update `.gitignore` to ensure the data files under `backend/chroma_db/` are not committed (binary vector data doesn't need to go into version control).

---

## Overall Dependency Graph

```
Step 1  (requirements.txt)
    │
Step 2  (__init__.py skeleton)
    │
Step 3  (core/config.py)  ──────────────────────────┐
    │                                                │
Step 4  (backend/.env.example)                       │
    │                                                │
Step 5  (db/base.py)  ──────────┐                   │
    │                           │                   │
Step 6  (db/session.py) ◄───────┤◄── settings       │
    │                           │                   │
Step 7  (models/user.py) ◄──────┤                   │
Step 8  (models/guide.py) ◄─────┤                   │
Step 9  (models/rating.py) ◄────┘                   │
    │                                               │
Step 10 (schemas/guide.py)                          │
Step 11 (schemas/rating.py)                         │
    │                                               │
Step 12 (services/rag_service.py) ◄─────────────────┤
Step 13 (services/search_service.py) ◄──────────────┤
Step 14 (services/ai_service.py) ◄──────────────────┘
    │
Step 15 (api/deps.py) ◄── Step 6 (session) + Step 7 (User model)
    │
Step 16 (routes/guide.py) ◄── Step 10/12/13/14/15
Step 17 (routes/courses.py)
Step 18 (api/v1/router.py) ◄── Step 16/17
    │
Step 19 (app/main.py) ◄── Step 3/6/18
    │
Step 20 (chroma_db directory migration) ◄── coordinates with Step 12's path
```

---

## Phase Acceptance Tests

Run after Step 19 is complete:

```bash
# Terminal 1: start FastAPI (from the backend/ directory)
uvicorn app.main:app --reload --port 8000

# Terminal 2: health check
curl http://localhost:8000/api/v1/health
# Expected: {"status": "ok", "version": "1.0.0"}

# Terminal 3: course list
curl http://localhost:8000/api/v1/courses
# Expected: {"courses": ["ICS 31", "ICS 32", ...]}

# Terminal 4: core AI generation endpoint (requires a real API key configured in .env)
curl -X POST http://localhost:8000/api/v1/guide/generate \
  -H "Content-Type: application/json" \
  -d '{
    "role": "student",
    "courses": ["ICS 32"],
    "confidence": 6.0,
    "goals": ["ace_grade"],
    "user_query": "I just finished ICS 31 with B+"
  }'
# Expected: {"guide_id": "...", "guide_markdown": "...", "sources_used": [...], "tokens_used": ...}
```

**Acceptance criteria**:
- All endpoints return the correct status code (200)
- `guide_markdown` content quality matches the original Flask version
- No `<thinking>` tag remnants in the response
- The logs show ChromaDB and Tavily being called concurrently

---

## Boundary with Phase 2

| Feature | Phase 1 State | Phase 2 Completion |
|---|---|---|
| DB models + Session | Code exists, not yet connected to real Supabase | Connection verified + tables created |
| `guide_id` | Temporarily generated via `uuid.uuid4()` | Persisted to the `guides` table |
| User authentication | `get_current_user` is a stub | Full JWT register/login implementation |
| Rating persistence | Schema exists, route not implemented | `POST /ratings` writes to DB |
| `get_optional_user` | Directly returns `None` | Real JWT parsing, returns None for anonymous |

---

*This file was generated by the architect. Code implementation must strictly follow the directory structure and interface contracts in ARCHITECTURE.md. Each step must wait for PM confirmation before execution.*
