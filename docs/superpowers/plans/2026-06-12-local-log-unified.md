# 本地日志系统统一 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消灭 `yh_logs` 与 `_voiceLog`，统一为内存 ring buffer `LOCAL_LOG`，明确与 `app_events` 的边界，收口 feedback diagnostics payload。

**Architecture:** 内存常驻 2000 条 ring buffer，不写 IDB，仅在 feedback 提交时随 `collectDiagnostics()` 携带最近 500 条。`log.info/warn/error(module, event, data)` 签名兼容现有 ~14 处调用点，机械重命名即可迁移。IDB v8 → v9 删除 `yh_logs` object store。

**Tech Stack:** Vanilla JS（单文件 `index.html`），Node.js 单测（`tests/run_all.js`），Playwright（`tests/_pw_ui_smoke.js`）。

**Spec:** `docs/superpowers/specs/2026-06-12-local-log-design.md`

---

## File Structure

| 文件 | 修改 |
|------|------|
| `index.html` | 替换 `log` 系统（5475-5500 段附近，4033-4109 段，3266-3267 常量，3979-3986 IDB v6 段，4042-4109 段，4256 purgeOldLogs，4117 logAppEvent，3406/3807/3892/3913/4030/4150/4160/4162/4174/4176/4213/4256/4265/4674 各 call site），改 `collectDiagnostics` (7068-7113)，删 `_voiceLog/_logVoice` (5494-5500) |
| `tests/yihai_v5.15_log_test.js` | 新建：LOCAL_LOG ring buffer 单测 |
| `tests/run_all.js` | 注册新单测套件 |
| `CLAUDE.md` | 更新当前版本说明、测试清单 |

---

## Task 1: LOCAL_LOG 核心 API + 单元测试

**目标：** 引入新 `log` API（签名兼容），替换原 `_LOG_LEVELS / _writeLogToIdb / _doLog / log` 定义。原 14 处 `log.warn/error/info` 调用点不动，自动适配。

**Files:**
- Modify: `index.html:4033-4109`（log 系统块）
- Create: `tests/yihai_v5.15_log_test.js`
- Modify: `tests/run_all.js`

- [ ] **Step 1: 新建单测文件**

Create `tests/yihai_v5.15_log_test.js`:

```javascript
// tests/yihai_v5.15_log_test.js
// 本地日志 ring buffer 单测（与 index.html 保持同步）

let passed = 0, failed = 0;
function check(desc, ok) {
  if (ok) passed++;
  else { failed++; console.log(`  ✗ ${desc}`); }
}

// ── LOCAL_LOG ring buffer ────────────────────────────────────────
const LOCAL_LOG_MAX = 2000;

function makeBuffer() {
  const buf = [];
  function push(level, module, event, data) {
    if (buf.length >= LOCAL_LOG_MAX) buf.shift();
    buf.push({ t: Date.now(), lv: level, m: module, e: event, d: data });
  }
  return { buf, push };
}

// 单条 push 形状正确
{
  const { buf, push } = makeBuffer();
  push('info', 'voice', 'tts_speak', { text: '太棒' });
  check('push 1 条后长度=1', buf.length === 1);
  const r = buf[0];
  check('entry 含 t/lv/m/e/d 字段', typeof r.t === 'number' && r.lv === 'info' && r.m === 'voice' && r.e === 'tts_speak' && r.d.text === '太棒');
}

// 多次 push 累积
{
  const { buf, push } = makeBuffer();
  for (let i = 0; i < 10; i++) push('info', 'sync', 'tick', { i });
  check('push 10 条后长度=10', buf.length === 10);
  check('保留顺序：第1条 i=0', buf[0].d.i === 0);
  check('保留顺序：最后1条 i=9', buf[9].d.i === 9);
}

// 满容量后 ring 行为：挤掉最旧
{
  const { buf, push } = makeBuffer();
  for (let i = 0; i < LOCAL_LOG_MAX + 5; i++) push('info', 'srs', 'tick', { i });
  check('超过 MAX 时长度恰好等于 MAX', buf.length === LOCAL_LOG_MAX);
  check('最旧的被挤掉：首条 i=5', buf[0].d.i === 5);
  check('最新保留：末条 i=MAX+4', buf[buf.length - 1].d.i === LOCAL_LOG_MAX + 4);
}

// level 字段保留
{
  const { buf, push } = makeBuffer();
  push('error', 'idb', 'tx_fail');
  push('warn',  'sync', 'retry');
  push('info',  'voice', 'tts_speak');
  check('error 级别记录', buf[0].lv === 'error');
  check('warn 级别记录',  buf[1].lv === 'warn');
  check('info 级别记录',  buf[2].lv === 'info');
}

// data 可省略
{
  const { buf, push } = makeBuffer();
  push('info', 'ui', 'go_home');
  check('data 省略时 d=undefined', buf[0].d === undefined);
}

console.log(`  ${passed} passed, ${failed} failed`);
module.exports = { passed, failed };
```

