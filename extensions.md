# AAF 功能扩展计划 — 三项真实世界连通性功能

> 补充文档，记录 Phase 5 上线后新增的三项"核心用户交互链路"功能（Calendar / Docs Export / Email）的架构决策、实施计划与状态。
> 创建时间：2026-07-12
> 关联文档：[ARCHITECTURE.md](ARCHITECTURE.md)（技术栈与目录结构总纲）、[CLAUDE.md](CLAUDE.md)（协作规范 —— 渐进式重构铁律适用于本文档所有步骤）

---

## 背景与目标

原有实现中，三项交互功能均为前端"假装成功"的本地技巧，未真正连通外部世界：

| 功能 | 原实现 | 问题 |
|---|---|---|
| 注册欢迎邮件 | 不存在 | 无任何发信逻辑 |
| 导出 Google Docs | 前端下载一份 `.html`，文案却宣称"已保存，可在 Google Docs 打开" | 完全是假的，只是本地文件下载 |
| 添加到日历 | 前端 `buildIcs()` 生成 `.ics` 一次性下载 | 非 RFC 5545 合规（缺 DTSTAMP、无折行、无转义），且是静态快照而非订阅源 |

技术方向调整：本项目将作为全栈工程作品集的核心展示项目，优先考虑健壮的后端系统设计、云原生架构与可扩展性，而非快速的前端 workaround —— 即使这意味着更高的实现复杂度。

---

## Step 1 — Calendar：动态订阅源（后端生成）

**状态：实施中**

### 核心设计约束

日历客户端（Apple Calendar / Google Calendar）订阅一个 URL 时，只会周期性发起无认证头的 `GET` 请求 —— 无法附加 `Authorization: Bearer <JWT>`。因此该 feed 端点无法复用现有 JWT 鉴权体系。

采用业界标准方案：为每个用户生成一个高熵、不可猜测的 opaque token（`secrets.token_urlsafe(32)`，256 bit 熵），直接嵌入 URL 路径中作为凭证 —— 与 Google Calendar / Trello / Asana 自身的"私密 iCal 地址"功能是同一模式。

### 已知数据限制（诚实披露）

`guides` 表只存储 AI 生成的原始 Markdown（`response_md`），不存在任何结构化的、带真实日期的任务表。前端旧版 `.ics` 导出也从未使用真实日期 —— 只是从"明天早上 9 点"开始，把每个任务间隔 2 小时排开。Step 1 后端实现将同一套启发式排期逻辑迁移到服务端（多了"实时订阅"这个真正的 SaaS 属性），而非凭空发明真实日期数据。

> **未来演进方向**（不在本次范围内）：让 AI 在生成 Markdown 的同时输出结构化的 `{task, day_offset, duration}` JSON，存入 `guides` 表新增的 `schedule_json` 列，届时前端渲染与 ICS 生成可共用同一份结构化数据源，不再需要脆弱的 Markdown 表格解析。这个改动会同时牵动 AI 服务、Schema、Guide 模型与前端渲染组件，属于跨系统改动，故列为独立的未来阶段，不与 Step 1 混在一起。

### 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `backend/app/models/user.py` | 编辑 | 新增 `calendar_token` 列（nullable, unique, 首次请求时惰性生成） |
| `backend/app/services/calendar_service.py` | 新建 | Markdown 任务解析 + RFC 5545 合规 `.ics` 生成（DTSTAMP、折行、转义、稳定 UID） |
| `backend/app/schemas/calendar.py` | 新建 | `CalendarUrlResponse` |
| `backend/app/api/v1/routes/calendar.py` | 新建 | `GET /calendar/{token}.ics`（公开订阅源）+ `GET /calendar/me/url`（需登录，返回订阅链接） |
| `backend/app/api/v1/router.py` | 编辑 | 注册 calendar 路由 |
| `backend/render.yaml` | 编辑 | 启动命令加 `--proxy-headers`，否则 `request.base_url` 在 Render 生产环境会误判协议为 `http://` |
| `ARCHITECTURE.md` | 编辑 | 同步目录树、`users` 表结构、端点契约表 |
| Supabase SQL 控制台（非仓库文件） | 手动执行 | `ALTER TABLE users ADD COLUMN calendar_token VARCHAR(64) UNIQUE;` |

### 关键设计细节

- **UID 必须稳定（`aaf-{guide_id}-{index}@aaf.uci`），不能像旧前端代码那样用 `Date.now()`**：订阅源会被日历 App 反复轮询，若每次 UID 都变，App 会把每次刷新都当成全新事件，事件无限重复堆积。
- **feed 范围 = 用户最新一份 guide**：避免每次重新生成学习计划后，旧任务在日历里阴魂不散。
- **404 统一为"not found"而非"invalid token"**：避免通过错误信息枚举出有效 token。
- **没有 guide 时返回空的合法 VCALENDAR，而非报错**：用户"先订阅、后生成计划"的时序也能正常工作。
- **已知行为变化**：订阅日历现在要求登录（token 需要稳定身份挂靠），匿名用户会失去这个功能 —— 这是设计的必然结果，不是随意取舍。

