# IDB Naming Convention — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `index.html` 引入 `IDB_DBS` / `IDB_STORES` 注册表 + helper 函数（`idbGet/idbPut/idbDelete/idbGetAll/idbCount/idbClear/idbPutWithKey/idbGetByKey/idbTx`），声明 IDB 现状，为后续 Phase 提供基础设施。**本阶段零行为变更**：注册表声明现状 store 名（不动 schema），helper 仅作为新增 API 可用但不强制调用点改造。

**Architecture:** 复用现有 `openSrsDb()` / `openDB()` 函数（不重复 open 逻辑、不引入新的 onupgradeneeded），helper 在它们之上做注册表路由 + Promise 包装。注册表存 `name`、`keyPath`、`db`，但 store 名沿用**当前现状**（如 `'trials'`、`'easyCardStates'`、`'blobs'`），P2 才会 rename 到规范名。

**Tech Stack:** vanilla JS（无构建步骤）、IndexedDB API、Playwright（浏览器内单测）、Node.js 纯单测（注册表静态校验）

**Reference Spec:** `docs/superpowers/specs/2026-06-13-idb-naming-convention-design.md`

---

## File Structure

| 文件 | 改动 |
|---|---|
| `index.html` | 添加 `IDB_DBS` / `IDB_STORES` 常量 + 9 个 helper 函数（约 100 行新增） |
| `tests/yihai_v5.13.10_idb_p1_test.js` | 新增 — 注册表静态校验单测（Node.js，约 8 断言） |
| `tests/_pw_idb_helpers.js` | 新增 — helper round-trip Playwright 测试（约 25 断言） |
| `tests/run_all.js` | 修改 — 注册新增的单测 |
| `CLAUDE.md` | 修改 — Key Files 表新增测试文件登记 |

---

## Task 1: 注册表常量 + Node.js 静态校验单测

**Files:**
- Create: `tests/yihai_v5.13.10_idb_p1_test.js`
- Modify: `tests/run_all.js`（注册新单测）
- Modify: `index.html`（添加 `IDB_DBS` / `IDB_STORES` 常量）

### - [ ] Step 1.1: 写注册表静态校验单测（预期失败）

新建 `tests/yihai_v5.13.10_idb_p1_test.js`：

