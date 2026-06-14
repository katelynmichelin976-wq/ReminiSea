# 管理看板 v2 全新设计 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 admin 从「医生/家属监控」重设计为「单人产品/运营驾驶舱」单页 Bento Grid 全览，纯只读，四象限（增长活跃 / 系统健康 / 用户反馈 / 内容运营），废弃 v1 顶层 3 tab + 患者详情 5 子 tab。

**Architecture:** 新文件 `yihai_admin_v2.html`（单 HTML 内联 CSS/JS）+ 2 个新 Edge Functions（`get-admin-overview` 聚合 + `get-admin-trend` 抽屉懒加载）。沿用 `_shared/admin-auth.ts` 鉴权、`admin-auth-check` / `sign-private-url`。v1 文件并存 1–2 周自用验证后清理。

**Tech Stack:** Deno + supabase-js@2 (Edge Functions, 复用现有 `_shared/admin-auth.ts` 模式) · 单 HTML 内联 (CSS/JS) · Chart.js CDN · Playwright (Node.js) 冒烟 · Supabase MCP（schema 校验 + 部署）

**Spec：** `docs/superpowers/specs/2026-06-14-admin-v2-redesign-design.md`

**Project ID:** `juzkonrzfyvchqxzmlpr`

---

## 文件清单

**新增**
- `supabase/functions/get-admin-overview/index.ts`
- `supabase/functions/get-admin-trend/index.ts`
- `supabase/functions/_shared/time-window.ts`（共享时间窗解析）
- `yihai_admin_v2.html`
- `tests/_pw_admin_v2.js`

**修改**
- `CLAUDE.md`（admin 文件名 + 测试套件清单）
- `docs/yihai_变更记录_CLAUDE参考.md`（admin v2 上线条目）

**保留不动**
- `supabase/functions/_shared/admin-auth.ts`
- `supabase/functions/admin-auth-check/`
- `supabase/functions/sign-private-url/`
- `yihai_admin_v1.html`（自用验证期并存）

**计划废弃（本计划不删，后续清理时单独 PR）**
- 8 个 v1 专用 Edge Functions
- `yihai_admin_v1.html`

---

## Phase 0 — Schema 校验

Edge Function 开发前必须确认表/字段实际命名，避免上线后才发现列不存在。本阶段全部用 Supabase MCP 跑查询。

### Task 0.1: 列出 public schema 全表

**Files:** 无（纯查询）

- [ ] **Step 1: 调 `mcp__supabase__list_tables`**

```
project_id: juzkonrzfyvchqxzmlpr
schemas: ["public"]
verbose: true
```

期望输出含：`sync_trials`, `sync_card_states`, `easy_card_states`, `app_events`, `admin_users`, `feedback`, `decks` 或类似精选牌组表, `deck_subscriptions`, `personal_decks` 或类似, `deck_cards`。

- [ ] **Step 2: 把表名 + 关键列名抄到一张草稿表**

格式：
```
sync_trials: id, user_id, card_id, deck_id, rating, response_time_ms, timestamp(bigint), trial_date(text), ...
app_events: id, user_id, event_type, payload(jsonb), app_version, timestamp, ...
feedback: id, user_id, content, screenshot_path, app_version, ts, ...
decks: id, title, is_featured/is_official/...,
deck_subscriptions: id, user_id, deck_id, subscribed_at, unsubscribed_at?, ...
personal_decks(?): id, owner_id, title, ...
deck_cards(?): id, deck_id, ...
```

如某些表不存在，把假设条目划掉。

### Task 0.2: 精选牌组字段确认

- [ ] **Step 1: 跑 SQL 取 `decks` 表前 3 条**

调 `mcp__supabase__execute_sql`:
```sql
SELECT * FROM decks LIMIT 3;
```

- [ ] **Step 2: 记录精选标记字段名**

实际字段名可能是 `is_featured` / `is_official` / `category='featured'` / `published`。在草稿表里记下正确字段名（后续 SQL 用）。

- [ ] **Step 3: 确认 deck_subscriptions schema**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='deck_subscriptions'
ORDER BY ordinal_position;
```

记下：是否有 `unsubscribed_at` 字段（否则"取消订阅率"无法算 → 该指标在 spec § 4.4 抽屉中改为 "—"）。

### Task 0.3: app_events 事件类型清单

- [ ] **Step 1: 跑 SQL 取最近 7 天 event_type 分布**

```sql
SELECT event_type, COUNT(*) AS n
FROM app_events
WHERE timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000
GROUP BY event_type
ORDER BY n DESC
LIMIT 30;
```

- [ ] **Step 2: 标记同步失败事件名**

在结果中找出与同步失败相关的 event_type（可能是 `sync_failed` / `sync_error` / `sync_timeout` 等）。如果一个都没有，则 spec § 4.2 KPI strip "同步失败次数" 临时显示 "—" + 在 Phase 1 实施时把 event_type 列表硬编码为已知值的并集。

- [ ] **Step 3: 确认 JS 错误事件名**

期望存在 `js_error`（v5.13.11 上线）。如果没有，在草稿表标记并继续——Phase 1 实施时改用该项目实际使用的名字。

### Task 0.4: feedback 表结构

- [ ] **Step 1: 取列结构**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='feedback'
ORDER BY ordinal_position;
```

- [ ] **Step 2: 记录关键字段**

文本字段名、截图路径字段名（用于 sign-private-url 拼路径）、时间戳字段名（`ts` / `created_at` / `timestamp`）。

### Task 0.5: personal_decks / deck_cards 结构（如存在）

- [ ] **Step 1: 查表是否存在**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('personal_decks','deck_cards');
```

- [ ] **Step 2: 如存在，取列结构**

对每张存在的表跑：
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='<表名>'
ORDER BY ordinal_position;
```

如果两张表都不存在，spec § 4.4 "个人牌组" 部分在 Phase 1 实施时降级为占位 "—"（不阻塞主流程）。

### Task 0.6: 提交 schema 草稿到 docs

**Files:**
- Create: `docs/superpowers/notes/2026-06-14-admin-v2-schema-check.md`

- [ ] **Step 1: 写入草稿**

把 Task 0.1 - 0.5 的所有确认结果写进新文件。后续 Phase 1 写 SQL 时直接照抄列名。

- [ ] **Step 2: 提交**

```powershell
git add docs/superpowers/notes/2026-06-14-admin-v2-schema-check.md
git commit -m "docs: admin v2 schema check 草稿（Phase 0 产出）"
```

---

## Phase 1 — Edge Function: get-admin-overview

### Task 1.1: 共享 time-window 工具

**Files:**
- Create: `supabase/functions/_shared/time-window.ts`

- [ ] **Step 1: 写文件**

```typescript
export type TimeWindow = "24h" | "7d" | "30d";

export function parseTimeWindow(s: unknown): TimeWindow {
  if (s === "24h" || s === "7d" || s === "30d") return s;
  return "7d";
}

export function timeWindowToMs(tw: TimeWindow): number {
  if (tw === "24h") return 24 * 3600 * 1000;
  if (tw === "7d") return 7 * 86400 * 1000;
  return 30 * 86400 * 1000;
}

export function timeWindowStartMs(tw: TimeWindow, nowMs = Date.now()): number {
  return nowMs - timeWindowToMs(tw);
}

export function timeWindowStartDateString(tw: TimeWindow, nowMs = Date.now()): string {
  return new Date(timeWindowStartMs(tw, nowMs)).toISOString().split("T")[0];
}
```

- [ ] **Step 2: 提交**

```powershell
git add supabase/functions/_shared/time-window.ts
git commit -m "feat: admin v2 共享 time-window 工具"
```

### Task 1.2: get-admin-overview 骨架 + auth

**Files:**
- Create: `supabase/functions/get-admin-overview/index.ts`

- [ ] **Step 1: 写骨架**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, errorResponse, corsHeaders, handleCors } from "../_shared/admin-auth.ts";
import { parseTimeWindow, timeWindowStartMs, timeWindowStartDateString } from "../_shared/time-window.ts";

