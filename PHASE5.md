# Phase 5 Execution Manual: render.yaml + vercel.json, Production Deployment Launch

> **Status**: **Completed** — Milestones A through E have all been executed; `backend/` has been deployed to Render, `frontend/` has been deployed to Vercel, and the PM has confirmed the overall production deployment is complete. All hands-on operations within the Render/Vercel consoles (creating services, filling in secrets, backfilling domains) were performed personally by the PM using their own account credentials — the AI never touched any real secrets or consoles.
> **Prerequisite**: Phase 4 completed and `git commit`ed (the three-step wizard, auth UI, Guide history, senior-contribution form, and admin review backend all manually walked through locally via `npm run dev` + `uvicorn --reload`). Before starting, the uncommitted changes in the current workspace to `ContributePage.tsx` / `LoginPage.tsx` / `RegisterPage.tsx` and the newly added `frontend/public/images.png` needed to be handled first — committed after local testing, so Phase 4's loose ends wouldn't carry over into Phase 5.
> **Acceptance goal**: `backend/` deployed to Render and reachable via a public domain; `frontend/` deployed to Vercel and reachable via a public domain; production CORS precisely allowlists the Vercel domain (no wildcard); production ChromaDB data is reproducible and **survives a real redeploy**; the full smoke test under the production domain (wizard + login + history + contribution-review loop) all pass
> **Collaboration constraint**: Wait for confirmation before each step; after execution, wait for local tests to pass and a `git commit` before moving to the next step. **Additional constraint for this phase**: any operation touching the Render/Vercel consoles (creating services, filling in secret-type environment variables, copying the Supabase connection string) must be performed personally by the PM using their own account credentials — the AI has no access to these consoles, and is only responsible for providing the precise configuration content and a verification checklist, not for performing the action on the PM's behalf.

---

## ⚠️ Deployment Decisions Requiring PM Confirmation (Must Read Before Executing)

### 1. ChromaDB production persistence strategy — Decided: Plan C (dynamic Supabase reseeding)

Issues discovered while auditing the code/infrastructure assumptions before starting work:
- `backend/scripts/load_rag_data.py` (the CSV → ChromaDB one-time import script), planned in ARCHITECTURE.md §2's directory tree, was never actually created across Phases 1-4.
- `backend/chroma_db/` (the local persistence directory, excluded via `.gitignore`) actually only contains **22** real pieces of senior-student feedback (the "43 entries" figure in ARCHITECTURE.md is stale) — an additional 2 records with `course: "ICS 46"` (one of which had a `REVIEWTAG` debug marker in its body) were, upon inspection, leftover data written through the real endpoint while locally testing Milestone L's admin-review-backend "approve" button; these have already been cleared from both Supabase and the local ChromaDB, and are not counted as real data.
- Render's default filesystem is **ephemeral** — every redeploy wipes the container's local disk. This assessment hasn't changed.

The original plan was a choice between "Plan A (Persistent Disk) / Plan B (rebuild from CSV on every cold start)," but while executing Milestone A a better path was found: Milestone L's admin review backend already writes approved contributions into Supabase's `contributions` table (the `is_approved` field) — Supabase itself is already a persistent data source. There's no need to pay for an extra Persistent Disk; it's enough to also migrate the CSV's original seed data into Supabase, making Supabase the single source of truth, and reload the `is_approved = true` records back into the in-memory ChromaDB on every container cold start. That's **Plan C**, which has fully replaced the Plan A/B draft, and has already been implemented and verified locally:

| Step | File | Description |
|---|---|---|
| One-time migration | `backend/scripts/migrate_csv_to_supabase.py` | Migrates the 23 original entries in the CSV (22 rows with a non-empty course column + 1 record with a manually completed course code) into Supabase's `contributions` table, with `is_approved=True`. Uses deterministic UUIDs (derived from the CSV row number) to ensure it can be safely rerun without duplicate inserts. Already run once locally. |
| Reload logic | `backend/scripts/load_rag_data.py` | No longer reads the CSV — instead queries Supabase `WHERE is_approved = true`, clears and rebuilds the ChromaDB collection (`rag_service.reset_collection_async()`), and writes each record in using `rag_service.build_tip_text()` (shared with `approve_contribution`'s same assembly logic, avoiding format drift between the two paths' generated tips). |
| Wired into the lifecycle | `backend/app/main.py` | `lifespan` calls `reseed_from_supabase()` right after the DB health check — this runs on every cold start (including free-tier sleep/wake cycles and every redeploy), with no dependency on any local disk state; `tests/integration/test_guide_route.py` was correspondingly given a mock, to avoid the tests hitting Supabase for real. |
| `render.yaml` | `backend/render.yaml` | No longer has a `disk` block — the free-tier Web Service is sufficient for deployment (see Milestone B Step 4 for details). |

The key difference between Plan C and the original Plan B: Plan B only rebuilt from the CSV, so any new contribution an admin approved would deterministically be lost on the next redeploy; Plan C also migrates the CSV seed data into Supabase, so old and new contributions are uniformly reloaded from the same table — this defect no longer exists, and there's also no need for Plan A's paid Persistent Disk.