```javascript
/**
 * IDB Naming Convention Phase 1 — 注册表静态校验
 *
 * 覆盖：IDB_DBS / IDB_STORES 常量完整性、唯一性、字段格式
 * 运行：node tests/yihai_v5.13.10_idb_p1_test.js
 */
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + label); }
  else      { failed++; console.log('  \x1b[31m✗\x1b[0m ' + label); }
}

// 从 index.html 抽取 IDB_DBS / IDB_STORES 常量定义并 eval
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function extractConst(name) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*(\\{[\\s\\S]*?\\});', 'm');
  const m = html.match(re);
  if (!m) throw new Error('Cannot find const ' + name + ' in index.html');
  // eslint-disable-next-line no-eval
  return eval('(' + m[1] + ')');
}

console.log('\n══════ IDB Naming P1 — 注册表静态校验 ══════');

let IDB_DBS, IDB_STORES;
try {
  IDB_DBS    = extractConst('IDB_DBS');
  IDB_STORES = extractConst('IDB_STORES');
  assert('IDB_DBS 与 IDB_STORES 常量存在', true);
} catch (e) {
  assert('IDB_DBS 与 IDB_STORES 常量存在', false);
  console.log('  ' + e.message);
  process.exit(1);
}

// IDB_DBS 校验
assert('IDB_DBS 含 srs 条目',   !!IDB_DBS.srs);
assert('IDB_DBS 含 media 条目', !!IDB_DBS.media);
assert('IDB_DBS.srs.name == "yihai_srs"',     IDB_DBS.srs && IDB_DBS.srs.name === 'yihai_srs');
assert('IDB_DBS.srs.version == 9（P1 不 bump）', IDB_DBS.srs && IDB_DBS.srs.version === 9);
assert('IDB_DBS.media.name == "yihai_media"',  IDB_DBS.media && IDB_DBS.media.name === 'yihai_media');
assert('IDB_DBS.media.version == 1（P1 不 bump）', IDB_DBS.media && IDB_DBS.media.version === 1);

// IDB_STORES 完整性
const expectedStoreKeys = ['syncTrials','syncCardStates','easyCardStates','appEvents','voiceSlots','mediaBlobs'];
expectedStoreKeys.forEach(k => {
  assert(`IDB_STORES.${k} 存在`, !!IDB_STORES[k]);
  if (IDB_STORES[k]) {
    assert(`  ${k}.db ∈ IDB_DBS`,   !!IDB_DBS[IDB_STORES[k].db]);
    assert(`  ${k}.name 是字符串`, typeof IDB_STORES[k].name === 'string' && IDB_STORES[k].name.length > 0);
  }
});

// store 名声明现状（P1 不 rename）
assert('syncTrials.name == "trials"（现状）',          IDB_STORES.syncTrials && IDB_STORES.syncTrials.name === 'trials');
assert('syncCardStates.name == "card_states"（现状）', IDB_STORES.syncCardStates && IDB_STORES.syncCardStates.name === 'card_states');
assert('easyCardStates.name == "easyCardStates"（现状）', IDB_STORES.easyCardStates && IDB_STORES.easyCardStates.name === 'easyCardStates');
assert('appEvents.name == "app_events"（现状）',       IDB_STORES.appEvents && IDB_STORES.appEvents.name === 'app_events');
assert('voiceSlots.name == "voiceSlots"（现状）',     IDB_STORES.voiceSlots && IDB_STORES.voiceSlots.name === 'voiceSlots');
assert('mediaBlobs.name == "blobs"（现状）',           IDB_STORES.mediaBlobs && IDB_STORES.mediaBlobs.name === 'blobs');

// store 名唯一性（同 DB 内不重名）
const byDb = {};
Object.entries(IDB_STORES).forEach(([k, v]) => {
  byDb[v.db] = byDb[v.db] || new Set();
  byDb[v.db].add(v.name);
});
Object.entries(byDb).forEach(([db, names]) => {
  const count = Object.values(IDB_STORES).filter(s => s.db === db).length;
  assert(`db=${db}: store 名唯一（${names.size} unique / ${count} total）`, names.size === count);
});

console.log(`\n  结果: ${passed} 通过, ${failed} 失败`);
if (failed) process.exit(1);
```

### - [ ] Step 1.2: 跑单测验证失败

Run:
```powershell
node tests/yihai_v5.13.10_idb_p1_test.js
```

Expected output: `Error: Cannot find const IDB_DBS in index.html`（因为还没写 const）

### - [ ] Step 1.3: 在 `index.html` 加 `IDB_DBS` / `IDB_STORES` 常量

定位 `index.html:3327` 附近（现有 store 名常量声明区，`const VOICE_SLOT_STORE = 'voiceSlots';` 这一行下面），插入：

```javascript
// ── IDB 注册表 (v5.13.10 Phase 1) ────────────────────────────────────
// 声明当前 IDB 现状；P2 将 rename store 到规范名（spec §4.2）
const IDB_DBS = {
  srs:   { name: 'yihai_srs',   version: 9 },
  media: { name: 'yihai_media', version: 1 },
};
const IDB_STORES = {
  syncTrials:     { db: 'srs',   name: 'trials',         keyPath: 'trial_id'  },
  syncCardStates: { db: 'srs',   name: 'card_states',    keyPath: 'state_key' },
  easyCardStates: { db: 'srs',   name: 'easyCardStates', keyPath: ['deck_key','card_id'] },
  appEvents:      { db: 'srs',   name: 'app_events',     keyPath: 'event_id'  },
  voiceSlots:     { db: 'srs',   name: 'voiceSlots',     keyPath: 'slotName'  },
  mediaBlobs:     { db: 'media', name: 'blobs',          keyPath: null /* external key */ },
};
```

### - [ ] Step 1.4: 把新单测注册到 `run_all.js`

打开 `tests/run_all.js`，找到现有套件列表，在最后一个测试文件 require 行之后追加：

```javascript
require('./yihai_v5.13.10_idb_p1_test.js');
```

### - [ ] Step 1.5: 跑单测验证通过

Run:
```powershell
node tests/yihai_v5.13.10_idb_p1_test.js
```

Expected: 22 passed / 0 failed

Run 全套单测，确保没破坏其他：
```powershell
node tests/run_all.js
```

Expected: 13 套件全过（原 12 + 新增 1）；total 断言数 >= 656（原 634 + 新 22）

### - [ ] Step 1.6: Commit

