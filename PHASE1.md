# Phase 1 执行手册：FastAPI 项目脚手架 + 核心路由迁移

> **状态**：待执行  
> **前置条件**：Phase 0 已完成并 `git commit`  
> **验收目标**：`POST /api/v1/guide/generate` 在 FastAPI 下真实响应，质量对齐原 Flask 版本  
> **协作约束**：每步执行前等待确认，执行后等待本地测试通过并 `git commit`，再进行下一步

---

## 现状摘要

| 项目 | 当前状态 |
|---|---|
| 框架 | Flask（`app.py` 单文件 600+ 行） |
| 向量数据库 | `chroma_db/`（根目录） |
| 依赖清单 | 根目录 `requirements.txt`，含 flask/gunicorn |
| 部署入口 | `Procfile`（gunicorn） |
| 目标结构 | `backend/` 分层 FastAPI 工程（见 ARCHITECTURE.md §2） |

---

## 里程碑 A：依赖层

### Step 1 — 新建 `backend/requirements.txt`

**阶段目标**：声明 FastAPI 生态的完整依赖，彻底移除 Flask/Gunicorn。

**技术细节**：

移除以下旧依赖：
- `flask`
- `gunicorn`

新增以下依赖：

| 包名 | 版本约束 | 用途 |
|---|---|---|
| `fastapi` | 无固定 | 框架核心，替代 Flask |
| `uvicorn[standard]` | 无固定 | ASGI 服务器，替代 gunicorn |
| `sqlalchemy[asyncio]` | 无固定 | 异步 ORM 支持 |
| `asyncpg` | 无固定 | PostgreSQL 异步驱动（Supabase 连接） |
| `pydantic-settings` | 无固定 | Pydantic v2 `BaseSettings`，读取 `.env` |
| `httpx` | 无固定 | 异步 HTTP 客户端（Anthropic SDK async 依赖） |
| `python-jose[cryptography]` | 无固定 | JWT 签发/校验（Phase 2 鉴权预埋） |
| `passlib[bcrypt]` | 无固定 | bcrypt 密码哈希（Phase 2 鉴权预埋） |

保留以下现有依赖（版本约束不变）：
- `anthropic`
- `tavily-python`
- `chromadb==0.4.24`
- `numpy<2.0.0`
- `python-dotenv`

**文件位置**：`backend/requirements.txt`（全新文件，与根目录旧版并存，旧版暂不删除）

---

## 里程碑 B：项目骨架

### Step 2 — 批量创建所有 `__init__.py` 空占位文件

**阶段目标**：建立 `backend/` 下完整的 Python package 层级结构，使后续所有 import 语句合法。

**技术细节**：

以下文件全部为**空文件**（0 字节），仅声明 package 边界：

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

> 这是唯一允许批量操作的步骤，因为所有文件均无实质逻辑。

---

## 里程碑 C：配置层

### Step 3 — 新建 `backend/app/core/config.py`

**阶段目标**：建立统一的环境变量读取入口，所有密钥/配置通过此模块访问，代码中零硬编码。

**技术细节**：

使用 Pydantic v2 `BaseSettings`。`model_config = SettingsConfigDict(env_file=".env", extra="ignore")`。

声明以下字段：

| 字段名 | 类型 | 默认值 | 用途 |
|---|---|---|---|
| `DATABASE_URL` | `str` | 无 | Supabase `postgresql+asyncpg://...` 连接串 |
| `ANTHROPIC_API_KEY` | `str` | 无 | Claude API 密钥 |
| `TAVILY_API_KEY` | `str` | 无 | Tavily 搜索密钥 |
| `JWT_SECRET_KEY` | `str` | 无 | JWT 签名密钥 |
| `JWT_ALGORITHM` | `str` | `"HS256"` | JWT 算法 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `int` | `60` | Access Token 有效期 |
| `ALLOWED_ORIGINS` | `list[str]` | `["http://localhost:5173"]` | CORS 白名单 |

在模块底部创建全局单例：`settings = Settings()`，其他模块统一 `from app.core.config import settings` 调用。

---

### Step 4 — 新建 `backend/.env.example`

**阶段目标**：提供所有环境变量的模板文件，提交 Git，供团队成员本地配置参考。

**技术细节**：