interface OverviewResponse {
  ok: boolean;
  asOf: string;
  timeWindow: string;
  growth: { ok: boolean; kpi?: Record<string, number | null>; miniChart?: Array<{ date: string; dau: number }>; error?: string };
  health: { ok: boolean; kpi?: Record<string, number | null>; topErrors?: Array<{ message: string; count: number; affectedUsers: number }>; error?: string };
  feedback: { ok: boolean; kpi?: Record<string, number | null>; recent?: Array<Record<string, unknown>>; error?: string };
  content: { ok: boolean; kpi?: Record<string, number | null>; featuredTop5?: Array<Record<string, unknown>>; personalTop5?: Array<Record<string, unknown>>; error?: string };
}

const cache = new Map<string, { at: number; data: OverviewResponse }>();
const CACHE_TTL_MS = 60 * 1000;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAdmin(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("Unauthorized") || msg.includes("Invalid token") || msg.includes("Missing")) {
      return errorResponse(403, msg);
    }
    return errorResponse(500, msg);
  }

  const url = new URL(req.url);
  const tw = parseTimeWindow(url.searchParams.get("timeWindow"));

  const minuteKey = Math.floor(Date.now() / CACHE_TTL_MS);
  const cacheKey = `${tw}::${minuteKey}`;
  const hit = cache.get(cacheKey);
  if (hit) {
    return new Response(JSON.stringify(hit.data), { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const startMs = timeWindowStartMs(tw);
  const startDate = timeWindowStartDateString(tw);

  const result: OverviewResponse = {
    ok: true,
    asOf: new Date().toISOString(),
    timeWindow: tw,
    growth: { ok: false, error: "not implemented" },
    health: { ok: false, error: "not implemented" },
    feedback: { ok: false, error: "not implemented" },
    content: { ok: false, error: "not implemented" },
  };

  cache.set(cacheKey, { at: Date.now(), data: result });
  return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
});
```

- [ ] **Step 2: 部署到 Supabase**

调 `mcp__supabase__deploy_edge_function`:
```
project_id: juzkonrzfyvchqxzmlpr
name: get-admin-overview
files: [index.ts + 共享文件]
```

具体参数：把 `index.ts`, `../_shared/admin-auth.ts`, `../_shared/time-window.ts` 三个文件一起上传。

- [ ] **Step 3: curl 验证**

让用户在 PowerShell 跑（需要他的 JWT，告诉他从浏览器 devtools 复制）：
```powershell
$token = "<paste JWT here>"
curl.exe -H "Authorization: Bearer $token" "https://juzkonrzfyvchqxzmlpr.supabase.co/functions/v1/get-admin-overview?timeWindow=7d"
```

期望返回 JSON 含 `ok: true`，四象限都是 `ok: false, error: "not implemented"`。

- [ ] **Step 4: 提交**

```powershell
git add supabase/functions/get-admin-overview/index.ts
git commit -m "feat: get-admin-overview 骨架 + auth + 60s memoize"
```

### Task 1.3: Growth 象限实现

**Files:**
- Modify: `supabase/functions/get-admin-overview/index.ts`

- [ ] **Step 1: 在骨架的 result 构造前插入 growth 计算块**

替换 `result.growth = { ok: false, error: "not implemented" }`：

```typescript
try {
  const [trialsInWindow, newUsers] = await Promise.all([
    supabase.from("sync_trials")
      .select("user_id, trial_date")
      .gte("trial_date", startDate),
    supabase.from("auth_users_admin_view")  // 实施时用 supabase.auth.admin.listUsers() 或新建 view; Phase 0 已确认走 admin API
      .select("id, created_at")
      .gte("created_at", new Date(startMs).toISOString()),
  ]);

  if (trialsInWindow.error) throw trialsInWindow.error;

  const trials = trialsInWindow.data || [];
  const newUsersList = newUsers.data || [];

  const byDate = new Map<string, Set<string>>();
  for (const r of trials) {
    if (!byDate.has(r.trial_date)) byDate.set(r.trial_date, new Set());
    byDate.get(r.trial_date)!.add(r.user_id);
  }
  const totalDays = tw === "24h" ? 1 : (tw === "7d" ? 7 : 30);
  const dauSum = Array.from(byDate.values()).reduce((acc, s) => acc + s.size, 0);
  const dauAvg = totalDays > 0 ? Math.round(dauSum / totalDays) : 0;

  const miniChart: Array<{ date: string; dau: number }> = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    miniChart.push({ date: d, dau: byDate.get(d)?.size ?? 0 });
  }

  let retention: number | null = null;
  if (tw !== "24h") {
    const lag = tw === "7d" ? 7 : 30;
    const cohortStart = new Date(Date.now() - lag * 2 * 86400000).toISOString().split("T")[0];
    const cohortEnd = new Date(Date.now() - lag * 86400000).toISOString().split("T")[0];
    const { data: cohortTrials } = await supabase.from("sync_trials")
      .select("user_id, trial_date")
      .gte("trial_date", cohortStart)
      .lte("trial_date", cohortEnd);
    const targetEnd = new Date(Date.now() - 0 * 86400000).toISOString().split("T")[0];
    const cohortUsers = new Set((cohortTrials || []).map((r: any) => r.user_id));
    const { data: lateTrials } = await supabase.from("sync_trials")
      .select("user_id")
      .gte("trial_date", cohortEnd);
    const retained = new Set((lateTrials || []).map((r: any) => r.user_id).filter((u: string) => cohortUsers.has(u)));
    retention = cohortUsers.size > 0 ? Math.round((retained.size / cohortUsers.size) * 1000) / 10 : null;
  }

  result.growth = {
    ok: true,
    kpi: {
      dauAvg,
      newUsers: newUsersList.length,
      totalTrials: trials.length,
      retention,
    },
    miniChart,
  };
} catch (e) {
  result.growth = { ok: false, error: e instanceof Error ? e.message : "growth error" };
}
```

实施时注意：`auth_users_admin_view` 是占位——实际用 `supabase.auth.admin.listUsers()` + 客户端按 `created_at >= startMs` 过滤；如果总用户数大（>1000），考虑改用 RPC 或新建一个安全的 view。Phase 0 schema check 时确认。

- [ ] **Step 2: 重新部署**

调 `mcp__supabase__deploy_edge_function` 重传。

- [ ] **Step 3: curl 验证三个时间窗**

```powershell
foreach ($tw in @("24h","7d","30d")) {
  curl.exe -H "Authorization: Bearer $token" "https://juzkonrzfyvchqxzmlpr.supabase.co/functions/v1/get-admin-overview?timeWindow=$tw"
  Write-Host "---"
}
```

期望：每个 timeWindow 的 `growth.ok=true`，`growth.kpi` 含 4 个数字（24h 时 retention 为 null），`growth.miniChart` 长度等于 1/7/30。

- [ ] **Step 4: SQL 交叉校验**

跑 `mcp__supabase__execute_sql` 手算 DAU 比对，确保 Edge Function 算的和直接 SQL 一致：
```sql
SELECT trial_date, COUNT(DISTINCT user_id) AS dau
FROM sync_trials
WHERE trial_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY trial_date
ORDER BY trial_date;
```

- [ ] **Step 5: 提交**

```powershell
git add supabase/functions/get-admin-overview/index.ts
git commit -m "feat: get-admin-overview growth 象限（DAU/新增/答题/留存）"
```

### Task 1.4: Health 象限实现

**Files:**
- Modify: `supabase/functions/get-admin-overview/index.ts`

- [ ] **Step 1: 替换 `result.health` 块**

```typescript
try {
  const { data: events, error } = await supabase
    .from("app_events")
    .select("event_type, user_id, payload, app_version, timestamp")
    .gte("timestamp", startMs);
  if (error) throw error;

  const all = events || [];
  const errEvents = all.filter(e => e.event_type === "js_error");  // Phase 0 已确认事件名
  const syncFailEvents = all.filter(e => /sync.*fail|sync.*error|sync.*timeout/i.test(e.event_type || ""));

  const errUsers = new Set(errEvents.map(e => e.user_id).filter(Boolean));
  const errorRate = all.length > 0 ? Math.round((errEvents.length / all.length) * 10000) / 10 : 0;

  const byMsg = new Map<string, { count: number; users: Set<string> }>();
  for (const e of errEvents) {
    const msg = String((e.payload as any)?.message || "").slice(0, 200);
    if (!byMsg.has(msg)) byMsg.set(msg, { count: 0, users: new Set() });
    const ent = byMsg.get(msg)!;
    ent.count++;
    if (e.user_id) ent.users.add(e.user_id);
  }
  const topErrors = Array.from(byMsg.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([message, info]) => ({ message, count: info.count, affectedUsers: info.users.size }));

  result.health = {
    ok: true,
    kpi: {
      jsErrors: errEvents.length,
      affectedUsers: errUsers.size,
      syncFailures: syncFailEvents.length,
      errorRatePerMille: errorRate,
    },
    topErrors,
  };
} catch (e) {
  result.health = { ok: false, error: e instanceof Error ? e.message : "health error" };
}
```

如果 Phase 0 发现 sync 失败事件没有命中规则，把正则替换成实际命中的 event_type 数组并集。

- [ ] **Step 2: 部署 + curl 校验**

同 Task 1.3 Step 2-3。期望 `health.kpi.jsErrors >= 0`，`health.topErrors` 是数组。

- [ ] **Step 3: SQL 交叉校验**

```sql
SELECT event_type, COUNT(*) FROM app_events
WHERE timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000
  AND event_type = 'js_error'