- [ ] **Step 2: 注册新套件到 run_all.js**

Find `tests/run_all.js`, add to suite list:

```javascript
// 在 'yihai_v5.14_ls_test.js' 后追加
'yihai_v5.15_log_test.js',
```

- [ ] **Step 3: 运行单测确认通过**

```powershell
node tests/run_all.js
```

Expected: `合计 12 套件，X 个断言，0 个失败`（596 + 11 新断言 = 607）

- [ ] **Step 4: 替换 index.html 中的 log 系统**

Find `index.html:4033-4109`（从 `// ── diagnostic log system ──────` 到 `};` 结尾，包含 `_LOG_LEVELS / _writeLogToIdb / _doLog / log / window.yhLog`）。

Replace entire block with:

```javascript
// ── local log buffer（内存 ring buffer，仅 feedback 携带）──────────
// 边界：app_events = 业务里程碑（自动上传服务端）；local_log = 技术细节（仅 feedback）
const LOCAL_LOG = [];
const LOCAL_LOG_MAX = 2000;

function _push(level, module, event, data) {
  if (LOCAL_LOG.length >= LOCAL_LOG_MAX) LOCAL_LOG.shift();
  LOCAL_LOG.push({ t: Date.now(), lv: level, m: module, e: event, d: data });
  const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
  if (data !== undefined) console[fn](`[${module}]`, event, data);
  else console[fn](`[${module}]`, event);
}

const log = {
  info:  (m, e, d) => _push('info',  m, e, d),
  warn:  (m, e, d) => _push('warn',  m, e, d),
  error: (m, e, d) => _push('error', m, e, d),
};
```

> 注：原 `log.debug` 删除，原 `window.yhLog` 删除（Task 5 中已无 LOG_STORE）。

- [ ] **Step 5: 跑全量单测确认无回归**

```powershell
node tests/run_all.js
```

Expected: 全过（12 套件，607 断言）。若 fail 通常是 typo，对照 step 4 检查。

- [ ] **Step 6: Commit**

```powershell
git add tests/yihai_v5.15_log_test.js tests/run_all.js index.html
git commit -m "feat: 引入 LOCAL_LOG 内存 ring buffer + 单测 (#508)"
```

---

## Task 2: 删除 _voiceLog，迁移 15 处埋点

**目标：** 把 PR #508 引入的 `_voiceLog`/`_logVoice` 临时方案合并到统一 `log.info('voice', ...)`。

**Files:**
- Modify: `index.html`（删除 `_voiceLog` / `_logVoice` 定义、替换 15 处调用）

- [ ] **Step 1: 列出所有 _logVoice 调用点**

```powershell
# 命令仅供参考，可直接看 grep 结果
```

调用点位于：line 9024, 9031, 9037, 9046, 9048, 9065, 9067, 9068, 9479, 9484, 9488, 9497, 9499, 9501, 9503, 9638, 9663（共 17 处含定义）。

- [ ] **Step 2: 删除 _voiceLog/_logVoice 定义**

Find in `index.html` (around line 5494-5500):