### Step 1b（后端验证通过后再做，未在本次范围内）

`frontend/src/components/result/ExportMenu.tsx`：把"Add all to Calendar"按钮换成一个小面板，调用 `GET /calendar/me/url`，展示复制链接 + "Subscribe in Google Calendar"（`calendar.google.com/calendar/render?cid=<url-encoded feed url>` —— 订阅外部 feed 的真实参数，区别于单次快速添加事件的 `action=TEMPLATE`）+ 一个 `webcal://` 链接（Apple Calendar 原生订阅弹窗）。

---

## Step 2 — Docs Export：后端生成 + Object Storage + Presigned URL

**状态：已实现**

### 相比原始方案的设计简化（诚实披露）

原计划是"前端 POST 任务数据"，但 Step 1 已经实现了 `calendar_service.parse_markdown_tasks()`，可以从 `guide.response_md` 解析出结构化任务 —— Step 2 直接复用这个函数，因此端点不需要请求体，只需要 `guide_id`（路径参数）。后端本来就存着这份数据，没有理由让前端重新爬一遍表格再传回来，也让日历订阅源与 Docs 导出共用同一套解析规则，避免两处实现各自维护、逐渐漂移。

### 数据流

```
POST /guide/{guide_id}/export/docx（无需请求体）
    → 从 DB 取 guide.response_md，parse_markdown_tasks() 解析任务
    → python-docx 在内存中生成 .docx（io.BytesIO，不落盘）
    → supabase-py 异步客户端（acreate_client）上传字节流至 Supabase Storage bucket（upsert，路径 = {guide_id}.docx）
    → create_signed_url() 生成 10 分钟时效的 Presigned URL
    → 返回 { download_url, expires_in } 给前端
```

### 关键设计细节

- **异步 Supabase 客户端，而非同步 + `asyncio.to_thread`**：确认 `supabase-py` 提供真正的 `acreate_client` / `AsyncClient`（`.storage.from_(bucket).upload()` / `.create_signed_url()` 均为原生协程），比包装同步客户端更贴合 CLAUDE.md"全程 async/await"的铁律 —— 与 `rag_service.py` 对 ChromaDB 的 `asyncio.to_thread` 包装不同（ChromaDB 没有可用的异步客户端，Supabase 有，所以这里选择原生异步而非照搬同一种包装模式）。
- **`SUPABASE_URL` ≠ `DATABASE_URL`**：两者共享同一个 project ref，但分别是 HTTPS REST/Storage API 地址（`https://<ref>.supabase.co`）与 Postgres 直连字符串（`postgresql+asyncpg://...@db.<ref>.supabase.co:5432/postgres`），不可互换 —— 已从 `DATABASE_URL` 的 host 中推导出正确的 `SUPABASE_URL` 值。
- **对象路径固定为 `{guide_id}.docx` + `upsert=true`**：同一份 guide 重复导出会覆盖旧文件，而非无限堆积存储用量。
- **鉴权与 `GET /guide/{id}` 保持一致（Optional）**：现有 guide 详情接口本来就没有归属校验（匿名可生成 guide），导出接口沿用同样的开放模型，而非另立一套更严格的规则。
- **范围收窄为 `.docx`，不做 PDF**：原计划写"`.docx`（或 PDF）"，但服务端生成 PDF 需要额外的重量级依赖（如 LibreOffice headless 转换或 `weasyprint`），本次先只做 `.docx`，PDF 留作独立的未来扩展。