包含 Step 3 中所有字段的键名，值全部留空或填写无意义占位符：

```
DATABASE_URL=postgresql+asyncpg://user:password@host:port/dbname
ANTHROPIC_API_KEY=sk-ant-...
TAVILY_API_KEY=tvly-...
JWT_SECRET_KEY=change-me-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
ALLOWED_ORIGINS=http://localhost:5173
```

> `.env`（真实密钥）已在 `.gitignore` 中，只有 `.env.example` 提交 Git。

---

## 里程碑 D：数据库层

### Step 5 — 新建 `backend/app/db/base.py`

**阶段目标**：建立 SQLAlchemy ORM 的基类，所有 Model 继承此 Base。

**技术细节**：

使用 SQLAlchemy 2.0+ 的 `DeclarativeBase`（非旧式 `declarative_base()`）：

```python
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass
```

所有 ORM 模型（Step 7-9）均从此 `Base` 继承。

---

### Step 6 — 新建 `backend/app/db/session.py`

**阶段目标**：配置异步数据库引擎和 Session 工厂，为 FastAPI 依赖注入做好准备。

**技术细节**：

- 引擎：`create_async_engine(settings.DATABASE_URL, pool_size=5, max_overflow=10, echo=False)`
- Session 工厂：`AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)`
- 暴露 `async_engine` 供 `main.py` 的 lifespan 事件使用（将来做连接池预热/关闭）

> **重要**：此步骤只写配置代码，不实际连接 Supabase。`DATABASE_URL` 可在 `.env` 中暂时留空，引擎仅在第一次真实 DB 调用时才建立连接。Phase 2 才做 Supabase 连通性验证。

---

### Step 7 — 新建 `backend/app/models/user.py`

**阶段目标**：建立 `users` 表的 ORM 映射模型。

**技术细节**：

字段对齐 ARCHITECTURE.md §5 的 `users` 表定义：

| 字段 | SQLAlchemy 类型 | 约束 |
|---|---|---|
| `id` | `Uuid` | PK，`default=uuid.uuid4` |
| `email` | `String(255)` | `unique=True, nullable=False` |
| `hashed_pw` | `String(255)` | `nullable=False` |
| `display_name` | `String(100)` | nullable |
| `role` | `String(10)` | CHECK IN `('student', 'senior', 'admin')` |
| `is_verified` | `Boolean` | `default=False` |
| `created_at` | `DateTime(timezone=True)` | `server_default=func.now()` |

---

### Step 8 — 新建 `backend/app/models/guide.py`

**阶段目标**：建立 `guides` 表的 ORM 映射模型（AI 生成历史）。

**技术细节**：

| 字段 | SQLAlchemy 类型 | 约束 |
|---|---|---|
| `id` | `Uuid` | PK，`default=uuid.uuid4` |
| `user_id` | `Uuid` | FK → `users.id`，**nullable**（支持匿名） |
| `role` | `String(10)` | |
| `courses` | `ARRAY(Text)` | |
| `confidence` | `Float` | |
| `goals` | `ARRAY(Text)` | |
| `user_query` | `Text` | nullable |
| `response_md` | `Text` | AI 生成 Markdown 全文 |
| `tokens_used` | `Integer` | |
| `created_at` | `DateTime(timezone=True)` | `server_default=func.now()` |

---

### Step 9 — 新建 `backend/app/models/rating.py`

**阶段目标**：建立 `ratings` 表的 ORM 映射模型（满意度持久化）。

**技术细节**：

| 字段 | SQLAlchemy 类型 | 约束 |
|---|---|---|
| `id` | `Uuid` | PK，`default=uuid.uuid4` |
| `guide_id` | `Uuid` | FK → `guides.id`，`nullable=False` |
| `user_id` | `Uuid` | FK → `users.id`，**nullable** |
| `score` | `SmallInteger` | CHECK IN `(1, 0, -1)`，对应 good/neutral/bad |
| `created_at` | `DateTime(timezone=True)` | `server_default=func.now()` |

---

## 里程碑 E：Schema 层（API 契约）

### Step 10 — 新建 `backend/app/schemas/guide.py`

**阶段目标**：用 Pydantic v2 严格定义 Guide 接口的请求/响应结构，作为前后端契约。

**技术细节**：

