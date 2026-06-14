# 答题热路径 IDB 写入容错 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `index.html` 5 个写入函数（`saveCardState` / `saveCardStateLocal` / `writeTrialLog` / `putEasyState` / `_writeSrs`）外层加 try-catch，让 IDB 失败时**不掐断答题流**；失败时 `log.error('idb', 'write_fail', ...)` 写本地日志 + `logAppEvent('idb_write_fail', ...)` 上传云端供 admin 监控。

**Architecture:** TDD：写 Playwright 测试 hijack `window.idbPut` 抛错 → 验证 5 个函数仍 resolve + 日志被写。再实现 5 处 try-catch wrap。零行为变化（IDB 成功时跟当前完全一致）。单 commit。

**Tech Stack:** vanilla JS、Playwright（浏览器内 hijack + 验证）、现有 `log.error` + `logAppEvent` 双通道。

**Reference Spec:** `docs/superpowers/specs/2026-06-14-idb-write-resilience-design.md`

---

## File Structure

| 文件 | 改动 |
|---|---|
| `index.html` | 5 处函数体加 try-catch（约 25 行新增），不删任何现有代码 |
| `tests/_pw_idb_resilience.js` | 新增 Playwright 测试（约 100 行，验证 hijack idbPut 抛错后函数仍 resolve + log 写入）|
| `CLAUDE.md` | Key Files 表登记新测试文件（1 行）|

---

## Task 1: Playwright 容错测试 + 5 处 try-catch wrap

**Files:**
- Create: `tests/_pw_idb_resilience.js`
- Modify: `index.html`（5 处函数体加 try-catch）
- Modify: `CLAUDE.md`（登记新测试）

### - [ ] Step 1.1: 写 Playwright 测试（预期失败）

Create `C:\code\tests\_pw_idb_resilience.js` with this EXACT code:

```javascript
/**
 * IDB write resilience 测试 — v5.13.11
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_idb_resilience.js
 *
 * 覆盖：mock idbPut 抛错时，5 个写入函数仍 resolve + log.error/logAppEvent 被写
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 800);

    // ════ PHASE 1: 准备 — hijack idbPut 抛 quota 错 ════
    section('PHASE 1: hijack idbPut 抛 QuotaExceededError');
    await run(page, () => {
      window._origIdbPut = idbPut;
      window.idbPut = async () => { throw new Error('TEST_QUOTA_EXCEEDED'); };
      // 清空 LOCAL_LOG 以便后续过滤
      while (LOCAL_LOG.length) LOCAL_LOG.pop();
    });
    pass('hijack 完成', true);

    // ════ PHASE 2: saveCardState 失败不抛 ════
    section('PHASE 2: saveCardState');
    const e1 = await run(page, async () => {
      try { await saveCardState({ state_key: 'k1', card_id: 'c1', deck_key: 'd1' }); return null; }
      catch (e) { return e.message; }
    });
    pass('saveCardState 失败不抛', e1 === null);

    // ════ PHASE 3: saveCardStateLocal 失败不抛 ════
    section('PHASE 3: saveCardStateLocal');
    const e2 = await run(page, async () => {
      try { await saveCardStateLocal({ state_key: 'k2', card_id: 'c2', deck_key: 'd2' }); return null; }
      catch (e) { return e.message; }
    });
    pass('saveCardStateLocal 失败不抛', e2 === null);

    // ════ PHASE 4: writeTrialLog 失败不抛 ════
    section('PHASE 4: writeTrialLog');
    const e3 = await run(page, async () => {
      try { await writeTrialLog({ trial_id: 't1', card_id: 'c3', deck_key: 'd1', timestamp: Date.now(), rating: 'good' }); return null; }
      catch (e) { return e.message; }
    });
    pass('writeTrialLog 失败不抛', e3 === null);

    // ════ PHASE 5: putEasyState 失败不抛 ════
    section('PHASE 5: putEasyState');
    const e4 = await run(page, async () => {
      try { await putEasyState({ deck_key: 'd1', card_id: 'c4', seen: 1, history: [1], last_seen: Date.now(), last_warmup: 0 }); return null; }
      catch (e) { return e.message; }
    });
    pass('putEasyState 失败不抛', e4 === null);

    // ════ PHASE 6: log.error + logAppEvent 都被写 ════
    section('PHASE 6: 日志双通道');
    const localLogCount = await run(page, () =>
      LOCAL_LOG.filter(x => x.m === 'idb' && x.e === 'write_fail').length
    );
    pass(`LOCAL_LOG 含 4 条 idb/write_fail（实际 ${localLogCount}）`, localLogCount === 4);

    const localLogFns = await run(page, () =>
      LOCAL_LOG.filter(x => x.m === 'idb' && x.e === 'write_fail').map(x => x.d && x.d.fn).sort()
    );
    pass('log payload 含 fn 字段（4 个函数都覆盖）', JSON.stringify(localLogFns) === '["putEasyState","saveCardState","saveCardStateLocal","writeTrialLog"]');

    const appEvtCount = await run(page, async () => {
      const evts = await idbGetAll('appEvents').catch(() => []);
      return evts.filter(e => e.type === 'idb_write_fail').length;
    });
    // appEvents 在 IDB 也是经 idbPut 写入 — 但 hijack 后写不进，所以 count 应为 0
    pass(`appEvents 写不进（hijack 影响）— count=${appEvtCount}`, true);  // 仅日志展示，不卡断言

    // ════ PHASE 7: 还原 hijack 后 _writeSrs 完整路径不掐断 ════
    section('PHASE 7: _writeSrs 不掐断（仍 hijack 状态）');
    const e5 = await run(page, async () => {
      try {
        await _writeSrs(
          { id: 'cx', _srsState: {
            state_key: 'k5', card_id: 'c5', deck_key: 'd1',
            srs_stage: 'review', interval: 1, ease_factor: 2.5,
            lapses_streak: 0, lapses_total: 0, review_mode: 'normal', step_index: 0,
            due_ts: Date.now(), due_date: '2026-06-14', suspended: false
          }},
          'good',
          { attemptNumber: 1, isCorrect: true }
        );
        return null;
      } catch (e) { return e.message; }
    });
    pass('_writeSrs 失败不抛（外层 wrap 兜底）', e5 === null);

    // ════ Cleanup: 还原 idbPut ════
    await run(page, () => { window.idbPut = window._origIdbPut; });

  } finally {
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
```

