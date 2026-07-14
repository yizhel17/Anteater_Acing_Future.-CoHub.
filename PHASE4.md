# Phase 4 Execution Manual: React + Vite Frontend Project, UI Migration

> **Status**: Pending
> **Prerequisite**: Phase 3 completed and `git commit`ed (history/detail routes, the contribution-review loop, rate limiting, and tests have all been verified; the backend API contract is frozen as of this phase — no further new/changed endpoints)
> **Acceptance goal**: The standalone `frontend/` React 18 + Vite + TS project runs locally end-to-end; the original `templates/index.html`'s three-step wizard + result card + atom loading animation are 100% visually reproduced; the four feature areas — auth state, Guide history, senior-experience submission, and admin review — which already had backend capability from Phase 2/3 but never had a UI, get their frontend interfaces filled in during this phase
> **Collaboration constraint**: Wait for confirmation before each step; after execution, wait for local tests to pass and a `git commit` before moving to the next step

---

## ⚠️ Architectural Decisions Already Confirmed with the PM (Must Read Before Executing)

The following three points are deviations discovered during a code audit before starting this phase — ones that ARCHITECTURE.md / CLAUDE.md's original text didn't anticipate. They've been confirmed one by one with the PM, and are stated here as a precondition for all subsequent steps, not repeated individually below:

1. **CSS approach**: `static/style.css` (1001 lines) turns out to be hand-written plain CSS + `:root` CSS variables (e.g. `--accent: #86351C`), with **no Tailwind used at all** — inconsistent with CLAUDE.md's wording of "must reuse ... Tailwind styles." Since "100% visual fidelity" takes higher priority, the approach is: **migrated pages (the three-step wizard + result card + atom loader) reuse `style.css` as-is as global CSS, without changing a single class name; only pages newly added in this phase with no legacy UI to match against (login/register, Guide history, contribution submission form, admin review backend) use Tailwind**, designed under the same CSS-variable vocabulary. The Tailwind row in ARCHITECTURE.md §1's tech-stack table should be understood under this framing.

2. **Routing approach**: ARCHITECTURE.md's original directory tree was designed around a "single-page wizard" and didn't plan for a routing library. `/guide/{id}`, added in Phase 3, is semantically a "share link" and needs a genuinely shareable URL; login, history, and the review backend are also better suited to standalone paths. Therefore `react-router-dom` is introduced, and the directory tree adds `frontend/src/pages/` on top of §2 to hold route-level components (the wizard itself is mounted at `/`, without being forcibly split into separate pages).

3. **Contribution-submission entry point**: in the original HTML, the "Join As a Contributor of AAF" button actually only called `resetToForm()` (returning to step 1 of the wizard) — the real submission channel was an external Google Form mentioned in the copy (corresponding to the already-deleted `AAF_responses.csv` in the repo). Now that Phase 3 has added the `POST /contributions` backend capability, this phase changes that button to navigate to a new in-app form, `ContributionForm`, forming the complete loop of "submit → admin review → write to ChromaDB," no longer depending on the external Google Form.

The following point is not a decision disagreement — just recorded ahead of time to avoid an unpleasant surprise when reaching Step 22:

- **Behavior change in `aafSubmitRating()`**: the original implementation only swapped the entire row's DOM for a thank-you message, and never actually called any endpoint (the `ratings` table didn't exist yet at that time). This phase makes it genuinely call `POST /ratings` — visually imperceptible to the user, but this is a "fake interaction becomes real interaction" behavioral completion, and acceptance testing needs to specifically use the network panel to confirm the request is actually being sent.

---

## Boundary Comparison with Phase 3