```powershell
git add index.html tests/yihai_v5.13.10_idb_p1_test.js tests/run_all.js
git commit -m "feat(idb-p1): IDB_DBS / IDB_STORES 注册表声明现状 (Task 1)"
```

---

## Task 2: 基础 helper（idbGet/idbPut/idbDelete/idbGetAll/idbCount/idbClear）+ Playwright 测试

**Files:**
- Create: `tests/_pw_idb_helpers.js`
- Modify: `index.html`（添加 helper 函数）
- Modify: `CLAUDE.md`（Key Files 表登记新测试文件）

### - [ ] Step 2.1: 写 Playwright 测试（预期失败）

新建 `tests/_pw_idb_helpers.js`：

```javascript
/**
 * IDB helper Playwright 测试 — v5.13.10 P1
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_idb_helpers.js
 *
 * 覆盖：idbGet / idbPut / idbDelete / idbGetAll / idbCount / idbClear round-trip
 *       idbPutWithKey / idbGetByKey（外部 key 形式，mediaBlobs 用）
 *       idbTx 批量事务原子性
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

    // ════ PHASE 1: 注册表运行时可用 ════
    section('PHASE 1: 注册表运行时可用');
    pass('IDB_DBS 全局可访问',    await run(page, () => typeof IDB_DBS === 'object' && !!IDB_DBS.srs));
    pass('IDB_STORES 全局可访问', await run(page, () => typeof IDB_STORES === 'object' && !!IDB_STORES.syncTrials));

    // ════ PHASE 2: helper 函数存在 ════
    section('PHASE 2: helper 函数存在');
    for (const fn of ['idbGet','idbPut','idbDelete','idbGetAll','idbCount','idbClear','idbPutWithKey','idbGetByKey','idbTx']) {
      pass(`${fn} 全局函数存在`, await run(page, (n) => typeof window[n] === 'function', fn));
    }

    // ════ PHASE 3: idbPut + idbGet round-trip（appEvents 用 keyPath 形式）════
    section('PHASE 3: idbPut + idbGet round-trip');
    const TEST_EVT = { event_id: 'test_p1_evt_1', ts: 1234567890, type: 'test', payload: { foo: 'bar' } };
    await run(page, async (ev) => { await idbPut('appEvents', ev); }, TEST_EVT);
    const got = await run(page, async () => await idbGet('appEvents', 'test_p1_evt_1'));
    pass('idbGet 返回 record',         got && got.event_id === 'test_p1_evt_1');
    pass('idbGet 返回 payload 完整',   got && got.payload && got.payload.foo === 'bar');
    pass('idbGet 不存在 key 返回 null', null === await run(page, async () => await idbGet('appEvents', 'nonexistent_p1')));

    // ════ PHASE 4: idbGetAll + idbCount ════
    section('PHASE 4: idbGetAll + idbCount');
    await run(page, async () => {
      await idbPut('appEvents', { event_id: 'test_p1_evt_2', ts: 1, type: 'a' });
      await idbPut('appEvents', { event_id: 'test_p1_evt_3', ts: 2, type: 'b' });
    });
    const all = await run(page, async () => await idbGetAll('appEvents'));
    pass('idbGetAll 返回数组',          Array.isArray(all));
    pass('idbGetAll 含 3 条测试 record', all.filter(r => r.event_id && r.event_id.startsWith('test_p1_')).length === 3);
    const cnt = await run(page, async () => await idbCount('appEvents'));
    pass('idbCount 返回数字 >= 3',      typeof cnt === 'number' && cnt >= 3);

    // ════ PHASE 5: idbDelete ════
    section('PHASE 5: idbDelete');
    await run(page, async () => { await idbDelete('appEvents', 'test_p1_evt_1'); });
    pass('idbDelete 后 idbGet 返回 null', null === await run(page, async () => await idbGet('appEvents', 'test_p1_evt_1')));

    // ════ PHASE 6: idbPutWithKey + idbGetByKey（mediaBlobs 外部 key 形式）════
    section('PHASE 6: idbPutWithKey + idbGetByKey');
    await run(page, async () => {
      const blob = new Blob(['hello'], { type: 'text/plain' });
      await idbPutWithKey('mediaBlobs', 'test_p1_blob_1', blob);
    });
    const blobBack = await run(page, async () => {
      const b = await idbGetByKey('mediaBlobs', 'test_p1_blob_1');
      return b ? await b.text() : null;
    });
    pass('idbPutWithKey + idbGetByKey round-trip', blobBack === 'hello');
    pass('idbGetByKey 不存在 key 返回 null',       null === await run(page, async () => await idbGetByKey('mediaBlobs', 'nonexistent_p1')));

    // ════ PHASE 7: idbTx 批量事务原子性 ════
    section('PHASE 7: idbTx 批量事务原子性');
    await run(page, async () => {
      await idbTx(['appEvents'], 'readwrite', async (tx) => {
        tx.objectStore(IDB_STORES.appEvents.name).put({ event_id: 'test_p1_tx_ok_1', ts: 1, type: 'tx' });
        tx.objectStore(IDB_STORES.appEvents.name).put({ event_id: 'test_p1_tx_ok_2', ts: 2, type: 'tx' });
      });
    });
    pass('idbTx 成功 → 两条都写入', 2 === await run(page, async () => {
      const a = await idbGet('appEvents', 'test_p1_tx_ok_1');
      const b = await idbGet('appEvents', 'test_p1_tx_ok_2');
      return (a ? 1 : 0) + (b ? 1 : 0);
    }));

    // 故意 throw → 整体回滚
    let threw = false;
    try {
      await run(page, async () => {
        await idbTx(['appEvents'], 'readwrite', async (tx) => {
          tx.objectStore(IDB_STORES.appEvents.name).put({ event_id: 'test_p1_tx_rollback', ts: 1, type: 'tx' });
          throw new Error('intentional rollback');
        });
      });
    } catch (e) {
      threw = e.message && e.message.includes('intentional');
    }
    pass('idbTx 内 throw 后 reject', threw);
    pass('idbTx 内 throw 后 record 未写入',
      null === await run(page, async () => await idbGet('appEvents', 'test_p1_tx_rollback')));

    // ════ Cleanup ════
    await run(page, async () => {
      for (const k of ['test_p1_evt_1','test_p1_evt_2','test_p1_evt_3','test_p1_tx_ok_1','test_p1_tx_ok_2','test_p1_tx_rollback']) {
        await idbDelete('appEvents', k);
      }
      await idbDelete('mediaBlobs', 'test_p1_blob_1').catch(() => {});
    });

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

### - [ ] Step 2.2: 跑测试验证失败

Run:
```powershell
node tests/_pw_idb_helpers.js
```

Expected: PHASE 2 失败（`idbGet 全局函数存在` 等）

### - [ ] Step 2.3: 在 `index.html` 添加基础 helper

定位 `index.html:4098`（`openSrsDb` 函数结束后的空行），插入以下函数：

```javascript
// ── IDB helper (v5.13.10 Phase 1) ────────────────────────────────────
// 复用现有 openSrsDb() / openDB() 的 DB cache；helper 仅做注册表路由 + Promise 包装
async function _idbDbFor(storeKey) {
  const meta = IDB_STORES[storeKey];
  if (!meta) throw new Error('idb: unknown storeKey: ' + storeKey);
  if (meta.db === 'srs')   return openSrsDb();
  if (meta.db === 'media') return openDB();
  throw new Error('idb: unknown db: ' + meta.db);
}
function _idbReqAsPromise(req) {
  return new Promise((res, rej) => {
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}
async function idbGet(storeKey, key) {
  const db = await _idbDbFor(storeKey);
  const name = IDB_STORES[storeKey].name;
  const req = db.transaction(name, 'readonly').objectStore(name).get(key);
  const r = await _idbReqAsPromise(req);
  return r == null ? null : r;
}
async function idbPut(storeKey, record) {
  const db = await _idbDbFor(storeKey);
  const name = IDB_STORES[storeKey].name;
  return new Promise((res, rej) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).put(record);
    tx.oncomplete = () => res();
    tx.onerror    = e => rej(e.target.error);
    tx.onabort    = e => rej(e.target.error || new Error('idb tx aborted'));
  });
}
async function idbDelete(storeKey, key) {
  const db = await _idbDbFor(storeKey);
  const name = IDB_STORES[storeKey].name;
  return new Promise((res, rej) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).delete(key);
    tx.oncomplete = () => res();
    tx.onerror    = e => rej(e.target.error);
  });
}
async function idbGetAll(storeKey) {
  const db = await _idbDbFor(storeKey);
  const name = IDB_STORES[storeKey].name;
  const req = db.transaction(name, 'readonly').objectStore(name).getAll();
  return (await _idbReqAsPromise(req)) || [];
}
async function idbCount(storeKey) {
  const db = await _idbDbFor(storeKey);
  const name = IDB_STORES[storeKey].name;
  const req = db.transaction(name, 'readonly').objectStore(name).count();
  return (await _idbReqAsPromise(req)) || 0;
}
async function idbClear(storeKey) {
  const db = await _idbDbFor(storeKey);
  const name = IDB_STORES[storeKey].name;
  return new Promise((res, rej) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).clear();
    tx.oncomplete = () => res();
    tx.onerror    = e => rej(e.target.error);
  });
}
```

### - [ ] Step 2.4: 添加外部 key helper（idbPutWithKey / idbGetByKey）

紧接 Step 2.3 插入位置之后，继续添加：

```javascript
// 外部 key 形式（mediaBlobs 用：put(blob, key) / get(key)，无 keyPath）
async function idbPutWithKey(storeKey, key, value) {
  const db = await _idbDbFor(storeKey);
  const name = IDB_STORES[storeKey].name;
  return new Promise((res, rej) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror    = e => rej(e.target.error);
  });
}
async function idbGetByKey(storeKey, key) {
  const db = await _idbDbFor(storeKey);
  const name = IDB_STORES[storeKey].name;
  const req = db.transaction(name, 'readonly').objectStore(name).get(key);
  const r = await _idbReqAsPromise(req);
  return r == null ? null : r;
}
```

### - [ ] Step 2.5: 添加批量事务 helper（idbTx）

紧接 Step 2.4 插入位置之后，继续添加：

```javascript
// 批量事务（多 store 原子读写）— callback 收到原生 IDB transaction
async function idbTx(storeKeys, mode, callback) {
  const meta = storeKeys.map(k => IDB_STORES[k]);
  const dbs = new Set(meta.map(m => m.db));
  if (dbs.size > 1) throw new Error('idbTx: cannot span multiple databases');
  const dbKey = [...dbs][0];
  const db = dbKey === 'srs' ? await openSrsDb() : await openDB();
  const names = meta.map(m => m.name);
  return new Promise((res, rej) => {
    const tx = db.transaction(names, mode);
    let userErr = null;
    tx.oncomplete = () => userErr ? rej(userErr) : res();
    tx.onerror    = e => rej(e.target.error);
    tx.onabort    = e => rej(userErr || e.target.error || new Error('idb tx aborted'));
    Promise.resolve(callback(tx)).catch(err => {
      userErr = err;
      try { tx.abort(); } catch {}
    });
  });
}
```

### - [ ] Step 2.6: 跑 Playwright 测试验证通过

确保 HTTP server 在跑：
```powershell
Start-Process -FilePath "python" -ArgumentList "-m","http.server","8080","--directory","C:\code" -WindowStyle Hidden
```

Run：
```powershell
node tests/_pw_idb_helpers.js
```

Expected: 约 25 passed / 0 failed

### - [ ] Step 2.7: 跑全单测确认无回归

```powershell
node tests/run_all.js
```

Expected: 13 套件全过

### - [ ] Step 2.8: 在 `CLAUDE.md` 登记新测试文件

定位 `CLAUDE.md:31` 附近的 `### 测试` 表，在合适位置（其他 Playwright 测试附近）添加一行：

