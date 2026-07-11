# Phase 4 执行手册：React + Vite 前端工程，迁移 UI

> **状态**：待执行
> **前置条件**：Phase 3 已完成并 `git commit`（历史/详情路由、贡献审核闭环、限流、测试均已验证；后端 API 契约自本阶段起冻结，不再新增/变更端点）
> **验收目标**：`frontend/` 独立 React 18 + Vite + TS 工程本地可跑通；原 `templates/index.html` 三步向导 + 结果卡 + 原子加载动画 100% 视觉还原；登录态、Guide 历史、学长经验提交、管理员审核这四块 Phase2/3 已具备后端能力但从未有 UI 的功能，本阶段补齐前端界面
> **协作约束**：每步执行前等待确认，执行后等待本地测试通过并 `git commit`，再进行下一步

---

## ⚠️ 已与 PM 确认的架构决策（执行前必读）

以下三点是本阶段开工前审计代码后发现的、ARCHITECTURE.md / CLAUDE.md 原文没预料到的偏差，已与 PM 逐条确认，写在这里作为后续所有 Step 的前提，不再逐一复述：

1. **CSS 方案**：`static/style.css`（1001 行）实测是纯手写 CSS + `:root` CSS 变量（如 `--accent: #86351C`），**完全没有使用 Tailwind**——与 CLAUDE.md「必须复用...Tailwind 样式」的表述不符。既然「视觉 100% 还原」优先级更高，处理方式为：**迁移页（三步向导 + 结果卡 + 原子加载）原样复用 `style.css` 作为全局 CSS，一个类名都不改；只有本阶段新增的、没有旧 UI 可对照的页面（登录/注册、Guide 历史、贡献提交表单、管理员审核后台）使用 Tailwind**，在同一套 CSS 变量语汇下设计。ARCHITECTURE.md §1 技术栈表的 Tailwind 行按此口径理解。

2. **路由方案**：ARCHITECTURE.md 原目录树按「单页向导」设计，没有规划路由库。Phase3 新增的 `/guide/{id}` 语义上就是「分享链接」，需要真实可分享的 URL；登录、历史、审核后台也更适合做成独立路径。因此引入 `react-router-dom`，目录树在 §2 基础上追加 `frontend/src/pages/` 存放路由级组件（向导本身挂在 `/`，不强制拆页面）。

3. **贡献提交入口**：原 HTML 里「Join As a Contributor of AAF」按钮实际只调用了 `resetToForm()`（回到向导第一步），真实提交渠道是文案里提到的外部 Google Form（对应已从仓库删除的 `AAF_responses.csv`）。Phase3 新增了 `POST /contributions` 后端能力后，本阶段把这颗按钮改为跳转到站内新表单 `ContributionForm`，形成「提交 → 管理员审核 → 写入 ChromaDB」的完整闭环，不再依赖外部 Google Form。

以下这点不是决策分歧，只是提前记录，避免执行到 Step 22 时才发现意外：

- **`aafSubmitRating()` 的行为变化**：原实现只是把整行 DOM 换成感谢文案，从未调用过任何接口（当时 `ratings` 表还不存在）。本阶段会让它真实调用 `POST /ratings`——视觉上用户无感，但这是一次「从假交互到真交互」的行为补全，验收时需要专门用网络面板确认请求真的发出去了。

---

## 与 Phase 3 的边界对照

| 功能 | Phase 3 状态 | Phase 4 完成 |
|---|---|---|
| 前端工程 | 不存在 | `frontend/` 独立 React 18 + Vite + TS 工程 |
| 视觉呈现 | 仅 Flask Jinja2 模板 `templates/index.html` | 100% 还原为 React 组件，原生 JS 逻辑等价迁移 |
| Markdown 渲染 | 后端返回 Markdown 字符串，无消费方 | `react-markdown` 渲染，替代 CDN `marked.js` |
| 认证态 UI | 无（仅 curl 测试过 API） | 登录/注册表单 + Token 存储与刷新（`useAuth.ts`） |
| Guide 历史 UI | 无（仅 API） | 历史列表 `/history` + 详情页 `/guide/:id` |
| 学长经验提交 UI | 无（仅 API + 外部 Google Form） | 站内表单 `/contribute`，替代外部 Google Form 入口 |
| 管理员审核 UI | 无（仅 curl 测试过 API） | 审核后台 `/admin/contributions`（list/approve/reject） |
| 满意度评分 | 前端假交互，从不调用 API | 真实调用 `POST /ratings` |
| 本地跨域 | 未涉及（无前端） | Vite Dev Proxy 生效（ARCHITECTURE.md §3 策略 A） |