`GuideRequest`（请求体）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `role` | `Literal["student", "senior"]` | 角色 |
| `courses` | `list[str]` | `min_length=1` |
| `confidence` | `float` | `ge=0, le=10` |
| `goals` | `list[str]` | |
| `user_query` | `str \| None` | `default=None` |

`GuideResponse`（响应体，对齐 ARCHITECTURE.md §6）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `guide_id` | `UUID` | |
| `guide_markdown` | `str` | AI 生成的完整 Markdown |
| `sources_used` | `list[str]` | Tavily 来源 URL 列表 |
| `tips_count` | `int` | ChromaDB 命中的 tip 数量 |
| `tokens_used` | `int` | Claude 实际消耗 token |

---

### Step 11 — 新建 `backend/app/schemas/rating.py`

**阶段目标**：定义评分接口的请求/响应 Schema。

**技术细节**：

`RatingRequest`：
- `guide_id: UUID`
- `score: Literal[-1, 0, 1]`（-1=bad，0=neutral，1=good）

`RatingResponse`：
- `id: UUID`
- `guide_id: UUID`
- `score: int`
- `created_at: datetime`

---

## 里程碑 F：服务层（核心业务逻辑迁移）

### Step 12 — 新建 `backend/app/services/rag_service.py`

**阶段目标**：将 `rag.py` 的 ChromaDB 检索逻辑迁移为异步接口，供路由层调用。

**技术细节**：

ChromaDB 客户端是**同步**库，不能直接在 `async` 函数中调用（会阻塞事件循环）。解决方案：用 `asyncio.to_thread()` 将同步调用推到线程池。

核心逻辑从 `rag.py` 的 `retrieve_tips()` 原样移植，仅更改：

1. `PersistentClient(path=...)` 的路径从根目录改为 `backend/chroma_db/`（配合 Step 20 的目录迁移）
2. 外层用 `asyncio.to_thread` 包装：

```python
async def retrieve_tips_async(query: str, course: str, n: int = 3) -> list[str]:
    return await asyncio.to_thread(_retrieve_tips_sync, query, course, n)
```

函数返回 `list[str]`，每个元素是一条学长经验文本。

---

### Step 13 — 新建 `backend/app/services/search_service.py`

**阶段目标**：将 `app.py` 中的 Tavily 搜索逻辑提取为独立异步服务，含完整的来源标签逻辑。

**技术细节**：

`TavilyClient.search()` 也是**同步**调用，同样用 `asyncio.to_thread()` 包装。

核心函数签名：

```python
async def tavily_search(courses: list[str]) -> tuple[list[str], str]:
    # 返回: (sources_used: list[str], formatted_str: str)
```

内部逻辑原样从 `app.py` 迁移：
- 只取 `courses[:1]`（首门课程），避免超时
- 发起两个定向查询：`{course} UCI professor exam difficulty study tips reddit student experience` 和 `{course} UCI internship career relevance skills employers`
- 来源标签逻辑**完整保留**：

| URL 特征 | 标签 |
|---|---|
| `reddit.com` | 📌 r/UCI Forum |
| `uci.edu` | 🎓 UCI Official |
| `ratemyprofessors.com` | ⭐ RateMyProfessors |
| `blind.com` | 💼 Blind SWE Intel |
| `linkedin.com` | 🔗 LinkedIn |
| 其他 | 🌐 Web |

- 去重逻辑（按前 60 字符 key 去重）原样保留
- Tavily 失败时 `return ([], "")` — **不影响主流程**（与原代码 `except: pass` 行为一致）

---

### Step 14 — 新建 `backend/app/services/ai_service.py`

**阶段目标**：迁移 Claude API 调用逻辑和完整的 `SYSTEM_PROMPT`，实现异步生成接口。

**技术细节**：

1. **SYSTEM_PROMPT**：从 `app.py` 第 41-123 行原样复制，不修改任何内容。
2. **客户端初始化**：使用 `httpx.AsyncClient(timeout=90.0)` 创建异步 Anthropic 客户端：
   ```python
   client = Anthropic(
       api_key=settings.ANTHROPIC_API_KEY,
       http_client=httpx.AsyncClient(timeout=90.0)
   )
   ```
3. **核心函数签名**：
   ```python
   async def generate_guide(user_context: str) -> tuple[str, int]:
       # 返回: (cleaned_markdown: str, tokens_used: int)
   ```