### 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `backend/requirements.txt` | 编辑 | 新增 `python-docx`、`supabase` |
| `backend/app/core/config.py` | 编辑 | 新增 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` |
| `backend/.env.example` | 编辑 | 新增对应占位符 |
| `backend/app/schemas/export.py` | 新建 | `DocxExportResponse` |
| `backend/app/services/docs_export_service.py` | 新建 | `build_docx()`（python-docx + io.BytesIO）+ `upload_and_sign()`（异步 Supabase Storage 上传 + Presigned URL） |
| `backend/app/api/v1/routes/guide.py` | 编辑 | 新增 `POST /guide/{guide_id}/export/docx` |
| `ARCHITECTURE.md` | 编辑 | 同步目录树、端点契约表 |
| Supabase 控制台（非仓库文件） | 手动执行 | 创建私有 Storage bucket `study-plan-exports`（见下方 SQL） |

手动创建 bucket（Supabase SQL 控制台）：

```sql
insert into storage.buckets (id, name, public)
values ('study-plan-exports', 'study-plan-exports', false);
```

### Step 2 前端接线（未在本次范围内）

`ExportMenu.tsx` 的 `handleExportDocs()` / `buildDocsExport()`（假的 `.html` 下载）需要替换为：调用 `POST /guide/{guide_id}/export/docx`，拿到 `download_url` 后 `window.open(download_url, '_blank')`；按钮文案从"Export for Google Docs"改为诚实的"Download as Word (.docx)"。

---

## Step 3 — Email：BackgroundTasks + Jinja2 + Resend

**状态：实施中**

### 相比原始方案的改进（诚实披露）

原计划是"`asyncio.to_thread` 包装 Resend 同步 SDK 调用"。实际拆包 `resend` 2.32.2 源码后发现：只要安装 `resend[async]`（唯一新增依赖是 `httpx>=0.24.0`，而 `httpx` 本项目已经在用），`resend.Emails.send_async()` 就是一个真正原生的、由 `httpx` 驱动的协程（`resend/async_request.py` 用 `AsyncRequest` 实现，非包装同步调用）。这与 Step 2 选择 Supabase 原生异步客户端而非 `asyncio.to_thread` 包装是同一个判断标准：SDK 有原生异步就用原生异步，没有才包装线程池（`rag_service.py` 包装 ChromaDB 是因为 ChromaDB 确实没有异步客户端）。因此改为使用 `send_async()`，不再需要 `asyncio.to_thread`。

**一个需要注意的细节**：`resend` 包自己的全局 `api_key` 是在模块导入时读取 `os.environ.get("RESEND_API_KEY")`，而不是走本项目的 `Settings`（pydantic-settings，读取 `.env` 文件）。两者通常一致，但如果 `RESEND_API_KEY` 只写在 `.env` 里、从未被 export 到真实 shell 环境变量，`resend.api_key` 在导入时会读到 `None`，与 `settings.RESEND_API_KEY` 不一致却不会报错，直到真正发信时才失败。解决方式：在 `send_welcome_email()` 内显式执行 `resend.api_key = settings.RESEND_API_KEY`，以本项目的 `Settings` 单一数据源为准，不依赖 `resend` 自己的环境变量探测。

### 数据流

```
POST /auth/register 成功写入 user
    → background_tasks.add_task(send_welcome_email, user.email, user.display_name)
    → HTTP 响应立即返回（慢/挂掉的第三方 API 不阻塞注册流程）
    → 后台任务：Jinja2 渲染 welcome_email.html（autoescape 开启，注入 display_name 等动态数据）
    → resend.Emails.send_async()（httpx 原生协程，非线程池包装）
    → 发送失败仅 logging.error 记录，不抛出（不影响已完成的注册流程）
```

### 关键设计细节

- **Jinja2 `autoescape` 必须开启**：`display_name` 是用户注册时自由填写的文本，会被插值进 HTML 邮件正文。开启 `select_autoescape(["html"])` 后 Jinja2 自动转义 `<`/`>`/`&` 等字符，防止恶意 `display_name`（如 `<script>...`）在收件方邮箱客户端渲染时形成 XSS。
- **模板目录用 `Path(__file__).resolve().parent.parent / "templates"`，不用相对字符串路径**：避免生产环境（Render）工作目录与本地不一致导致找不到模板文件。
- **邮件内 "返回 AAF" 链接复用 `settings.ALLOWED_ORIGINS[0]`**：前端地址已经作为 CORS 白名单存在于 `Settings` 中，没有必要为同一个 URL 再新增一个专门的配置项。
- **仅"欢迎邮件"，不做邮箱验证链接流程**（`users.is_verified` 列继续保持未使用状态）。
- **发信方使用 Resend 沙箱地址 `onboarding@resend.dev`**，无需 DNS 配置即可立即上线；后续可换绑自定义域名。

### 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `backend/requirements.txt` | 编辑 | 新增 `resend[async]`、`jinja2` |
| `backend/app/core/config.py` | 编辑 | 新增 `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` |
| `backend/.env.example` | 编辑 | 新增对应占位符 |
| `backend/app/templates/welcome_email.html` | 新建 | Jinja2 HTML 邮件模板 |
| `backend/app/services/email_service.py` | 新建 | Jinja2 环境初始化 + `send_welcome_email()`（resend `send_async`，失败仅记录日志） |
| `backend/app/api/v1/routes/auth.py` | 编辑 | `register()` 新增 `background_tasks: BackgroundTasks` 参数，写入成功后派发欢迎邮件任务 |
| `ARCHITECTURE.md` | 编辑 | 同步目录树、`/auth/register` 端点描述 |

Supabase / 第三方控制台无需任何手动步骤（不涉及新表或新存储桶）；用户只需自行申请 Resend API Key 并写入未提交的 `backend/.env`。

---

## 执行纪律（继承自 CLAUDE.md）

每个 Step 视为一个逻辑块：实现后停下，等待本地测试通过并 `git commit`，再进入下一步。本文档随每个 Step 的状态变化同步更新。