---

## 里程碑 A：前端工程骨架

### Step 1 — 创建 `frontend/` 工程 + `package.json`

```bash
npm create vite@latest frontend -- --template react-ts
```

追加依赖：`@tanstack/react-query`、`zustand`、`axios`、`react-markdown`、`react-router-dom`；开发依赖追加 `tailwindcss`、`postcss`、`autoprefixer`（仅用于净新增页面，见上文架构决策 1）。

### Step 2 — `frontend/vite.config.ts`

按 ARCHITECTURE.md §3 策略 A 配置 dev proxy：

```ts
server: {
  proxy: { '/api': 'http://localhost:8000' }
}
```

### Step 3 — `frontend/tsconfig.json`

追加 `@/*` 路径别名指向 `src/*`，与目录树里 `api/`、`components/`、`hooks/` 等子目录的 import 写法对齐。

### Step 4 — `frontend/vercel.json`

提前放好 SPA 回退配置（Phase5 部署时直接生效，避免遗漏）：

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## 里程碑 B：视觉资产迁移（严格 1:1，仅限迁移页）

### Step 5 — `frontend/src/index.css`

把 `static/style.css`（1001 行）原样搬入，类名、CSS 变量、媒体查询一个字节不改。

### Step 6 — `frontend/src/data/courses.ts`

把 `templates/index.html` 里的 `UCI_COURSES`（含 `dept` 元数据，用于搜索框前缀/全名匹配）迁移为 TS 常量。

> 注：不调用后端 `GET /courses`——那个端点只返回精简课程码列表（`backend/app/api/v1/routes/courses.py`），供其他/未来客户端使用；原搜索框依赖的 `dept` 元数据只存在于前端本地数据里，继续维护在 `courses.ts`。

---

## 里程碑 C：类型与 API 客户端层

### Step 7 — `frontend/src/types/index.ts`

对齐所有 Pydantic Schema：`GuideRequest/Response`、`GuideHistoryItem/Response`、`LoginRequest/RegisterRequest/TokenResponse/UserResponse`、`RatingRequest/Response`、`ContributionRequest/Response`。

### Step 8 — `frontend/src/api/client.ts`

axios 实例：

```ts
const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL });
client.interceptors.request.use(cfg => {
  const token = useAuthStore.getState().accessToken;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
```

响应拦截器：401 时尝试用 `refresh_token` 换新 `access_token` 重放一次；仍失败则清空 `authStore` 并跳转登录。

### Step 9 — `frontend/src/api/guide.ts`

`generateGuide(req)` / `getGuideHistory(limit, offset)` / `getGuide(id)`。

### Step 10 — `frontend/src/api/auth.ts`

`login()` / `register()` / `refresh()` / `logout()` / `me()`。

### Step 11 — `frontend/src/api/ratings.ts`

`submitRating(guideId, score)`。

### Step 12 — `frontend/src/api/contributions.ts`

`submitContribution(req)` / `listPendingContributions()` / `approveContribution(id)` / `rejectContribution(id)`。

---

## 里程碑 D：状态管理

### Step 13 — `frontend/src/store/wizardStore.ts`

Zustand，字段对齐原生 JS 全局状态：`currentStep`、`role`、`courses: string[]`、`otherSelectedCourses: Set<string>`、`confidence`、`goals/expertise: string[]`、`userQuery`。

### Step 14 — `frontend/src/store/authStore.ts`

`accessToken` / `refreshToken` / `user`，用 `persist` middleware 落到 `localStorage`（键名加前缀避免冲突，如 `aaf_auth`）。

---

## 里程碑 E：原子 UI 组件迁移（1:1 视觉）

