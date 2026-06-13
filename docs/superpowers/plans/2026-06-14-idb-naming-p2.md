# IDB Naming Convention — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 IDB store 名 rename 到 snake_case 对齐 Supabase 表名（`trials → sync_trials` 等），通过 onupgradeneeded 删老 store 重建。**keyPath / record 字段保留 snake_case 不动**（spec §3.1 修正后）。零字段名改造，老代码 50+ 调用点通过常量延迟引用透明 follow 新 store 名。

**Architecture:**
- 先把老的字符串常量（`TRIAL_STORE = 'trials'` 等）改成延迟引用 `IDB_STORES.syncTrials.name`（仍是 `'trials'`，行为不变）— 把改 store 名的"唯一开关"集中到 `IDB_STORES`
- 然后改 `IDB_STORES.xxx.name` 到 snake_case 新名 + bump `IDB_DBS.{srs,media}.version` + 重写 onupgradeneeded（删所有老 store + 按注册表重建）— 所有调用点同步切换
- 用户冷启动一次：已登录用户通过 runSync 从云端拉回 `sync_card_states` / `easy_card_states`；未登录用户重新开始

**Tech Stack:** vanilla JS、IndexedDB API、Playwright（模拟老版本 IDB 升级流程）、Node.js 纯单测

**Reference Spec:** `docs/superpowers/specs/2026-06-13-idb-naming-convention-design.md`（已通过 commit `72d1ad1` 修正：record 字段保留 snake_case）
**Reference P1 Plan:** `docs/superpowers/plans/2026-06-13-idb-naming-p1.md`（P1 已完成，commits `48c63d3` / `29bc20f` / `99d2389`）

---

## File Structure

| 文件 | 改动 |
|---|---|
| `index.html` | Task 1: 6 个老常量改延迟引用（~10 行）。Task 2: `IDB_STORES` 6 个 name 改 snake_case + `IDB_DBS` version bump + `openSrsDb` 的 onupgradeneeded 重写（~30 行替换）+ `openDB`（媒体）的 onupgradeneeded 重写（~5 行）|
| `tests/yihai_v5.13.10_idb_p1_test.js` | Task 2: 更新断言到新 store 名（`sync_trials` 等）+ 新版本号（10 / 2）|
| `tests/_pw_idb_migration.js` | Task 2: 新增 — 模拟老版本 IDB → 升级 → 验证新 schema（~80 行）|
| `CLAUDE.md` | Task 2: Key Files 表登记新测试文件（1 行）|

---

## Task 1: 老常量改延迟引用（无运行时行为变更）

**Files:**
- Modify: `index.html` 6 处常量声明

**目标**：把现有的硬编码字符串改成 `IDB_STORES.xxx.name` 延迟引用，让 Task 2 改 store 名时所有调用点自动 follow，无需 grep-replace 50+ 处。

### - [ ] Step 1.1: 跑现有单测确认基线

```powershell
node tests/run_all.js
```

Expected: 14 套件 667 断言全过（继承 P1 结束状态）

### - [ ] Step 1.2: 修改 6 个老常量

In `C:\code\index.html`, locate these existing lines (around line 3322-3328):

```javascript
const SRS_DB_NAME    = 'yihai_srs';
const SRS_DB_VER     = 9;
const EASY_STORE     = 'easyCardStates';
const CS_STORE       = 'card_states';
const TRIAL_STORE    = 'trials';
const EVT_STORE      = 'app_events';
const VOICE_SLOT_STORE = 'voiceSlots';
```

And around line 5232:

```javascript
const IDB_NAME = 'yihai_media', IDB_VER = 1, IDB_STORE = 'blobs';
```

