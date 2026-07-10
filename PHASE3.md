# Phase 3 执行手册：历史记录 + 学长贡献审核流 + 限流 + 测试

> **状态**：待执行
> **前置条件**：Phase 2 已完成并 `git commit`（JWT 鉴权、Supabase 持久化、`/ratings`、`/health` DB ping 均已验证）
> **验收目标**：登录用户可查看自己的 Guide 历史；学长经验提交 → 管理员审核 → 同步至 ChromaDB 的完整闭环打通；`/guide/generate` 具备防滥用限流；核心安全与业务逻辑有自动化测试覆盖
> **协作约束**：每步执行前等待确认，执行后等待本地测试通过并 `git commit`，再进行下一步

---

## ⚠️ 需要 PM 确认的契约扩展

ARCHITECTURE.md §6 的端点契约表只声明了 `POST /contributions`（提交），没有声明管理员审核所需的查询/批准/驳回端点。要完成 PHASE2.md 里程碑约定的"管理员审核流"，本阶段会新增 3 个 ARCHITECTURE.md 尚未记录的端点（见里程碑 F）。这些端点确认后，需要同步补写进 ARCHITECTURE.md §6，保持文档与代码的契约一致——这一点会作为本阶段最后一步单独提出，不在下面的 18 个 Step 里，等前面步骤全部验收通过后再做。

---

## 与 Phase 2 的边界对照

| 功能 | Phase 2 状态 | Phase 3 完成 |
|---|---|---|
| `/guide/history` | 未实现 | `GET /guide/history` 分页查询（需登录） |
| `/guide/{id}` | 未实现 | `GET /guide/{id}` 单条详情（匿名可访问，分享链接语义） |
| `contributions` 表 | 未创建 | 建表 + `POST /contributions` 持久化 |
| 学长经验审核 | 无 | 管理员列表/批准/驳回 + 批准后同步至 ChromaDB |
| `/guide/generate` 滥用防护 | 无限流，任何人可无限调用（真实扣费） | `asyncio.Lock` 滑动窗口限流（按 IP） |
| 单元/集成测试 | 无 | `test_security.py` + `test_ai_service.py` + `test_guide_route.py` |
| `/auth/logout` | 无状态（客户端删除 token） | 维持无状态；黑名单方案列为可选里程碑，默认不做 |

---

## 里程碑 A：测试基础设施

### Step 1 — 更新 `backend/requirements.txt`

新增：

```
pytest
pytest-asyncio
```

不引入 `pytest-mock`——用标准库 `unittest.mock.patch` 已够用，避免多一个依赖。

---

## 里程碑 B：Supabase 表结构扩展

### Step 2 — 在 Supabase SQL Editor 建 `contributions` 表

