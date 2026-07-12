# Phase 5 执行手册：render.yaml + vercel.json，生产部署上线

> **状态**：执行中——里程碑 A（ChromaDB 生产数据可复现性）与里程碑 B 的 Step 4（`render.yaml`）已完成并本地验证；其余里程碑待执行。
> **前置条件**：Phase 4 已完成并 `git commit`（三步向导、认证 UI、Guide 历史、学长贡献表单、管理员审核后台，本地 `npm run dev` + `uvicorn --reload` 全部手动走查通过）。开工前需先处理当前工作区里 `ContributePage.tsx` / `LoginPage.tsx` / `RegisterPage.tsx` 的未提交改动与新增的 `frontend/public/images.png`——本地测试后先提交，不把 Phase4 尾巴带进 Phase5。
> **验收目标**：`backend/` 部署至 Render 并可通过公网域名访问；`frontend/` 部署至 Vercel 并可通过公网域名访问；生产 CORS 精确放行 Vercel 域名（不使用通配符）；ChromaDB 生产数据可复现，且**扛得住一次真实 redeploy**；生产域名下完整冒烟测试（向导 + 登录 + 历史 + 贡献审核闭环）全部通过
> **协作约束**：每步执行前等待确认，执行后等待本地测试通过并 `git commit`，再进行下一步。**本阶段额外约束**：凡涉及 Render/Vercel 控制台的操作（创建服务、填写密钥类环境变量、复制 Supabase 连接串）必须由 PM 持账号权限亲自执行——AI 没有这些控制台的访问权限，只负责给出精确的配置内容与核对清单，不代为操作。

---

## ⚠️ 需要 PM 确认的部署决策（执行前必读）

### 1. ChromaDB 生产持久化策略 — 已拍板：方案 C（Supabase 动态重灌）

开工前审计代码/基础设施假设时发现的问题：
- ARCHITECTURE.md §2 目录树里规划的 `backend/scripts/load_rag_data.py`（CSV → ChromaDB 一次性导入脚本）在 Phase1-4 都没有被实际创建。
- `backend/chroma_db/`（本机持久化目录，`.gitignore` 排除）里实际只有 **22 条**真实学长经验（ARCHITECTURE.md 里"43 条"是过时数字），另外 2 条 `course: "ICS 46"` 的记录（其中一条正文带 `REVIEWTAG` 调试标记）经核对是本地测试 Milestone L 审核后台"批准"按钮时通过真实接口写入的残留数据，已从 Supabase 和本地 ChromaDB 一并清除，不计入真实数据。
- Render 的默认文件系统是**临时的（ephemeral）**——每次 redeploy 都会清空容器内的本地磁盘，这一点判断没变。

最初设想的是"方案 A（Persistent Disk）/ 方案 B（每次冷启动从 CSV 重建）"二选一，但执行 Milestone A 时发现一个更好的路径：Milestone L 的管理员审核后台早已把 approve 的贡献写进 Supabase 的 `contributions` 表（`is_approved` 字段），Supabase 本身就是持久化数据源——不需要额外买 Persistent Disk，只要把 CSV 原始种子数据也一并迁移进 Supabase，让 Supabase 成为唯一数据源头，每次容器冷启动时把 `is_approved = true` 的记录重新灌回内存态 ChromaDB 即可。这就是**方案 C**，已完全取代方案 A/B 起草稿，且已经实现并本地验证：

| 步骤 | 文件 | 说明 |
|---|---|---|
| 一次性迁移 | `backend/scripts/migrate_csv_to_supabase.py` | 把 CSV 里 23 条原始经验（22 条课程列非空 + 1 条手动补全课程代码的记录）迁移进 Supabase `contributions` 表，`is_approved=True`。用确定性 UUID（按 CSV 行号派生）保证可安全重跑、不重复插入。已本地执行一次。 |
| 重灌逻辑 | `backend/scripts/load_rag_data.py` | 不再读 CSV，改为查询 Supabase `WHERE is_approved = true`，清空并重建 ChromaDB collection（`rag_service.reset_collection_async()`），用 `rag_service.build_tip_text()`（与 `approve_contribution` 共享同一份拼接逻辑，避免两条路径产出的 tip 格式 drift）逐条写入。 |
| 接入生命周期 | `backend/app/main.py` | `lifespan` 在 DB 健康检查之后调用 `reseed_from_supabase()`——每次冷启动（含免费档休眠重启、每次 redeploy）都会重建，不依赖任何本地磁盘状态；`tests/integration/test_guide_route.py` 相应加了 mock，避免测试真的打 Supabase。 |
| `render.yaml` | `backend/render.yaml` | 不再有 `disk` 块，免费层 Web Service 即可部署（详见里程碑 B Step 4）。 |