GROUP BY event_type;
```

数字应等于 Edge Function 返回的 `jsErrors`。

- [ ] **Step 4: 提交**

```powershell
git add supabase/functions/get-admin-overview/index.ts
git commit -m "feat: get-admin-overview health 象限（JS 错误/同步失败/Top5）"
```

### Task 1.5: Feedback 象限实现

**Files:**
- Modify: `supabase/functions/get-admin-overview/index.ts`

前置：Phase 0 确认的 feedback 字段名（占位用 `content` / `screenshot_path` / `created_at` / `app_version`；实施时换成实际名）。

- [ ] **Step 1: 替换 `result.feedback` 块**

```typescript
try {
  const startIso = new Date(startMs).toISOString();
  const [all, allCount, totalCount] = await Promise.all([
    supabase.from("feedback")
      .select("id, user_id, content, screenshot_path, app_version, created_at")
      .gte("created_at", startIso)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("feedback")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso),
    supabase.from("feedback")
      .select("id", { count: "exact", head: true }),
  ]);

  if (all.error) throw all.error;

  const recent5 = all.data || [];
  const { data: windowAll } = await supabase
    .from("feedback")
    .select("user_id, screenshot_path")
    .gte("created_at", startIso);
  const usersSet = new Set((windowAll || []).map((r: any) => r.user_id).filter(Boolean));
  const withShots = (windowAll || []).filter((r: any) => r.screenshot_path).length;

  const { data: emails } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailMap = new Map<string, string>();
  for (const u of (emails?.users || [])) emailMap.set(u.id, u.email || "");

  result.feedback = {
    ok: true,
    kpi: {
      windowCount: allCount.count ?? 0,
      totalCount: totalCount.count ?? 0,
      withScreenshots: withShots,
      uniqueUsers: usersSet.size,
    },
    recent: recent5.map(r => ({
      id: r.id,
      ts: r.created_at,
      emailHint: (emailMap.get(r.user_id) || "").split("@")[0] || "anon",
      contentPreview: String(r.content || "").slice(0, 60),
      hasScreenshot: !!r.screenshot_path,
      screenshotPath: r.screenshot_path || null,
      appVersion: r.app_version || null,
    })),
  };
} catch (e) {
  result.feedback = { ok: false, error: e instanceof Error ? e.message : "feedback error" };
}
```

- [ ] **Step 2: 部署 + curl + SQL 交叉校验**

```sql
SELECT COUNT(*) FROM feedback WHERE created_at >= NOW() - INTERVAL '7 days';
```

- [ ] **Step 3: 提交**

```powershell
git add supabase/functions/get-admin-overview/index.ts
git commit -m "feat: get-admin-overview feedback 象限（未读/最近 5 条/截图标记）"
```

### Task 1.6: Content 象限实现

**Files:**
- Modify: `supabase/functions/get-admin-overview/index.ts`

前置：Phase 0 确认的 `decks.is_featured` 字段、`deck_subscriptions` 列、`personal_decks` / `deck_cards` 是否存在。本任务示例代码假定字段名是 `is_featured`、`subscribed_at`、`personal_decks(owner_id, title, created_at)`、`deck_cards(deck_id, card_id)`。**实施时替换为 Phase 0 确认的真名。**

- [ ] **Step 1: 替换 `result.content` 块**

```typescript
try {
  const startIso = new Date(startMs).toISOString();
  const [featured, subs, personals, personalCards, windowSubs] = await Promise.all([
    supabase.from("decks").select("id, title").eq("is_featured", true),
    supabase.from("deck_subscriptions").select("deck_id", { count: "exact", head: true }),
    supabase.from("personal_decks").select("id, owner_id, title, created_at"),
    supabase.from("deck_cards").select("deck_id"),
    supabase.from("deck_subscriptions").select("deck_id, subscribed_at").gte("subscribed_at", startIso),
  ]);

  if (featured.error) throw featured.error;

  const featuredList = featured.data || [];
  const windowSubsCount = new Map<string, number>();
  for (const s of (windowSubs.data || [])) {
    windowSubsCount.set(s.deck_id, (windowSubsCount.get(s.deck_id) || 0) + 1);
  }

  const featuredTop5 = featuredList
    .map(d => ({ id: d.id, title: d.title, windowSubs: windowSubsCount.get(d.id) || 0 }))
    .sort((a, b) => b.windowSubs - a.windowSubs)
    .slice(0, 5);

  const cardsByDeck = new Map<string, number>();
  for (const c of (personalCards.data || [])) {
    cardsByDeck.set(c.deck_id, (cardsByDeck.get(c.deck_id) || 0) + 1);
  }
  const personalList = personals.data || [];
  const personalTop5 = personalList
    .map(p => ({
      id: p.id,
      title: p.title,
      ownerHint: String(p.owner_id || "").slice(0, 8),
      cardCount: cardsByDeck.get(p.id) || 0,
    }))
    .sort((a, b) => b.cardCount - a.cardCount)
    .slice(0, 5);

  const newPersonalsInWindow = personalList.filter(p => p.created_at >= startIso).length;

  result.content = {
    ok: true,
    kpi: {
      featuredCount: featuredList.length,
      totalSubscriptions: subs.count ?? 0,
      windowNewSubs: (windowSubs.data || []).length,
      newPersonalDecks: newPersonalsInWindow,
    },
    featuredTop5,
    personalTop5,
  };
} catch (e) {
  result.content = { ok: false, error: e instanceof Error ? e.message : "content error" };
}
```

- [ ] **Step 2: 部署 + curl 校验**

期望四象限全部 `ok: true`；如果 personal_decks 表不存在，第一次会 500——把 personals 那块包独立 try/catch 即可。

- [ ] **Step 3: SQL 交叉校验精选订阅数**

```sql
SELECT d.title, COUNT(s.id) AS subs
FROM decks d LEFT JOIN deck_subscriptions s ON s.deck_id = d.id
WHERE d.is_featured = true AND s.subscribed_at >= NOW() - INTERVAL '7 days'
GROUP BY d.id, d.title ORDER BY subs DESC LIMIT 5;
```

- [ ] **Step 4: 提交**

```powershell
git add supabase/functions/get-admin-overview/index.ts
git commit -m "feat: get-admin-overview content 象限（精选/个人 top5）"
```

---

## Phase 2 — Edge Function: get-admin-trend

### Task 2.1: 骨架 + 分发

**Files:**
- Create: `supabase/functions/get-admin-trend/index.ts`

- [ ] **Step 1: 写骨架**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, errorResponse, corsHeaders, handleCors } from "../_shared/admin-auth.ts";
import { parseTimeWindow, timeWindowStartMs, timeWindowStartDateString } from "../_shared/time-window.ts";

type Quadrant = "growth" | "health" | "feedback" | "content";

function parseQuadrant(s: unknown): Quadrant | null {
  if (s === "growth" || s === "health" || s === "feedback" || s === "content") return s;
  return null;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAdmin(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("Unauthorized") || msg.includes("Invalid token") || msg.includes("Missing")) {
      return errorResponse(403, msg);
    }
    return errorResponse(500, msg);
  }

  const url = new URL(req.url);
  const tw = parseTimeWindow(url.searchParams.get("timeWindow"));
  const quadrant = parseQuadrant(url.searchParams.get("quadrant"));
  if (!quadrant) return errorResponse(400, "Missing or invalid quadrant");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const startMs = timeWindowStartMs(tw);
  const startDate = timeWindowStartDateString(tw);

  try {
    let data: unknown;
    if (quadrant === "growth") data = await trendGrowth(supabase, tw, startDate);
    else if (quadrant === "health") data = await trendHealth(supabase, tw, startMs);
    else if (quadrant === "feedback") data = await trendFeedback(supabase, tw, startMs);
    else data = await trendContent(supabase, tw, startMs);

    return new Response(JSON.stringify({ ok: true, quadrant, timeWindow: tw, data }),
      { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  } catch (e) {
    return errorResponse(500, e instanceof Error ? e.message : "trend error");
  }
});

async function trendGrowth(_sb: any, _tw: string, _sd: string) { return { todo: true }; }
async function trendHealth(_sb: any, _tw: string, _sm: number) { return { todo: true }; }
async function trendFeedback(_sb: any, _tw: string, _sm: number) { return { todo: true }; }
async function trendContent(_sb: any, _tw: string, _sm: number) { return { todo: true }; }
```