```javascript
// ── 语音链路诊断日志（始终开启，不依赖 log level，随 feedback 上报）──
const _voiceLog = [];
function _logVoice(event, data) {
  if (_voiceLog.length >= 60) _voiceLog.shift();
  _voiceLog.push({ t: Date.now(), e: event, ...(data || {}) });
  console.info('[VOICE]', event, data || '');
}
```

Delete this entire block (including the comment line).

- [ ] **Step 3: 批量替换 _logVoice → log.info('voice', ...)**

每处 `_logVoice('event_name', dataObj)` → `log.info('voice', 'event_name', dataObj)`。

具体 15 处（除定义外）：

| 位置（旧行号近似）| 旧 | 新 |
|--|--|--|
| 9024 | `_logVoice('slot_muted', { slot: slotName })` | `log.info('voice', 'slot_muted', { slot: slotName })` |
| 9031 | `_logVoice('slot_recording', { slot: slotName })` | `log.info('voice', 'slot_recording', { slot: slotName })` |
| 9037 | `_logVoice('slot_recording_end', { slot: slotName, reason })` | `log.info('voice', 'slot_recording_end', { slot: slotName, reason })` |
| 9046 | `_logVoice('slot_idb_err', { slot: slotName, err: e && e.message })` | `log.warn('voice', 'slot_idb_err', { slot: slotName, err: e && e.message })` |
| 9048 | `_logVoice('slot_tts', { ... })` | `log.info('voice', 'slot_tts', { ... })` |
| 9065 | `_logVoice('tts_speak', { ... })` | `log.info('voice', 'tts_speak', { ... })` |
| 9067 | `_logVoice('tts_onend', { ... })` | `log.info('voice', 'tts_onend', { ... })` |
| 9068 | `_logVoice('tts_onerror', { ... })` | `log.warn('voice', 'tts_onerror', { ... })` |
| 9479 | `_logVoice('correct_click', { streak: _correctStreak, wrongCount })` | `log.info('voice', 'correct_click', { streak: _correctStreak, wrongCount })` |
| 9484 | `_logVoice('enc_start', { streakFires })` | `log.info('voice', 'enc_start', { streakFires })` |
| 9488 | `_logVoice('complete_chain')` | `log.info('voice', 'complete_chain')` |
| 9497 | `_logVoice('correct_hint_call')` | `log.info('voice', 'correct_hint_call')` |
| 9499 | `_logVoice('correct_hint_onend', { streakFires })` | `log.info('voice', 'correct_hint_onend', { streakFires })` |
| 9501 | `_logVoice('streak_correct_call')` | `log.info('voice', 'streak_correct_call')` |
| 9503 | `_logVoice('streak_correct_onend')` | `log.info('voice', 'streak_correct_onend')` |
| 9638 | `_logVoice('safety_net_fired')` | `log.info('voice', 'safety_net_fired')` |
| 9663 | `_logVoice('enc_cancelled')` | `log.info('voice', 'enc_cancelled')` |

> 上 17 处含两次 idb_err/tts_onerror 改为 `warn` 级别（错误更明显）。

可用 `Edit` 工具按表逐条改，或全局 `replace_all`：`_logVoice('` → `log.info('voice', '`（但需对 4 处 err 单独改成 `log.warn`）。

- [ ] **Step 4: 跑全量单测**

```powershell
node tests/run_all.js
```

Expected: 12 套件 607 断言全过。

- [ ] **Step 5: Commit**

```powershell
git add index.html
git commit -m "refactor: _voiceLog 合并到 log.info('voice', ...) (#508)"
```

---

## Task 3: 现有 14 处 call sites 改为 event-key 风格

**目标：** 把原有自然语言 `msg` 调整为 snake_case event key，关键信息搬到 `data`。

**Files:**
- Modify: `index.html`（14 处分散点）

- [ ] **Step 1: 按表逐条改**