方案 C 相比原方案 B 的关键差异：原方案 B 只从 CSV 重建，管理员 approve 的新贡献会在下一次 redeploy 时确定性丢失；方案 C 把 CSV 种子数据也迁移进了 Supabase，新旧贡献统一从同一张表重灌，不再有这个缺陷，也不需要方案 A 的付费 Persistent Disk。

**本地已验证的关键闭环**：手动把本地 ChromaDB collection 清空到 0 条，不手动跑任何脚本，直接 `uvicorn app.main:app` 冷启动，`/api/v1/health` 返回 200 后独立查询 collection，确认已自动恢复到 23 条——这正是"扛得住 redeploy"要验证的场景，本地已复现并通过；生产环境仍需在"阶段验收测试"第 6 项里重复验证一次（Render 的临时文件系统和本地手动清空毕竟是两回事）。

### 2. Supabase 连接串：直连 vs 连接池

`backend/app/db/session.py` 的 `pool_size=10, max_overflow=20` 是按"一个常驻服务器进程"设计的参数。本地开发只跑一个 `uvicorn --reload` 进程，从没暴露过问题。Render 生产环境下，如果 `DATABASE_URL` 填的是 Supabase 的直连地址（`db.<ref>.supabase.co:5432`），最多 30 条并发连接可能撞上 Supabase 中小规格实例的直连数上限，报错只会在生产、在并发请求下出现，本地永远复现不了。

Supabase 官方对这类"常驻后端服务"场景的建议是改用控制台里的 **Session Pooler 连接串**（端口通常是 `6543`，主机名带 `pooler` 字样）替代直连串。这只是一个环境变量的值的问题，不需要改代码——但需要 PM 去 Supabase 控制台 Settings → Database 页面自己复制这个值。已写入下面 Step 5 的环境变量核对清单，执行时不要图方便直接复用本地 `.env` 里的直连串。

### 附：已知取舍（不阻塞，仅告知）

Render 免费档 Web Service 在 15 分钟无请求后会休眠，下一次请求要额外等 30-60 秒冷启动，叠加 Claude 请求本身的 90s 超时，第一位访问者的等待体验会明显变差；免费档休眠重启还会触发一次 `reseed_from_supabase()`（多几秒冷启动时间，属于预期内代价，见里程碑 A）。这是免费档固有的取舍，不是 bug，写在这里方便 PM 决定要不要为常驻实例的付费档买单。

---

## 与 Phase 4 的边界对照

| 功能 | Phase 4 状态 | Phase 5 完成 |
|---|---|---|
| 前端工程 | 本地 `npm run dev` 可跑通，未部署 | Vercel 生产部署，公网域名可访问 |
| 后端部署 | 本地 `uvicorn --reload`，未部署 | Render 生产部署，公网域名可访问 |
| ChromaDB 数据 | 仅本机 `backend/chroma_db/`，无灌入脚本 | 生产环境可复现，扛得住 redeploy（方案 C：Supabase 动态重灌，已完成，见里程碑 A） |
| CORS | 本地 `.env` 只含 `http://localhost:5173` | 生产 `ALLOWED_ORIGINS` 精确指向 Vercel 域名，无通配符 |
| 数据库连接 | 本地直连 Supabase | 生产改用 Session Pooler 连接串 |
| 环境变量 | 本地 `.env`/`.env.example` | Render/Vercel 控制台环境变量核对清单（本文件 Step 5、Step 7） |
| 健康检查 | `/api/v1/health` 仅检查 DB | （可选加固）补充 ChromaDB 连通性，与 ARCHITECTURE.md §6 文档描述对齐 |
| 端到端验收 | 仅本地手动走查 | 生产域名下完整冒烟测试，含"redeploy 后数据是否还在"这一之前从未测过的场景 |

---

## 里程碑 A：ChromaDB 生产数据可复现性（已完成）

方案 C 的落地拆成三个文件，均已实现并本地验证，细节见文首"部署决策 1"：

### Step 1 — `backend/scripts/migrate_csv_to_supabase.py`（一次性迁移，已执行）

一次性脚本，非 Web 服务。读取 `backend/data/AAF_responses.csv`，把 23 条真实学长经验（course 列非空的 22 行 + 手动补全课程代码的 1 行）写入 Supabase `contributions` 表，`is_approved=True`。用 `uuid.uuid5(固定命名空间, f"csv-row-{行号}")` 生成确定性 id，重跑脚本会跳过已存在的行，不会重复插入。已本地执行一次，Supabase `contributions` 表现有 23 条、全部 `is_approved=True`。

