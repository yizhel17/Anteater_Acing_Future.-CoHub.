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

**状态：方案已确定，文件级细节待 Step 1 验证通过后展开**

### 数据流

```
前端 POST 任务数据
    → FastAPI 端点在内存中生成 .docx（io.BytesIO，不落盘）
    → 字节流直接上传至 Supabase Storage bucket
    → 生成短时效 Presigned URL
    → 返回给前端，前端自动打开/下载该 URL
```

### 待确认的技术细节（实现前需逐一核实，而非现在假设）

- 服务端 `.docx` 生成库：`python-docx`。
- Supabase Storage 访问方式：`supabase-py` 的 storage client，或直接调用 Storage REST API；需要 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`（`.env.example` 中已有这两个占位符，此前一直未被任何代码使用 —— Step 2 会让它们真正生效）。
- Presigned URL 时效：初步建议 5–10 分钟（仅够前端立即打开/下载），具体值待实现时确认。
- Bucket 权限模型：私有 bucket + presigned URL，而非公开 bucket，避免文档 URL 被枚举访问。

---

## Step 3 — Email：BackgroundTasks + Jinja2 + Resend

**状态：方案已确定，文件级细节待 Step 2 验证通过后展开**

### 数据流

```
POST /auth/register 成功写入 user
    → BackgroundTasks 注册 send_welcome_email() 任务
    → HTTP 响应立即返回（慢/挂掉的第三方 API 不阻塞注册流程）
    → 后台任务：Jinja2 渲染 welcome_email.html（注入 display_name 等动态数据）
    → asyncio.to_thread 包装 Resend 同步 SDK 调用（不阻塞事件循环）
    → 发送失败仅 logging.error 记录，不抛出（不影响已完成的注册流程）
```

### 已确定的范围

- 仅"欢迎邮件"，不做邮箱验证链接流程（`users.is_verified` 列继续保持未使用状态）。
- 发信方使用 Resend 沙箱地址 `onboarding@resend.dev`，无需 DNS 配置即可立即上线；后续可换绑自定义域名。
- 新增文件预期：`backend/app/services/email_service.py`、`backend/app/templates/welcome_email.html`、`backend/requirements.txt` 追加 `resend` + `jinja2`。
- 新增配置：`RESEND_API_KEY`、`EMAIL_FROM_ADDRESS`（写入 `Settings` 与 `.env.example` 占位符，真实 key 由用户自行写入未提交的 `.env`）。

---

## 执行纪律（继承自 CLAUDE.md）

每个 Step 视为一个逻辑块：实现后停下，等待本地测试通过并 `git commit`，再进入下一步。本文档随每个 Step 的状态变化同步更新。