| 行号近似 | 旧 | 新 |
|--|--|--|
| 3406 | `log.info('sync', 'online — retrying session restore')` | `log.info('sync', 'online_retry_session')` |
| 3807 | `log.warn('sync', 'runSync watchdog: 30s timeout')` | `log.warn('sync', 'watchdog_timeout', { ms: 30000 })` |
| 3892 | `log.warn('sync', 'syncCardStatesFromCloud skip', e.message)` | `log.warn('sync', 'card_states_pull_skip', { err: e.message })` |
| 3913 | `log.warn('feedback', 'pending retry failed', e.message)` | `log.warn('feedback', 'pending_retry_fail', { err: e.message })` |
| 4030 | `log.error('idb', 'migrateDeviceId failed', e.message)` | `log.error('storage', 'migrate_device_id_fail', { err: e.message })` |
| 4150 | `log.warn('sync', 'upsertDeviceRegistry failed', e.message)` | `log.warn('sync', 'device_registry_upsert_fail', { err: e.message })` |
| 4160 | `log.warn('sync', 'uploadAppEvent error', _a.error)` | `log.warn('sync', 'app_event_upload_err', { err: _a.error })` |
| 4162 | `log.warn('sync', 'uploadAppEvent exception', e.message)` | `log.warn('sync', 'app_event_upload_exc', { err: e.message })` |
| 4174 | `log.warn('sync', 'uploadAppEventBatch error', _a.error)` | `log.warn('sync', 'app_event_batch_err', { err: _a.error })` |
| 4176 | `log.warn('sync', 'uploadAppEventBatch exception', e.message)` | `log.warn('sync', 'app_event_batch_exc', { err: e.message })` |
| 4213 | `log.error('sync', 'batch markSynced failed', ...)` | `log.error('sync', 'batch_mark_synced_fail', { err: e.target.error && e.target.error.message })` |
| 4256 | `log.warn('idb', 'purgeOldLogs failed', e.message)` | `log.warn('storage', 'purge_old_logs_fail', { err: e.message })` |
| 4265 | `log.warn('sync', 'purge device_registry failed', e.message)` | `log.warn('sync', 'purge_device_registry_fail', { err: e.message })` |
| 4674 | `log.warn('idb', 'getDailyProgress parse error', e.message)` | `log.warn('storage', 'daily_progress_parse_fail', { err: e.message })` |

注：`idb` 模块统一改为 `storage`（spec 中合并定义）。

- [ ] **Step 2: 跑全量单测**

```powershell
node tests/run_all.js
```

Expected: 全过。

- [ ] **Step 3: Commit**

```powershell
git add index.html
git commit -m "refactor: log call sites 改为 event-key 风格 + module=storage (#508)"
```

---

## Task 4: 删除 log.debug 调用

**目标：** 仅 1 处 `log.debug('evt', type, payload)` 在 `logAppEvent` 中，改为 `console.debug`。

**Files:**
- Modify: `index.html:4117`

- [ ] **Step 1: 修改 logAppEvent**

Find:

```javascript
function logAppEvent(type, payload, deckKey) {
  log.debug('evt', type, payload);
```

Replace with:

```javascript
function logAppEvent(type, payload, deckKey) {
  console.debug('[evt]', type, payload);
```

- [ ] **Step 2: 跑全量单测**

```powershell
node tests/run_all.js
```

Expected: 全过。

- [ ] **Step 3: Commit**

```powershell
git add index.html
git commit -m "refactor: log.debug → console.debug (#508)"
```

---

## Task 5: 删除 LOG_STORE + IDB v8 → v9 migration

**目标：** 删除 `yh_logs` IDB object store，常量、`purgeOldLogs` 引用清理。

**Files:**
- Modify: `index.html`（多处）

- [ ] **Step 1: SRS_DB_VER 升级**

Find `index.html:3262`:

```javascript
const SRS_DB_VER     = 8;
```

Replace with:

```javascript
const SRS_DB_VER     = 9;
```

- [ ] **Step 2: 删除 LOG_STORE 常量**

Find `index.html:3267`:

```javascript
const LOG_STORE      = 'yh_logs';
```

Delete this line.

- [ ] **Step 3: 删除 v6 创建 LOG_STORE 的迁移代码**