### Step 2 — `backend/scripts/load_rag_data.py`（重灌逻辑）

不读 CSV，改为 `SELECT * FROM contributions WHERE is_approved = true`，先调用 `rag_service.reset_collection_async()` 清空并重建 ChromaDB collection，再用 `rag_service.build_tip_text()` 逐条写入：

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

这个函数同时被 `contributions.py::approve_contribution` 调用，保证"批量重灌"和"管理员审核后实时写入"两条路径产出的 tip 文本格式完全一致，不会 drift。`tip_id` 直接用 `Contribution.id`（Supabase 的真实主键），不再用 `uuid4()` 生成——这样重灌和实时写入指向的是同一份 id 空间。

### Step 3 — 接入 `backend/app/main.py` 的 `lifespan`

`lifespan` 在 DB 健康检查之后调用 `reseed_from_supabase()`，每次冷启动都会执行。副作用：`tests/integration/test_guide_route.py` 里的测试会真实触发 `lifespan_context`，因此加了一个 `autouse` fixture mock 掉 `app.main.reseed_from_supabase`，避免测试打真实网络请求（实测过不加 mock 会导致每个测试多耗时约 8 秒）。

**本地闭环验证**：手动清空 ChromaDB collection 到 0 条 → 不手动跑任何脚本，直接 `uvicorn app.main:app` 冷启动 → `/api/v1/health` 返回 200 → 独立进程查询 collection，确认自动恢复到 23 条。

---

## 里程碑 B：后端 Render 部署

### Step 4 — `backend/render.yaml`（已完成）

方案 C 落地后不再需要 Persistent Disk，`render.yaml` 里没有 `disk` 块，免费层 Web Service 即可部署：

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

`sync: false` 表示密钥类的值只在 Render 控制台手填，不写进这个会被提交进 Git 的文件——延续 CLAUDE.md「密钥不硬编码」的约束。落地时发现并修了两个原始草案没有的坑：
- **`rootDir: backend`**：仓库根目录没有 `requirements.txt`（只在 `backend/requirements.txt`），不加这个字段 `buildCommand` 会因为找不到文件失败。
- **`PYTHON_VERSION: 3.11.15`**：本地 venv 实际是 Python 3.11.15（ARCHITECTURE.md 写的"3.12"是过时信息），且不锁定版本时用系统更新的 Python（实测 3.13）会导致 `chromadb==0.4.24` 的间接依赖 `pulsar-client>=3.1.0` 找不到可用发行版，构建直接失败。

本地已按 `buildCommand`/`startCommand` 原文验证：Python 3.11.15 下 `pip install -r requirements.txt --dry-run` 全部 `Requirement already satisfied`；`PORT=8002 uvicorn app.main:app --host 0.0.0.0 --port $PORT` 启动后 `/api/v1/health` 返回 200。

### Step 5 — Render 控制台环境变量核对清单

| 变量 | 本地 `.env` 现值 | 生产应填 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 真实 key | 同一个 key（或生产专用 key，视 PM 账单策略） |
| `TAVILY_API_KEY` | 真实 key | 同上 |
| `JWT_SECRET_KEY` | `change-me-in-production`（占位值） | **必须**换成随机生成的强密钥，不能沿用占位值上线 |
| `DATABASE_URL` | Supabase 直连串 | **改用 Supabase Session Pooler 连接串**（见上文决策 2），端口通常 `6543` |
| `ALLOWED_ORIGINS` | `["http://localhost:5173"]` | `["https://<vercel-域名>"]`——需要等 Step 7 部署出前端后才知道确切域名，见里程碑 D |

---

## 里程碑 C：前端 Vercel 部署

### Step 6 — 校验 `frontend/vercel.json`

Phase4 Step4 已经提前放好 SPA 回退配置，本步只做确认，不重复创建：

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### Step 7 — Vercel 环境变量

`VITE_API_BASE_URL` 本地是相对路径 `/api`（命中 Vite Proxy）；生产环境前后端不同源，没有 Proxy 兜底，必须改成 Render 后端的完整 URL（例如 `https://aaf-api.onrender.com/api`），直接依赖 Step 4 的 `ALLOWED_ORIGINS` 配置和 `app/main.py` 里已有的 CORSMiddleware 放行。

---

## 里程碑 D：生产 CORS 联调

### Step 8 — 部署顺序与 `ALLOWED_ORIGINS` 回填

