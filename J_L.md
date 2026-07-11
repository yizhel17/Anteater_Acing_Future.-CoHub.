# 里程碑 J-L 执行方案

> 本文件记录 PHASE4.md 里程碑 J（Guide 历史页）、K（学长经验提交表单）、L（管理员审核后台）的 UI 设计方案，与 PM 讨论确认后固化于此。每次开工前必须先读 `PHASE4.md` 和本文件，避免走偏。

---

## Milestone J — Step28 `GuideHistoryPage.tsx` + Step29 `GuideDetailPage.tsx`

**视觉**：宣纸底色（`--xuan-paper`/`--ink-black`/`--border-ink` 等既有 CSS 变量），跟向导页视觉语言呼应，不用 login/register 那套深红卡片。

### GuideHistoryPage（`/history`）

- 数据：`hooks/useGuide.ts` 里新增 `useGuideHistory()`，`useQuery` 包已有的 `getGuideHistory()`。
- 鉴权：不写守卫组件，未登录时后端 401 → `api/client.ts` 里 Step8 已有的拦截器自动跳 `/login`，复用现成机制。
- 布局：`bg-[var(--xuan-paper)]` 页面底色 + 卡片列表，每条显示角色 / 课程 / 时间，整行点击跳 `/guide/:id`；空列表就一句提示文案，不做插画。
- 分页：先用默认 `limit=20`，不做"加载更多"之类的交互，避免过度设计。

### GuideDetailPage（`/guide/:id`）

- 数据：`useQuery` 包 `getGuide(id)`，拿到结果直接扔给现成的 `GuideCard` 渲染，匿名可访问。
- 接口不对齐点：`GuideResponse`（后端 schema）没有 `role` 字段，但 `GuideCard` 现在要求必传 `role`（用来判断要不要显示"Join As a Contributor"那一行）。分享链接场景里不知道原始角色，把 `GuideCard` 的 `role` 改成可选，`GuideDetailPage` 不传时就不显示那一行。

---

## Milestone K — Step30 `ContributePage.tsx`

**视觉**：延续 login/register 已定稿的白卡片 + icon 输入框语言，但不照搬双栏分割。理由：双栏是"品牌介绍+登录动作"场景的结构，Contribute 表单有 4 个字段（course 下拉 + danger_zone/setup_tips/career_value 三个长文本框），用户是从"生成结果页点击 Join as Contributor"点进来的，已经知道这是干嘛的，不需要再来一块营销文案；硬塞进窄栏会让文本框显得挤。用单栏居中卡片，宽度比 login 卡片更宽（textarea 需要更多横向空间），沿用同一套间距纪律（`!gap-6` 分组、输入框 `rounded-md`、`!` 前缀强制优先级）。

**入口**：结果卡片里 senior 分支的按钮已经指向 `/contribute`（`GuideCard.tsx`），K 做完后自然接上，不用改按钮那边。

---

## Milestone L — Step31 `AdminContributionsPage.tsx`

**视觉**：同样宣纸底色，偏工具属性，不追求品牌感。

**权限展示**：`useAuth()` 判断 `user.role === 'admin'` 才展示这个页面入口——这只是 UX 遮罩，真正把关的是后端 `require_admin` 的 403。按 PHASE4.md 验收测试第7条的要求，非 admin 强行访问要在页面上显示错误提示而不是白屏崩溃，所以组件里要显式接住 query 报错状态渲染一条错误文案，不能让它直接抛出去。

**布局**：待审核列表（course + 三段文本预览 + approve/reject 按钮），对接 `api/contributions.ts` 里已有的 `listPendingContributions`/`approveContribution`/`rejectContribution`，approve/reject 成功后要让列表重新拉取（TanStack Query 的 mutation 成功后 invalidate 对应 query）。

**新 hook 文件**：K 和 L 都要用到 contributions 相关的请求状态（提交/列表/审核），新建 `hooks/useContributions.ts` 统一放，跟 `useAuth.ts`/`useGuide.ts` 的"一个领域一个 hook 文件"规律保持一致，不散落到各个页面组件里手写 `useMutation`。

---

## 路由

`/history`、`/guide/:id`、`/contribute`、`/admin/contributions` 分别在对应里程碑里加进 `App.tsx`，不一次性全加。

## 执行纪律

- 一个里程碑一个里程碑做，每步等 PM 确认再动手。
- 新页面一律走 Tailwind + 既有 CSS 变量（不碰迁移页专用的 `.container` 等手写类名）。
- 每步做完跑 `tsc -b` / `oxlint` / `vite build`，有后端接口变动的额外跑 `pytest`。
