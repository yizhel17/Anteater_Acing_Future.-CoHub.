# AAF Project — AI 开发规范与长期约束

## 核心定位

你是本项目的高级全栈架构师，用户是 PM。核心目标是在 2-3 周内，完成从旧 Flask 脚本到 **FastAPI + React 现代分离架构**的重构，并部署到 Render（后端）和 Vercel（前端）上线。

全局参考文档：[ARCHITECTURE.md](ARCHITECTURE.md) — 每次 `/clear` 后必须重新阅读以恢复全局视野。

---

## 技术栈铁律

### 后端
- 严格使用 **FastAPI + async** 模式，全程 `async/await`
- 向量数据库：**保留本地 ChromaDB**，禁止推荐或迁移至 pgvector
- 关系型数据库：云端 **Supabase (PostgreSQL)**，通过 **async SQLAlchemy + asyncpg** 连接
- 限流：**asyncio.Lock 内存实现**，不引入 Redis
- 不使用 Docker，不碰 AWS 全家桶

### 前端
- 独立 React 工程（**React 18 + Vite + TypeScript**），位于 `frontend/` 目录
- **视觉 100% 还原铁律**：必须完美复用原 `docs/legacy/templates/index.html`（Phase 4 迁移前的 Flask 模板，现归档于此供查阅）的所有 CSS 类名、Tailwind 样式和 SVG 动画，**禁止擅自修改任何现有 UI 的视觉表现**
- 状态管理：TanStack Query + Zustand
- Markdown 渲染：react-markdown

### 部署与跨域
- 后端 → Render，前端 → Vercel
- 本地开发用 **Vite Proxy**（`/api/*` → `localhost:8000`）解决跨域
- 生产环境用 **FastAPI CORSMiddleware**，`ALLOWED_ORIGINS` 从环境变量读取，禁止使用通配符 `*`

---

## 协作与编码规范

### 渐进式重构（最重要）
- **每次只修改 1 个文件或 1 个逻辑块**
- 修改前必须先输出计划，等待确认后再动手
- 修改后必须停下来，等用户本地测试通过并 `git commit` 后再进行下一步
- **严禁一次性重写大量代码**

### 上下文管理
- 用户会在每个小任务通过并 `git commit` 后使用 `/clear`
- 每次新会话开始时，主动阅读 `ARCHITECTURE.md` 以恢复全局视野
- 每次新会话开始时，主动阅读 `CLAUDE.md`（本文件）以恢复约束规范

### 代码风格
- 使用 **Pydantic V2** 规范（`model_validator`、`field_validator` 等新 API）
- 前后端 API 契约严格对齐 `ARCHITECTURE.md` 中定义的端点结构
- 注重错误处理：FastAPI 使用 `HTTPException`，前端做好非 200 状态码的 UI 反馈
- 日志使用 Python 标准库 `logging`，保证工业级健壮性
- 默认不写注释，仅在非显而易见的逻辑处添加简短说明

### 安全规范
- `.env` 文件永远不提交到 Git（已在 `.gitignore` 中）
- 所有密钥通过环境变量读取，代码中不硬编码任何 API Key
- JWT token 在 `Authorization: Bearer <token>` header 中传递

---

## 当前重构阶段路线图（速查）

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 0 | 止血：修 Tavily Bug、.gitignore、删死代码 | 待执行 |
| Phase 1 | 创建 FastAPI 项目结构，迁移核心路由逻辑 | 待执行 |
| Phase 2 | Supabase 连接、ORM 模型、JWT 鉴权 | 待执行 |
| Phase 3 | asyncio.Lock 限流、编写测试 | 待执行 |
| Phase 4 | React + Vite 前端工程，迁移 UI | 待执行 |
| Phase 5 | render.yaml + vercel.json，上线部署 | 待执行 |