| Feature | Phase 3 State | Phase 4 Completion |
|---|---|---|
| Frontend project | Does not exist | Standalone `frontend/` React 18 + Vite + TS project |
| Visual presentation | Only the Flask Jinja2 template `templates/index.html` | 100% reproduced as React components, native JS logic migrated equivalently |
| Markdown rendering | Backend returns a Markdown string, no consumer | Rendered via `react-markdown`, replacing the CDN `marked.js` |
| Auth-state UI | None (API only tested via curl) | Login/register forms + token storage and refresh (`useAuth.ts`) |
| Guide history UI | None (API only) | History list `/history` + detail page `/guide/:id` |
| Senior-experience submission UI | None (API only + external Google Form) | In-app form `/contribute`, replacing the external Google Form entry point |
| Admin review UI | None (API only tested via curl) | Review backend `/admin/contributions` (list/approve/reject) |
| Satisfaction rating | Frontend fake interaction, never calls the API | Genuinely calls `POST /ratings` |
| Local cross-origin handling | Not applicable (no frontend yet) | Vite dev proxy takes effect (ARCHITECTURE.md §3 Strategy A) |

---

## Milestone A: Frontend Project Skeleton

### Step 1 — Create the `frontend/` project + `package.json`

```bash
npm create vite@latest frontend -- --template react-ts
```

Add dependencies: `@tanstack/react-query`, `zustand`, `axios`, `react-markdown`, `react-router-dom`; add dev dependencies `tailwindcss`, `postcss`, `autoprefixer` (used only for net-new pages, see architectural decision 1 above).

### Step 2 — `frontend/vite.config.ts`

Configure the dev proxy per ARCHITECTURE.md §3 Strategy A:

```ts
server: {
  proxy: { '/api': 'http://localhost:8000' }
}
```

### Step 3 — `frontend/tsconfig.json`

Add a `@/*` path alias pointing to `src/*`, aligned with the import style used by subdirectories like `api/`, `components/`, `hooks/` in the directory tree.

### Step 4 — `frontend/vercel.json`

Put the SPA fallback config in place ahead of time (takes effect immediately during Phase 5 deployment, avoiding it being forgotten):

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## Milestone B: Visual Asset Migration (Strict 1:1, Migrated Pages Only)

### Step 5 — `frontend/src/index.css`

Carry `static/style.css` (1001 lines) over as-is — not a single byte of class names, CSS variables, or media queries changed.

### Step 6 — `frontend/src/data/courses.ts`

Migrate `templates/index.html`'s `UCI_COURSES` (including the `dept` metadata used for search-box prefix/full-name matching) into a TS constant.

> Note: does not call the backend's `GET /courses` — that endpoint only returns a trimmed-down list of course codes (`backend/app/api/v1/routes/courses.py`), meant for other/future clients. The `dept` metadata the original search box relies on exists only in the frontend's local data, and continues to be maintained in `courses.ts`.

---

## Milestone C: Types and API Client Layer

### Step 7 — `frontend/src/types/index.ts`

Aligned with all Pydantic schemas: `GuideRequest/Response`, `GuideHistoryItem/Response`, `LoginRequest/RegisterRequest/TokenResponse/UserResponse`, `RatingRequest/Response`, `ContributionRequest/Response`.

### Step 8 — `frontend/src/api/client.ts`

axios instance:

```ts
const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL });
client.interceptors.request.use(cfg => {
  const token = useAuthStore.getState().accessToken;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
```

Response interceptor: on 401, attempt to exchange `refresh_token` for a new `access_token` and retry once; if that still fails, clear `authStore` and redirect to login.

### Step 9 — `frontend/src/api/guide.ts`

`generateGuide(req)` / `getGuideHistory(limit, offset)` / `getGuide(id)`.

### Step 10 — `frontend/src/api/auth.ts`

`login()` / `register()` / `refresh()` / `logout()` / `me()`.

### Step 11 — `frontend/src/api/ratings.ts`

`submitRating(guideId, score)`.

### Step 12 — `frontend/src/api/contributions.ts`

`submitContribution(req)` / `listPendingContributions()` / `approveContribution(id)` / `rejectContribution(id)`.

---

## Milestone D: State Management

### Step 13 — `frontend/src/store/wizardStore.ts`

Zustand, fields aligned with the original vanilla-JS global state: `currentStep`, `role`, `courses: string[]`, `otherSelectedCourses: Set<string>`, `confidence`, `goals/expertise: string[]`, `userQuery`.

### Step 14 — `frontend/src/store/authStore.ts`