### Step 15 — `frontend/src/components/ui/AtomLoader.tsx`

原样迁移 SVG（`glow-nucleus`/`glow-orbit`/`glow-electron` 三个 filter + 三条 `animateMotion` 轨道），不做任何简化。

### Step 16 — `frontend/src/components/ui/ProgressBar.tsx`

进度条 + 三个 step-label，`active` class 切换逻辑迁移自 `updateProgress()`。

### Step 17 — `frontend/src/components/ui/CourseChip.tsx`

课程标签卡片，`checked` 状态受控于 `wizardStore`，替代原生 `classList.toggle('selected', ...)`。

---

## 里程碑 F：向导步骤组件迁移

### Step 18 — `frontend/src/components/wizard/StepIdentity.tsx`

角色卡片（student/senior），selected/dimmed 切换逻辑迁移自 `goNext(1)` 里 role 分支那段（含切换身份清空 `user_query` 的副作用）。

### Step 19 — `frontend/src/components/wizard/StepCourses.tsx`

课程网格 + division tabs（all/lower/upper）+ 搜索框（dropdown/tags/自定义课程），`handleOtherSearch`/`selectOtherCourse`/`removeOtherCourse` 迁移为组件内 state，逻辑与原版完全等价。

### Step 20 — `frontend/src/components/wizard/StepGoals.tsx`

置信度滑杆（`confidence`，学生模式显示）+ goal/expertise chips + `user_query` textarea。`placeholders`/`seniorPlaceholders`/`comboPlaceholders` 三套映射表迁移为常量，`updatePlaceholder()` 逻辑等价迁移。

---

## 里程碑 G：结果展示组件迁移

### Step 21 — `frontend/src/components/result/GuideCard.tsx`

`react-markdown` 渲染 `guide_markdown`，替代 CDN `marked.js`；保留原表格样式（`style.css` 里 `#aafBody table` 相关规则已在 Step5 一并迁入）。

### Step 22 — `frontend/src/components/result/ExportMenu.tsx`

「more...」弹出菜单：Add to Calendar（生成 `.ics` blob）/ Download as PDF（打印窗口）/ Export for Google Docs（`.html` blob）/ Share（`navigator.share` 或剪贴板降级）。`injectTableActions()` 里的四段逻辑原样迁移为 TS 函数。

### Step 23 — `frontend/src/components/result/RatingBar.tsx`

Emoji 评分，`aafRate()` 的选中态迁移为组件 state；`aafSubmitRating()` 改为真实调用 `api/ratings.ts` 的 `submitRating()`，成功后再展示感谢文案（对照上文「已提前记录」的行为变化说明）。

---

## 里程碑 H：数据请求 Hook 与主流程组装

### Step 24 — `frontend/src/hooks/useGuide.ts`

TanStack Query `useMutation` 封装 `generateGuide`，替代原 `fetch + DOMParser` 那段 AJAX；`isPending` 驱动 `AtomLoader` 显隐，替代 `startAtom()/stopAtom()`。

### Step 25 — `frontend/src/App.tsx` + `main.tsx`

`QueryClientProvider` + `BrowserRouter` 包裹；`/` 路由挂三步向导 + 结果卡（`wizardStore.currentStep` 驱动 `StepIdentity`/`StepCourses`/`StepGoals`/`GuideCard` 切换，替代原生 `classList.add('hidden')`）。

---

## 里程碑 I（净新增）：认证 UI

### Step 26 — `frontend/src/hooks/useAuth.ts`

封装 login/register/logout/me；401 时的自动 refresh 逻辑已在 Step8 的拦截器里做了，这里只暴露 `isAuthenticated`/`user`/`login()`/`logout()` 给组件用。

### Step 27 — `frontend/src/pages/LoginPage.tsx` + `RegisterPage.tsx`

Tailwind 实现（无旧 UI 可对照），沿用 `style.css` 里的 `--accent` 等 CSS 变量保持视觉语汇一致，不追求逐像素还原。

---

## 里程碑 J（净新增）：Guide 历史页

### Step 28 — `frontend/src/pages/GuideHistoryPage.tsx`

