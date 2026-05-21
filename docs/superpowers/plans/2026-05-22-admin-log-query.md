# Admin 日志查询功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理看板患者详情面板新增「日志」子 Tab，支持查看答题流水（sync_trials）和应用事件（app_events），按今天/近7天/近30天快捷筛选。

**Architecture:** 扩展现有 `get-patient-calendar` Edge Function，新增 `days` 参数路径返回跨天答题流水；新建 `get-patient-events` Edge Function 查询 `app_events`；前端新增「日志」子 Tab 含切换开关与快捷时段按钮。

**Tech Stack:** Deno + TypeScript（Edge Functions）、单文件 HTML 内联 JS、Supabase JS SDK v2、Supabase MCP 工具部署

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `supabase/functions/get-patient-calendar/index.ts` | 修改 | 新增 `days` 查询分支（不影响原有月历路径） |
| `supabase/functions/get-patient-events/index.ts` | 新建 | 查询 `app_events` 表 |
| `yihai_admin_v1.html` | 修改 | 新增「日志」子 Tab、JS 渲染函数、CSS |

---

## Task 1: 扩展 get-patient-calendar — 支持 `days` 跨天查询

**Files:**
- Modify: `supabase/functions/get-patient-calendar/index.ts:73-77`

- [ ] **Step 1: 修改参数解构与校验逻辑**

将 `index.ts` 第 73-77 行替换为以下内容（在原有 `year/month/date` 路径之前插入 `days` 分支）：

```ts
    const { userId, year, month, date, days } = await req.json();

    if (!userId) {
      return errorResponse(400, "Missing required parameter: userId");
    }

    // days 路径：跨天答题流水（用于日志查询 Tab）
    if (days && !year && !month) {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - (Number(days) - 1));
      const startStr = startDate.toISOString().split("T")[0];

      const { data: trials } = await supabase
        .from("sync_trials")
        .select("trial_id, card_id, deck_key, rating, is_correct, response_time_ms, srs_stage_before, srs_stage_after, timestamp")
        .eq("user_id", userId)
        .gte("trial_date", startStr)
        .order("timestamp", { ascending: false })
        .limit(200);

      const nameMap = new Map<string, string>();
      const cardIds = [...new Set((trials || []).map(t => t.card_id))];
      if (cardIds.length > 0) {
        const { data: cardsPool } = await supabase
          .from("cards_pool")
          .select("card_id, card_name")
          .in("card_id", cardIds);
        if (cardsPool) {
          for (const c of cardsPool) nameMap.set(c.card_id, c.card_name);
        }
      }

      const response: CalendarResponse = {
        year: 0, month: 0, days: [],
        trials: (trials || []).map(t => ({
          trialId: t.trial_id,
          cardId: t.card_id,
          cardName: nameMap.get(t.card_id) || t.card_id,
          deckKey: t.deck_key,
          rating: t.rating,
          isCorrect: t.is_correct,
          responseTimeMs: t.response_time_ms,
          srsStageBefore: t.srs_stage_before,
          srsStageAfter: t.srs_stage_after,
          timestamp: t.timestamp,
        })),
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (!year || !month) {
      return errorResponse(400, "Missing required parameters: year, month");
    }
```

> 原来的 `if (!userId || !year || !month)` 整行删除（已被上方代码替代）。原有月历逻辑从 "Build date range for the month" 注释行起保持不变。

- [ ] **Step 2: 用 Supabase MCP 部署函数**

调用 `mcp__supabase__deploy_edge_function`，参数：
```json
{ "function_name": "get-patient-calendar" }
```

预期：部署成功，返回函数 URL。

- [ ] **Step 3: 在浏览器 DevTools 快速验证**

打开 admin 看板登录，在 Console 执行（替换 `YOUR_TOKEN` 和 `PATIENT_USER_ID`）：