**Replace** them with delayed references to `IDB_DBS` / `IDB_STORES` (which are defined later but JavaScript hoists `const` to TDZ — these are read at function-call time, not at declaration time, so order doesn't matter):

Replace block at line 3322-3328 with:

```javascript
const SRS_DB_NAME    = IDB_DBS.srs.name;
const SRS_DB_VER     = IDB_DBS.srs.version;
const EASY_STORE     = IDB_STORES.easyCardStates.name;
const CS_STORE       = IDB_STORES.syncCardStates.name;
const TRIAL_STORE    = IDB_STORES.syncTrials.name;
const EVT_STORE      = IDB_STORES.appEvents.name;
const VOICE_SLOT_STORE = IDB_STORES.voiceSlots.name;
```

Replace line 5232 with:

```javascript
const IDB_NAME = IDB_DBS.media.name, IDB_VER = IDB_DBS.media.version, IDB_STORE = IDB_STORES.mediaBlobs.name;
```

**IMPORTANT — TDZ guard**: `IDB_DBS` / `IDB_STORES` must be DECLARED BEFORE these usages. Since the file is read top-to-bottom and these `const` statements execute in order, you MUST verify that `IDB_DBS` / `IDB_STORES` are declared earlier in the file. Run:

```powershell
node -e "const html = require('fs').readFileSync('index.html', 'utf8'); const idbStores = html.indexOf('const IDB_STORES'); const trialStore = html.indexOf('const TRIAL_STORE'); console.log('IDB_STORES line index:', idbStores, 'TRIAL_STORE line index:', trialStore, idbStores < trialStore ? 'OK (IDB_STORES first)' : 'ERROR (TRIAL_STORE first)');"
```

If ERROR: `IDB_STORES` is currently declared at line 3330+ (after line 3322-3328 — TDZ violation). **You must MOVE the `IDB_DBS` / `IDB_STORES` declaration block to BEFORE these old constants** (e.g., to line 3320 region, before `const SRS_DB_NAME`). Do this by:

1. Read the current `IDB_DBS` / `IDB_STORES` block from `index.html` (P1 added it around line 3330).
2. Delete that block from its current location.
3. Insert it BEFORE the `const SRS_DB_NAME = ...` line.

Then re-run the TDZ check command to confirm.

### - [ ] Step 1.3: 跑回归确认无破坏

```powershell
node tests/run_all.js
```

Expected: still 14 套件 667 断言全过 (`yihai_v5.13.10_idb_p1_test.js` 仍然校验 IDB_STORES 现状值如 `trials`、`card_states`，因为 Task 1 没改 name 值)

Verify HTTP server is running on port 8080, then:

```powershell
node tests/_pw_ui_smoke.js
```

Expected: 68 断言全过

```powershell
node tests/_pw_idb_helpers.js
```

Expected: 23 断言全过

### - [ ] Step 1.4: Commit

```powershell
git add index.html
git commit -m "refactor(idb-p2): 老 store 常量改延迟引用 IDB_STORES (Task 1)"
```

---

## Task 2: IDB_STORES rename + onupgradeneeded + migration 测试

**Files:**
- Modify: `index.html`（`IDB_DBS` version bump + `IDB_STORES` name 改 snake_case + `openSrsDb` / `openDB` 的 onupgradeneeded 重写）
- Modify: `tests/yihai_v5.13.10_idb_p1_test.js`（更新断言到新值）
- Create: `tests/_pw_idb_migration.js`
- Modify: `CLAUDE.md`（Key Files 登记新测试）

### - [ ] Step 2.1: 更新单测断言为新值（预期失败）

In `tests/yihai_v5.13.10_idb_p1_test.js`, find these lines and change to new values:

```javascript
// 旧：
assert('IDB_DBS.srs.version == 9（P1 不 bump）', IDB_DBS.srs && IDB_DBS.srs.version === 9);
// 改为：
assert('IDB_DBS.srs.version == 10（P2 bump）', IDB_DBS.srs && IDB_DBS.srs.version === 10);

// 旧：
assert('IDB_DBS.media.version == 1（P1 不 bump）', IDB_DBS.media && IDB_DBS.media.version === 1);
// 改为：
assert('IDB_DBS.media.version == 2（P2 bump）', IDB_DBS.media && IDB_DBS.media.version === 2);

// 旧：
assert('syncTrials.name == "trials"（现状）',          IDB_STORES.syncTrials && IDB_STORES.syncTrials.name === 'trials');
assert('syncCardStates.name == "card_states"（现状）', IDB_STORES.syncCardStates && IDB_STORES.syncCardStates.name === 'card_states');
assert('easyCardStates.name == "easyCardStates"（现状）', IDB_STORES.easyCardStates && IDB_STORES.easyCardStates.name === 'easyCardStates');
assert('appEvents.name == "app_events"（现状）',       IDB_STORES.appEvents && IDB_STORES.appEvents.name === 'app_events');
assert('voiceSlots.name == "voiceSlots"（现状）',     IDB_STORES.voiceSlots && IDB_STORES.voiceSlots.name === 'voiceSlots');
assert('mediaBlobs.name == "blobs"（现状）',           IDB_STORES.mediaBlobs && IDB_STORES.mediaBlobs.name === 'blobs');
// 改为：
assert('syncTrials.name == "sync_trials"（P2 规范）',          IDB_STORES.syncTrials && IDB_STORES.syncTrials.name === 'sync_trials');
assert('syncCardStates.name == "sync_card_states"（P2 规范）', IDB_STORES.syncCardStates && IDB_STORES.syncCardStates.name === 'sync_card_states');
assert('easyCardStates.name == "easy_card_states"（P2 规范）', IDB_STORES.easyCardStates && IDB_STORES.easyCardStates.name === 'easy_card_states');
assert('appEvents.name == "app_events"（不变）',             IDB_STORES.appEvents && IDB_STORES.appEvents.name === 'app_events');
assert('voiceSlots.name == "voice_slots"（P2 规范）',         IDB_STORES.voiceSlots && IDB_STORES.voiceSlots.name === 'voice_slots');
assert('mediaBlobs.name == "media_blobs"（P2 规范）',         IDB_STORES.mediaBlobs && IDB_STORES.mediaBlobs.name === 'media_blobs');
```

### - [ ] Step 2.2: 跑单测看失败

```powershell
node tests/yihai_v5.13.10_idb_p1_test.js
```

Expected: 多个断言失败（旧值跟新断言不匹配）

### - [ ] Step 2.3: 更新 `IDB_STORES` 到新规范 + bump version

In `C:\code\index.html`, find the `IDB_DBS` / `IDB_STORES` block (P1 added). Replace it with:

```javascript
// ── IDB 注册表 (v5.13.10 Phase 2 — store rename + schema bump) ──────
// keyPath / record 字段保留 snake_case（spec §3.1 修正）
const IDB_DBS = {
  srs:   { name: 'yihai_srs',   version: 10 },
  media: { name: 'yihai_media', version: 2  },
};
const IDB_STORES = {
  syncTrials:     { db: 'srs',   name: 'sync_trials',      keyPath: 'trial_id'  },
  syncCardStates: { db: 'srs',   name: 'sync_card_states', keyPath: 'state_key' },
  easyCardStates: { db: 'srs',   name: 'easy_card_states', keyPath: ['deck_key','card_id'] },
  appEvents:      { db: 'srs',   name: 'app_events',       keyPath: 'event_id'  },
  voiceSlots:     { db: 'srs',   name: 'voice_slots',      keyPath: 'slotName'  },
  mediaBlobs:     { db: 'media', name: 'media_blobs',      keyPath: null /* external key */ },
};
```

### - [ ] Step 2.4: 重写 `openSrsDb` 的 onupgradeneeded

In `C:\code\index.html`, locate `openSrsDb` function (around line 4044). Find its `onupgradeneeded` handler (about lines 4049-4089) and **replace the entire `req.onupgradeneeded = e => { ... };` block** with:

```javascript
    req.onupgradeneeded = e => {
      const db = e.target.result;
      // P2: 删除所有老 store（含 P1 之前命名 + P1 现状声明），按注册表新建
      // 数据可丢（已登录用户启动后 runSync 从云端拉回 sync_card_states / easy_card_states）
      const obsoleteStoreNames = [
        'trials', 'card_states', 'easyCardStates', 'app_events',
        'voiceSlots', 'yh_logs'
      ];
      obsoleteStoreNames.forEach(name => {
        if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
      });
      // 按 IDB_STORES 注册表新建所有 srs store
      Object.values(IDB_STORES).filter(s => s.db === 'srs').forEach(s => {
        if (!db.objectStoreNames.contains(s.name)) {
          db.createObjectStore(s.name, { keyPath: s.keyPath });
        }
      });
      console.log('[idb] yihai_srs upgraded to v' + IDB_DBS.srs.version);
    };
```

### - [ ] Step 2.5: 重写媒体 DB 的 `openDB` onupgradeneeded

In `C:\code\index.html`, locate `openDB` function (around line 5234). Find the line:

```javascript
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
```

**Replace** with:

```javascript
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (db.objectStoreNames.contains('blobs')) db.deleteObjectStore('blobs');
      Object.values(IDB_STORES).filter(s => s.db === 'media').forEach(s => {
        if (!db.objectStoreNames.contains(s.name)) {
          const opts = s.keyPath ? { keyPath: s.keyPath } : {};
          db.createObjectStore(s.name, opts);
        }
      });
      console.log('[idb] yihai_media upgraded to v' + IDB_DBS.media.version);
    };
```

### - [ ] Step 2.6: 跑单测验证通过

```powershell
node tests/yihai_v5.13.10_idb_p1_test.js
```

Expected: 33 断言全过

```powershell
node tests/run_all.js
```

Expected: 14 套件 667 断言全过

### - [ ] Step 2.7: 写 migration Playwright 测试（预期通过）

Create `tests/_pw_idb_migration.js`:

```javascript
/**
 * IDB Migration Playwright 测试 — v5.13.10 P2
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_idb_migration.js
 *
 * 覆盖：
 *   - 模拟老版本 IDB（v9 srs + v1 media，含老 store 名）
 *   - 触发 app 启动 → onupgradeneeded 跑迁移
 *   - 验证老 store 已删，新 store 已建，schema version 已 bump
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();

async function deleteAllDbs(page) {
  await run(page, async () => {
    await new Promise((res, rej) => {
      const req = indexedDB.deleteDatabase('yihai_srs');
      req.onsuccess = () => res(); req.onerror = () => rej();
      req.onblocked = () => rej(new Error('delete blocked'));
    });
    await new Promise((res, rej) => {
      const req = indexedDB.deleteDatabase('yihai_media');
      req.onsuccess = () => res(); req.onerror = () => rej();
      req.onblocked = () => rej(new Error('delete blocked'));
    });
  });
}

async function seedOldSchema(page) {
  await run(page, async () => {
    // 手动建 v9 yihai_srs with old store names
    await new Promise((res, rej) => {
      const req = indexedDB.open('yihai_srs', 9);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        db.createObjectStore('trials',         { keyPath: 'trial_id' });
        db.createObjectStore('card_states',    { keyPath: 'state_key' });
        db.createObjectStore('app_events',     { keyPath: 'event_id' });
        db.createObjectStore('voiceSlots',     { keyPath: 'slotName' });
        db.createObjectStore('easyCardStates', { keyPath: ['deck_key','card_id'] });
      };
      req.onsuccess = e => { e.target.result.close(); res(); };
      req.onerror = () => rej();
    });
    // 手动建 v1 yihai_media with old 'blobs' store
    await new Promise((res, rej) => {
      const req = indexedDB.open('yihai_media', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('blobs');
      req.onsuccess = e => { e.target.result.close(); res(); };
      req.onerror = () => rej();
    });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    // ════ PHASE 1: 清空 IDB ════
    section('PHASE 1: 清空 IDB');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 500);
    await deleteAllDbs(page);
    pass('IDB 已清空', true);

    // ════ PHASE 2: 种入老版本 schema ════
    section('PHASE 2: 种入老版本 schema');
    await seedOldSchema(page);
    pass('老版本 schema 已种入', true);

    // 验证老 store 确实存在
    const oldStores = await run(page, async () => {
      return new Promise((res) => {
        const req = indexedDB.open('yihai_srs', 9);
        req.onsuccess = e => {
          const names = Array.from(e.target.result.objectStoreNames);
          e.target.result.close();
          res(names.sort());
        };
      });
    });
    pass('种入后含 trials/card_states/easyCardStates',
      oldStores.includes('trials') && oldStores.includes('card_states') && oldStores.includes('easyCardStates'));

    // ════ PHASE 3: 重新加载页面，触发升级 ════
    section('PHASE 3: 重新加载页面，触发升级');
    await page.goto(URL + '&reload=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);
    // 触发 openSrsDb（用 helper 间接）
    await run(page, async () => { await idbCount('appEvents'); });
    await run(page, async () => { await idbGetByKey('mediaBlobs', '__nonexistent__').catch(() => {}); });

    // ════ PHASE 4: 验证升级结果 ════
    section('PHASE 4: 验证升级结果');
    const newSrsStores = await run(page, async () => {
      return new Promise((res) => {
        const req = indexedDB.open('yihai_srs');
        req.onsuccess = e => {
          const names = Array.from(e.target.result.objectStoreNames);
          const ver = e.target.result.version;
          e.target.result.close();
          res({ names: names.sort(), version: ver });
        };
      });
    });
    pass('yihai_srs version == 10',                    newSrsStores.version === 10);
    pass('新 store sync_trials 存在',                   newSrsStores.names.includes('sync_trials'));
    pass('新 store sync_card_states 存在',              newSrsStores.names.includes('sync_card_states'));
    pass('新 store easy_card_states 存在',              newSrsStores.names.includes('easy_card_states'));
    pass('新 store app_events 存在',                    newSrsStores.names.includes('app_events'));
    pass('新 store voice_slots 存在',                   newSrsStores.names.includes('voice_slots'));
    pass('老 store trials 已删',                        !newSrsStores.names.includes('trials'));
    pass('老 store card_states 已删',                   !newSrsStores.names.includes('card_states'));
    pass('老 store easyCardStates 已删',                !newSrsStores.names.includes('easyCardStates'));
    pass('老 store voiceSlots 已删',                    !newSrsStores.names.includes('voiceSlots'));

    const newMediaStores = await run(page, async () => {
      return new Promise((res) => {
        const req = indexedDB.open('yihai_media');
        req.onsuccess = e => {
          const names = Array.from(e.target.result.objectStoreNames);
          const ver = e.target.result.version;
          e.target.result.close();
          res({ names: names.sort(), version: ver });
        };
      });
    });
    pass('yihai_media version == 2',                   newMediaStores.version === 2);
    pass('新 store media_blobs 存在',                   newMediaStores.names.includes('media_blobs'));
    pass('老 store blobs 已删',                         !newMediaStores.names.includes('blobs'));

    // ════ PHASE 5: 升级后 helper 可正常 round-trip ════
    section('PHASE 5: 升级后 helper round-trip');
    await run(page, async () => {
      await idbPut('appEvents', { event_id: 'mig_p2_evt_1', ts: 1, type: 'migrated' });
    });
    const got = await run(page, async () => await idbGet('appEvents', 'mig_p2_evt_1'));
    pass('升级后 idbPut + idbGet 仍工作', got && got.event_id === 'mig_p2_evt_1');

    await run(page, async () => { await idbDelete('appEvents', 'mig_p2_evt_1'); });

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

### - [ ] Step 2.8: 跑 migration 测试

Ensure HTTP server is running on port 8080. Then:

```powershell
node tests/_pw_idb_migration.js
```

Expected: 约 16 断言全过

### - [ ] Step 2.9: 在 `CLAUDE.md` 登记新测试

In `CLAUDE.md`, find the test table area. Add a row near other Playwright tests:

```
| `tests/_pw_idb_migration.js` | IDB schema 迁移（v9→v10 srs / v1→v2 media，老 store 删除新建，~16 断言，无需登录） |
```

### - [ ] Step 2.10: Commit

```powershell
git add index.html tests/yihai_v5.13.10_idb_p1_test.js tests/_pw_idb_migration.js CLAUDE.md
git commit -m "feat(idb-p2): store rename snake_case + schema bump + migration 测试 (Task 2)"
```

---

## Task 3: 全回归 + memory 更新

**Files:** 无新文件，仅跑测试 + 更新 memory

### - [ ] Step 3.1: 跑发布级最小回归

Ensure HTTP server is running on port 8080. Run:

```powershell
node tests/run_test.js tests/run_all.js
node tests/run_test.js tests/_pw_ui_smoke.js
node tests/run_test.js tests/_pw_srs_e2e.js
node tests/run_test.js tests/_pw_idb_helpers.js
node tests/run_test.js tests/_pw_idb_migration.js
```

Expected：
- `run_all.js`: 14 套件 667 断言全过
- `_pw_ui_smoke.js`: 68 断言全过
- `_pw_srs_e2e.js`: 21 断言全过
- `_pw_idb_helpers.js`: 23 断言全过
- `_pw_idb_migration.js`: ~16 断言全过

任意失败 → 报告 BLOCKED。

### - [ ] Step 3.2: 加跑跨设备同步测试（schema 改动触及核心 IDB 路径）

```powershell
node tests/run_test.js tests/_pw_cross_device.js
```

Expected: 39 断言全过

Note: 此测试需要 `$env:TEST_PASSWORD=...`，如未设置或登录失败则报告 BLOCKED 并附错误信息。

### - [ ] Step 3.3: memory 更新

Edit `C:\Users\chenl\.claude\projects\C--code\memory\project-naming-convention-todo.md`.

Find the existing IDB Phase 1 line:
```
- 🚧 **IDB（Phase 1 完成）** — IDB_DBS/IDB_STORES 注册表 + 11 个 helper 函数...
```

Replace with:
```
- 🚧 **IDB（Phase 1 + Phase 2 完成）** — Phase 1: IDB_DBS/IDB_STORES 注册表 + 11 个 helper 函数。Phase 2: store 名 snake_case rename (trials → sync_trials 等) + schema bump (srs v9→v10, media v1→v2) + onupgradeneeded 删老 store 重建。record 字段保留 snake_case (spec §3.1 修正)。spec: `docs/superpowers/specs/2026-06-13-idb-naming-convention-design.md`；P2 plan: `docs/superpowers/plans/2026-06-14-idb-naming-p2.md`。P3 (50+ 调用点改用 helper) 后续 PR。
```

### - [ ] Step 3.4: 收尾

```powershell
git status
git log --oneline -5
```

Report all commits made in P2 (should be 2: Task 1 + Task 2).

---

## Self-Review 结果（已修复）

**Spec 覆盖检查（对照修正后 spec §8.2）**：
- ✅ `IDB_DBS` version bump (srs 9→10, media 1→2) → Task 2 Step 2.3
- ✅ `IDB_STORES` store 名改 snake_case → Task 2 Step 2.3
- ✅ keyPath 保留 snake_case（§3.1 修正后）→ Task 2 Step 2.3 注释 + IDB_STORES 定义
- ✅ onupgradeneeded 走 §7 → Task 2 Step 2.4 (srs) + Step 2.5 (media)
- ✅ 老常量延迟引用 IDB_STORES → Task 1
- ✅ 无需改 record 字段 → spec §3.1 修正后明确不需要
- ✅ `_pw_idb_migration.js` 测试 → Task 2 Step 2.7
- ✅ 回归测试范围 → Task 3 Step 3.1-3.2

**Type consistency**：
- ✅ `IDB_DBS.srs.version === 10` 在 Task 2 Step 2.1 单测断言、Step 2.3 实现、Step 2.7 migration 测试断言中一致
- ✅ store key 名 (`syncTrials, syncCardStates, easyCardStates, appEvents, voiceSlots, mediaBlobs`) 全文一致
- ✅ store name 字符串 (`sync_trials, sync_card_states, ...`) 在断言/实现/migration 测试中一致
- ✅ keyPath 类型一致（`'trial_id'` string, `['deck_key','card_id']` array, `null` for media_blobs）

**Placeholder 扫描**：无 TBD / TODO / "fill in" 等。每个 code 块都是完整可执行代码。

**关键 invariants**：
- 修改 IDB_DBS / IDB_STORES 时不能破坏现有 helper（Task 1 Step 1.3 跑 `_pw_idb_helpers.js` 确认 helper 仍工作）
- TDZ 警告（Task 1 Step 1.2 内含检查命令）

---

## 不在 P2 内的事

按 spec 修正后的 §8.2：
- ❌ record 字段名改动（spec §3.1 修正后明确保留 snake_case）
- ❌ sync 层 mapping 重构（保留现状）
- ❌ 50+ 调用点改用 helper → P3
- ❌ release 发布 → 等用户「发布」指令
- ❌ 数据搬运（用户已确认全部老数据可丢）

## 已知风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 用户冷启动 IDB 已删，未登录用户本地 SRS 进度丢 | 中 | 已确认可接受；登录用户走 runSync 拉回 |
| Task 1 TDZ 顺序错（IDB_STORES 在老常量后声明）| 中 | Step 1.2 内含 node 检查命令 + 明确移动 IDB_STORES 块的指令 |
| onupgradeneeded 中断 → DB 半升级 | 低 | IDB 事务原子；中断自动 abort，下次启动重试 |
| `_pw_cross_device.js` 需登录但 TEST_PASSWORD 缺失 | 低 | Step 3.2 明确报告 BLOCKED 而非静默跳过 |