Find `index.html:3979-3986`:

```javascript
      if (oldVer < 6) {
        if (!db.objectStoreNames.contains(LOG_STORE)) {
          const ls = db.createObjectStore(LOG_STORE, { keyPath: 'log_id', autoIncrement: true });
          ls.createIndex('timestamp', 'timestamp');
          ls.createIndex('level', 'level');
        }
        console.log('[idb] upgraded yihai_srs v5→v6: yh_logs store created');
      }
```

Delete entire block.

- [ ] **Step 4: 添加 v9 删除 yh_logs store 的迁移**

Find the line after the v8 migration block (around line 3998):

```javascript
      if (oldVer < 8) {
        if (!db.objectStoreNames.contains(EASY_STORE)) {
          const s = db.createObjectStore(EASY_STORE, { keyPath: ['deck_key', 'card_id'] });
          s.createIndex('deck_key', 'deck_key', { unique: false });
        }
        console.log('[idb] upgraded yihai_srs v7→v8: easyCardStates store created');
      }
```

Add immediately after:

```javascript
      if (oldVer < 9) {
        if (db.objectStoreNames.contains('yh_logs')) {
          db.deleteObjectStore('yh_logs');
        }
        console.log('[idb] upgraded yihai_srs v8→v9: yh_logs store dropped');
      }
```

- [ ] **Step 5: 清理 purgeOldLogs**

`index.html:4256` 已在 Task 3 改为 `log.warn('storage', 'purge_old_logs_fail', ...)`，正文不需要再动。但函数名 `purgeOldLogs` 现在只清 EVT_STORE + TRIAL_STORE，名称仍合理（保留）。

- [ ] **Step 6: 跑全量单测**

```powershell
node tests/run_all.js
```

Expected: 全过。

- [ ] **Step 7: 启动本地 server + Playwright 冒烟**

```powershell
python -m http.server 8080 --directory C:\code
```

新开 PowerShell 窗口：

```powershell
node tests/_pw_ui_smoke.js
```

Expected: 全部断言通过，确认 IDB v8→v9 migration 不破坏现有功能。

如果 Playwright 报错"yh_logs IDB store doesn't exist"或类似，检查 step 4 的迁移代码是否漏写。

- [ ] **Step 8: Commit**

```powershell
git add index.html
git commit -m "refactor: 删除 LOG_STORE，IDB v8→v9 drop yh_logs (#508)"
```

---

## Task 6: collectDiagnostics 收口

**目标：** feedback payload 改为 `local_log`，移除冗余 `logs`/`events`/`log_source`/`voice_log`。

**Files:**
- Modify: `index.html:7068-7113`（`collectDiagnostics` 函数）

- [ ] **Step 1: 重写 collectDiagnostics**

Find the entire `collectDiagnostics` function (around line 7068):

```javascript
async function collectDiagnostics() {
  var base = {
    app_version:        APP_VERSION,
    collected_at:       Date.now(),
    idb_version:        SRS_DB_VER,
    sync_enabled:       _syncEnabled,
    has_session_backup: !!lsGet(LS_KEYS.SESSION_BACKUP),
    last_sync_ts:       Number(lsGet(LS_KEYS.GLOBAL_SYNC_TS)) || null,
    deck_count:         (typeof DECKS_META !== 'undefined' ? DECKS_META.length : null),
    logs:               null,
    log_source:         null,
    events:             null,
  };
  try {
    var db = await Promise.race([
      openSrsDb(),
      new Promise(function(_, rej) { setTimeout(function() { rej(new Error('idb timeout')); }, 2000); })
    ]);
    var logs = await new Promise(function(res, rej) {
      var r = db.transaction(LOG_STORE, 'readonly').objectStore(LOG_STORE).getAll();
      r.onsuccess = function(e) { res(e.target.result || []); };
      r.onerror   = function(e) { rej(e.target.error); };
    });
    base.logs = logs
      .filter(function(l) { return l.level === 'warn' || l.level === 'error'; })
      .slice(-30)
      .map(function(l) { return { level: l.level, module: l.module, msg: l.msg, ts: l.timestamp }; });
    base.log_source = 'idb';
    var evts = await new Promise(function(res, rej) {
      var r = db.transaction(EVT_STORE, 'readonly').objectStore(EVT_STORE).getAll();
      r.onsuccess = function(e) { res(e.target.result || []); };
      r.onerror   = function(e) { rej(e.target.error); };
    });
    base.events = evts.slice(-10).map(function(e) { return { type: e.event_type, payload: e.payload, ts: e.timestamp }; });
    base.voice_log = _voiceLog.slice(-40);
    base.user_id = _cloudUserId || null;
  } catch(e) {}
  return base;
}
```