```markdown
| `tests/_pw_idb_helpers.js` | IDB helper round-trip（IDB_STORES 注册表 + 9 个 helper 函数，~25 断言） |
```

同区域，单元测试表添加：

```markdown
| `tests/yihai_v5.13.10_idb_p1_test.js` | IDB_DBS / IDB_STORES 注册表静态校验（~22 断言） |
```

### - [ ] Step 2.9: Commit

```powershell
git add index.html tests/_pw_idb_helpers.js CLAUDE.md
git commit -m "feat(idb-p1): 9 个 IDB helper 函数 + Playwright 测试 (Task 2)"
```

---

## Task 3: 全回归 + 最终 commit

**Files:** 无新文件，仅跑回归

### - [ ] Step 3.1: 跑 release 级最小回归

确保 HTTP server 在跑（端口 8080）：
```powershell
Get-Process python -ErrorAction SilentlyContinue | Format-Table Id,ProcessName
# 若没有，启动：
Start-Process -FilePath "python" -ArgumentList "-m","http.server","8080","--directory","C:\code" -WindowStyle Hidden
```

依次跑：
```powershell
node tests/run_test.js tests/run_all.js
node tests/run_test.js tests/_pw_ui_smoke.js
node tests/run_test.js tests/_pw_srs_e2e.js
node tests/run_test.js tests/_pw_idb_helpers.js
```