`accessToken` / `refreshToken` / `user`, persisted to `localStorage` via the `persist` middleware (key name prefixed to avoid collisions, e.g. `aaf_auth`).

---

## Milestone E: Atomic UI Component Migration (1:1 Visual)

### Step 15 — `frontend/src/components/ui/AtomLoader.tsx`

Migrate the SVG as-is (the three filters `glow-nucleus`/`glow-orbit`/`glow-electron` + three `animateMotion` orbit paths), with no simplification whatsoever.

### Step 16 — `frontend/src/components/ui/ProgressBar.tsx`

Progress bar + three step-labels; the `active` class-toggling logic migrated from `updateProgress()`.

### Step 17 — `frontend/src/components/ui/CourseChip.tsx`

Course tag card; the `checked` state is controlled by `wizardStore`, replacing the native `classList.toggle('selected', ...)`.

---

## Milestone F: Wizard Step Component Migration

### Step 18 — `frontend/src/components/wizard/StepIdentity.tsx`

Role cards (student/senior); the selected/dimmed toggling logic migrated from the role branch inside `goNext(1)` (including the side effect of clearing `user_query` when switching identity).

### Step 19 — `frontend/src/components/wizard/StepCourses.tsx`

Course grid + division tabs (all/lower/upper) + search box (dropdown/tags/custom course); `handleOtherSearch`/`selectOtherCourse`/`removeOtherCourse` migrated into in-component state, with logic fully equivalent to the original.

### Step 20 — `frontend/src/components/wizard/StepGoals.tsx`

Confidence slider (`confidence`, shown in student mode) + goal/expertise chips + `user_query` textarea. The three mapping tables `placeholders`/`seniorPlaceholders`/`comboPlaceholders` migrated as constants; `updatePlaceholder()` logic migrated equivalently.

---

## Milestone G: Result Display Component Migration

### Step 21 — `frontend/src/components/result/GuideCard.tsx`

`react-markdown` renders `guide_markdown`, replacing the CDN `marked.js`; the original table styling is preserved (the `#aafBody table`-related rules in `style.css` were already migrated together in Step 5).

### Step 22 — `frontend/src/components/result/ExportMenu.tsx`

The "more..." popover menu: Add to Calendar (generates a `.ics` blob) / Download as PDF (print window) / Export for Google Docs (`.html` blob) / Share (`navigator.share` or clipboard fallback). The four logic blocks inside `injectTableActions()` migrated as-is into TS functions.

### Step 23 — `frontend/src/components/result/RatingBar.tsx`

Emoji rating; `aafRate()`'s selected state migrated into component state; `aafSubmitRating()` changed to genuinely call `submitRating()` from `api/ratings.ts`, showing the thank-you message only after success (see the "recorded ahead of time" behavior-change note above).

---

## Milestone H: Data-Fetching Hooks and Main Flow Assembly

### Step 24 — `frontend/src/hooks/useGuide.ts`

TanStack Query's `useMutation` wraps `generateGuide`, replacing the original `fetch + DOMParser` AJAX section; `isPending` drives `AtomLoader`'s visibility, replacing `startAtom()/stopAtom()`.

### Step 25 — `frontend/src/App.tsx` + `main.tsx`

Wrapped in `QueryClientProvider` + `BrowserRouter`; the `/` route mounts the three-step wizard + result card (`wizardStore.currentStep` drives switching between `StepIdentity`/`StepCourses`/`StepGoals`/`GuideCard`, replacing the native `classList.add('hidden')`).

---

## Milestone I (Net New): Auth UI

### Step 26 — `frontend/src/hooks/useAuth.ts`

Wraps login/register/logout/me; the automatic refresh-on-401 logic is already handled in Step 8's interceptor — this only exposes `isAuthenticated`/`user`/`login()`/`logout()` for components to use.

### Step 27 — `frontend/src/pages/LoginPage.tsx` + `RegisterPage.tsx`

Implemented with Tailwind (no legacy UI to match against); reuses CSS variables like `--accent` from `style.css` to keep the visual vocabulary consistent, without pursuing pixel-perfect reproduction.

---