- [ ] **Step 2: 部署 + curl 验证 400 / 200**

```powershell
curl.exe -H "Authorization: Bearer $token" "https://juzkonrzfyvchqxzmlpr.supabase.co/functions/v1/get-admin-trend?timeWindow=7d"
# 期望: 400 "Missing or invalid quadrant"

curl.exe -H "Authorization: Bearer $token" "https://juzkonrzfyvchqxzmlpr.supabase.co/functions/v1/get-admin-trend?timeWindow=7d&quadrant=growth"
# 期望: {"ok":true,"quadrant":"growth","timeWindow":"7d","data":{"todo":true}}
```

- [ ] **Step 3: 提交**

```powershell
git add supabase/functions/get-admin-trend/index.ts
git commit -m "feat: get-admin-trend 骨架 + 4 象限分发"
```

### Task 2.2: trendGrowth 实现

**Files:**
- Modify: `supabase/functions/get-admin-trend/index.ts`

- [ ] **Step 1: 替换 trendGrowth**

```typescript
async function trendGrowth(supabase: any, tw: string, startDate: string) {
  const days = tw === "24h" ? 1 : (tw === "7d" ? 7 : 30);

  const [trials, signups, versions] = await Promise.all([
    supabase.from("sync_trials").select("user_id, trial_date").gte("trial_date", startDate),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from("app_events").select("user_id, app_version, timestamp")
      .gte("timestamp", Date.now() - days * 86400000),
  ]);

  const trialsRows = trials.data || [];
  const byDate = new Map<string, Set<string>>();
  for (const r of trialsRows) {
    if (!byDate.has(r.trial_date)) byDate.set(r.trial_date, new Set());
    byDate.get(r.trial_date)!.add(r.user_id);
  }

  const dauWauMau: Array<{ date: string; dau: number; wau: number; mau: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    const dau = byDate.get(d)?.size ?? 0;
    const wauUsers = new Set<string>();
    const mauUsers = new Set<string>();
    for (let j = 0; j < 7; j++) {
      const dd = new Date(Date.now() - (i + j) * 86400000).toISOString().split("T")[0];
      for (const u of (byDate.get(dd) || new Set<string>())) wauUsers.add(u);
    }
    for (let j = 0; j < 30; j++) {
      const dd = new Date(Date.now() - (i + j) * 86400000).toISOString().split("T")[0];
      for (const u of (byDate.get(dd) || new Set<string>())) mauUsers.add(u);
    }
    dauWauMau.push({ date: d, dau, wau: wauUsers.size, mau: mauUsers.size });
  }

  const signupsByDate = new Map<string, number>();
  for (const u of (signups.data?.users || [])) {
    const d = (u.created_at || "").split("T")[0];
    if (d && d >= startDate) signupsByDate.set(d, (signupsByDate.get(d) || 0) + 1);
  }
  const newSignupsSeries: Array<{ date: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    newSignupsSeries.push({ date: d, count: signupsByDate.get(d) || 0 });
  }

  const versionCount = new Map<string, number>();
  const seenUserVersion = new Set<string>();
  for (const e of (versions.data || [])) {
    const v = e.app_version || "unknown";
    const key = `${e.user_id}::${v}`;
    if (seenUserVersion.has(key)) continue;
    seenUserVersion.add(key);
    versionCount.set(v, (versionCount.get(v) || 0) + 1);
  }
  const versionPie = Array.from(versionCount.entries())
    .map(([version, users]) => ({ version, users }))
    .sort((a, b) => b.users - a.users);

  return { dauWauMau, newSignupsSeries, versionPie };
}
```

- [ ] **Step 2: 部署 + curl + 抽样核对**

```powershell
curl.exe -H "Authorization: Bearer $token" "https://juzkonrzfyvchqxzmlpr.supabase.co/functions/v1/get-admin-trend?timeWindow=7d&quadrant=growth"
```

- [ ] **Step 3: 提交**

```powershell
git add supabase/functions/get-admin-trend/index.ts
git commit -m "feat: trend growth（DAU/WAU/MAU 三线/新增/版本分布）"
```

### Task 2.3: trendHealth 实现

**Files:**
- Modify: `supabase/functions/get-admin-trend/index.ts`

- [ ] **Step 1: 替换 trendHealth**

```typescript
async function trendHealth(supabase: any, _tw: string, startMs: number) {
  const { data, error } = await supabase.from("app_events")
    .select("event_type, user_id, payload, app_version, timestamp")
    .gte("timestamp", startMs);
  if (error) throw error;
  const all = data || [];
  const errs = all.filter((e: any) => e.event_type === "js_error");
  const syncFails = all.filter((e: any) => /sync.*fail|sync.*error|sync.*timeout/i.test(e.event_type || ""));

  const hourly: Array<{ hourBucket: string; jsErrors: number; syncFailures: number }> = [];
  const bucketJs = new Map<string, number>();
  const bucketSync = new Map<string, number>();
  for (const e of errs) {
    const h = new Date(e.timestamp).toISOString().slice(0, 13);
    bucketJs.set(h, (bucketJs.get(h) || 0) + 1);
  }
  for (const e of syncFails) {
    const h = new Date(e.timestamp).toISOString().slice(0, 13);
    bucketSync.set(h, (bucketSync.get(h) || 0) + 1);
  }
  const allHours = new Set<string>([...bucketJs.keys(), ...bucketSync.keys()]);
  for (const h of Array.from(allHours).sort()) {
    hourly.push({ hourBucket: h, jsErrors: bucketJs.get(h) || 0, syncFailures: bucketSync.get(h) || 0 });
  }

  const agg = new Map<string, { firstAt: number; lastAt: number; count: number; users: Set<string>; versions: Set<string> }>();
  for (const e of errs) {
    const msg = String((e.payload as any)?.message || "").slice(0, 200);
    if (!agg.has(msg)) agg.set(msg, { firstAt: e.timestamp, lastAt: e.timestamp, count: 0, users: new Set(), versions: new Set() });
    const ent = agg.get(msg)!;
    ent.count++;
    ent.firstAt = Math.min(ent.firstAt, e.timestamp);
    ent.lastAt = Math.max(ent.lastAt, e.timestamp);
    if (e.user_id) ent.users.add(e.user_id);
    if (e.app_version) ent.versions.add(e.app_version);
  }
  const errorTable = Array.from(agg.entries())
    .map(([message, info]) => ({
      message,
      firstAt: info.firstAt,
      lastAt: info.lastAt,
      count: info.count,
      affectedUsers: info.users.size,
      versions: Array.from(info.versions),
    }))
    .sort((a, b) => b.count - a.count);

  const byVersionTotal = new Map<string, number>();
  const byVersionErr = new Map<string, number>();
  for (const e of all) {
    const v = e.app_version || "unknown";
    byVersionTotal.set(v, (byVersionTotal.get(v) || 0) + 1);
  }
  for (const e of errs) {
    const v = e.app_version || "unknown";
    byVersionErr.set(v, (byVersionErr.get(v) || 0) + 1);
  }
  const versionHealth = Array.from(byVersionTotal.entries())
    .map(([version, total]) => ({
      version, total,
      errors: byVersionErr.get(version) || 0,
      errorRatePerMille: total > 0 ? Math.round(((byVersionErr.get(version) || 0) / total) * 10000) / 10 : 0,
    }))
    .sort((a, b) => b.errorRatePerMille - a.errorRatePerMille);

  return { hourly, errorTable, versionHealth };
}
```

