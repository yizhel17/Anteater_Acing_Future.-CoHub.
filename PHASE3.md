# Phase 3 Execution Manual: History + Senior Contribution Review Flow + Rate Limiting + Tests

> **Status**: Pending
> **Prerequisite**: Phase 2 completed and `git commit`ed (JWT auth, Supabase persistence, `/ratings`, and the `/health` DB ping have all been verified)
> **Acceptance goal**: Logged-in users can view their own Guide history; the full loop of senior-experience submission → admin review → sync to ChromaDB is wired up end-to-end; `/guide/generate` has anti-abuse rate limiting; core security and business logic have automated test coverage
> **Collaboration constraint**: Wait for confirmation before each step; after execution, wait for local tests to pass and a `git commit` before moving to the next step

---

## ⚠️ Contract Extension Requiring PM Confirmation

ARCHITECTURE.md §6's endpoint contract table only declares `POST /contributions` (submission) — it doesn't declare the query/approve/reject endpoints needed for admin review. To complete the "admin review flow" agreed upon in PHASE2.md's milestones, this phase adds 3 endpoints not yet recorded in ARCHITECTURE.md (see Milestone F). Once these endpoints are confirmed, they need to be written back into ARCHITECTURE.md §6 to keep the documentation and code contracts in sync — this will be raised separately as the final step of this phase, not among the 18 steps below, and done only after all the preceding steps have passed acceptance.

---

## Boundary Comparison with Phase 2

| Feature | Phase 2 State | Phase 3 Completion |
|---|---|---|
| `/guide/history` | Not implemented | `GET /guide/history` paginated query (requires login) |
| `/guide/{id}` | Not implemented | `GET /guide/{id}` single-item detail (anonymous access, share-link semantics) |
| `contributions` table | Not created | Table created + `POST /contributions` persistence |
| Senior-experience review | None | Admin list/approve/reject + sync to ChromaDB upon approval |
| `/guide/generate` abuse protection | No rate limit, anyone can call it unlimited times (real billing cost) | `asyncio.Lock` sliding-window rate limit (by IP) |
| Unit/integration tests | None | `test_security.py` + `test_ai_service.py` + `test_guide_route.py` |
| `/auth/logout` | Stateless (client deletes token) | Remains stateless; blacklist approach listed as an optional milestone, not done by default |

---

## Milestone A: Test Infrastructure

### Step 1 — Update `backend/requirements.txt`

Add:

```
pytest
pytest-asyncio
```

Do not introduce `pytest-mock` — the standard library's `unittest.mock.patch` is already sufficient, avoiding one extra dependency.

---

## Milestone B: Supabase Schema Extension

### Step 2 — Create the `contributions` table in the Supabase SQL Editor

**Where to do this**: Supabase console (not a code file); fields aligned with ARCHITECTURE.md §5:

| Field | Type | Constraint |
|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` |
| `user_id` | UUID | FK → users, nullable |
| `course` | VARCHAR(50) | NOT NULL |
| `danger_zone` | TEXT | |
| `setup_tips` | TEXT | |
| `career_value` | TEXT | |
| `is_approved` | BOOLEAN | DEFAULT FALSE |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Acceptance command**: the same `pg_tables` query as PHASE2.md Step 1; expect `contributions` to now appear.

---

## Milestone C: Model + Schema Layer

### Step 3 — Create `backend/app/models/contribution.py`

Fields and constraints strictly aligned with the table above; `user_id` and `course` use the same `Mapped[...]` style as the `Guide`/`Rating` models.

### Step 4 — Create `backend/app/schemas/contribution.py`

```python
class ContributionRequest(BaseModel):
    course: str
    danger_zone: str | None = None
    setup_tips: str | None = None
    career_value: str | None = None

class ContributionResponse(BaseModel):
    id: UUID
    course: str
    is_approved: bool
    created_at: datetime
```

### Step 5 — Update `backend/app/schemas/guide.py` (append only, do not modify the existing `GuideRequest`/`GuideResponse`)

```python
class GuideHistoryItem(BaseModel):
    guide_id: UUID
    role: str
    courses: list[str]
    created_at: datetime

class GuideHistoryResponse(BaseModel):
    items: list[GuideHistoryItem]
    total: int