```js
fetch('https://juzkonrzfyvchqxzmlpr.supabase.co/functions/v1/get-patient-calendar', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'PATIENT_USER_ID', days: 7 })
}).then(r => r.json()).then(console.log);
```

预期：返回 `{ year: 0, month: 0, days: [], trials: [...] }`，`trials` 数组包含最近 7 天的答题记录。

---

## Task 2: 新建 get-patient-events Edge Function

**Files:**
- Create: `supabase/functions/get-patient-events/index.ts`

- [ ] **Step 1: 创建函数文件**

新建 `supabase/functions/get-patient-events/index.ts`，完整内容如下：

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}
function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  return null;
}
function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireAdmin(
  req: Request,
): Promise<{ userId: string; displayName: string; role: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer "))
    throw new Error("Missing or invalid Authorization header");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || !user)
    throw new Error("Invalid token: " + (userError?.message || "no user"));
  const { data: admin, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id, role, display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminError) throw new Error("Database error: " + adminError.message);
  if (!admin) throw new Error("Unauthorized: not an admin user");
  return { userId: user.id, displayName: admin.display_name, role: admin.role };
}

interface EventRecord {
  eventId: string;
  eventType: string;
  deckKey: string;
  payload: Record<string, unknown>;
  deviceId: string;
  timestamp: number;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAdmin(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return errorResponse(
      msg.includes("Unauthorized") || msg.includes("Invalid token") ? 403 : 500,
      msg,
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { userId, days } = await req.json();

    if (!userId || !days) {
      return errorResponse(400, "Missing required parameters: userId, days");
    }

    // 对齐到 N 天前的当天零点
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (Number(days) - 1));
    startDate.setHours(0, 0, 0, 0);
    const cutoffTs = startDate.getTime();

    const { data: events, error } = await supabase
      .from("app_events")
      .select("event_id, event_type, deck_key, payload, device_id, timestamp")
      .eq("user_id", userId)
      .gte("timestamp", cutoffTs)
      .order("timestamp", { ascending: false })
      .limit(200);

    if (error) throw error;

    const response = {
      events: (events || []).map(
        (e): EventRecord => ({
          eventId: e.event_id,
          eventType: e.event_type,
          deckKey: e.deck_key || "",
          payload: e.payload || {},
          deviceId: e.device_id,
          timestamp: e.timestamp,
        }),
      ),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[get-patient-events]", msg);
    return errorResponse(500, msg);
  }
});
```

- [ ] **Step 2: 用 Supabase MCP 部署函数**

调用 `mcp__supabase__deploy_edge_function`，参数：
```json
{ "function_name": "get-patient-events" }
```

预期：部署成功，返回函数 URL。

- [ ] **Step 3: 在 DevTools 验证**

```js
fetch('https://juzkonrzfyvchqxzmlpr.supabase.co/functions/v1/get-patient-events', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'PATIENT_USER_ID', days: 7 })
}).then(r => r.json()).then(console.log);
```

预期：返回 `{ events: [...] }`，每条含 `eventId, eventType, deckKey, payload, deviceId, timestamp`。

- [ ] **Step 4: Commit**

```
git add supabase/functions/get-patient-events/index.ts
git add supabase/functions/get-patient-calendar/index.ts
git commit -m "feat: admin 日志查询 — 新建 get-patient-events + 扩展 get-patient-calendar days 路径"
```

---

## Task 3: HTML — CSS 新增 + 「日志」子 Tab 按钮

**Files:**
- Modify: `yihai_admin_v1.html`

- [ ] **Step 1: 在 `</style>` 前插入新 CSS 规则**

在 `yihai_admin_v1.html` 中找到 `.content::-webkit-scrollbar-thumb:hover { background: #94a3b8; border-radius: 3px; }` 这行之后、`/* ═══ Misc Utility ═══ */` 之前，插入：

```css
/* ── Log Day Filter ── */
.cal-nav-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.badge-default { background: #e2e8f0; color: #64748b; }
```

- [ ] **Step 2: 在患者详情面板新增「日志」子 Tab 按钮**

找到 `yihai_admin_v1.html` 中的：
```html
    <button class="detail-tab" data-subtab="config" onclick="switchDetailTab('config')">参数配置</button>
```
在其后追加：
```html
    <button class="detail-tab" data-subtab="logs" onclick="switchDetailTab('logs')">日志</button>
```

- [ ] **Step 3: 验证 Tab 出现**

打开 admin 看板，点击任意患者，确认详情面板顶部显示五个子 Tab：概览 / 月历 / 卡牌状态 / 参数配置 / 日志。点击「日志」Tab 目前会无响应（`switchDetailTab` 还无 case），属正常。

---

## Task 4: HTML — JS 状态变量与 switchDetailTab 扩展

**Files:**
- Modify: `yihai_admin_v1.html`

- [ ] **Step 1: 添加日志状态变量**

找到：
```js
var _configShowSrs = true, _configShowUi = true;
```
在其后追加：
```js
let _logSubType = 'trials'; // 'trials' | 'events'
let _logDays = 7;           // 1 | 7 | 30
```

- [ ] **Step 2: 在 switchDetailTab 添加 logs case**

找到：
```js
    case 'config':
      body.innerHTML = '<div class="skeleton" style="height:300px"></div>';
      await renderPatientConfig(_selectedPatientId, body);
      break;
```
在其后追加：
```js
    case 'logs':
      body.innerHTML = '<div class="skeleton" style="height:300px"></div>';
      await renderPatientLogs(_selectedPatientId, body);
      break;
```

---

## Task 5: HTML — 渲染函数

**Files:**
- Modify: `yihai_admin_v1.html`（在 `</script>` 前追加以下全部函数）

- [ ] **Step 1: 追加渲染函数**

在 `yihai_admin_v1.html` 的 `</script>` 标签前插入以下代码块：

```js
// ═══ Detail: Logs ═══

async function renderPatientLogs(userId, body) {
  body.innerHTML = buildLogHeaderHTML(userId) +
    '<div id="log-results"><div class="skeleton" style="height:200px"></div></div>';
  await loadPatientLogs(userId);
}

// 按钮点击时整体重渲染（确保按钮高亮与状态同步）
function reloadPatientLogs(userId) {
  renderPatientLogs(userId, document.getElementById('detail-body'));
}

function buildLogHeaderHTML(userId) {
  const dayBtns = [
    { label: '今天', val: 1 },
    { label: '近 7 天', val: 7 },
    { label: '近 30 天', val: 30 },
  ].map(b =>
    `<button class="cal-nav-btn${_logDays === b.val ? ' active' : ''}"
      onclick="_logDays=${b.val};reloadPatientLogs('${userId}')">${b.label}</button>`
  ).join('');

  const typeBtns = [
    { label: '答题记录', val: 'trials' },
    { label: '应用事件', val: 'events' },
  ].map(b =>
    `<button class="detail-tab${_logSubType === b.val ? ' active' : ''}"
      onclick="_logSubType='${b.val}';reloadPatientLogs('${userId}')">${b.label}</button>`
  ).join('');

  return `
    <div style="border-bottom:1px solid var(--border);margin-bottom:12px;display:flex;gap:0;">
      ${typeBtns}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      ${dayBtns}
    </div>
  `;
}

async function loadPatientLogs(userId) {
  const container = document.getElementById('log-results');
  if (!container) return;
  container.innerHTML = '<div class="skeleton" style="height:200px"></div>';
  try {
    if (_logSubType === 'trials') {
      const data = await callEdgeFunction('get-patient-calendar', { userId, days: _logDays });
      container.innerHTML = buildTrialLogHTML(data.trials || []);
    } else {
      const data = await callEdgeFunction('get-patient-events', { userId, days: _logDays });
      container.innerHTML = buildEventLogHTML(data.events || []);
    }
  } catch(e) {
    container.innerHTML = errorState('加载日志失败：' + e.message, "loadPatientLogs('" + userId + "')");
  }
}

function buildTrialLogHTML(trials) {
  if (!trials || trials.length === 0) return emptyState('该时段无答题记录');
  let rows = '';
  trials.forEach(t => {
    const ratingCls = t.rating === 'again' ? 'again' : t.rating === 'hard' ? 'hard'
      : t.rating === 'good' ? 'good' : 'easy';
    const ratingLabel = t.rating === 'again' ? '重来' : t.rating === 'hard' ? '困难'
      : t.rating === 'good' ? '良好' : '简单';
    const rt = t.responseTimeMs ? formatDuration(t.responseTimeMs) : '—';
    const before = srsStageLabel(t.srsStageBefore) || '?';
    const after = srsStageLabel(t.srsStageAfter) || '?';
    rows += `<tr>
      <td style="white-space:nowrap">${formatDate(t.timestamp)}</td>
      <td style="min-width:120px;word-break:break-all">${t.cardName || t.cardId}</td>
      <td style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.deckKey}</td>
      <td><span class="trial-rating ${ratingCls}">${ratingLabel}</span></td>
      <td style="white-space:nowrap">${rt}</td>
      <td style="white-space:nowrap">${before} → ${after}</td>
    </tr>`;
  });
  return `<div class="text-sm text-muted mb-2">共 ${trials.length} 条</div>
    <div class="table-wrap"><table>
    <thead><tr><th>时间</th><th>卡片名称</th><th>牌组</th><th>评分</th><th>响应</th><th>阶段变化</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function buildEventLogHTML(events) {
  if (!events || events.length === 0) return emptyState('该时段无应用事件');

  function eventBadge(type) {
    let cls = 'badge';
    if (type === 'login' || type === 'logout') cls += ' badge-primary';
    else if (type.startsWith('sync_')) cls += ' badge-success';
    else if (type === 'log:error') cls += ' badge-danger';
    else if (type === 'log:warn') cls += ' badge-warning';
    else cls += ' badge-default';
    return '<span class="' + cls + '">' + type + '</span>';
  }

  let rows = '';
  events.forEach(e => {
    const payloadStr = JSON.stringify(e.payload || {});
    const summary = payloadStr.length > 80 ? payloadStr.slice(0, 80) + '…' : payloadStr;
    rows += `<tr>
      <td style="white-space:nowrap">${formatDate(e.timestamp)}</td>
      <td>${eventBadge(e.eventType)}</td>
      <td style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.deckKey || '—'}</td>
      <td style="font-family:monospace;font-size:11px;max-width:200px;word-break:break-all">${summary}</td>
    </tr>`;
  });
  return `<div class="text-sm text-muted mb-2">共 ${events.length} 条</div>
    <div class="table-wrap"><table>
    <thead><tr><th>时间</th><th>事件类型</th><th>牌组</th><th>payload 摘要</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
```

- [ ] **Step 2: 在浏览器验证端到端功能**

1. 打开本地 admin 看板（`python -m http.server 8080` 或直接打开文件）
2. 登录管理员账号
3. 点击「患者」Tab → 选一个有数据的患者
4. 切换到「日志」子 Tab
5. 验证：
   - 默认显示「答题记录」+「近 7 天」，顶部两组按钮高亮正确
   - 表格显示答题记录（时间、卡片名称、牌组、评分、响应时间、阶段变化）
   - 切到「应用事件」，显示事件类型（badge 颜色对应 login/sync/error/warn）
   - 切换「今天」/「近 7 天」/「近 30 天」，重新加载并更新条数
   - 无数据时显示「该时段无答题记录」空状态
   - 接口失败时显示错误状态 + 重试按钮

- [ ] **Step 3: Commit**

```
git add yihai_admin_v1.html
git commit -m "feat: admin 患者详情新增「日志」子 Tab（答题记录 + 应用事件）"
```