- [ ] **Step 2: 部署 + curl + SQL 校验**

- [ ] **Step 3: 提交**

```powershell
git add supabase/functions/get-admin-trend/index.ts
git commit -m "feat: trend health（小时柱状/聚合表/版本健康对比）"
```

### Task 2.4: trendFeedback 实现

**Files:**
- Modify: `supabase/functions/get-admin-trend/index.ts`

- [ ] **Step 1: 替换 trendFeedback**

```typescript
async function trendFeedback(supabase: any, _tw: string, startMs: number) {
  const startIso = new Date(startMs).toISOString();
  const { data, error } = await supabase.from("feedback")
    .select("id, user_id, content, screenshot_path, app_version, created_at")
    .gte("created_at", startIso)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const emails = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailMap = new Map<string, string>();
  for (const u of (emails?.data?.users || [])) emailMap.set(u.id, u.email || "");

  const list = (data || []).map((r: any) => ({
    id: r.id,
    ts: r.created_at,
    emailHint: (emailMap.get(r.user_id) || "").split("@")[0] || "anon",
    content: String(r.content || ""),
    screenshotPath: r.screenshot_path || null,
    appVersion: r.app_version || null,
  }));

  const ngrams = new Map<string, number>();
  for (const item of list) {
    const text = item.content.replace(/\s+/g, "");
    for (let i = 0; i < text.length - 1; i++) {
      const g = text.slice(i, i + 2);
      if (/^[一-鿿]{2}$/.test(g)) {
        ngrams.set(g, (ngrams.get(g) || 0) + 1);
      }
    }
  }
  const keywords = Array.from(ngrams.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return { list, keywords };
}
```

- [ ] **Step 2: 部署 + curl + 抽样校验**

- [ ] **Step 3: 提交**

```powershell
git add supabase/functions/get-admin-trend/index.ts
git commit -m "feat: trend feedback（分页 list + 关键词 top20）"
```

### Task 2.5: trendContent 实现

**Files:**
- Modify: `supabase/functions/get-admin-trend/index.ts`

- [ ] **Step 1: 替换 trendContent**

```typescript
async function trendContent(supabase: any, _tw: string, startMs: number) {
  const startIso = new Date(startMs).toISOString();
  const [featured, allSubs, windowSubs, personals, cards] = await Promise.all([
    supabase.from("decks").select("id, title").eq("is_featured", true),
    supabase.from("deck_subscriptions").select("deck_id, user_id, subscribed_at"),
    supabase.from("deck_subscriptions").select("deck_id, user_id, subscribed_at").gte("subscribed_at", startIso),
    supabase.from("personal_decks").select("id, owner_id"),
    supabase.from("deck_cards").select("deck_id"),
  ]);

  const featuredIds = new Set((featured.data || []).map((d: any) => d.id));
  const subsByDeck = new Map<string, Set<string>>();
  for (const s of (allSubs.data || [])) {
    if (!featuredIds.has(s.deck_id)) continue;
    if (!subsByDeck.has(s.deck_id)) subsByDeck.set(s.deck_id, new Set());
    subsByDeck.get(s.deck_id)!.add(s.user_id);
  }
  const windowSubsByDeck = new Map<string, number>();
  for (const s of (windowSubs.data || [])) {
    if (!featuredIds.has(s.deck_id)) continue;
    windowSubsByDeck.set(s.deck_id, (windowSubsByDeck.get(s.deck_id) || 0) + 1);
  }
  const featuredTable = (featured.data || []).map((d: any) => ({
    id: d.id,
    title: d.title,
    totalSubs: subsByDeck.get(d.id)?.size || 0,
    windowSubs: windowSubsByDeck.get(d.id) || 0,
  })).sort((a: any, b: any) => b.totalSubs - a.totalSubs);

  const cardsByDeck = new Map<string, number>();
  for (const c of (cards.data || [])) cardsByDeck.set(c.deck_id, (cardsByDeck.get(c.deck_id) || 0) + 1);
  const decksByOwner = new Map<string, number>();
  for (const p of (personals.data || [])) decksByOwner.set(p.owner_id, (decksByOwner.get(p.owner_id) || 0) + 1);

  const deckCountHistogram: Record<string, number> = {};
  for (const n of decksByOwner.values()) {
    const bucket = n >= 10 ? "10+" : String(n);
    deckCountHistogram[bucket] = (deckCountHistogram[bucket] || 0) + 1;
  }
  const cardCountHistogram: Record<string, number> = {};
  for (const p of (personals.data || [])) {
    const n = cardsByDeck.get(p.id) || 0;
    const bucket = n === 0 ? "0" : n < 5 ? "1-4" : n < 20 ? "5-19" : n < 50 ? "20-49" : "50+";
    cardCountHistogram[bucket] = (cardCountHistogram[bucket] || 0) + 1;
  }

  return { featuredTable, personalDistribution: { deckCountHistogram, cardCountHistogram } };
}
```

- [ ] **Step 2: 部署 + curl + SQL 校验**

- [ ] **Step 3: 提交**

```powershell
git add supabase/functions/get-admin-trend/index.ts
git commit -m "feat: trend content（精选表/个人分布直方图）"
```

---

## Phase 3 — 前端 yihai_admin_v2.html

### Task 3.1: 创建 Playwright 冒烟测试（先写 / 测试驱动）

**Files:**
- Create: `tests/_pw_admin_v2.js`

- [ ] **Step 1: 写测试骨架**