```

---

## Milestone D: Dependency Layer — Admin Permissions

### Step 6 — Update `backend/app/api/deps.py` (append only, do not modify the existing `get_db`/`get_current_user`/`get_optional_user`)

```python
async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
```

Reuses `get_current_user` (it already raises 401 for not-logged-in/invalid tokens) — this only adds the 403 role check on top.

---

## Milestone E: Guide History and Detail Routes

### Step 7 — Update `backend/app/api/v1/routes/guide.py` (append an endpoint, `generate`'s logic untouched)

```python
@router.get("/history", response_model=GuideHistoryResponse)
async def guide_history(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # WHERE guide.user_id == user.id, ORDER BY created_at DESC, LIMIT/OFFSET
    # also run a COUNT query at the same time to get total
```

### Step 8 — Update `backend/app/api/v1/routes/guide.py` (append)

```python
@router.get("/{guide_id}", response_model=GuideResponse)
async def get_guide(
    guide_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    # db.get(Guide, guide_id); if it doesn't exist → 404
    # no ownership check: guide_id is a UUID, inherently unguessable, semantically equivalent to a share link
```

---

## Milestone F: Contribution Submission and Review Routes

### Step 9 — Update `backend/app/services/rag_service.py` (append, `retrieve_tips_async` untouched)

```python
def _add_tip_sync(tip_id: str, course: str, text: str) -> None:
    collection = _get_collection()
    collection.add(documents=[text], metadatas=[{"course": course}], ids=[tip_id])

async def add_tip_async(tip_id: str, course: str, text: str) -> None:
    await asyncio.to_thread(_add_tip_sync, tip_id, course, text)
```

Reuses the existing `_get_collection()`, writing into the same `aaf_data` collection; `metadatas={"course": ...}` is aligned with the `where={"course": course}` query field used by `retrieve_tips_async`, ensuring approved content can actually be retrieved.

### Step 10 — Create `backend/app/api/v1/routes/contributions.py`

```python
@router.post("", response_model=ContributionResponse, status_code=201)
async def submit_contribution(
    body: ContributionRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    # INSERT contributions, user_id=user.id if user else None, is_approved=False
```

### Step 11 — Update `backend/app/api/v1/routes/contributions.py` (append, all with `Depends(require_admin)`)

```python
@router.get("", response_model=list[ContributionResponse])
async def list_pending_contributions(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    # WHERE is_approved = false, ORDER BY created_at ASC

@router.post("/{contribution_id}/approve", response_model=ContributionResponse)
async def approve_contribution(
    contribution_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    # 1. look up the contribution; if it doesn't exist → 404
    # 2. is_approved = True
    # 3. assemble the text (course + danger_zone + setup_tips + career_value)
    # 4. await rag_service.add_tip_async(str(contribution.id), contribution.course, text)
    # 5. return the updated ContributionResponse

@router.delete("/{contribution_id}", status_code=204)
async def reject_contribution(
    contribution_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    # DELETE directly (the table has no "rejected" state — rejecting just deletes it, never enters ChromaDB)
```

### Step 12 — Update `backend/app/api/v1/router.py`

```python
from app.api.v1.routes import contributions

api_router.include_router(contributions.router, prefix="/contributions", tags=["contributions"])
```

---

## Milestone G: Rate Limiting Layer

### Step 13 — Create `backend/app/core/rate_limit.py`

```python
import asyncio
import time
from collections import defaultdict

class SlidingWindowLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self._max = max_requests
        self._window = window_seconds
        self._lock = asyncio.Lock()
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def allow(self, key: str) -> bool:
        now = time.monotonic()
        async with self._lock:
            hits = self._hits[key]
            cutoff = now - self._window
            while hits and hits[0] < cutoff:
                hits.pop(0)
            if len(hits) >= self._max:
                return False
            hits.append(now)
            return True

guide_generate_limiter = SlidingWindowLimiter(max_requests=5, window_seconds=60)
```

`max_requests=5, window_seconds=60` is the initial default and can be adjusted during acceptance testing per PM's needs. Single-instance + `asyncio.Lock` is consistent with CLAUDE.md's iron rule of "no Redis"; under a multi-instance Render deployment this in-memory rate limit would fail (each instance counts independently) — not currently a problem under the single-instance deployment.

### Step 14 — Update `backend/app/api/v1/routes/guide.py` (add a single dependency to the `generate` endpoint only)

```python
async def check_rate_limit(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    if not await guide_generate_limiter.allow(key):
        raise HTTPException(status_code=429, detail="Too many requests, please slow down")

@router.post("/generate", response_model=GuideResponse)
async def generate_guide_endpoint(
    body: GuideRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
    _rl: None = Depends(check_rate_limit),
):
    ...
```

---

## Milestone H: Unit / Integration Tests

### Step 15 — Create `backend/tests/unit/test_security.py`

Covers: `hash_password`/`verify_password` round-trip; a token generated by `create_access_token` can be correctly decoded by `decode_token` to recover `sub`; an expired token (`expires_delta=timedelta(seconds=-1)`) → `decode_token` raises 401; a token with a tampered signature → 401.

### Step 16 — Create `backend/tests/unit/test_ai_service.py`

Uses `unittest.mock.patch` to patch out `ai_service._client.messages.create`; verifies: `build_user_context` assembles each field correctly; `generate_guide`'s return value correctly strips `<thinking>...</thinking>`; `tokens_used` equals the mock-returned `input_tokens + output_tokens`. No real Anthropic requests are sent.

### Step 17 — Create `backend/tests/integration/test_guide_route.py`

`ASGITransport` + `app.router.lifespan_context` (reusing the pattern already used during Phase 2 acceptance testing). `monkeypatch`es out `rag_service.retrieve_tips_async` / `search_service.tavily_search` / `ai_service.generate_guide`, avoiding real paid calls. Covers: anonymous generation → `guide.user_id is None`; logged-in generation → `guide.user_id` matches the current user; when a single sub-task inside `asyncio.gather` raises, the main flow can still degrade gracefully and complete (the `return_exceptions=True` logic); requests exceeding the rate-limit threshold in a row receive 429.

---

## Milestone I (Optional, As Needed): `/auth/logout` Blacklist

PHASE2.md already flagged this as "if needed." Unless the product genuinely requires "old tokens become invalid immediately after the user clicks logout," keep the status quo (client simply deletes the token — the stateless design is simpler). If it is to be done:

### Step 18 (Optional) — `revoked_tokens` table + blacklist check added to `decode_token`

This requires one extra DB query on every authenticated request, at a performance cost — recommended to skip for now, and only spin up as its own item once the frontend/product explicitly asks for it; not counted as part of this phase's mandatory acceptance scope.

---

## Phase Acceptance Tests

```bash
# Prerequisite: TOKEN = the access_token of a logged-in user (obtained via the Phase 2 login flow)
# ADMIN_TOKEN = the access_token of a user with role=admin (first manually change a test user's role to admin in Supabase)

# 1. Submit senior experience (anonymous)
curl -X POST http://localhost:8000/api/v1/contributions \
  -H "Content-Type: application/json" \
  -d '{"course":"ICS 32","danger_zone":"Project 3 due same week as midterm","setup_tips":"Set up pylint before week 1"}'
# Expected: 201, is_approved:false

# 2. Admin views the pending-review list
curl http://localhost:8000/api/v1/contributions \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200, includes the record submitted in step 1

# 3. Admin approves (triggers the ChromaDB write)
curl -X POST http://localhost:8000/api/v1/contributions/<id>/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200, is_approved:true

# 4. Non-admin calls the review endpoint → 403
curl http://localhost:8000/api/v1/contributions \
  -H "Authorization: Bearer $TOKEN"
# Expected: 403

# 5. View Guide history (requires login)
curl http://localhost:8000/api/v1/guide/history \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200, {"items":[...],"total":N}

# 6. View a single Guide's detail (anonymous access)
curl http://localhost:8000/api/v1/guide/<guide_id>
# Expected: 200

# 7. Rate-limit verification: call /guide/generate 6 times in a row (exceeding the default threshold of 5 requests/60s)
for i in {1..6}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/api/v1/guide/generate \
    -H "Content-Type: application/json" \
    -d '{"role":"student","courses":["ICS 32"],"confidence":6.0,"goals":["ace_grade"]}'
done
# Expected: 200 for the first 5, 429 on the 6th
```

---

## Boundary with Phase 4

| Feature | Phase 3 State | Phase 4 Completion |
|---|---|---|
| Backend API contract | Frozen at the end of this phase (including the newly added history/detail/contributions-review endpoints) | Frontend strictly aligns and consumes as-is; no further new/changed backend endpoints |
| Frontend project | Not started | Standalone React 18 + Vite + TS project, 100% visual fidelity to `templates/index.html` |
| Auth-state frontend integration | None | `useAuth.ts` wired to `/auth/*`, token storage and refresh logic |
| Markdown rendering | None | `react-markdown` replaces `marked.js` |

---

*This file was generated by the architect. Code implementation must strictly follow the directory structure and interface contracts in ARCHITECTURE.md. The contract-extension section requires separate PM confirmation before Step 2. Each step must wait for PM confirmation before execution.*