Expected：
- `run_all.js`：13 套件，656+ 断言全过
- `_pw_ui_smoke.js`：68 断言全过
- `_pw_srs_e2e.js`：21 断言全过
- `_pw_idb_helpers.js`：~25 断言全过

任意失败 → 停下来排查（Phase 1 不应破坏任何现有功能）。

### - [ ] Step 3.2: memory 更新

在 `C:\Users\chenl\.claude\projects\C--code\memory\project-naming-convention-todo.md` 的"进度"块新增一行：

```markdown
- 🚧 **IDB（Phase 1 完成）** — IDB_DBS/IDB_STORES 注册表 + 9 个 helper 函数（idbGet/Put/Delete/GetAll/Count/Clear/PutWithKey/GetByKey/Tx）已引入。声明现状 store 名，零行为变更。spec 见 `docs/superpowers/specs/2026-06-13-idb-naming-convention-design.md`；P1 plan 见 `docs/superpowers/plans/2026-06-13-idb-naming-p1.md`。P2/P3/P4 等后续 PR。
```

### - [ ] Step 3.3: Phase 1 收尾 commit（如有 memory 改动）

```powershell
git status
# 如 memory 文件被改：手动 stage memory 文件（在用户家目录，不在 repo 里 — 无需 git add）
# 如 docs/CLAUDE.md 还有未提交改动：git add 它们
git diff --cached
# 没有未提交内容 → 跳过 commit
```