**操作位置**：Supabase 控制台（非代码文件），字段对齐 ARCHITECTURE.md §5：

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` |
| `user_id` | UUID | FK → users，nullable |
| `course` | VARCHAR(50) | NOT NULL |
| `danger_zone` | TEXT | |
| `setup_tips` | TEXT | |
| `career_value` | TEXT | |
| `is_approved` | BOOLEAN | DEFAULT FALSE |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

**验收命令**：与 PHASE2.md Step 1 相同的 `pg_tables` 查询，预期新增 `contributions`。

---

## 里程碑 C：模型 + Schema 层

### Step 3 — 新建 `backend/app/models/contribution.py`

字段与约束严格对齐上表；`user_id`、`course` 用与 `Guide`/`Rating` 模型一致的 `Mapped[...]` 写法。

### Step 4 — 新建 `backend/app/schemas/contribution.py`

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

### Step 5 — 更新 `backend/app/schemas/guide.py`（仅追加，不改动现有 `GuideRequest`/`GuideResponse`）

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

## 里程碑 D：依赖层 — 管理员权限

### Step 6 — 更新 `backend/app/api/deps.py`（追加，不改动现有 `get_db`/`get_current_user`/`get_optional_user`）

```python
async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
```

复用 `get_current_user`（未登录/token 无效已由它抛 401），这里只补 403 的角色校验。

---

## 里程碑 E：Guide 历史与详情路由

### Step 7 — 更新 `backend/app/api/v1/routes/guide.py`（追加端点，`generate` 逻辑不动）

```python
@router.get("/history", response_model=GuideHistoryResponse)
async def guide_history(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # WHERE guide.user_id == user.id, ORDER BY created_at DESC, LIMIT/OFFSET
    # 同时执行一次 COUNT 得到 total
```

### Step 8 — 更新 `backend/app/api/v1/routes/guide.py`（追加）

```python
@router.get("/{guide_id}", response_model=GuideResponse)
async def get_guide(
    guide_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    # db.get(Guide, guide_id)，不存在 → 404
    # 不做归属校验：guide_id 是 UUID，本身即不可猜测，语义等同分享链接
```

---

## 里程碑 F：Contributions 提交与审核路由

### Step 9 — 更新 `backend/app/services/rag_service.py`（追加，`retrieve_tips_async` 不动）

```python
def _add_tip_sync(tip_id: str, course: str, text: str) -> None:
    collection = _get_collection()
    collection.add(documents=[text], metadatas=[{"course": course}], ids=[tip_id])

async def add_tip_async(tip_id: str, course: str, text: str) -> None:
    await asyncio.to_thread(_add_tip_sync, tip_id, course, text)
```

复用已有的 `_get_collection()`，写入同一个 `aaf_data` collection，`metadatas={"course": ...}` 与 `retrieve_tips_async` 的 `where={"course": course}` 查询字段对齐，保证审核通过的内容能被检索到。

### Step 10 — 新建 `backend/app/api/v1/routes/contributions.py`

```python
@router.post("", response_model=ContributionResponse, status_code=201)
async def submit_contribution(
    body: ContributionRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    # INSERT contributions，user_id=user.id if user else None，is_approved=False
```

### Step 11 — 更新 `backend/app/api/v1/routes/contributions.py`（追加，均 `Depends(require_admin)`）

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
    # 1. 查 contribution，不存在 → 404
    # 2. is_approved = True
    # 3. 拼装文本（course + danger_zone + setup_tips + career_value）
    # 4. await rag_service.add_tip_async(str(contribution.id), contribution.course, text)
    # 5. 返回更新后的 ContributionResponse

@router.delete("/{contribution_id}", status_code=204)
async def reject_contribution(
    contribution_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    # 直接 DELETE（表里没有"已驳回"状态，驳回即删除，不进 ChromaDB）
```

### Step 12 — 更新 `backend/app/api/v1/router.py`

```python
from app.api.v1.routes import contributions

api_router.include_router(contributions.router, prefix="/contributions", tags=["contributions"])
```

---

## 里程碑 G：限流层

### Step 13 — 新建 `backend/app/core/rate_limit.py`

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

`max_requests=5, window_seconds=60` 是初始默认值，可在验收时按 PM 需要调整。单实例 + `asyncio.Lock` 与 CLAUDE.md「不引入 Redis」的铁律一致；Render 多实例部署时这个内存限流会失效（每个实例各算各的），当前单实例部署下暂不是问题。

### Step 14 — 更新 `backend/app/api/v1/routes/guide.py`（仅 `generate` 端点追加一个依赖）

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

## 里程碑 H：单元 / 集成测试

### Step 15 — 新建 `backend/tests/unit/test_security.py`

覆盖：`hash_password`/`verify_password` 往返；`create_access_token` 生成的 token 能被 `decode_token` 正确解出 `sub`；过期 token（`expires_delta=timedelta(seconds=-1)`）→ `decode_token` 抛 401；篡改签名的 token → 401。

### Step 16 — 新建 `backend/tests/unit/test_ai_service.py`

`unittest.mock.patch` 掉 `ai_service._client.messages.create`，验证：`build_user_context` 各字段拼装正确；`generate_guide` 返回值正确剥离 `<thinking>...</thinking>`；`tokens_used` 等于 mock 返回的 `input_tokens + output_tokens`。不发真实 Anthropic 请求。

### Step 17 — 新建 `backend/tests/integration/test_guide_route.py`

`ASGITransport` + `app.router.lifespan_context`（沿用 Phase 2 验收时用过的模式）。`monkeypatch` 掉 `rag_service.retrieve_tips_async` / `search_service.tavily_search` / `ai_service.generate_guide`，避免真实付费调用。覆盖：匿名生成 → `guide.user_id is None`；登录生成 → `guide.user_id` 与当前用户一致；`asyncio.gather` 单个子任务抛异常时主流程仍能降级完成（`return_exceptions=True` 那段逻辑）；连续超过限流阈值的请求收到 429。

---

## 里程碑 I（可选，按需）：`/auth/logout` 黑名单

PHASE2.md 已把这个标为"若需要"。除非产品上确实需要"用户点登出后旧 token 立刻失效"，否则维持现状（客户端删 token 即可，无状态设计更简单）。如果要做：

### Step 18（可选）— `revoked_tokens` 表 + `decode_token` 增加黑名单校验

需要额外一次 DB 查询在每次鉴权请求里执行，有性能代价，建议先跳过，等前端/产品明确提出这个需求再单独立项，不算进本阶段强制验收范围。

---

## 阶段验收测试

```bash
# 前置：TOKEN = 已登录用户的 access_token（沿用 Phase2 的登录方式获取）
# ADMIN_TOKEN = role=admin 用户的 access_token（需先手动在 Supabase 把某个测试用户 role 改成 admin）

# 1. 提交学长经验（匿名）
curl -X POST http://localhost:8000/api/v1/contributions \
  -H "Content-Type: application/json" \
  -d '{"course":"ICS 32","danger_zone":"Project 3 due same week as midterm","setup_tips":"Set up pylint before week 1"}'
# 预期: 201, is_approved:false

# 2. 管理员查看待审核列表
curl http://localhost:8000/api/v1/contributions \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# 预期: 200, 包含步骤1提交的记录

# 3. 管理员批准（触发 ChromaDB 写入）
curl -X POST http://localhost:8000/api/v1/contributions/<id>/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# 预期: 200, is_approved:true

# 4. 非管理员调用审核端点 → 403
curl http://localhost:8000/api/v1/contributions \
  -H "Authorization: Bearer $TOKEN"
# 预期: 403

# 5. 查看 Guide 历史（需登录）
curl http://localhost:8000/api/v1/guide/history \
  -H "Authorization: Bearer $TOKEN"
# 预期: 200, {"items":[...],"total":N}

# 6. 查看单条 Guide 详情（匿名可访问）
curl http://localhost:8000/api/v1/guide/<guide_id>
# 预期: 200

# 7. 限流验证：连续调用 6 次 /guide/generate（超过默认阈值 5次/60s）
for i in {1..6}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/api/v1/guide/generate \
    -H "Content-Type: application/json" \
    -d '{"role":"student","courses":["ICS 32"],"confidence":6.0,"goals":["ace_grade"]}'
done
# 预期: 前5次 200，第6次 429
```

---

## 与 Phase 4 的边界

| 功能 | Phase 3 状态 | Phase 4 完成 |
|---|---|---|
| 后端 API 契约 | 本阶段结束后冻结（含新增的 history/detail/contributions 审核端点） | 前端严格对齐消费，不再新增/变更后端端点 |
| 前端工程 | 未开始 | React 18 + Vite + TS 独立工程，100% 视觉还原 `templates/index.html` |
| 认证态前端联调 | 无 | `useAuth.ts` 接入 `/auth/*`，Token 存储与刷新逻辑 |
| Markdown 渲染 | 无 | `react-markdown` 替代 `marked.js` |

---

*本文件由架构师生成，代码实施须严格遵循 ARCHITECTURE.md 中的目录结构与接口契约。契约扩展部分需 PM 在 Step 2 前单独确认。每步执行前必须等待 PM 确认。*