存在一个先后依赖：Render 后端的 `ALLOWED_ORIGINS` 需要填 Vercel 分配的域名，但 Vercel 域名要部署过一次才知道。执行顺序：

```
1. 先部署前端（Step 6/7），拿到 Vercel 分配的域名（如 aaf-product.vercel.app）
2. 回填 Render 的 ALLOWED_ORIGINS 环境变量为这个域名
3. 触发 Render 重新部署，使 CORS 配置生效
4. 前端重新请求，确认不再有 CORS 报错
```

---

## 里程碑 E（可选，不阻塞部署）：健康检查补全

### Step 9 — `/api/v1/health` 补充 ChromaDB 连通性

Phase4 审计时已经指出 `/api/v1/health` 只检查了 DB（`SELECT 1`），没有覆盖 ARCHITECTURE.md §6 文档里写的"DB + ChromaDB 连通性"。当时判定是文档/实现的小偏差，优先级低，未修。放到本阶段重新评估的原因：Render 的 `healthCheckPath` 会持续调这个端点判断实例是否存活——如果里程碑 A 的 `reseed_from_supabase()` 在某次冷启动时失败或被跳过（比如 Supabase 连接失败、`DATABASE_URL` 配置错误），当前实现依然会返回 `200 {"status":"ok","db":"connected"}`，把一个真实的数据故障掩盖成"一切正常"。

建议做法：复用 `rag_service.py` 已有的模块级 `_collection`，加一次轻量 `collection.count()` 调用，失败或返回 0 时在响应里体现出来，不需要新起 client。标记为可选，因为不影响部署本身能否跑通——是可观测性加固，不是阻塞项。

---

## 阶段验收测试

不同于前几个阶段"本地手动走查"，本阶段验收必须在**生产域名**下进行，因为核心风险（CORS、ChromaDB 持久化）本质上是"本地永远测不出来"的一类问题：

```
1. curl https://<render-域名>/api/v1/health → 200

2. 浏览器访问 Vercel 域名，走一遍 student 向导全流程，打开 Network 面板确认
   请求真的打到了 Render 域名（不是意外还在打 localhost 或残留的相对路径）。

3. 登录闭环：在生产环境注册一个新账号 → 登录 → 刷新页面确认登录态不丢
   （localStorage token 在生产 HTTPS 域名下依然生效）。

4. Guide 历史 + 分享链接：登录后生成一条 Guide → /history 能看到 → 复制
   /guide/:id 链接，用隐身窗口（未登录）打开，确认匿名可访问（Optional 鉴权语义）。

5. 贡献审核闭环：提交一条新的学长经验 → 管理员账号登录生产环境 →
   /admin/contributions 里 approve → 重新生成一次同课程的 Guide，确认检索到
   刚才这条新 tip（证明生产环境的 ChromaDB 写入路径本身是通的）。

6. 【本阶段最关键的一步，之前从未验证过】手动触发一次 Render 重新部署
   （例如推一个空 commit），部署完成后重复步骤 5 的检索确认。如果这条 tip
   还能被检索到，说明里程碑 A 的 Supabase 动态重灌逻辑（`lifespan` 里的
   `reseed_from_supabase()`）在生产环境真的生效了；如果检索不到，说明
   `DATABASE_URL` 或 `reseed_from_supabase()` 的调用配置有问题，需要回到
   里程碑 A 重新核查——步骤 1-5 全部通过但跳过这一步，等于完全没有验证过
   持久化方案本身（本地已经用"手动清空 collection 再冷启动"模拟过一次，
   这一步是生产环境下的真实复现）。

7. CORS 校验：用 curl 从一个不在白名单里的 Origin 发起跨域请求
   （curl -H "Origin: https://evil.example.com" ...），确认被拒绝，
   证明生产配置没有退化成通配符 "*"。
```

---

## 收尾

CLAUDE.md 路线图表格里 Phase 5 是当前规划的最后一个阶段，本文件不再设"与 Phase 6 的边界"小节。本阶段验收全部通过后，AAF 在 ARCHITECTURE.md 定义的目标架构下完整闭环上线；如果后续有新的迭代需求，应作为独立的新阶段文档另起，而不是塞进本文件。

*本文件由架构师生成，代码实施须严格遵循 ARCHITECTURE.md 中的目录结构与接口契约。文首两项部署决策中，ChromaDB 持久化方案已拍板为方案 C 并落地完成（里程碑 A、里程碑 B Step 4）；Supabase 连接池（直连 vs Session Pooler）仍待 PM 在里程碑 B Step 5 执行时确认。每步执行前必须等待 PM 确认。*