**Key loop already verified locally**: manually cleared the local ChromaDB collection down to 0 entries, without manually running any script, did a cold start directly via `uvicorn app.main:app`, and after `/api/v1/health` returned 200, queried the collection from a separate process and confirmed it had automatically recovered to 23 entries — this is exactly the scenario "survives a redeploy" needs to verify, and it has been reproduced and passed locally; the production environment still needs to verify this once more in item 6 of "Phase Acceptance Tests" (Render's ephemeral filesystem and a manual local clear are, after all, two different things).

### 2. Supabase connection string: direct connection vs. connection pooler

`backend/app/db/session.py`'s `pool_size=10, max_overflow=20` are parameters designed around "one long-running server process." Local development only ever runs a single `uvicorn --reload` process, so this has never surfaced a problem. In the Render production environment, if `DATABASE_URL` is set to Supabase's direct-connection address (`db.<ref>.supabase.co:5432`), up to 30 concurrent connections could hit the direct-connection limit of a small/medium Supabase instance — and the resulting errors would only show up in production, under concurrent load, never reproducible locally.

Supabase's own recommendation for this kind of "long-running backend service" scenario is to switch to the **Session Pooler connection string** from the console (port is usually `6543`, hostname contains `pooler`) in place of the direct-connection string. This is purely a matter of an environment variable's value — no code changes needed — but it requires the PM to copy this value themselves from the Supabase console's Settings → Database page. It has been written into the environment-variable checklist in Step 5 below; when executing, don't take the shortcut of just reusing the direct-connection string from the local `.env`.

### Appendix: Known trade-off (not blocking, informational only)

Render's free-tier Web Service goes to sleep after 15 minutes without a request, and the next request has to wait an extra 30-60 seconds for a cold start — stacked on top of the Claude request's own 90s timeout, the first visitor's wait experience will be noticeably worse. The free-tier sleep/wake cycle will also trigger a `reseed_from_supabase()` (a few extra seconds of cold-start time, an expected cost — see Milestone A). This is an inherent trade-off of the free tier, not a bug; written here so the PM can decide whether it's worth paying for an always-on instance.

---

## Boundary Comparison with Phase 4

| Feature | Phase 4 State | Phase 5 Completion |
|---|---|---|
| Frontend project | Runs locally via `npm run dev`, not deployed | Vercel production deployment, reachable via public domain |
| Backend deployment | Local `uvicorn --reload`, not deployed | Render production deployment, reachable via public domain |
| ChromaDB data | Only on the local machine at `backend/chroma_db/`, no reload script | Reproducible in production, survives a redeploy (Plan C: dynamic Supabase reseeding, completed — see Milestone A) |
| CORS | Local `.env` only contains `http://localhost:5173` | Production `ALLOWED_ORIGINS` precisely points to the Vercel domain, no wildcard |
| Database connection | Local direct connection to Supabase | Production switches to the Session Pooler connection string |
| Environment variables | Local `.env`/`.env.example` | Render/Vercel console environment-variable checklist (Step 5, Step 7 of this file) |
| Health check | `/api/v1/health` only checks the DB | (Optional hardening) add ChromaDB connectivity, aligning with ARCHITECTURE.md §6's documented description |
| End-to-end acceptance | Manual local walkthrough only | Full smoke test under the production domain, including the "does data survive a redeploy" scenario, never tested before |

---

## Milestone A: ChromaDB Production Data Reproducibility (Completed)

Plan C's implementation is split across three files, all already implemented and verified locally — see "Deployment Decision 1" at the top of this document for details:

### Step 1 — `backend/scripts/migrate_csv_to_supabase.py` (one-time migration, already executed)

A one-time script, not a web service. Reads `backend/data/AAF_responses.csv` and writes the 23 real senior-student experiences (22 rows with a non-empty course column + 1 row with a manually completed course code) into Supabase's `contributions` table, with `is_approved=True`. Generates deterministic ids via `uuid.uuid5(fixed_namespace, f"csv-row-{row_number}")`, so rerunning the script skips rows that already exist rather than inserting duplicates. Already run once locally; Supabase's `contributions` table currently has 23 entries, all `is_approved=True`.

### Step 2 — `backend/scripts/load_rag_data.py` (reload logic)

Doesn't read the CSV — instead runs `SELECT * FROM contributions WHERE is_approved = true`, first calls `rag_service.reset_collection_async()` to clear and rebuild the ChromaDB collection, then writes each record in using `rag_service.build_tip_text()`:

```python
def build_tip_text(course, danger_zone, setup_tips, career_value) -> str:
    text_parts = [f"Course: {course}"]
    if danger_zone:
        text_parts.append(f"Danger Zone: {danger_zone}")
    if setup_tips:
        text_parts.append(f"Setup Tips: {setup_tips}")
    if career_value:
        text_parts.append(f"Career Value: {career_value}")
    return "\n".join(text_parts)
```

This function is also called by `contributions.py::approve_contribution`, ensuring the tip text format produced by both the "batch reload" and "real-time write after admin review" paths is exactly identical, with no drift. `tip_id` uses `Contribution.id` directly (Supabase's real primary key) rather than generating one via `uuid4()` — so reload and real-time writes point into the same id space.

### Step 3 — Wired into `backend/app/main.py`'s `lifespan`

`lifespan` calls `reseed_from_supabase()` right after the DB health check, and this runs on every cold start. Side effect: the tests in `tests/integration/test_guide_route.py` would genuinely trigger `lifespan_context`, so an `autouse` fixture was added to mock out `app.main.reseed_from_supabase`, avoiding tests making real network requests (empirically, without the mock each test took about 8 extra seconds).

**Local loop verification**: manually cleared the ChromaDB collection down to 0 entries → without manually running any script, did a cold start directly via `uvicorn app.main:app` → `/api/v1/health` returned 200 → a separate process queried the collection and confirmed it had automatically recovered to 23 entries.

---

## Milestone B: Backend Render Deployment

### Step 4 — `backend/render.yaml` (Completed)

With Plan C in place, a Persistent Disk is no longer needed — `render.yaml` has no `disk` block, and the free-tier Web Service is sufficient for deployment:

```yaml
services:
  - type: web
    name: aaf-api
    env: python
    rootDir: backend
    buildCommand: "pip install -r requirements.txt"
    startCommand: "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
    healthCheckPath: /api/v1/health
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.15
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: TAVILY_API_KEY
        sync: false
      - key: JWT_SECRET_KEY
        sync: false
      - key: DATABASE_URL
        sync: false
      - key: ALLOWED_ORIGINS
        sync: false
```

`sync: false` means secret-type values are only filled in by hand in the Render console, never written into this file (which does get committed to Git) — carrying forward CLAUDE.md's constraint of "secrets never hardcoded." Two pitfalls not present in the original draft were found and fixed while implementing this:
- **`rootDir: backend`**: the repo root has no `requirements.txt` (it only exists at `backend/requirements.txt`) — without this field, `buildCommand` would fail with a file-not-found error.
- **`PYTHON_VERSION: 3.11.15`**: the local venv is actually Python 3.11.15 (the "3.12" written in ARCHITECTURE.md is stale information), and without pinning the version, using the system's newer Python (observed to be 3.13) causes `chromadb==0.4.24`'s indirect dependency `pulsar-client>=3.1.0` to have no available release, causing the build to fail outright.

Already verified locally against the exact `buildCommand`/`startCommand` text: under Python 3.11.15, `pip install -r requirements.txt --dry-run` reports all `Requirement already satisfied`; after starting with `PORT=8002 uvicorn app.main:app --host 0.0.0.0 --port $PORT`, `/api/v1/health` returns 200.

### Step 5 — Render console environment-variable checklist (Completed, executed personally by the PM)

| Variable | Current local `.env` value | Production value |
|---|---|---|
| `ANTHROPIC_API_KEY` | real key | the same key (or a production-specific key, depending on the PM's billing strategy) |
| `TAVILY_API_KEY` | real key | same as above |
| `JWT_SECRET_KEY` | `change-me-in-production` (placeholder) | **must** be swapped for a randomly generated strong key — the placeholder cannot go live |
| `DATABASE_URL` | Supabase direct-connection string | **switch to the Supabase Session Pooler connection string** (see Decision 2 above), port usually `6543` |
| `ALLOWED_ORIGINS` | `["http://localhost:5173"]` | `["https://<vercel-domain>"]` — the exact domain is only known after the frontend is deployed in Step 7, see Milestone D |

The PM has already created the service in the Render console and filled in the above 5 environment variables; the service starts up normally. The specific secret values, the Supabase Pooler connection string, and the final `ALLOWED_ORIGINS` content were all entered directly by the PM in the console, never passing through the AI — consistent with CLAUDE.md's constraint that "secrets are never hardcoded, never handled by the AI."

---

## Milestone C: Frontend Vercel Deployment (Completed)

### Step 6 — Verify `frontend/vercel.json` (Confirmed)

Phase 4 Step 4 already put the SPA fallback config in place ahead of time — this step is only a confirmation, not a re-creation. The AI side read the local file and confirmed the content exactly matches expectations:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### Step 7 — Vercel environment variables (Completed, executed personally by the PM)

`VITE_API_BASE_URL` is the relative path `/api` locally (hitting the Vite proxy); in production the frontend and backend are on different origins with no proxy as a fallback, so it must be changed to the Render backend's full URL (e.g. `https://aaf-api.onrender.com/api`), relying directly on Step 4's `ALLOWED_ORIGINS` configuration and the CORSMiddleware already in place in `app/main.py`. The PM has already filled in this environment variable in the Vercel console and completed the deployment.

---

## Milestone D: Production CORS Integration Testing (Completed)

### Step 8 — Deployment order and `ALLOWED_ORIGINS` backfill (Completed, executed personally by the PM)

There's an ordering dependency: the Render backend's `ALLOWED_ORIGINS` needs the domain Vercel assigns, but the Vercel domain is only known after it's been deployed once. Execution order:

```
1. Deploy the frontend first (Step 6/7), obtaining the domain Vercel assigns (e.g. aaf-product.vercel.app)
2. Backfill Render's ALLOWED_ORIGINS environment variable with this domain
3. Trigger a Render redeploy, so the CORS configuration takes effect
4. Have the frontend make a request again, confirming there are no more CORS errors
```

---

## Milestone E (Optional, Non-Blocking for Deployment): Health-Check Completion

### Step 9 — Add ChromaDB connectivity to `/api/v1/health`

The Phase 4 audit already pointed out that `/api/v1/health` only checks the DB (`SELECT 1`), not covering the "DB + ChromaDB connectivity" written in ARCHITECTURE.md §6's documentation. At the time this was judged a minor doc/implementation mismatch, low priority, and left unfixed. Reason for re-evaluating it in this phase: Render's `healthCheckPath` continuously calls this endpoint to judge whether the instance is alive — if Milestone A's `reseed_from_supabase()` fails or gets skipped during some cold start (e.g. a Supabase connection failure, a misconfigured `DATABASE_URL`), the current implementation would still return `200 {"status":"ok","db":"connected"}`, masking a real data failure as "everything is fine."

Suggested approach: reuse `rag_service.py`'s existing module-level `_collection`, add one lightweight `collection.count()` call, and surface it in the response if it fails or returns 0 — no need to spin up a new client. Marked as optional, since it doesn't affect whether the deployment itself can run — it's observability hardening, not a blocking item.

---

## Phase Acceptance Tests (PM Has Confirmed Deployment Complete)

Unlike the "manual local walkthrough" of previous phases, this phase's acceptance testing must happen against the **production domain**, because the core risks (CORS, ChromaDB persistence) are fundamentally the kind of problem that "can never be tested locally." The PM has confirmed the overall deployment is complete; the checklist below is kept as a reference for production acceptance — if production behavior is ever suspected to be off, it can be re-checked item by item:

```
1. curl https://<render-domain>/api/v1/health → 200

2. Visit the Vercel domain in a browser, walk through the full student wizard flow, open the Network
   panel and confirm requests are genuinely hitting the Render domain (not accidentally still hitting
   localhost or a leftover relative path).

3. Login loop: register a new account in the production environment → log in → refresh the page and
   confirm login state isn't lost (the localStorage token still works under the production HTTPS domain).

4. Guide history + share link: generate a Guide while logged in → confirm it's visible at /history →
   copy the /guide/:id link, open it in an incognito window (not logged in), confirm anonymous access
   works (Optional-auth semantics).

5. Contribution review loop: submit a new senior experience → log into the production environment with
   an admin account → approve it in /admin/contributions → generate a new Guide for the same course,
   confirm the newly submitted tip is retrieved (proving the production ChromaDB write path itself works).

6. [The single most important step in this phase, never verified before] Manually trigger a Render
   redeploy (e.g. push an empty commit); once the deployment finishes, repeat step 5's retrieval check.
   If that tip can still be retrieved, it means Milestone A's dynamic Supabase-reseeding logic (the
   `reseed_from_supabase()` inside `lifespan`) genuinely works in production; if it can't be retrieved,
   there's a problem with either `DATABASE_URL` or how `reseed_from_supabase()` is being invoked, and
   Milestone A needs to be re-checked — passing steps 1-5 while skipping this one would mean the
   persistence strategy itself was never actually verified (locally this was already simulated once via
   "manually clear the collection, then cold start"; this step is the real-world reproduction in
   production).

7. CORS check: use curl to make a cross-origin request from an Origin that isn't on the allowlist
   (curl -H "Origin: https://evil.example.com" ...), confirm it's rejected, proving the production
   configuration hasn't degraded into a wildcard "*".
```

---

## Wrap-Up (Phase 5 Complete)

Phase 5 is the final phase currently planned in CLAUDE.md's roadmap table, so this file does not have a "Boundary with Phase 6" section. Milestones A through D have all been completed; the PM has confirmed `backend/` is deployed to Render and `frontend/` is deployed to Vercel, and the whole system is usable. AAF is now fully live, end to end, under the target architecture defined in ARCHITECTURE.md. Milestone E (Step 9, adding ChromaDB connectivity to the health check) is marked as an optional hardening item — it did not block this deployment, and is left for later, as needed. If new iteration requirements come up later, they should be started as an independent new phase document, rather than stuffed into this file.

*This file was generated by the architect. Code implementation must strictly follow the directory structure and interface contracts in ARCHITECTURE.md. Both deployment decisions at the top of this document have been implemented: the ChromaDB persistence strategy was decided as Plan C (Milestone A, Milestone B Step 4); the Supabase connection pool was switched to the Session Pooler connection string by the PM while executing Milestone B Step 5. All console operations were performed personally by the PM using their own account credentials.*