```javascript
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD;

if (!TEST_PASSWORD) {
  console.error('Set TEST_PASSWORD env var');
  process.exit(2);
}

let passed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { console.error('  ✗', msg); process.exitCode = 1; }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${BASE}/yihai_admin_v2.html`);

  await page.fill('#login-email', TEST_EMAIL);
  await page.fill('#login-pwd', TEST_PASSWORD);
  await page.click('#login-btn');

  await page.waitForSelector('#screen-main.active', { timeout: 15000 });
  assert(true, '管理员登录后进入主屏');

  await page.waitForSelector('[data-quadrant="growth"] .kpi-strip .kpi-value', { timeout: 15000 });
  const growthKpis = await page.$$eval('[data-quadrant="growth"] .kpi-strip .kpi-value', els => els.map(e => e.textContent));
  assert(growthKpis.length === 4, `growth 象限 4 个 KPI（实际 ${growthKpis.length}）`);

  for (const q of ['health', 'feedback', 'content']) {
    await page.waitForSelector(`[data-quadrant="${q}"] .kpi-strip .kpi-value`, { timeout: 15000 });
    const kpis = await page.$$eval(`[data-quadrant="${q}"] .kpi-strip .kpi-value`, els => els.length);
    assert(kpis === 4, `${q} 象限 4 个 KPI`);
  }

  await page.click('[data-tw="24h"]');
  await page.waitForTimeout(500);
  assert((await page.$$eval('[data-tw="24h"].active', els => els.length)) === 1, '24h 时间窗高亮');

  await page.click('[data-quadrant="feedback"] .quadrant-expand');
  await page.waitForSelector('.drawer.active', { timeout: 10000 });
  assert(true, '反馈抽屉打开');
  await page.click('.drawer-close');
  await page.waitForSelector('.drawer:not(.active)', { timeout: 5000 });

  const url = new URL(page.url());
  assert(url.hash.includes('tw=24h'), 'URL hash 含时间窗');

  await ctx.clearCookies();
  await ctx.storageState({ path: '/dev/null' }).catch(() => {});
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/yihai_admin_v2.html`);
  await page2.fill('#login-email', 'test+nonadmin@example.com');
  await page2.fill('#login-pwd', 'wrongpass');
  await page2.click('#login-btn');
  await page2.waitForTimeout(2000);
  assert(!(await page2.$('#screen-main.active')), '非管理员不能进入');

  console.log(`\n${passed} 断言通过`);
  await browser.close();
})();
```

- [ ] **Step 2: 跑测试确认失败（v2 文件还不存在）**

```powershell
python -m http.server 8080 --directory C:\code
# 另一窗口
$env:TEST_PASSWORD="667788"; node tests/_pw_admin_v2.js
```

期望：失败在 `page.goto` 后 404 / login 元素找不到。

- [ ] **Step 3: 提交（测试先行）**

```powershell
git add tests/_pw_admin_v2.js
git commit -m "test: _pw_admin_v2 冒烟（红，待实现 v2）"
```

### Task 3.2: 创建 v2 HTML 骨架（loading / login / main 三屏）

**Files:**
- Create: `yihai_admin_v2.html`

- [ ] **Step 1: 复制 v1 作为基础**

```powershell
Copy-Item C:\code\yihai_admin_v1.html C:\code\yihai_admin_v2.html
```

- [ ] **Step 2: 把 v1 删干净到三屏骨架**

打开 `yihai_admin_v2.html`，做这些改动：
1. 标题改为 `<title>忆海拾光 · 运营</title>`
2. 把 `<body>` 内容删到只剩：`#screen-loading`、`#screen-login`、`#screen-main`（main 内仅留 topbar + 一个空 `<div id="grid-content"></div>`）；删 `#detail-overlay` 和 `#detail-panel`、`#mobile-tabs`
3. 删 v1 sidebar 和 cards 视图相关 CSS
4. `<script>` 块清空到只剩：`SUPABASE_URL` / `SUPABASE_ANON_KEY`（沿用 v1 的值）、`ADMIN_VERSION='2.0.0'`、`DOMContentLoaded` handler、`doLogin`、`doLogout`、`showLogin`、`enterMain`、`callEdgeFunction` 工具函数
5. `enterMain` 内仅渲染 topbar 和空 grid，不调任何业务接口
6. 把 v1 中 admin 顶层标题从 "管理看板" 改为 "运营"

具体替换示例（topbar 部分）：

```html
<div class="topbar">
  <div class="topbar-left">
    <div class="topbar-logo">忆海拾光<span> · 运营</span></div>
  </div>
  <div class="topbar-right">
    <div class="tw-selector" id="tw-selector">
      <button data-tw="24h">24h</button>
      <button data-tw="7d" class="active">7d</button>
      <button data-tw="30d">30d</button>
    </div>
    <button class="btn-icon" onclick="reloadOverview()" title="刷新">🔄</button>
    <span id="admin-name" style="font-size:13px;color:var(--text2);"></span>
    <button class="btn-text" onclick="doLogout()">退出</button>
  </div>
</div>

<div class="main-wrap">
  <div id="grid-content"></div>
</div>
```

`callEdgeFunction` 沿用 v1 原样。

- [ ] **Step 3: 跑测试**

```powershell
$env:TEST_PASSWORD="667788"; node tests/_pw_admin_v2.js
```

期望：登录通过、`screen-main` 出现这两条 ✓ 通过；KPI 4 个 × 4 象限 4 条 ✗ 失败；时间窗高亮 ✓ 也可能因为 active 默认 7d 而通过，但抽屉 ✗ 失败。

- [ ] **Step 4: 提交**

```powershell
git add yihai_admin_v2.html
git commit -m "feat: yihai_admin_v2 三屏骨架 + topbar + 时间窗按钮"
```

### Task 3.3: Bento Grid CSS + 4 空象限卡片

**Files:**
- Modify: `yihai_admin_v2.html`

- [ ] **Step 1: 在 `<style>` 块加 Bento CSS**

```css
.main-wrap { padding: 20px; max-width: 1400px; margin: 0 auto; }
.bento-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.quadrant {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: var(--shadow);
  display: flex; flex-direction: column; gap: 12px;
}
.quadrant-title { font-size: 16px; font-weight: 600; }
.kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.kpi-cell { background: var(--bg); border-radius: var(--radius-sm); padding: 10px; }
.kpi-label { font-size: 12px; color: var(--text3); }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--text); }
.quadrant-body { min-height: 100px; }
.quadrant-expand { align-self: flex-end; background: none; border: none; color: var(--primary); cursor: pointer; font-size: 13px; }
.tw-selector { display: inline-flex; gap: 2px; background: var(--bg); border-radius: var(--radius-sm); padding: 2px; }
.tw-selector button { padding: 4px 12px; background: transparent; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; color: var(--text2); }
.tw-selector button.active { background: var(--surface); color: var(--primary); font-weight: 600; }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 18px; padding: 4px 8px; }
@media (max-width: 768px) {
  .bento-grid { grid-template-columns: 1fr; }
  .kpi-strip { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 2: 在 `enterMain` 中渲染 4 个空象限**

```javascript
function enterMain() {
  document.getElementById('screen-loading').classList.remove('active');
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('screen-main').classList.add('active');
  document.getElementById('admin-name').textContent = _adminInfo?.displayName || '';
  renderGridShell();
  bindTimeWindow();
  loadOverview();
}

function renderGridShell() {
  const titles = {
    growth: '① 增长 / 活跃',
    health: '② 系统健康',
    feedback: '③ 反馈收件箱',
    content: '④ 内容运营',
  };
  const grid = document.getElementById('grid-content');
  grid.innerHTML = `<div class="bento-grid">${
    ['growth','health','feedback','content'].map(q => `
      <div class="quadrant" data-quadrant="${q}">
        <div class="quadrant-title">${titles[q]}</div>
        <div class="kpi-strip">${
          [0,1,2,3].map(i => `
            <div class="kpi-cell">
              <div class="kpi-label">—</div>
              <div class="kpi-value">—</div>
            </div>
          `).join('')
        }</div>
        <div class="quadrant-body" id="body-${q}"></div>
        <button class="quadrant-expand" onclick="openDrawer('${q}')">展开 →</button>
      </div>
    `).join('')
  }</div>`;
}

function bindTimeWindow() {
  document.querySelectorAll('.tw-selector button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tw-selector button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _timeWindow = btn.dataset.tw;
      location.hash = `tw=${_timeWindow}`;
      loadOverview();
    });
  });
  const m = (location.hash || '').match(/tw=(24h|7d|30d)/);
  if (m) {
    _timeWindow = m[1];
    document.querySelectorAll('.tw-selector button').forEach(b => b.classList.toggle('active', b.dataset.tw === _timeWindow));
  }
}

function reloadOverview() { loadOverview(); }
function loadOverview() { /* Task 3.4 实现 */ }
function openDrawer(_q) { /* Task 3.5 实现 */ }