P1 实施代码已分两个 commit（Task 1、Task 2）落地。Memory 更新不入 repo（用户家目录文件，自动持久）。

---

## Self-Review 结果（已修复）

**Spec 覆盖检查（对照 spec §8.1）**：
- ✅ 注册表 `IDB_DBS` / `IDB_STORES` → Task 1
- ✅ helper 函数 `idbGet/Put/Delete/GetAll/Count/Clear/Tx`（spec §6.1, §6.3）→ Task 2
- ✅ 外部 key helper `idbPutWithKey/idbGetByKey`（spec §6.2）→ Task 2
- ✅ "声明现状不动 store 名" → 注册表里 store 名沿用 `trials`、`easyCardStates`、`blobs` 等
- ✅ "P1 不改运行路径" → 老代码继续用 `tx.objectStore(TRIAL_STORE)` 等，未做任何 refactor
- ✅ "单测 helper 基础路径"（spec §9.1）→ `_pw_idb_helpers.js` Phase 3-7
- ✅ "IDB_STORES 注册表完整性"（spec §9.1）→ `yihai_v5.13.10_idb_p1_test.js`
- ✅ 回归测试范围（spec §9.3 P1）：run_all + _pw_ui_smoke + _pw_srs_e2e → Task 3

**Type consistency**：
- ✅ storeKey 字符串（`'syncTrials'`、`'appEvents'`、`'mediaBlobs'` 等）在 Task 1 注册表中定义、Task 2 helper 中引用、Task 2 测试中使用 — 一致
- ✅ `IDB_DBS.srs.version === 9` 在 Task 1 单测和 Task 1 实现一致
- ✅ helper 函数名首字母小写 `idbXxx` 风格全程一致（无 `IdbXxx` 或 `idb_xxx` 混用）

**Placeholder 扫描**：无 TBD/TODO/"add appropriate error handling" 等。

**类型/方法/属性引用**：所有 helper 使用的 store key (`syncTrials/appEvents/mediaBlobs` 等) 都在 Task 1 的 IDB_STORES 中定义。

---

## 不在 P1 内的事（避免范围蔓延）

按 spec 设计：
- ❌ schema 改动（不 bump version，不动 onupgradeneeded）→ P2
- ❌ store rename → P2
- ❌ 50+ 调用点改造 → P3
- ❌ case transform → 不做
- ❌ release 发布 → 等用户「发布」指令；P1 代码静默就位，等 P2/P3 一起或独立发布