Replace with:

```javascript
async function collectDiagnostics() {
  return {
    app_version:        APP_VERSION,
    collected_at:       Date.now(),
    idb_version:        SRS_DB_VER,
    sync_enabled:       _syncEnabled,
    has_session_backup: !!lsGet(LS_KEYS.SESSION_BACKUP),
    last_sync_ts:       Number(lsGet(LS_KEYS.GLOBAL_SYNC_TS)) || null,
    deck_count:         (typeof DECKS_META !== 'undefined' ? DECKS_META.length : null),
    user_id:            _cloudUserId || null,
    local_log:          LOCAL_LOG.slice(-500),
  };
}
```

> 注：`device_info` 已在 `submitFeedback` 中独立字段提交，无需在 diagnostics 重复。

- [ ] **Step 2: 更新 formatFeedbackText（如果引用 d.logs）**

Find `index.html:7129-7136`:

```javascript
  if (d.logs && d.logs.length) {
    lines.push('最近错误：');
    d.logs.slice(-3).forEach(function(l) {
      lines.push('  [' + l.module + '] ' + l.msg + ' (' + new Date(l.ts).toLocaleTimeString('zh-CN') + ')');
    });
  } else {
    lines.push('错误日志：（无）');
  }
```

Replace with:

```javascript
  var errs = (d.local_log || []).filter(function(l) { return l.lv === 'error' || l.lv === 'warn'; }).slice(-3);
  if (errs.length) {
    lines.push('最近异常：');
    errs.forEach(function(l) {
      lines.push('  [' + l.m + '] ' + l.e + ' (' + new Date(l.t).toLocaleTimeString('zh-CN') + ')');
    });
  } else {
    lines.push('异常日志：（无）');
  }
```

- [ ] **Step 3: 跑全量单测**

```powershell
node tests/run_all.js
```

Expected: 全过。

- [ ] **Step 4: 启动 server + Playwright feedback 冒烟**

```powershell
node tests/_pw_feedback.js
```

Expected: feedback 模块 11 断言全过。

- [ ] **Step 5: Commit**

```powershell
git add index.html
git commit -m "refactor: collectDiagnostics 改用 local_log，移除 logs/events 冗余 (#508)"
```

---

## Task 7: 回归 + 文档更新

**目标：** 完整 Playwright 回归 + 同步 `CLAUDE.md` 测试清单与变更说明。

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 启动 HTTP server**

```powershell
python -m http.server 8080 --directory C:\code
```

- [ ] **Step 2: 跑核心 Playwright 套件**

新开 PowerShell：

```powershell
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
node tests/_pw_easy.js
```

Expected: 全部通过。如果 `_pw_easy.js` 有断言依赖 `_voiceLog` 全局，需修正测试（但当前测试中没引用，无需改）。

- [ ] **Step 3: 更新 CLAUDE.md 测试清单**

Find `CLAUDE.md` 测试章节中：

```
| `tests/yihai_v5.14_ls_test.js` | LS_KEYS 注册表 + helper + 工厂 + 聚合迁移 + yh:v1: prefix rename 单测（109 cases） |
| `tests/run_all.js` | 单元测试统一入口（11 套件，596 断言） |
```

Replace with:

