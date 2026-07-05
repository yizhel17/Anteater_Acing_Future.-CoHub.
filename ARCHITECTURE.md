# AAF 重构架构总纲

> 本文件是 AAF (Anteater Acing the Future) 项目从 Flask 单体应用向工业级全栈应用重构的架构总纲。
> 所有重构阶段的目录结构、技术决策与工程规范均以本文件为准。
>
> **最后更新：** 2026-07-04
> **状态：** 架构设计阶段（Phase 0 待启动）

---

## 目录

1. [最终技术栈决策](#1-最终技术栈决策)
2. [目标项目目录树](#2-目标项目目录树)
3. [本地开发 CORS 解决方案](#3-本地开发-cors-解决方案)
4. [FastAPI 依赖注入组织方式](#4-fastapi-依赖注入组织方式)
5. [数据库表结构规划](#5-数据库表结构规划)
6. [核心 API 端点契约](#6-核心-api-端点契约)
7. [部署架构](#7-部署架构)

---

## 1. 最终技术栈决策

| 层次 | 技术选型 | 说明 |
|---|---|---|
| 后端框架 | FastAPI + Uvicorn | 全异步，自动 OpenAPI 文档，Pydantic v2 数据验证 |
| 后端语言 | Python 3.12 | |
| 关系型数据库 | Supabase (PostgreSQL) | 云托管，通过 async SQLAlchemy + asyncpg 连接 |
| 向量数据库 | ChromaDB（本地持久化） | 保留现有 `chroma_db/` 目录，不迁移 |
| AI 模型 | Anthropic Claude Sonnet | 异步 httpx 客户端，90s timeout |
| 网络搜索 | Tavily Search API | 异步调用，仅对 student 模式触发 |
| 限流机制 | 内存滑动窗口（asyncio.Lock） | 无 Redis 依赖，Render 单实例部署下足够 |
| 前端框架 | React 18 + Vite + TypeScript | 完全独立工程，存放于 `frontend/` |
| 前端状态管理 | Zustand | 向导步骤与表单字段 |
| 前端数据请求 | TanStack Query | API 调用、缓存、loading/error 状态 |
| 前端 UI | Tailwind CSS | 保留现有视觉风格 |
| Markdown 渲染 | react-markdown | 替代当前 marked.js |
| 后端部署 | Render | 直接推送，render.yaml 配置启动命令 |
| 前端部署 | Vercel | 直接推送，vercel.json 配置 SPA 回退路由 |

---

## 2. 目标项目目录树

```
AAF_Product/                              ← Git Monorepo 根目录
│
├── backend/                              ← FastAPI 后端（部署至 Render）
│   │
│   ├── app/
│   │   ├── main.py                       ← FastAPI 实例创建、CORS 中间件注册、路由挂载
│   │   │
│   │   ├── api/
│   │   │   ├── deps.py                   ← 全局依赖注入（DB Session、当前用户解析）
│   │   │   └── v1/
│   │   │       ├── router.py             ← 汇总 v1 所有子路由
│   │   │       └── routes/
│   │   │           ├── guide.py          ← POST /guide/generate（核心 AI 导引）
│   │   │           ├── auth.py           ← POST /auth/register, /auth/login, /auth/refresh
│   │   │           ├── ratings.py        ← POST /ratings（满意度持久化）
│   │   │           ├── contributions.py  ← POST /contributions（学长经验提交）
│   │   │           └── courses.py        ← GET /courses（静态课程列表接口）
│   │   │
│   │   ├── core/
│   │   │   ├── config.py                 ← Pydantic BaseSettings（读取全部环境变量）
│   │   │   ├── security.py               ← JWT 签发/校验、bcrypt 密码哈希
│   │   │   └── rate_limit.py             ← 内存滑动窗口限流（asyncio.Lock 保证并发安全）
│   │   │
│   │   ├── db/
│   │   │   ├── base.py                   ← SQLAlchemy declarative_base()
│   │   │   └── session.py                ← async engine（连接 Supabase）+ AsyncSession 工厂
│   │   │
│   │   ├── models/                       ← SQLAlchemy ORM 模型（映射 Supabase 表结构）
│   │   │   ├── user.py                   ← users 表
│   │   │   ├── guide.py                  ← guides 表（AI 生成历史）
│   │   │   └── rating.py                 ← ratings 表
│   │   │
│   │   ├── schemas/                      ← Pydantic v2 请求/响应 Schema（API 契约层）
│   │   │   ├── auth.py                   ← RegisterRequest, LoginRequest, TokenResponse
│   │   │   ├── guide.py                  ← GuideRequest, GuideResponse
│   │   │   └── rating.py                 ← RatingRequest, RatingResponse
│   │   │
│   │   └── services/                     ← 纯业务逻辑层（不持有 Request/Response 对象）
│   │       ├── ai_service.py             ← Prompt 组装 + Claude 异步调用 + thinking 标签剥离
│   │       ├── rag_service.py            ← ChromaDB 语义检索（asyncio.to_thread 包装）
│   │       └── search_service.py         ← Tavily 异步封装（含 Bug 修复 + 来源标签）
│   │
│   ├── chroma_db/                        ← ChromaDB 本地持久化目录（.gitignore 数据文件）
│   │
│   ├── data/
│   │   └── AAF_responses.csv             ← 学长经验原始数据（Google Form 导出）
│   │
│   ├── scripts/
│   │   └── load_rag_data.py              ← 一次性 CSV → ChromaDB 导入脚本（非 Web 服务）
│   │
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── test_ai_service.py
│   │   │   └── test_security.py
│   │   └── integration/
│   │       └── test_guide_route.py
│   │
│   ├── .env                              ← 本地密钥（git 忽略）
│   ├── .env.example                      ← 密钥模板（提交 Git）
│   ├── requirements.txt
│   └── render.yaml                       ← Render 平台部署配置（启动命令、环境变量声明）
│
├── frontend/                             ← React 18 + Vite 前端（部署至 Vercel）
│   │
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts                 ← axios 实例（baseURL 按环境变量切换）
│   │   │   ├── guide.ts                  ← generateGuide() 调用封装
│   │   │   ├── auth.ts                   ← login(), register(), refresh() 封装
│   │   │   └── ratings.ts                ← submitRating() 封装
│   │   │
│   │   ├── components/
│   │   │   ├── wizard/
│   │   │   │   ├── StepIdentity.tsx      ← 步骤1：角色选择
│   │   │   │   ├── StepCourses.tsx       ← 步骤2：课程选择 + 搜索引擎
│   │   │   │   └── StepGoals.tsx         ← 步骤3：目标 + 置信度 + 自由文本
│   │   │   ├── result/
│   │   │   │   ├── GuideCard.tsx         ← Markdown 渲染（react-markdown）
│   │   │   │   ├── RatingBar.tsx         ← 满意度 Emoji 评分（调用真实 API）
│   │   │   │   └── ExportMenu.tsx        ← .ics / PDF / Google Docs 导出
│   │   │   └── ui/
│   │   │       ├── AtomLoader.tsx        ← SVG 原子动画（从 index.html 迁移）
│   │   │       ├── CourseChip.tsx        ← 课程标签卡片
│   │   │       └── ProgressBar.tsx       ← 三步进度条
│   │   │
│   │   ├── hooks/
│   │   │   ├── useGuide.ts               ← TanStack Query：useMutation 封装 AI 生成
│   │   │   └── useAuth.ts                ← 登录状态、Token 刷新逻辑
│   │   │
│   │   ├── store/
│   │   │   └── wizardStore.ts            ← Zustand：当前步骤、表单字段、角色状态
│   │   │
│   │   ├── types/
│   │   │   └── index.ts                  ← 与后端 Pydantic Schema 对齐的 TypeScript 类型
│   │   │
│   │   ├── data/
│   │   │   └── courses.ts                ← 80+ UCI 课程列表（从 index.html 迁移至此）
│   │   │
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   │
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts                    ← 含 dev 环境 proxy 配置（CORS 解决方案核心）
│   ├── tsconfig.json
│   ├── package.json
│   └── vercel.json                       ← Vercel SPA 路由回退配置
│
├── .gitignore                            ← 覆盖 .env、chroma_db/、node_modules/、venv/、__pycache__/
├── ARCHITECTURE.md                       ← 本文件：架构总纲
└── README.md
```

---

## 3. 本地开发 CORS 解决方案

本地开发时 Vite dev server 跑在 `http://localhost:5173`，FastAPI 跑在 `http://localhost:8000`，采用**双保险策略**，两端各配置一次，互为备份。

### 策略 A：Vite Dev Proxy（开发期主力方案）

在 `frontend/vite.config.ts` 中配置代理。所有 `/api/*` 请求由 Vite Dev Server **在 Node 层转发**到后端，浏览器视角看到的永远是同源请求，CORS 问题从根本上不存在。

```
浏览器
  └── localhost:5173/api/v1/guide/generate
            ↓ (Vite Node 层透明代理，浏览器不可见)
      localhost:8000/api/v1/guide/generate
```

`frontend/src/api/client.ts` 中的 `baseURL` 配置规则：

| 环境 | `VITE_API_BASE_URL` 值 | 实际效果 |
|---|---|---|
| 本地开发 | `/api`（相对路径） | 命中 Vite Proxy，转发到 `localhost:8000` |
| 生产部署 | `https://aaf-api.onrender.com` | 直接请求 Render 后端域名 |

### 策略 B：FastAPI CORSMiddleware（生产期必须 + 开发期兜底）

在 `backend/app/main.py` 中注册 `CORSMiddleware`，允许的 Origin 列表从 `config.py` 的环境变量读取：

| 环境 | `ALLOWED_ORIGINS` 值 |
|---|---|
| 本地 `.env` | `http://localhost:5173` |
| Render 生产环境变量 | `https://aaf-product.vercel.app` |

两者结合后：本地开发不依赖后端 CORS 配置（Proxy 已拦截）；生产部署不依赖 Vite（由 CORSMiddleware 精确管控白名单）。绝不使用通配符 `"*"`。

---

## 4. FastAPI 依赖注入组织方式

所有可复用的"获取资源"逻辑集中在 `backend/app/api/deps.py`，通过 FastAPI 的 `Depends()` 机制注入到路由函数。

### 依赖链条

```
get_db()
    └── get_current_user()   ← 返回 User ORM 对象，Token 无效则 401
            └── get_optional_user()  ← 返回 User | None，Token 缺失时不报错
```

### `get_db()` — 异步 DB Session 生命周期

每个请求独享一个 `AsyncSession`，请求结束后无论成功/失败都自动关闭，不泄漏连接池资源。

```
请求进入
  → yield AsyncSession（从连接池获取）
    → 路由函数执行
      → 正常结束：await session.commit()
      → 抛出异常：await session.rollback()
  → finally: await session.close()
```

### `get_current_user()` — JWT 校验 + 用户查询

```
1. 从 Authorization Header 提取 Bearer Token
2. 用 core/security.py 校验 JWT 签名 + 过期时间
3. 从 Token payload 取 user_id
4. 用 get_db() 提供的 Session 查询 users 表
5. 用户不存在 或 Token 无效 → HTTP 401（路由函数不执行）
6. 验证通过 → 返回 User ORM 对象
```

### `get_optional_user()` — 兼容匿名访问

行为与 `get_current_user()` 完全相同，唯一区别：Token 缺失或无效时返回 `None` 而非 401。用于支持匿名访问的接口（Guide 生成——匿名用户可使用，但不保存历史记录）。

### 路由函数中的使用形态

```python
# 必须登录的接口（如查看个人历史记录）
async def get_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ...

# 匿名/登录均可的接口（如生成 AI 导引）
async def generate_guide(
    request: GuideRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    ...
```

> **重要：** FastAPI 自动解析依赖图，`get_current_user` 内部依赖的 `get_db()` 与路由函数签名中显式声明的 `get_db()` **共享同一个 Session 实例**（在同一请求生命周期内），无需手动传递，也不会创建两条数据库连接。

---

## 5. 数据库表结构规划

以下表结构将在 Supabase 控制台中创建，同时由 SQLAlchemy ORM 模型映射。

### `users` 表

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | UUID | PK, `gen_random_uuid()` |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL |
| `hashed_pw` | VARCHAR(255) | NOT NULL |
| `display_name` | VARCHAR(100) | |
| `role` | ENUM | `('student', 'senior', 'admin')` |
| `is_verified` | BOOLEAN | DEFAULT FALSE |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

### `guides` 表（AI 生成历史）

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users，**nullable**（支持匿名） |
| `role` | VARCHAR(10) | |
| `courses` | TEXT[] | |
| `confidence` | FLOAT | |
| `goals` | TEXT[] | |
| `user_query` | TEXT | |
| `response_md` | TEXT | AI 生成的 Markdown 全文 |
| `tokens_used` | INT | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

### `ratings` 表（满意度持久化，解决当前数据丢失问题）

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | UUID | PK |
| `guide_id` | UUID | FK → guides |
| `user_id` | UUID | FK → users，**nullable** |
| `score` | SMALLINT | CHECK (score IN (1, 0, -1))，对应 good/neutral/bad |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

### `contributions` 表（学长经验提交记录）

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users，**nullable** |
| `course` | VARCHAR(50) | |
| `danger_zone` | TEXT | |
| `setup_tips` | TEXT | |
| `career_value` | TEXT | |
| `is_approved` | BOOLEAN | DEFAULT FALSE（待管理员审核后同步至 ChromaDB） |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

---

## 6. 核心 API 端点契约

所有端点均挂载在 `/api/v1/` 前缀下。FastAPI 自动生成完整 OpenAPI 文档，访问 `/docs`（Swagger UI）或 `/redoc`。

| 端点 | 方法 | 描述 | 认证要求 |
|---|---|---|---|
| `/api/v1/guide/generate` | POST | 生成 AI 个性化导引（核心） | Optional |
| `/api/v1/guide/history` | GET | 获取当前用户历史记录 | Required |
| `/api/v1/guide/{id}` | GET | 获取单条导引详情 | Optional |
| `/api/v1/ratings` | POST | 提交满意度评分 | Optional |
| `/api/v1/contributions` | POST | 学长提交课程经验 | Optional |
| `/api/v1/courses` | GET | 获取支持的 UCI 课程列表 | None |
| `/api/v1/auth/register` | POST | 邮箱注册 | None |
| `/api/v1/auth/login` | POST | 邮箱登录，返回 Token | None |
| `/api/v1/auth/refresh` | POST | 刷新 Access Token | None |
| `/api/v1/auth/logout` | POST | 使 Refresh Token 失效 | Required |
| `/api/v1/auth/me` | GET | 获取当前用户信息 | Required |
| `/api/v1/health` | GET | 健康检查（DB + ChromaDB 连通性） | None |

### Guide 生成接口 Schema

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

## 7. 部署架构

```
用户浏览器
    │
    ├── Vercel CDN
    │     └── React 静态构建产物（HTML/JS/CSS）
    │           └── VITE_API_BASE_URL → Render 后端域名
    │
    └── Render (FastAPI + Uvicorn)
          ├── Supabase PostgreSQL（云端托管，连接池 asyncpg）
          ├── ChromaDB（Render 实例本地文件系统持久化）
          ├── Anthropic Claude API（外部调用）
          └── Tavily Search API（外部调用）
```

### 关键配置文件

**`backend/render.yaml`**
- 启动命令：`uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- 健康检查路径：`/api/v1/health`
- 环境变量在 Render 控制台配置（不提交 `.env`）

**`frontend/vercel.json`**
- 配置 SPA 回退路由：所有路径均返回 `index.html`（支持 React Router 客户端路由）

### 本地开发启动命令

```bash
# 后端（在 backend/ 目录下）
uvicorn app.main:app --reload --port 8000

# 前端（在 frontend/ 目录下）
npm run dev   # 默认启动在 localhost:5173，Proxy 自动转发 /api/* 到 :8000
```

---

*本文件由架构师在项目重构启动前生成，代码实施须严格遵循本文件中的目录结构与接口契约。*