登录后可见，消费 `GET /guide/history`，点击条目跳转 `/guide/:id`。

### Step 29 — `frontend/src/pages/GuideDetailPage.tsx`

消费 `GET /guide/{id}`（匿名可访问，真正的分享链接），复用 `GuideCard` 渲染。

---

## 里程碑 K（净新增）：学长经验提交表单

### Step 30 — `frontend/src/pages/ContributePage.tsx`

对接 `POST /contributions`；`StepIdentity.tsx` 里 senior 分支下、结果卡里的「Join As a Contributor of AAF」按钮改为 `navigate('/contribute')`（替代原来的 `resetToForm()`）。

---

## 里程碑 L（净新增）：管理员审核后台

### Step 31 — `frontend/src/pages/AdminContributionsPage.tsx`

`useAuth` 判断 `user.role === 'admin'` 才展示入口（纯 UX 遮罩，真正权限仍由后端 `require_admin` 的 403 把关）；列表 + approve/reject 按钮，对接里程碑 C 的 `contributions.ts`。

---

## 阶段验收测试

后端沿用 Phase3 的 `uvicorn --reload`；前端 `cd frontend && npm run dev`，浏览器访问 `http://localhost:5173`，手动走查（本阶段不引入 Vitest/Playwright，除非 PM 后续要求，遵循不过度设计原则）：

```
1. 视觉 diff：并排打开旧 templates/index.html（需临时起 Flask 或直接开本地文件）与新 localhost:5173，
   核对向导三步、进度条、course chip 选中态、原子加载动画、结果卡表格样式逐屏一致。

2. Student 全流程：选 student → 选课 → 填置信度/目标/自由文本 → 提交 → 看到真实 Guide → 打分（打开
   Network 面板确认 POST /api/v1/ratings 真的发出并返回 201）→ more... 菜单四个导出功能逐个点一遍。

3. Senior 全流程：选 senior → 选课 → 提交 → 结果卡里点击 "Join As a Contributor of AAF" →
   确认跳转到 /contribute 而不是回到向导第一步 → 填表提交 → 确认 201。

4. 登录闭环：/register 建号 → /login 拿 token → 刷新页面确认登录态不丢（localStorage 生效）→
   /history 能看到匿名生成之外、登录后生成的 Guide → 点条目跳 /guide/:id 能看到详情。

5. 匿名分享链接：不登录直接访问某个已知 guide_id 的 /guide/:id，确认能看到内容（Optional 鉴权语义）。

6. 管理员审核闭环：把测试账号 role 手动改成 admin（Supabase）→ 登录 → 能看到 /admin/contributions
   入口 → 看到第3步提交的记录 → approve → 确认 ChromaDB 侧数据可被下一次 generate 检索到
   （检索 tip 里含刚才提交的文本片段）。

7. 非 admin 用户访问 /admin/contributions：前端隐藏入口，若强行改 URL 访问，后端 403 应体现为
   页面上的错误提示而不是白屏崩溃。
```

---

## 与 Phase 5 的边界

| 功能 | Phase 4 状态 | Phase 5 完成 |
|---|---|---|
| 前端工程 | 本地 `npm run dev` 可跑通，未部署 | Vercel 生产部署，`vercel.json` 生效 |
| 后端部署 | 本地 `uvicorn --reload`，未部署 | Render 生产部署，`render.yaml` 生效 |
| CORS | 本地 `.env` 只含 `http://localhost:5173` | 补充生产 `ALLOWED_ORIGINS`（Vercel 域名，无通配符） |
| 环境变量 | 本地 `.env`/`.env.example` | Render/Vercel 控制台环境变量核对清单 |
| 端到端验收 | 仅本地手动走查 | 生产域名下完整冒烟测试（向导 + 登录 + 历史 + 审核全走一遍） |

---

*本文件由架构师生成，代码实施须严格遵循 ARCHITECTURE.md 中的目录结构与接口契约；本阶段涉及的三项架构决策（CSS 方案 / 路由方案 / 贡献提交入口）已与 PM 确认，详见文首。每步执行前必须等待 PM 确认。*