```
| `tests/yihai_v5.14_ls_test.js` | LS_KEYS 注册表 + helper + 工厂 + 聚合迁移 + yh:v1: prefix rename 单测（109 cases） |
| `tests/yihai_v5.15_log_test.js` | 本地日志 ring buffer 单测（11 cases） |
| `tests/run_all.js` | 单元测试统一入口（12 套件，607 断言） |
```

- [ ] **Step 4: 更新 CLAUDE.md "Recent Changes" 段**

在 `**当前版本：v5.13.4**` 段下方追加（不要 bump version，这是基础设施改造、与发布解耦）：

```
**基础设施改造（本地日志统一）：** 删除 `yh_logs` IDB store（v8→v9 migration drop）+ `_voiceLog` 内存 buffer，统一为 `LOCAL_LOG` 内存 ring buffer（2000 条），新 `log.info/warn/error(module, event, data)` 签名。模块分类：voice/sync/srs/config/storage/auth/media/deck/ui/feedback/diag（11 个）。`collectDiagnostics` 收口：移除 `logs`/`events`/`voice_log`/`log_source`，统一带 `local_log`（最近 500 条）+ `user_id`。`app_events` 系统完全不动，定位边界 = 业务里程碑（自动上传）vs 本地日志（仅 feedback 携带）。
```

- [ ] **Step 5: 单测 + Playwright 最终验证**

```powershell
node tests/run_all.js
```

Expected: 12 套件 607 断言。

- [ ] **Step 6: Commit**

```powershell
git add CLAUDE.md
git commit -m "docs: 本地日志系统统一改造完成，更新测试清单与基础设施说明 (#508)"
```

---

## 完成判定

1. `node tests/run_all.js` 全过（12 套件 607 断言）
2. `node tests/_pw_ui_smoke.js / _pw_srs_e2e.js / _pw_easy.js / _pw_feedback.js` 全过
3. IDB v8→v9 升级路径在浏览器中无报错（启动 app 后 console 见 `[idb] upgraded yihai_srs v8→v9: yh_logs store dropped`）
4. 在「我的 → 意见反馈」提交一条，查 Supabase：

   ```sql
   SELECT diagnostics->'local_log' AS local_log,
          jsonb_array_length(diagnostics->'local_log') AS log_count
   FROM feedback
   ORDER BY created_at DESC LIMIT 1;
   ```

   确认 `local_log` 是数组，长度 > 0，含 voice/sync 等模块事件。

5. 旧字段 `logs`/`events`/`voice_log`/`log_source` 不再出现在 diagnostics。
6. 浏览器 DevTools Application → IndexedDB → yihai_srs 中无 `yh_logs` store。

---

## 自查（Spec Coverage）

| Spec 章节 | 实现于 Task |
|----------|-----------|
| §3 系统边界 | Task 6（保留 app_events，只动 local_log）|
| §4.1 核心 API | Task 1 |
| §4.2 关键决策（取消 debug 级别）| Task 1 + Task 4 |
| §4.3 模块分类 | Task 2/3（voice + storage 等模块投入使用）|
| §5 容量与生命周期 | Task 1（LOCAL_LOG_MAX = 2000）|
| §6 feedback payload 收口 | Task 6 |
| §7.1 IDB v8→v9 | Task 5 |
| §7.2 代码删除 | Task 1 + Task 5（_writeLogToIdb / _doLog / window.yhLog 在 Task 1 删；LOG_STORE 在 Task 5 删）|
| §7.3 调用点改造（类型 1）| Task 2（_voiceLog 迁移）|
| §7.3 调用点改造（类型 2）| Task 3（event-key 风格）|
| §7.3 调用点改造（类型 3）| Task 4（log.debug 删）|
| §7.3 调用点改造（类型 4）补埋点 | 不在本次实施（spec 已声明）|
| §7.4 app_events 不动 | 默认覆盖（无任何任务触及 logAppEvent/EVT_STORE 写入路径）|
| §8.1 单元测试 | Task 1 |
| §8.2 Playwright | Task 5 / Task 6 / Task 7 |
| §8.3 手动验证 | Task 7 完成判定 #4 |

无遗漏。