4. **`<thinking>` 标签剥离**：用 `re.sub(r"<thinking>.*?</thinking>", "", raw, flags=re.DOTALL).strip()` 原样保留。
5. **用户上下文组装辅助函数**：
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
       # 原样迁移 app.py 中 parts[] 的拼装逻辑
   ```

---

## 里程碑 G：路由层

### Step 15 — 新建 `backend/app/api/deps.py`

**阶段目标**：实现 FastAPI 全局依赖注入函数，供所有路由通过 `Depends()` 使用。

**技术细节**：

实现 ARCHITECTURE.md §4 定义的三条依赖链：

**`get_db()`** — AsyncSession 生命周期管理：
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

**`get_current_user()`** — Phase 1 中为 stub，直接返回 `None`（Phase 2 补全 JWT 校验）：
```python
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Phase 2 实现：JWT 校验 → 查询 users 表 → 返回 User 或抛 401
    raise HTTPException(status_code=401, detail="Auth not implemented yet")
```

**`get_optional_user()`** — Token 缺失/无效时返回 `None`：
```python
async def get_optional_user(...) -> User | None:
    # Phase 1 stub：直接返回 None
    return None
```

---

### Step 16 — 新建 `backend/app/api/v1/routes/guide.py`

**阶段目标**：实现 `POST /guide/generate` 端点，这是 Phase 1 最核心的文件，并发执行 ChromaDB 和 Tavily。

**技术细节**：

端点函数签名：
```python
@router.post("/generate", response_model=GuideResponse)
async def generate_guide(
    body: GuideRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
```

执行流程（**关键并发优化**）：

```
1. 为每门课程构造 ChromaDB 查询列表
2. 根据 role 决定是否触发 Tavily（senior 角色跳过）
3. asyncio.gather 并发执行：
   ├── [rag_service.retrieve_tips_async(course) for course in courses]  ← ChromaDB
   └── search_service.tavily_search(courses) if role != "senior" else ("", "")  ← Tavily
   return_exceptions=True  ← 任一失败不阻断另一个
4. 组装 senior_tips_str（格式对齐原 app.py 的 lines[] 逻辑）
5. 调用 ai_service.build_user_context() 组装 user_context
6. 调用 ai_service.generate_guide(user_context) 获取 (markdown, tokens)
7. Phase 1 暂不写数据库，guide_id 用 uuid.uuid4() 临时生成
8. 返回 GuideResponse
```

相比原 Flask 串行代码，ChromaDB 多课程查询 + Tavily 两个定向搜索**同时并发执行**，理论响应时间缩短 40-60%。

**错误处理**：
- 任何 service 层异常捕获后记录 `logging.error()`，抛出 `HTTPException(status_code=500, detail=...)`
- Tavily 失败降级为空结果，不影响主流程（与原代码行为一致）

---

### Step 17 — 新建 `backend/app/api/v1/routes/courses.py`

**阶段目标**：提供 `GET /courses` 静态接口，返回支持的 UCI 课程列表。

**技术细节**：

- 从 `templates/index.html` 中提取 80+ 课程代码列表，硬编码为 `COURSES: list[str]` 常量
- 端点直接返回该列表（无 DB 查询）
- 响应 Schema：`{"courses": ["ICS 31", "ICS 32", ...]}`

---

### Step 18 — 新建 `backend/app/api/v1/router.py`

**阶段目标**：汇总所有 v1 子路由，提供统一的路由注册入口。

**技术细节**：

```python
from fastapi import APIRouter
from app.api.v1.routes import guide, courses

api_router = APIRouter()
api_router.include_router(guide.router, prefix="/guide", tags=["guide"])
api_router.include_router(courses.router, prefix="/courses", tags=["courses"])
```

Phase 2 会在此处追加 `auth`、`ratings`、`contributions` 路由。

---

## 里程碑 H：应用入口

### Step 19 — 新建 `backend/app/main.py`

**阶段目标**：创建 FastAPI 应用实例，注册 CORS 中间件和所有路由，这是 uvicorn 的启动入口。

**技术细节**：

1. **lifespan 上下文管理器**（应用级启动/关闭钩子）：
   ```python
   @asynccontextmanager
   async def lifespan(app: FastAPI):
       # startup：将来在此做 DB 连接池预热、ChromaDB 连通检查
       logger.info("AAF FastAPI starting up...")
       yield
       # shutdown：关闭 async_engine
       await async_engine.dispose()
       logger.info("AAF FastAPI shut down.")
   ```

2. **FastAPI 实例**：
   ```python
   app = FastAPI(
       title="AAF API",
       version="1.0.0",
       lifespan=lifespan,
   )
   ```

3. **CORSMiddleware**（对齐 ARCHITECTURE.md §3 策略 B）：
   ```python
   app.add_middleware(
       CORSMiddleware,
       allow_origins=settings.ALLOWED_ORIGINS,  # 从环境变量读取，绝不用 "*"
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

4. **路由挂载**：
   ```python
   app.include_router(api_router, prefix="/api/v1")
   ```

5. **健康检查端点**（Render 部署必需）：
   ```python
   @app.get("/api/v1/health")
   async def health():
       return {"status": "ok", "version": "1.0.0"}
   ```

6. **启动命令**（本地开发）：
   ```bash
   cd backend && uvicorn app.main:app --reload --port 8000
   ```

---

## 里程碑 I：数据目录迁移

### Step 20 — 迁移 `chroma_db/` 到 `backend/chroma_db/`

**阶段目标**：将 ChromaDB 数据目录迁移到 `backend/` 下，与 ARCHITECTURE.md 目录树对齐。

**技术细节**：

执行 shell 命令：
```bash
mv /path/to/AAF_Product/chroma_db /path/to/AAF_Product/backend/chroma_db
```

同时确认 `rag_service.py`（Step 12）中 `PersistentClient(path=...)` 的路径已指向新位置。

同步迁移数据文件：
```bash
mkdir -p backend/data
cp AAF_responses.csv backend/data/AAF_responses.csv
```

更新 `.gitignore`，确保 `backend/chroma_db/` 下的数据文件不被提交（二进制向量数据无需入库）。

---

## 整体依赖关系图

```
Step 1  (requirements.txt)
    │
Step 2  (__init__.py 骨架)
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
Step 20 (chroma_db 目录迁移) ◄── 配合 Step 12 路径
```

---

## 阶段验收测试

Step 19 完成后执行：

```bash
# 终端 1：启动 FastAPI（在 backend/ 目录下）
uvicorn app.main:app --reload --port 8000

# 终端 2：健康检查
curl http://localhost:8000/api/v1/health
# 预期: {"status": "ok", "version": "1.0.0"}

# 终端 3：课程列表
curl http://localhost:8000/api/v1/courses
# 预期: {"courses": ["ICS 31", "ICS 32", ...]}

# 终端 4：核心 AI 生成接口（需要 .env 中配置真实 API Key）
curl -X POST http://localhost:8000/api/v1/guide/generate \
  -H "Content-Type: application/json" \
  -d '{
    "role": "student",
    "courses": ["ICS 32"],
    "confidence": 6.0,
    "goals": ["ace_grade"],
    "user_query": "I just finished ICS 31 with B+"
  }'
# 预期: {"guide_id": "...", "guide_markdown": "...", "sources_used": [...], "tokens_used": ...}
```

**验收标准**：
- 所有端点返回正确状态码（200）
- `guide_markdown` 内容质量与原 Flask 版本一致
- 无 `<thinking>` 标签残留在响应中
- 日志中可见 ChromaDB 和 Tavily 并发调用

---

## 与 Phase 2 的边界

| 功能 | Phase 1 状态 | Phase 2 完成 |
|---|---|---|
| DB 模型 + Session | 代码存在，未连接真实 Supabase | 连接验证 + 表创建 |
| `guide_id` | `uuid.uuid4()` 临时生成 | 持久化到 `guides` 表 |
| 用户认证 | `get_current_user` 为 stub | JWT 注册/登录完整实现 |
| 评分持久化 | Schema 存在，路由未实现 | `POST /ratings` 写入 DB |
| `get_optional_user` | 直接返回 `None` | 真实 JWT 解析，匿名返回 None |

---

*本文件由架构师生成，代码实施须严格遵循 ARCHITECTURE.md 中的目录结构与接口契约。每步执行前必须等待 PM 确认。*