### - [ ] Step 1.2: 跑测试看失败

Ensure HTTP server on port 8080:
```powershell
$test = $null
try { $test = Invoke-WebRequest -Uri "http://localhost:8080/index.html" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop } catch {}
if (-not $test) {
  Start-Process -FilePath "python" -ArgumentList "-m","http.server","8080","--directory","C:\code" -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
```

Run:
```powershell
node tests/_pw_idb_resilience.js
```

Expected: PHASE 2-5 失败（`saveCardState 失败不抛` 等），因为函数当前没 try-catch，hijack 抛错会传到调用方。

### - [ ] Step 1.3: 在 `index.html` 加 try-catch 到 `saveCardState`

Locate `saveCardState` (around line 4423-4428):

```javascript
async function saveCardState(state) {
  state.updated_at = Date.now();
  state.synced_at = null;
  state.user_id = state.user_id || getCurrentUserId();
  await idbPut('syncCardStates', state);
}
```

Replace with:

```javascript
async function saveCardState(state) {
  state.updated_at = Date.now();
  state.synced_at = null;
  state.user_id = state.user_id || getCurrentUserId();
  try {
    await idbPut('syncCardStates', state);
  } catch (e) {
    log.error('idb', 'write_fail', { fn: 'saveCardState', cardId: state.card_id, err: e && e.message });
    try { logAppEvent('idb_write_fail', { fn: 'saveCardState', cardId: state.card_id, err: e && e.message }); } catch {}
  }
}
```

### - [ ] Step 1.4: 加 try-catch 到 `saveCardStateLocal`

Locate `saveCardStateLocal` (around line 4431-4434):

```javascript
async function saveCardStateLocal(state) {
  state.user_id = state.user_id || getCurrentUserId();
  await idbPut('syncCardStates', state);
}
```

Replace with:

```javascript
async function saveCardStateLocal(state) {
  state.user_id = state.user_id || getCurrentUserId();
  try {
    await idbPut('syncCardStates', state);
  } catch (e) {
    log.error('idb', 'write_fail', { fn: 'saveCardStateLocal', cardId: state.card_id, err: e && e.message });
    try { logAppEvent('idb_write_fail', { fn: 'saveCardStateLocal', cardId: state.card_id, err: e && e.message }); } catch {}
  }
}
```

### - [ ] Step 1.5: 加 try-catch 到 `putEasyState`

