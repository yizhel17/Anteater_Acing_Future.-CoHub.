# Phase 2 执行手册：Supabase 连接 + JWT 鉴权 + 业务持久化

> **状态**：待执行
> **前置条件**：Phase 1 已完成并 `git commit`；Supabase 项目已创建，`DATABASE_URL` 已配置在 `backend/.env`
> **验收目标**：注册/登录真实可用；Guide 生成结果写入 DB；评分持久化；`get_optional_user()` 识别真实 JWT Token
> **协作约束**：每步执行前等待确认，执行后等待本地测试通过并 `git commit`，再进行下一步

---

## 与 Phase 1 的边界对照

| 功能 | Phase 1 状态 | Phase 2 完成 |
|---|---|---|
| Supabase 连接 | 引擎已配置，未验证真实连接 | 创建表 + 连通性验证 |
| `get_current_user` | 直接抛 401 stub | JWT 校验 + 查 users 表 |
| `get_optional_user` | 直接返回 `None` | 真实 JWT 解析，匿名返回 None |
| `guide_id` | `uuid.uuid4()` 临时生成 | 持久化到 `guides` 表 |
| 评分接口 | Schema 存在，路由未实现 | `POST /ratings` 写入 DB |
| health 端点 | 仅返回 `{"status":"ok"}` | 加入 DB ping |

---

## 里程碑 A：Supabase 表结构创建

### Step 1 — 在 Supabase SQL Editor 执行建表 SQL

**操作位置**：Supabase 控制台 → SQL Editor（非代码文件）

在 Supabase SQL Editor 中执行以下 DDL（已包含 `users`、`guides`、`ratings` 三张表）。

**验收命令**（在 `backend/` 目录下执行）：

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

预期输出包含：`['users', 'guides', 'ratings']`

---

### Step 2 — 验证 SQLAlchemy async 引擎连通性

**修改文件**：`backend/app/main.py`（仅 lifespan startup 部分加一行 ping）

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

**验收**：`uvicorn` 启动日志出现 `DB OK`，无 asyncpg 报错。

---

## 里程碑 B：JWT 安全层

### Step 3 — 新建 `backend/app/core/security.py`

**内容**：

| 函数 | 说明 |
|---|---|
| `hash_password(plain: str) -> str` | `passlib[bcrypt]` 哈希 |
| `verify_password(plain: str, hashed: str) -> bool` | bcrypt 校验 |
| `create_access_token(data: dict, expires_delta: timedelta \| None) -> str` | 签发 JWT，payload 含 `sub`(user_id str) + `exp` |
| `create_refresh_token(data: dict) -> str` | 有效期 30 天的 Refresh Token |
| `decode_token(token: str) -> dict` | 校验签名 + 过期时间，失败抛 `HTTPException(401)` |

密钥从 `settings.JWT_SECRET_KEY` 读取，算法固定 `settings.JWT_ALGORITHM`（默认 `HS256`）。

---

### Step 4 — 更新 `backend/.env` 和 `backend/.env.example`

**`.env`** 新增一行（如尚未添加）：
```
JWT_SECRET_KEY=<64字节随机hex>
```

生成命令：
```bash
python -c "import secrets; print(secrets.token_hex(64))"
```

**`.env.example`** 同步新增：
```
JWT_SECRET_KEY=change-me-in-production
```

> `config.py` 中 `JWT_SECRET_KEY` 字段已在 Phase 1 Step 3 声明，此步骤仅填充真实值。

---

## 里程碑 C：认证 Schema 层

### Step 5 — 新建 `backend/app/schemas/auth.py`

**Pydantic v2 Schema 定义**：

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

## 里程碑 D：认证路由层

### Step 6 — 新建 `backend/app/api/v1/routes/auth.py`

**端点**（5 个）：