## Milestone J (Net New): Guide History Page

### Step 28 — `frontend/src/pages/GuideHistoryPage.tsx`

Visible once logged in; consumes `GET /guide/history`; clicking an item navigates to `/guide/:id`.

### Step 29 — `frontend/src/pages/GuideDetailPage.tsx`

Consumes `GET /guide/{id}` (anonymous access, a genuine share link); reuses `GuideCard` for rendering.

---

## Milestone K (Net New): Senior-Experience Submission Form

### Step 30 — `frontend/src/pages/ContributePage.tsx`

Wired to `POST /contributions`; the "Join As a Contributor of AAF" button — under the senior branch in `StepIdentity.tsx` and in the result card — changes to `navigate('/contribute')` (replacing the original `resetToForm()`).

---

## Milestone L (Net New): Admin Review Backend

### Step 31 — `frontend/src/pages/AdminContributionsPage.tsx`

`useAuth` checks `user.role === 'admin'` before showing the entry point (a pure UX mask — the real permission gate remains the backend's `require_admin` 403); list + approve/reject buttons, wired to Milestone C's `contributions.ts`.

---

## Phase Acceptance Tests

The backend continues to use Phase 3's `uvicorn --reload`; for the frontend, `cd frontend && npm run dev`, then visit `http://localhost:5173` in the browser and walk through it manually (this phase does not introduce Vitest/Playwright unless the PM later requests it, following the principle of not over-engineering):

```
1. Visual diff: open the old templates/index.html side by side (either temporarily start Flask or just
   open the local file) with the new localhost:5173, and check screen-by-screen that the wizard's three
   steps, progress bar, course-chip selected state, atom loading animation, and result-card table styling
   all match.

2. Full student flow: choose student → pick courses → fill in confidence/goals/free text → submit →
   see a real Guide → rate it (open the Network panel to confirm POST /api/v1/ratings is genuinely sent
   and returns 201) → click through all four export functions in the "more..." menu one by one.

3. Full senior flow: choose senior → pick courses → submit → click "Join As a Contributor of AAF" in
   the result card → confirm it navigates to /contribute instead of returning to step 1 of the wizard →
   fill out and submit the form → confirm 201.

4. Login loop: create an account at /register → get a token at /login → refresh the page and confirm
   login state isn't lost (localStorage working) → /history shows Guides generated while logged in, in
   addition to any generated anonymously → clicking an item navigates to /guide/:id and shows the detail.

5. Anonymous share link: without logging in, visit /guide/:id for a known guide_id directly, and confirm
   the content is visible (Optional-auth semantics).

6. Admin review loop: manually change a test account's role to admin (in Supabase) → log in → confirm
   the /admin/contributions entry point is visible → see the record submitted in step 3 → approve it →
   confirm the ChromaDB-side data can be retrieved by the next generate call (the retrieved tip contains
   the text snippet just submitted).

7. Non-admin user visits /admin/contributions: the frontend hides the entry point; if the URL is forced
   directly, the backend's 403 should surface as an on-page error message, not a blank-screen crash.
```

---

## Boundary with Phase 5

| Feature | Phase 4 State | Phase 5 Completion |
|---|---|---|
| Frontend project | Runs locally via `npm run dev`, not deployed | Vercel production deployment, `vercel.json` in effect |
| Backend deployment | Local `uvicorn --reload`, not deployed | Render production deployment, `render.yaml` in effect |
| CORS | Local `.env` only contains `http://localhost:5173` | Production `ALLOWED_ORIGINS` added (Vercel domain, no wildcard) |
| Environment variables | Local `.env`/`.env.example` | Render/Vercel console environment-variable checklist |
| End-to-end acceptance | Manual local walkthrough only | Full smoke test under the production domain (wizard + login + history + review, all walked through) |

---

*This file was generated by the architect. Code implementation must strictly follow the directory structure and interface contracts in ARCHITECTURE.md; the three architectural decisions involved in this phase (CSS approach / routing approach / contribution-submission entry point) have already been confirmed with the PM, see the top of this document. Each step must wait for PM confirmation before execution.*