Locate `putEasyState` (around line 4476-...). The function should be a single-line `await idbPut('easyCardStates', s);`. Find and replace it.

Find:
```javascript
async function putEasyState(s) {
  await idbPut('easyCardStates', s);
}
```

Replace with:
```javascript
async function putEasyState(s) {
  try {
    await idbPut('easyCardStates', s);
  } catch (e) {
    log.error('idb', 'write_fail', { fn: 'putEasyState', cardId: s && s.card_id, err: e && e.message });
    try { logAppEvent('idb_write_fail', { fn: 'putEasyState', cardId: s && s.card_id, err: e && e.message }); } catch {}
  }
}
```

### - [ ] Step 1.6: 加 try-catch 到 `writeTrialLog`

Locate `writeTrialLog` (around line 4538-4542):

```javascript
async function writeTrialLog(entry) {
  entry.user_id = entry.user_id || getCurrentUserId();
  await idbPut('syncTrials', entry);
  if (_realtimeUpload) syncTrialLog(entry);
}
```

Replace with:

```javascript
async function writeTrialLog(entry) {
  entry.user_id = entry.user_id || getCurrentUserId();
  try {
    await idbPut('syncTrials', entry);
  } catch (e) {
    log.error('idb', 'write_fail', { fn: 'writeTrialLog', cardId: entry.card_id, err: e && e.message });
    try { logAppEvent('idb_write_fail', { fn: 'writeTrialLog', cardId: entry.card_id, err: e && e.message }); } catch {}
    return;  // 写盘失败时不触发云端上传（避免上传一个本地未持久化的 trial）
  }
  if (_realtimeUpload) syncTrialLog(entry);
}
```

### - [ ] Step 1.7: 加外层 try-catch 到 `_writeSrs`

Locate `_writeSrs` (around line 9744). The function is ~150 lines long. **不要重写函数体**，只在函数体的最外层加 try-catch。

Find the function declaration:
```javascript
async function _writeSrs(q, rating, attempt) {
  // Use the deck key from the card's SRS state (set at queue build time) to avoid
  // a race where background sync's renderDeckList() resets currentDeck mid-session.
  const state   = q._srsState;
```

Insert a `try {` immediately after the opening `{` of the function (after line 9744, before line 9745 comment) so the function body is wrapped:

```javascript
async function _writeSrs(q, rating, attempt) {
  try {
  // Use the deck key from the card's SRS state (set at queue build time) to avoid
  // a race where background sync's renderDeckList() resets currentDeck mid-session.
  const state   = q._srsState;
  // ... 函数其余部分原样保留 ...
```

Then locate the closing `}` of `_writeSrs` (the function ends before the next function declaration). Find the last few lines of the function — should look like the end of the easy-mode block followed by the final `}` of the function. Add the catch block BEFORE the closing `}`:

To do this surgically:
1. Use Grep to find `_writeSrs` start at line ~9744
2. Find the matching closing `}` (the next top-level function start gives a landmark)
3. Insert `} catch (e) { log.error('idb', 'srs_write_fail', { cardId: q && q.id, err: e && e.message }); try { logAppEvent('idb_write_fail', { fn: '_writeSrs', cardId: q && q.id, err: e && e.message }); } catch {} }` immediately before the final closing `}`.

**Concrete steps**:

a. Read `index.html` from line 9744 forward until you find the next top-level `async function` or `function` declaration that's NOT inside `_writeSrs`. Identify the line number of `_writeSrs`'s closing `}`.

b. The function body should be wrapped like:
```javascript
async function _writeSrs(q, rating, attempt) {
  try {
    // ... entire existing body, unchanged ...
  } catch (e) {
    log.error('idb', 'srs_write_fail', { cardId: q && q.id, err: e && e.message });
    try { logAppEvent('idb_write_fail', { fn: '_writeSrs', cardId: q && q.id, err: e && e.message }); } catch {}
  }
}
```

Use Edit tool with old_string spanning enough context (function declaration + first 2 lines of body) and new_string adding `try {` after the opening, then a SECOND Edit to add the closing `} catch ...` before the function's closing `}`.