let _timeWindow = '7d';
```

- [ ] **Step 3: 跑测试**

```powershell
$env:TEST_PASSWORD="667788"; node tests/_pw_admin_v2.js
```

期望：象限渲染 + KPI 4 个 × 4 ✓ 通过（值是 "—"）；URL hash 切换 ✓ 通过；抽屉 ✗ 失败（还没实现）。

- [ ] **Step 4: 提交**

```powershell
git add yihai_admin_v2.html
git commit -m "feat: Bento Grid 4 象限骨架 + 时间窗高亮/hash 持久化"
```

### Task 3.4: loadOverview — 调聚合接口并填充 KPI + 卡内迷你内容

**Files:**
- Modify: `yihai_admin_v2.html`

- [ ] **Step 1: 实现 loadOverview**

```javascript
async function loadOverview() {
  try {
    const result = await callEdgeFunction('get-admin-overview', null, `?timeWindow=${_timeWindow}`);
    fillGrowth(result.growth);
    fillHealth(result.health);
    fillFeedback(result.feedback);
    fillContent(result.content);
  } catch (e) {
    console.error('loadOverview', e);
  }
}

function fillKpi(q, defs) {
  const cells = document.querySelectorAll(`[data-quadrant="${q}"] .kpi-cell`);
  defs.forEach((def, i) => {
    if (!cells[i]) return;
    cells[i].querySelector('.kpi-label').textContent = def.label;
    cells[i].querySelector('.kpi-value').textContent = def.value;
  });
}