| 端点 | 方法 | 逻辑 |
|---|---|---|
| `/auth/register` | POST | bcrypt hash → INSERT users → 返回 `TokenResponse` |
| `/auth/login` | POST | 查邮箱 → verify_password → 签 access + refresh token |
| `/auth/refresh` | POST | 校验 refresh token → 签新 access token |
| `/auth/logout` | POST | 无状态设计：返回 `{"ok": true}`，客户端删除 Token 即可 |
| `/auth/me` | GET | `Depends(get_current_user)` → 返回 `UserResponse` |

**错误处理**：
- 邮箱已注册 → `409 Conflict`
- 密码错误 / 用户不存在 → 统一 `401`（不暴露具体原因，防止用户名枚举攻击）
- Token 过期/无效 → `401`

---

### Step 7 — 更新 `backend/app/api/deps.py`

**从 Phase 1 stub 升级为真实实现**：

```python
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = security.decode_token(token)          # 失败直接抛 401
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

## 里程碑 E：业务持久化

### Step 8 — 更新 `backend/app/api/v1/routes/guide.py`

**变更点**（仅最后 DB 写入部分，并发逻辑不动）：

```python
# Phase 2: 写入 guides 表（匿名用户 user_id=None）
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
await db.flush()   # 获取 DB 生成的 guide.id；commit 在 get_db() 生命周期末统一提交
```

`GuideResponse.guide_id` 改为 `guide.id`（数据库真实 UUID）。

---

### Step 9 — 新建 `backend/app/api/v1/routes/ratings.py`

**端点**：`POST /ratings`，status_code=201

逻辑：
1. 查 `guides` 表验证 `guide_id` 存在，不存在 → `404`
2. `INSERT ratings`，`user_id=user.id if user else None`
3. 返回 `RatingResponse`

---

## 里程碑 F：路由汇总 + 健康检查升级

### Step 10 — 更新 `backend/app/api/v1/router.py`

追加：

```python
from app.api.v1.routes import auth, ratings

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(ratings.router, prefix="/ratings", tags=["ratings"])
```

---

### Step 11 — 升级 health 端点（`backend/app/main.py`）

```python
@app.get("/api/v1/health")
async def health(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "version": "1.0.0", "db": "connected"}
```

Render 部署后，健康检查可验证 Supabase 连通性。

---

## 阶段验收测试

```bash
# 1. 注册
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@uci.edu","password":"password123"}'
# 预期: {"access_token":"...","refresh_token":"...","token_type":"bearer"}

# 2. 登录
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@uci.edu","password":"password123"}'
# 预期: TokenResponse

# 3. 获取当前用户
curl http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer <access_token>"
# 预期: {"id":"...","email":"test@uci.edu","role":"student",...}

# 4. 生成 Guide（带 Token，guide_id 写入 DB）
curl -X POST http://localhost:8000/api/v1/guide/generate \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"role":"student","courses":["ICS 32"],"confidence":6.0,"goals":["ace_grade"]}'
# 预期: guide_id 与 Supabase guides 表记录一致

# 5. 提交评分
curl -X POST http://localhost:8000/api/v1/ratings \
  -H "Content-Type: application/json" \
  -d '{"guide_id":"<guide_id_from_step4>","score":1}'
# 预期: 201

# 6. 健康检查（含 DB ping）
curl http://localhost:8000/api/v1/health
# 预期: {"status":"ok","version":"1.0.0","db":"connected"}
```

---

## 与 Phase 3 的边界

| 功能 | Phase 2 状态 | Phase 3 完成 |
|---|---|---|
| `contributions.py` | 未实现 | `POST /contributions` + 管理员审核流 |
| `/guide/history` | 未实现 | `GET /guide/history` 分页查询 |
| 限流 `rate_limit.py` | 未实现 | `asyncio.Lock` 滑动窗口 |
| 单元/集成测试 | 无 | `tests/unit/test_security.py` + `test_guide_route.py` |
| `/auth/logout` 黑名单 | 无状态（客户端删除） | 若需要，引入 revoked_tokens 表 |

---

*本文件由架构师生成，代码实施须严格遵循 ARCHITECTURE.md 中的目录结构与接口契约。每步执行前必须等待 PM 确认。*