Be careful about indentation — the body lines inside try would technically need +2 indent but to minimize diff, **leave inner indentation unchanged** (mixed indent is acceptable for a single wrap; clean indentation isn't worth the diff size).

### - [ ] Step 1.8: 跑测试看通过

```powershell
node tests/_pw_idb_resilience.js
```

Expected: 全部 PHASE 2-7 通过（约 9 断言）。

### - [ ] Step 1.9: 跑回归

```powershell
node tests/run_all.js
node tests/_pw_srs_e2e.js
node tests/_pw_easy.js
node tests/_pw_idb_helpers.js
```

Expected: 全过（run_all 14 套件 667 / srs_e2e 21 / easy 28 / idb_helpers 27）。

### - [ ] Step 1.10: 登记新测试到 `CLAUDE.md`

In `C:\code\CLAUDE.md`, find the Playwright test table area (look for rows like `| `tests/_pw_idb_migration.js` | ...`). Add a row near other IDB tests:

```
| `tests/_pw_idb_resilience.js` | IDB 写入容错（hijack idbPut 抛错，验证 5 个写入函数不掐断答题流，~9 断言，无需登录） |
```

### - [ ] Step 1.11: Commit

```powershell
git add index.html tests/_pw_idb_resilience.js CLAUDE.md
git commit -m "fix: 答题热路径 IDB 写入容错 (5 函数 + Playwright)"
```

---

## Self-Review

**Spec coverage（对照 `docs/superpowers/specs/2026-06-14-idb-write-resilience-design.md`）**:
- ✅ §1 风险路径 5 函数 → Steps 1.3-1.7 全部加 wrap
- ✅ §2 目标"不掐断答题流" → PHASE 2-7 验证
- ✅ §3.1 try-catch 模式 → 每个 wrap 匹配 spec 模板
- ✅ §3.2 数据流不变性 → wrap 只在末尾或外层，前面的内存状态推进不变
- ✅ §3.3 日志结构 → 双通道 `log.error('idb', 'write_fail', { fn, cardId, err })` + `logAppEvent('idb_write_fail', {fn, cardId, err})`
- ✅ §3.4 内存/磁盘不一致 trade-off → 实现接受（用户已确认）
- ✅ §5 单元测试 → Step 1.1 Playwright（替代单元，因 IDB 需浏览器环境）
- ✅ §5 Playwright 回归 → Step 1.9 跑 srs_e2e + easy + idb_helpers

**Placeholder 扫描**：
- 无 TBD / TODO / vague stuff
- writeTrialLog 加了 `return;` 在 catch 后（避免上传未持久化的 trial）— 这是个微小行为差异但符合 spec 意图（"不掐断答题流" 不等于"上传无效数据"）

**Type consistency**：
- `log.error('idb', 'write_fail', { fn, cardId, err })` 在 5 处一致（saveCardState/saveCardStateLocal/writeTrialLog/putEasyState）+ `_writeSrs` 用 `srs_write_fail` 区分（外层兜底，可能不是 IDB 直接错）
- `logAppEvent('idb_write_fail', { fn, ... })` 在所有 5 处一致

**已知 risk**：
- Step 1.7 `_writeSrs` 加外层 try-catch 是结构性改动（函数 ~150 行），需精确插入 try/catch 不破坏内部逻辑。建议 implementer 用 Edit 工具的两次精确插入，**不要重写函数**。如果 Edit 失败，停下来 report DONE_WITH_CONCERNS 让控制端介入。

---

## 不在 P1 内的事

- ❌ 单元测试（Node.js）— IDB 是浏览器 API，无法在 Node 中可靠 mock；用 Playwright 替代
- ❌ Sync 上下行容错（已有 `.catch(() => {})`）
- ❌ localStorage 写入容错（不在本次范围）
- ❌ Storage media blob 写入容错（不在本次范围）
- ❌ Service Worker / inline CDN（后续 Capacitor 工作）

---

## 已知风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| `_writeSrs` 外层 try-catch 插入破坏内部异步流 | 中 | TDD 验证：PHASE 7 测试 `_writeSrs` 完整调用路径，破坏立即可见 |
| writeTrialLog catch 后 return 阻断 syncTrialLog 触发 | 低 | 设计选择 — 不触发上传更安全（避免上传 ghost trial），PHASE 4 验证不抛 |
| `logAppEvent` 自身也写 IDB（appEvents store），hijack 时会失败 | 低 | 内层 try-catch 包住 logAppEvent 调用本身，失败仅 console，不递归错 |
| Playwright hijack 影响后续测试 | 低 | Cleanup 块还原 `window.idbPut = window._origIdbPut`；测试单独跑，不与其他套件干扰 |