function fillGrowth(g) {
  if (!g.ok) { document.getElementById('body-growth').textContent = `加载失败：${g.error}`; return; }
  fillKpi('growth', [
    { label: 'DAU', value: g.kpi.dauAvg },
    { label: '新增用户', value: g.kpi.newUsers },
    { label: '答题数', value: g.kpi.totalTrials },
    { label: '留存率', value: g.kpi.retention == null ? '—' : `${g.kpi.retention}%` },
  ]);
  const max = Math.max(1, ...g.miniChart.map(p => p.dau));
  document.getElementById('body-growth').innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:2px;height:60px;">
      ${g.miniChart.map(p => `<div style="flex:1;background:var(--primary);height:${(p.dau/max)*100}%;" title="${p.date}: ${p.dau}"></div>`).join('')}
    </div>`;
}

function fillHealth(h) {
  if (!h.ok) { document.getElementById('body-health').textContent = `加载失败：${h.error}`; return; }
  fillKpi('health', [
    { label: 'JS 错误', value: h.kpi.jsErrors },
    { label: '影响用户', value: h.kpi.affectedUsers },
    { label: '同步失败', value: h.kpi.syncFailures },
    { label: '错误率‰', value: h.kpi.errorRatePerMille },
  ]);
  document.getElementById('body-health').innerHTML = `
    <table style="width:100%;font-size:12px;">
      ${(h.topErrors || []).map(e => `
        <tr><td style="padding:4px 0;color:var(--text2);">${escapeHtml(e.message.slice(0,60))}</td>
        <td style="text-align:right;color:var(--danger);">${e.count}</td>
        <td style="text-align:right;color:var(--text3);">/${e.affectedUsers}人</td></tr>`).join('')}
    </table>`;
}

function fillFeedback(f) {
  if (!f.ok) { document.getElementById('body-feedback').textContent = `加载失败：${f.error}`; return; }
  fillKpi('feedback', [
    { label: '窗口未读', value: f.kpi.windowCount },
    { label: '总计', value: f.kpi.totalCount },
    { label: '含截图', value: f.kpi.withScreenshots },
    { label: '不同用户', value: f.kpi.uniqueUsers },
  ]);
  document.getElementById('body-feedback').innerHTML = `
    <ul style="list-style:none;font-size:12px;">
      ${(f.recent || []).map(r => `
        <li style="padding:6px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text3);">${new Date(r.ts).toLocaleDateString()}</span>
          <span style="color:var(--text);">${escapeHtml(r.emailHint)}</span>
          ${r.hasScreenshot ? '📎' : ''}
          <div style="color:var(--text2);">${escapeHtml(r.contentPreview)}</div>
        </li>`).join('')}
    </ul>`;
}

function fillContent(c) {
  if (!c.ok) { document.getElementById('body-content').textContent = `加载失败：${c.error}`; return; }
  fillKpi('content', [
    { label: '精选数', value: c.kpi.featuredCount },
    { label: '总订阅', value: c.kpi.totalSubscriptions },
    { label: '窗口新订阅', value: c.kpi.windowNewSubs },
    { label: '窗口新建', value: c.kpi.newPersonalDecks },
  ]);
  document.getElementById('body-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">
      <div><div style="color:var(--text3);">精选 top5</div>${
        (c.featuredTop5 || []).map(d => `<div>${escapeHtml(d.title)} <span style="color:var(--text3);">+${d.windowSubs}</span></div>`).join('')
      }</div>
      <div><div style="color:var(--text3);">个人 top5</div>${
        (c.personalTop5 || []).map(d => `<div>${escapeHtml(d.title)} <span style="color:var(--text3);">${d.cardCount}卡</span></div>`).join('')
      }</div>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
}
```

- [ ] **Step 2: 修 `callEdgeFunction` 兼容查询串**

如果 v1 的 `callEdgeFunction(name, body)` 不接受 query 参数，扩展签名为 `callEdgeFunction(name, body, querySuffix='')`。

```javascript
async function callEdgeFunction(name, body, querySuffix='') {
  const session = (await _sb.auth.getSession()).data.session;
  if (!session) throw new Error('not logged in');
  const url = `${SUPABASE_URL}/functions/v1/${name}${querySuffix}`;
  const r = await fetch(url, {
    method: body == null ? 'GET' : 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}
```

- [ ] **Step 3: 手动验证**

浏览器开 `http://localhost:8080/yihai_admin_v2.html`，登录看四象限是否有真实数字。

- [ ] **Step 4: 跑测试**

```powershell
$env:TEST_PASSWORD="667788"; node tests/_pw_admin_v2.js
```

期望：除"抽屉打开"外全部 ✓。

- [ ] **Step 5: 提交**

```powershell
git add yihai_admin_v2.html
git commit -m "feat: loadOverview 拉取聚合数据 + 4 象限 KPI/迷你图渲染"
```

### Task 3.5: 抽屉 panel + 4 象限懒加载

**Files:**
- Modify: `yihai_admin_v2.html`

- [ ] **Step 1: 加抽屉 CSS + DOM**

CSS：
```css
.drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 50; }
.drawer-overlay.active { opacity: 1; pointer-events: auto; }
.drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 60vw; max-width: 800px; background: var(--surface); transform: translateX(100%); transition: transform 0.25s; z-index: 51; display: flex; flex-direction: column; }
.drawer.active { transform: translateX(0); }
.drawer-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
.drawer-body { padding: 20px; overflow-y: auto; flex: 1; }
.drawer-close { background: none; border: none; cursor: pointer; font-size: 20px; }
@media (max-width: 768px) { .drawer { width: 100vw; } }
```

`<body>` 末尾：
```html
<div class="drawer-overlay" id="drawer-overlay" onclick="closeDrawer()"></div>
<div class="drawer" id="drawer">
  <div class="drawer-header">
    <h2 id="drawer-title">详情</h2>
    <button class="drawer-close" onclick="closeDrawer()">✕</button>
  </div>
  <div class="drawer-body" id="drawer-body"></div>
</div>
```

- [ ] **Step 2: JS 实现 open/close + 懒加载**

```javascript
async function openDrawer(q) {
  const titles = { growth: '增长 / 活跃 趋势', health: '系统健康 详情', feedback: '反馈 全量', content: '内容运营 详情' };
  document.getElementById('drawer-title').textContent = titles[q];
  document.getElementById('drawer-body').innerHTML = '<div style="padding:40px;text-align:center;">加载中…</div>';
  document.getElementById('drawer').classList.add('active');
  document.getElementById('drawer-overlay').classList.add('active');
  try {
    const result = await callEdgeFunction('get-admin-trend', null, `?timeWindow=${_timeWindow}&quadrant=${q}`);
    renderDrawer(q, result.data);
  } catch (e) {
    document.getElementById('drawer-body').innerHTML = `加载失败：${escapeHtml(e.message)}`;
  }
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('active');
  document.getElementById('drawer-overlay').classList.remove('active');
}

function renderDrawer(q, data) {
  const body = document.getElementById('drawer-body');
  if (q === 'growth') {
    body.innerHTML = `
      <h3>活跃用户（DAU/WAU/MAU）</h3>
      <pre style="font-size:11px;overflow:auto;">${escapeHtml(JSON.stringify(data.dauWauMau, null, 2))}</pre>
      <h3>新增注册</h3>
      <pre style="font-size:11px;overflow:auto;">${escapeHtml(JSON.stringify(data.newSignupsSeries, null, 2))}</pre>
      <h3>版本分布</h3>
      <pre style="font-size:11px;overflow:auto;">${escapeHtml(JSON.stringify(data.versionPie, null, 2))}</pre>`;
  } else if (q === 'health') {
    body.innerHTML = `
      <h3>错误时间序列</h3>
      <pre style="font-size:11px;overflow:auto;">${escapeHtml(JSON.stringify(data.hourly, null, 2))}</pre>
      <h3>错误聚合（${data.errorTable.length} 条）</h3>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <tr><th align="left">message</th><th>次数</th><th>用户</th><th>版本</th></tr>
        ${data.errorTable.slice(0, 50).map(e => `
          <tr style="border-top:1px solid var(--border);">
            <td>${escapeHtml(e.message.slice(0,80))}</td>
            <td align="center">${e.count}</td>
            <td align="center">${e.affectedUsers}</td>
            <td>${e.versions.join(',')}</td>
          </tr>`).join('')}
      </table>
      <h3>版本健康度</h3>
      <pre style="font-size:11px;overflow:auto;">${escapeHtml(JSON.stringify(data.versionHealth, null, 2))}</pre>`;
  } else if (q === 'feedback') {
    body.innerHTML = `
      <input id="fb-filter" placeholder="搜索关键词…" style="width:100%;padding:8px;margin-bottom:10px;">
      <div id="fb-list">${
        data.list.map(r => `
          <div class="fb-item" data-content="${escapeHtml(r.content)}" style="padding:10px;border-bottom:1px solid var(--border);">
            <div style="color:var(--text3);font-size:12px;">${new Date(r.ts).toLocaleString()} · ${escapeHtml(r.emailHint)} · v${r.appVersion || '?'}</div>
            <div style="margin-top:4px;">${escapeHtml(r.content)}</div>
            ${r.screenshotPath ? `<a href="#" onclick="openShot('${r.screenshotPath}');return false;">📎 截图</a>` : ''}
          </div>`).join('')
      }</div>
      <h3 style="margin-top:20px;">关键词频率 top20</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${data.keywords.map(k => `<span style="background:var(--bg);padding:2px 8px;border-radius:10px;font-size:${10 + Math.min(10, k.count)}px;">${escapeHtml(k.term)} ${k.count}</span>`).join('')}
      </div>`;
    document.getElementById('fb-filter').addEventListener('input', (e) => {
      const kw = e.target.value;
      document.querySelectorAll('.fb-item').forEach(it => {
        it.style.display = it.dataset.content.includes(kw) ? '' : 'none';
      });
    });
  } else {
    body.innerHTML = `
      <h3>精选牌组</h3>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <tr><th align="left">title</th><th>累计订阅</th><th>窗口新增</th></tr>
        ${data.featuredTable.map(d => `
          <tr style="border-top:1px solid var(--border);">
            <td>${escapeHtml(d.title)}</td><td align="center">${d.totalSubs}</td><td align="center">${d.windowSubs}</td>
          </tr>`).join('')}
      </table>
      <h3>个人牌组分布</h3>
      <pre style="font-size:11px;overflow:auto;">${escapeHtml(JSON.stringify(data.personalDistribution, null, 2))}</pre>`;
  }
}

async function openShot(path) {
  try {
    const r = await callEdgeFunction('sign-private-url', { path });
    if (r.url) window.open(r.url, '_blank');
  } catch (e) {
    alert('签名失败：' + e.message);
  }
}
```

- [ ] **Step 3: 跑测试**

```powershell
$env:TEST_PASSWORD="667788"; node tests/_pw_admin_v2.js
```

期望：所有断言 ✓。

- [ ] **Step 4: 浏览器手测**

打开 v2，登录，点每个象限的"展开 →"，检查抽屉内容渲染。点截图链接确认 sign-private-url 工作。

- [ ] **Step 5: 提交**

```powershell
git add yihai_admin_v2.html
git commit -m "feat: 抽屉 panel + 4 象限懒加载趋势内容 + 反馈截图签名链接"
```

---

## Phase 4 — 文档同步

### Task 4.1: 更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 在 Key Files 当前版本表加 v2 行**

找到 `| yihai_admin_v1.html | 管理看板（监控面板，Supabase Edge Functions） |` 这行，**保留**，下方加：

```markdown
| `yihai_admin_v2.html` | 运营驾驶舱（v2，Bento Grid 单页，纯只读，自用验证期与 v1 并存） |
```

- [ ] **Step 2: 测试表加 _pw_admin_v2.js**

在测试表末尾加：

```markdown
| `tests/_pw_admin_v2.js` | admin v2 冒烟（登录/四象限 KPI/时间窗/抽屉/sign-private-url，~15 断言，需登录） |
```

- [ ] **Step 3: 提交**

```powershell
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 同步 admin v2 文件 + 测试"
```

### Task 4.2: 变更记录追加

**Files:**
- Modify: `docs/yihai_变更记录_CLAUDE参考.md`

- [ ] **Step 1: 在最新位置追加**

```markdown
## yihai_admin_v2.html — 运营驾驶舱（2026-06-14）

废弃 v1 医生/家属监控定位。重设计为单人产品/运营驾驶舱：单页 Bento Grid 四象限（增长活跃 / 系统健康 / 用户反馈 / 内容运营），纯只读，点击展开右侧抽屉看趋势详情。新增 2 个 Edge Functions（get-admin-overview / get-admin-trend），沿用 admin-auth-check 鉴权和 sign-private-url 截图签名。v1 文件并存观察 1–2 周后清理，连同 8 个废弃 Edge Functions 一并删除。
```

- [ ] **Step 2: 提交**

```powershell
git add docs/yihai_变更记录_CLAUDE参考.md
git commit -m "docs: 变更记录追加 admin v2"
```

---

## Phase 5 — 上线确认

### Task 5.1: 部署确认

- [ ] **Step 1: 确认 2 个新 Edge Functions 已部署到 prod**

```
mcp__supabase__list_edge_functions
```

期望列表含 `get-admin-overview`、`get-admin-trend`。

- [ ] **Step 2: 跑全套 Playwright 冒烟**

```powershell
$env:TEST_PASSWORD="667788"
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
node tests/_pw_admin_v2.js
```

期望：全 ✓。

- [ ] **Step 3: 跑单元测试全量**

```powershell
node tests/run_all.js
```

期望：667 断言全过（admin v2 不影响主 app 单测）。

### Task 5.2: 用户自用确认期开始

- [ ] **Step 1: 在浏览器打开 prod 上的 admin v2**

URL：`https://katelynmichelin976-wq.github.io/ReminiSea/yihai_admin_v2.html`（GitHub Pages 自动部署）

- [ ] **Step 2: 报告**

向用户说明：v2 已上线，并存 v1。自用 1–2 周后，确认 v2 OK，再启动清理任务（删 v1 文件 + 8 个废弃 Edge Function），那部分单独开 PR，不在本计划范围。

---

## 范围外（明确不做）

- **不删除 v1 文件和废弃 Edge Functions**：等自用 1–2 周确认后单独走清理 PR
- **不做实时推送**：所有数据按时间窗一次拉
- **不做多管理员权限**：仅你一人 admin
- **不做写操作**：spec 范围外
- **不做用户个人钻入**：spec 范围外
- **不发布主 app 版本**：admin v2 不绑 `APP_VERSION`；本计划完全不动 `index.html`
