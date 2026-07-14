# Phase 2 Execution Manual: Supabase Connection + JWT Authentication + Business Persistence

> **Status**: Pending
> **Prerequisite**: Phase 1 completed and `git commit`ed; the Supabase project has been created, and `DATABASE_URL` is configured in `backend/.env`
> **Acceptance goal**: Register/login are genuinely functional; Guide generation results are written to the DB; ratings are persisted; `get_optional_user()` recognizes real JWT tokens
> **Collaboration constraint**: Wait for confirmation before each step; after execution, wait for local tests to pass and a `git commit` before moving to the next step

---

## Boundary Comparison with Phase 1

| Feature | Phase 1 State | Phase 2 Completion |
|---|---|---|
| Supabase connection | Engine configured, real connection unverified | Tables created + connectivity verified |
| `get_current_user` | Directly raises a 401 stub | JWT verification + users table lookup |
| `get_optional_user` | Directly returns `None` | Real JWT parsing, returns None for anonymous |
| `guide_id` | Temporarily generated via `uuid.uuid4()` | Persisted to the `guides` table |
| Rating endpoint | Schema exists, route not implemented | `POST /ratings` writes to DB |
| health endpoint | Only returns `{"status":"ok"}` | Adds a DB ping |

---

## Milestone A: Supabase Table Creation

### Step 1 — Run the table-creation SQL in the Supabase SQL Editor

**Where to do this**: Supabase console → SQL Editor (not a code file)

Run the following DDL in the Supabase SQL Editor (already includes the three tables `users`, `guides`, `ratings`).

**Acceptance command** (run from the `backend/` directory):

```bash
python -c "
import asyncio, asyncpg, os
from dotenv import load_dotenv
load_dotenv()
async def t():
    conn = await asyncpg.connect(os.environ['DATABASE_URL'])
    rows = await conn.fetch(\"SELECT tablename FROM pg_tables WHERE schemaname='public'\")
    print([r['tablename'] for r in rows])
    await conn.close()
asyncio.run(t())
"
```

Expected output includes: `['users', 'guides', 'ratings']`

---

### Step 2 — Verify SQLAlchemy async engine connectivity

**File to edit**: `backend/app/main.py` (add a single ping line, only in the lifespan startup section)

```python
from sqlalchemy import text

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    logger.info("AAF FastAPI starting up — DB OK")
    yield
    await async_engine.dispose()
    logger.info("AAF FastAPI shut down.")
```

**Acceptance**: The `uvicorn` startup log shows `DB OK`, with no asyncpg errors.

---

## Milestone B: JWT Security Layer

### Step 3 — Create `backend/app/core/security.py`

**Contents**:

| Function | Description |
|---|---|
| `hash_password(plain: str) -> str` | `passlib[bcrypt]` hashing |
| `verify_password(plain: str, hashed: str) -> bool` | bcrypt verification |
| `create_access_token(data: dict, expires_delta: timedelta \| None) -> str` | Issues a JWT, payload contains `sub` (user_id str) + `exp` |
| `create_refresh_token(data: dict) -> str` | Refresh token with a 30-day validity period |
| `decode_token(token: str) -> dict` | Verifies signature + expiration; raises `HTTPException(401)` on failure |

The signing key is read from `settings.JWT_SECRET_KEY`, with the algorithm fixed to `settings.JWT_ALGORITHM` (default `HS256`).

---

### Step 4 — Update `backend/.env` and `backend/.env.example`

**`.env`**: add one line (if not already added):
```
JWT_SECRET_KEY=<64-byte random hex>
```

Generation command:
```bash
python -c "import secrets; print(secrets.token_hex(64))"
```

**`.env.example`**: add the corresponding line:
```
JWT_SECRET_KEY=change-me-in-production
```

> The `JWT_SECRET_KEY` field in `config.py` was already declared in Phase 1 Step 3 — this step only fills in the real value.

---

## Milestone C: Authentication Schema Layer

### Step 5 — Create `backend/app/schemas/auth.py`

**Pydantic v2 schema definitions**:

```python
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str       # min_length=8
    display_name: str | None = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RefreshRequest(BaseModel):
    refresh_token: str

class UserResponse(BaseModel):
    id: UUID
    email: str
    display_name: str | None
    role: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

---

## Milestone D: Authentication Route Layer

### Step 6 — Create `backend/app/api/v1/routes/auth.py`

**Endpoints** (5 total):

| Endpoint | Method | Logic |
|---|---|---|
| `/auth/register` | POST | bcrypt hash → INSERT users → return `TokenResponse` |
| `/auth/login` | POST | look up email → verify_password → sign access + refresh token |
| `/auth/refresh` | POST | verify refresh token → sign a new access token |
| `/auth/logout` | POST | Stateless design: returns `{"ok": true}`, client simply deletes the token |
| `/auth/me` | GET | `Depends(get_current_user)` → return `UserResponse` |

**Error handling**:
- Email already registered → `409 Conflict`
- Wrong password / user not found → uniformly `401` (doesn't expose the specific reason, to prevent username-enumeration attacks)
- Token expired/invalid → `401`

---

### Step 7 — Update `backend/app/api/deps.py`

**Upgrade from the Phase 1 stub to a real implementation**:

```python
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = security.decode_token(token)          # raises 401 directly on failure
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_optional_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        token = authorization.removeprefix("Bearer ")
        return await get_current_user(token, db)
    except HTTPException:
        return None
```

---

## Milestone E: Business Persistence

### Step 8 — Update `backend/app/api/v1/routes/guide.py`

**Change** (only the final DB-write section — the concurrency logic is untouched):

```python
# Phase 2: write to the guides table (anonymous users get user_id=None)
guide = Guide(
    user_id=user.id if user else None,
    role=role,
    courses=courses,
    confidence=body.confidence,
    goals=body.goals,
    user_query=body.user_query,
    response_md=guide_markdown,
    tokens_used=tokens_used,
)
db.add(guide)
await db.flush()   # obtain the DB-generated guide.id; the commit happens once, at the end of get_db()'s lifecycle
```

`GuideResponse.guide_id` changes to `guide.id` (a real database UUID).

---

### Step 9 — Create `backend/app/api/v1/routes/ratings.py`

**Endpoint**: `POST /ratings`, status_code=201

Logic:
1. Look up the `guides` table to verify `guide_id` exists; if not → `404`
2. `INSERT ratings`, with `user_id=user.id if user else None`
3. Return `RatingResponse`

---

## Milestone F: Route Aggregation + Health-Check Upgrade

### Step 10 — Update `backend/app/api/v1/router.py`

Append:

```python
from app.api.v1.routes import auth, ratings

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(ratings.router, prefix="/ratings", tags=["ratings"])
```

---

### Step 11 — Upgrade the health endpoint (`backend/app/main.py`)

```python
@app.get("/api/v1/health")
async def health(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "version": "1.0.0", "db": "connected"}
```

Once deployed on Render, the health check can verify Supabase connectivity.

---

## Phase Acceptance Tests

```bash
# 1. Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@uci.edu","password":"password123"}'
# Expected: {"access_token":"...","refresh_token":"...","token_type":"bearer"}

# 2. Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@uci.edu","password":"password123"}'
# Expected: TokenResponse

# 3. Get current user
curl http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer <access_token>"
# Expected: {"id":"...","email":"test@uci.edu","role":"student",...}

# 4. Generate a Guide (with token, guide_id written to DB)
curl -X POST http://localhost:8000/api/v1/guide/generate \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"role":"student","courses":["ICS 32"],"confidence":6.0,"goals":["ace_grade"]}'
# Expected: guide_id matches the record in the Supabase guides table

# 5. Submit a rating
curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{"guide_id":"<guide_id_from_step4>","score":1}'
# Expected: 201

# 6. Health check (with DB ping)
curl http://localhost:8000/api/v1/health
# Expected: {"status":"ok","version":"1.0.0","db":"connected"}
```

---

## Boundary with Phase 3

| Feature | Phase 2 State | Phase 3 Completion |
|---|---|---|
| `contributions.py` | Not implemented | `POST /contributions` + admin review workflow |
| `/guide/history` | Not implemented | `GET /guide/history` paginated query |
| Rate limiting `rate_limit.py` | Not implemented | `asyncio.Lock` sliding window |
| Unit/integration tests | None | `tests/unit/test_security.py` + `test_guide_route.py` |
| `/auth/logout` blacklist | Stateless (client deletes) | Introduce a revoked_tokens table if needed |

---

*This file was generated by the architect. Code implementation must strictly follow the directory structure and interface contracts in ARCHITECTURE.md. Each step must wait for PM confirmation before execution.*
