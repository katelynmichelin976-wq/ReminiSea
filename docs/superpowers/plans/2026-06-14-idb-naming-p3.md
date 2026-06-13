# IDB Naming Convention — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `index.html` 里 ~35 个直接 `tx.objectStore(...)` 调用点改用 P1 引入的 `idbGet/Put/Delete/GetAll/Tx` helper（同时新增 `idbGetAllKeys` 给媒体 blob 用），按模块分 5 个独立 PR。完成后删除遗留的旧常量（`TRIAL_STORE`/`CS_STORE`/`EVT_STORE`/`EASY_STORE`/`VOICE_SLOT_STORE`/`SRS_DB_NAME`/`SRS_DB_VER`/`IDB_NAME`/`IDB_VER`/`IDB_STORE`）。**零行为变更**——纯语法 refactor，每个 PR 通过现有测试即视为成功。

**Architecture:**
- 每个调用点匹配一个 helper：单字段简单读写用 `idbGet/Put/Delete/GetAll/Count`，外部 key 媒体用 `idbPutWithKey/GetByKey`，多操作事务用 `idbTx(stores, mode, callback)`，cursor / index getAll 等复杂 API 用 `idbTx` callback 内的原生 store 句柄。
- 新增 `idbGetAllKeys(storeKey)` 给媒体清理路径用（getAllKeys 不在 P1 helper 集合里）。
- 按模块分 PR：SRS 热路径 / Sync 上下行 + AppEvents / Voice 槽 / Media blob。最后一个 PR 删除老常量以校验"全部到位"。

**Tech Stack:** vanilla JS、IndexedDB API、Playwright（验证 helper 路径走得通）、Node.js 单测

**Reference Spec:** `docs/superpowers/specs/2026-06-13-idb-naming-convention-design.md`
**Reference Plans:** `docs/superpowers/plans/2026-06-13-idb-naming-p1.md`、`docs/superpowers/plans/2026-06-14-idb-naming-p2.md`

---

## File Structure

| 文件 | 改动 |
|---|---|
| `index.html` | Task 1: 加 `idbGetAllKeys` 函数（~15 行）。Task 2-5: 替换 ~35 处 `tx.objectStore(...)` 为 helper 调用（每处 1-5 行替换）。Task 6: 删除 10 个遗留 const 声明（~12 行删除）。|
| `tests/_pw_idb_helpers.js` | Task 1: 加 `idbGetAllKeys` round-trip 断言（~3 断言）|
| `CLAUDE.md` | Task 6: 无新增（注释跟测试范围已在 P1/P2 中维护）|

---

## Task 1: 新增 `idbGetAllKeys` helper + Playwright 测试

**Files:**
- Modify: `index.html`（加 helper 函数 + 注释）
- Modify: `tests/_pw_idb_helpers.js`（加 round-trip 断言）

### - [ ] Step 1.1: 写 Playwright 断言（预期失败）

In `C:\code\tests\_pw_idb_helpers.js`, locate the section `// ════ PHASE 6: idbPutWithKey + idbGetByKey（mediaBlobs 外部 key 形式）════` (around line 78).

After the existing PHASE 6 assertions block and BEFORE the `// ════ PHASE 7:` line, insert this new PHASE block:

```javascript
    // ════ PHASE 6.5: idbGetAllKeys（mediaBlobs 外部 key 列表）════
    section('PHASE 6.5: idbGetAllKeys');
    await run(page, async () => {
      const b1 = new Blob(['a'], { type: 'text/plain' });
      const b2 = new Blob(['b'], { type: 'text/plain' });
      await idbPutWithKey('mediaBlobs', 'test_p3_keys_1', b1);
      await idbPutWithKey('mediaBlobs', 'test_p3_keys_2', b2);
    });
    const keys = await run(page, async () => await idbGetAllKeys('mediaBlobs'));
    pass('idbGetAllKeys 返回数组',          Array.isArray(keys));
    pass('idbGetAllKeys 含 test_p3_keys_1', keys.includes('test_p3_keys_1'));
    pass('idbGetAllKeys 含 test_p3_keys_2', keys.includes('test_p3_keys_2'));
    await run(page, async () => {
      await idbDelete('mediaBlobs', 'test_p3_keys_1').catch(() => {});
      await idbDelete('mediaBlobs', 'test_p3_keys_2').catch(() => {});
    });
```

Also update the PHASE 2 helper-existence loop (around line 35-37) to include `'idbGetAllKeys'`:

Find:
```javascript
    for (const fn of ['idbGet','idbPut','idbDelete','idbGetAll','idbCount','idbClear','idbPutWithKey','idbGetByKey','idbTx']) {
```

Change to:
```javascript
    for (const fn of ['idbGet','idbPut','idbDelete','idbGetAll','idbCount','idbClear','idbPutWithKey','idbGetByKey','idbGetAllKeys','idbTx']) {
```

### - [ ] Step 1.2: 跑测试看失败

Ensure HTTP server is running on port 8080:
```powershell
$test = $null
try { $test = Invoke-WebRequest -Uri "http://localhost:8080/index.html" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop } catch {}
if (-not $test) {
  Start-Process -FilePath "python" -ArgumentList "-m","http.server","8080","--directory","C:\code" -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
```

```powershell
node tests/_pw_idb_helpers.js
```

Expected: 失败（`idbGetAllKeys` 函数不存在）

### - [ ] Step 1.3: 在 `index.html` 添加 `idbGetAllKeys` helper

Locate the existing `idbGetByKey` function (around line 4172-4178):

```javascript
async function idbGetByKey(storeKey, key) {
  const db = await _idbDbFor(storeKey);
  const name = IDB_STORES[storeKey].name;
  const req = db.transaction(name, 'readonly').objectStore(name).get(key);
  const r = await _idbReqAsPromise(req);
  return r == null ? null : r;
}
```

Insert this function IMMEDIATELY AFTER it (before the `// 批量事务` comment):

```javascript
async function idbGetAllKeys(storeKey) {
  const db = await _idbDbFor(storeKey);
  const name = IDB_STORES[storeKey].name;
  const req = db.transaction(name, 'readonly').objectStore(name).getAllKeys();
  return (await _idbReqAsPromise(req)) || [];
}
```

### - [ ] Step 1.4: 跑测试看通过

```powershell
node tests/_pw_idb_helpers.js
```

Expected: ~26 断言全过（原 23 + 新增 3 + helper 存在 1）

```powershell
node tests/run_all.js
```

Expected: 14 套件 667 断言全过

### - [ ] Step 1.5: Commit

```powershell
git add index.html tests/_pw_idb_helpers.js
git commit -m "feat(idb-p3): idbGetAllKeys helper + 测试 (Task 1)"
```

---

## Task 2 (P3-A SRS): 转换 SRS 热路径调用点

**Files:**
- Modify: `index.html`（替换 SRS 模块的 ~12 处 `tx.objectStore(...)`）

### 转换清单（按函数名定位）

每处替换都给出"Find this exact block" + "Replace with this block"。所有改动后行为完全一致。

### - [ ] Step 2.1: 转换 `_writeSrs` 中的 CS_STORE put（_writeSrs 函数内）

In `C:\code\index.html`, find the `_writeSrs` function (around line 4444-4470). It contains TWO blocks that write to CS_STORE. Locate the first block (around line 4448-4453):

```javascript
    const db = await openSrsDb();
    const tx = db.transaction(CS_STORE, 'readwrite');
    tx.objectStore(CS_STORE).put(state);
    await new Promise((res, rej) => {
      tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
    });
```

**Replace** with:

```javascript
    await idbPut('syncCardStates', state);
```

Locate the SECOND block (around line 4460-4466):

```javascript
    const db = await openSrsDb();
    const tx = db.transaction(CS_STORE, 'readwrite');
    tx.objectStore(CS_STORE).put(state);
    await new Promise((res, rej) => {
      tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
    });
```

**Replace** with:

```javascript
    await idbPut('syncCardStates', state);
```

(They are identical blocks for different branches in the function; both get the same replacement.)

### - [ ] Step 2.2: 转换 `_writeSrs` 中的 CS_STORE get（如果存在）

Find the block (around line 4430-4438):

```javascript
    let prev = null;
    if (window.indexedDB) {
      const dbg = await openSrsDb();
      prev = await new Promise(r => {
        const reqg = dbg.transaction(CS_STORE, 'readonly')
                       .objectStore(CS_STORE).get(key);
        reqg.onsuccess = e => r(e.target.result || null);
        reqg.onerror = () => r(null);
      });
    }
```

**Replace** with:

```javascript
    let prev = null;
    if (window.indexedDB) {
      try { prev = await idbGet('syncCardStates', key); } catch { prev = null; }
    }
```

### - [ ] Step 2.3: 转换 logTrial 中的 TRIAL_STORE put

Find the `logTrial` function (around line 4600-4625). Locate the block:

```javascript
    const db = await openSrsDb();
    const tx = db.transaction(TRIAL_STORE, 'readwrite');
    tx.objectStore(TRIAL_STORE).put(entry);
    await new Promise((res, rej) => {
      tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
    });
```

**Replace** with:

```javascript
    await idbPut('syncTrials', entry);
```

### - [ ] Step 2.4: 转换 logTrial 中的 TRIAL_STORE getAll（如果用于检查 dup）

If `logTrial` has a block like:

```javascript
    const trAll = await new Promise(r => {
      const req = db.transaction(TRIAL_STORE, 'readonly')
                    .objectStore(TRIAL_STORE).getAll();
      req.onsuccess = e => r(e.target.result || []);
    });
```

**Replace** with:

```javascript
    const trAll = await idbGetAll('syncTrials');
```

If not present, skip this step.

### - [ ] Step 2.5: 转换 `getEasyState` (EASY_STORE get)

Find function (around line 4533-4540):

```javascript
async function getEasyState(deckKey, cardId) {
  const db = await openSrsDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(EASY_STORE, 'readonly');
    const req = tx.objectStore(EASY_STORE).get([deckKey, cardId]);
    req.onsuccess = () => res(req.result || null);
    req.onerror   = () => rej(req.error);
  });
}
```

**Replace** with:

```javascript
async function getEasyState(deckKey, cardId) {
  return await idbGet('easyCardStates', [deckKey, cardId]);
}
```

### - [ ] Step 2.6: 转换 `putEasyState` (EASY_STORE put)

Find function (around line 4543-4551):

```javascript
async function putEasyState(s) {
  const db = await openSrsDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(EASY_STORE, 'readwrite');
    tx.objectStore(EASY_STORE).put(s);
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}
```

**Replace** with:

```javascript
async function putEasyState(s) {
  await idbPut('easyCardStates', s);
}
```

### - [ ] Step 2.7: `getAllEasyStates` 保留 raw（依赖 index）

Function at ~line 4553-4562 uses `objectStore(...).index('deck_key').getAll(...)`. helper 不支持 index API。**保留这个函数不动**——但确认它通过 `EASY_STORE` 常量（已是 `IDB_STORES.easyCardStates.name`）间接引用 store。

Just verify the function reads:
```javascript
async function getAllEasyStates(deckKey) {
  const db = await openSrsDb();
  return new Promise((res, rej) => {
    const tx  = db.transaction(EASY_STORE, 'readonly');
    const idx = tx.objectStore(EASY_STORE).index('deck_key');
    const req = idx.getAll(IDBKeyRange.only(deckKey));
    req.onsuccess = () => res(req.result || []);
    req.onerror   = () => rej(req.error);
  });
}
```

If yes, **skip this step**. No change.

### - [ ] Step 2.8: 转换 `getAllCardStates` (CS_STORE getAll)

Find function (around line 4513-4525):

```javascript
async function getAllCardStates(deckKey) {
  let db = await openSrsDb();
  return new Promise((res, rej) => {
    const req = db.transaction(CS_STORE, 'readonly')
                  .objectStore(CS_STORE).getAll();
    req.onsuccess = e => {
      const all = e.target.result || [];
      res(deckKey ? all.filter(s => s.deck_key === deckKey) : all);
    };
    req.onerror = e => rej(e.target.error);
  });
}
```

**Replace** with:

```javascript
async function getAllCardStates(deckKey) {
  const all = await idbGetAll('syncCardStates');
  return deckKey ? all.filter(s => s.deck_key === deckKey) : all;
}
```

### - [ ] Step 2.9: 跑回归

```powershell
node tests/run_all.js
node tests/_pw_srs_e2e.js
node tests/_pw_easy.js
node tests/_pw_idb_helpers.js
```

Expected:
- run_all: 14 套件 667 断言全过
- _pw_srs_e2e: 21 断言全过
- _pw_easy: 28 断言全过
- _pw_idb_helpers: 26 断言全过

### - [ ] Step 2.10: Commit

```powershell
git add index.html
git commit -m "refactor(idb-p3a): SRS 热路径改用 helper (Task 2)"
```

---

## Task 3 (P3-B Sync + AppEvents): 转换同步上下行 + 事件存储

**Files:**
- Modify: `index.html`（替换同步/事件模块的 ~13 处 `tx.objectStore(...)`）

### - [ ] Step 3.1: 转换 uploadTrial 内 TRIAL_STORE put（synced_at 回写）

In `C:\code\index.html`, find `uploadTrial` function (around line 3548-3598). Locate the first writeback block (around line 3583-3590):

```javascript
        entry.synced_at = Date.now();
        const db = await openSrsDb();
        const tx = db.transaction(TRIAL_STORE, 'readwrite');
        tx.objectStore(TRIAL_STORE).put(entry);
```

**Replace** with:

```javascript
        entry.synced_at = Date.now();
        await idbPut('syncTrials', entry).catch(() => {});
```

Locate the second writeback block (around line 3592-3597):

```javascript
    entry.synced_at = Date.now();
    const db = await openSrsDb();
    const tx = db.transaction(TRIAL_STORE, 'readwrite');
    tx.objectStore(TRIAL_STORE).put(entry);
    tx.onerror = e => console.warn('[sync] trial synced_at writeback failed');
```

**Replace** with:

```javascript
    entry.synced_at = Date.now();
    await idbPut('syncTrials', entry).catch(e => console.warn('[sync] trial synced_at writeback failed', e && e.message));
```

### - [ ] Step 3.2: 转换 uploadCardState 内 CS_STORE put

Find `uploadCardState` function (around line 3650-3661). Locate the block:

```javascript
    state.synced_at = Date.now();
    const db = await openSrsDb();
    const tx = db.transaction(CS_STORE, 'readwrite');
    tx.objectStore(CS_STORE).put(state);
```

**Replace** with:

```javascript
    state.synced_at = Date.now();
    await idbPut('syncCardStates', state).catch(() => {});
```

### - [ ] Step 3.3: 转换 pullSyncTrials 等的 TRIAL_STORE getAll

Find blocks of the form (around line 3730-3740):

```javascript
      const req = db.transaction(TRIAL_STORE, 'readonly').objectStore(TRIAL_STORE).getAll();
      req.onsuccess = e => { ... };
```

For each such block, replace the `db.transaction(...).objectStore(...).getAll()` Promise wrapper with:

```javascript
const allTrials = await idbGetAll('syncTrials');
```

Locate each one (there are 2-3 in sync paths around lines 3735, 3924, 4629). Use these exact patterns:

**Block A** (around 3735):
```javascript
    return new Promise(res => {
      const req = db.transaction(TRIAL_STORE, 'readonly').objectStore(TRIAL_STORE).getAll();
      req.onsuccess = e => res(e.target.result || []);
      req.onerror = () => res([]);
    });
```
→
```javascript
    try { return await idbGetAll('syncTrials'); } catch { return []; }
```

**Block B** (around 3924, may be `var` style):
```javascript
      var r = db.transaction(TRIAL_STORE, 'readonly').objectStore(TRIAL_STORE).getAll();
      r.onsuccess = function(e) { ... };
```

If wrapping logic is complex (filtering inline), instead replace just the inner request with:
```javascript
      var rows = await idbGetAll('syncTrials');
      // ... rest of logic uses `rows`
```

**Block C** (around 4629):
```javascript
                  .objectStore(TRIAL_STORE).getAll();
```

Replace surrounding wrapper with `await idbGetAll('syncTrials')`.

For each block, preserve the surrounding filtering/mapping logic that uses the result. Only the IDB call itself changes.

### - [ ] Step 3.4: 转换 syncAppEvents 等的 EVT_STORE 调用

Find `syncAppEvents` and surrounding event-store sites (around lines 4262, 4268, 4318):

**Site 4262** (inside a `db.transaction(EVT_STORE, 'readwrite')` Promise):
```javascript
    openSrsDb().then(function(db) {
      var tx = db.transaction(EVT_STORE, 'readwrite');
      tx.objectStore(EVT_STORE).put(event);
      tx.oncomplete = function() { trimStore(db, EVT_STORE, 50); };
    }).catch(function(){});
```

**Replace** with:
```javascript
    idbPut('appEvents', event).then(function() {
      openSrsDb().then(function(db) { trimStore(db, EVT_STORE, 50); }).catch(function(){});
    }).catch(function(){});
```

**Site 4268** (simpler):
```javascript
  openSrsDb().then(function(db) {
    db.transaction(EVT_STORE, 'readwrite').objectStore(EVT_STORE).put(event);
  }).catch(function(){});
```

**Replace** with:
```javascript
  idbPut('appEvents', event).catch(function(){});
```

**Site 4318** (EVT_STORE getAll inside a Promise):
```javascript
    var r = db.transaction(EVT_STORE, 'readonly').objectStore(EVT_STORE).getAll();
    r.onsuccess = function(e) { ... };
```

Replace the inner request with `await idbGetAll('appEvents')` (return the result variable to enclosing logic).

### - [ ] Step 3.5: 跑回归

```powershell
node tests/run_all.js
node tests/_pw_srs_e2e.js
node tests/_pw_idb_helpers.js
```

Expected: 全过

If `TEST_PASSWORD` available, also:
```powershell
node tests/_pw_cloud_sync.js
node tests/_pw_cross_device.js
```
Expected: 32 / 39 断言全过

### - [ ] Step 3.6: Commit

```powershell
git add index.html
git commit -m "refactor(idb-p3b): 同步上下行 + AppEvents 改用 helper (Task 3)"
```

---

## Task 4 (P3-C Voice slot): 转换 voice slot 4 处调用

**Files:**
- Modify: `index.html`（替换 voice 模块的 4 处 `tx.objectStore(...)`）

### - [ ] Step 4.1: 转换 `saveVoiceSlot` 函数

Find function (around line 4468-4481):

```javascript
async function saveVoiceSlot(slotName, audioBlob, mimeType, duration) {
  const db = await openSrsDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(VOICE_SLOT_STORE, 'readwrite');
    tx.objectStore(VOICE_SLOT_STORE).put({
      slotName, audioBlob, mimeType,
      duration: Math.round(duration * 10) / 10,
      recordedAt: Date.now()
    });
    tx.oncomplete = () => res();
    tx.onerror = e => rej(e.target.error);
  });
}
```

**Replace** with:

```javascript
async function saveVoiceSlot(slotName, audioBlob, mimeType, duration) {
  await idbPut('voiceSlots', {
    slotName, audioBlob, mimeType,
    duration: Math.round(duration * 10) / 10,
    recordedAt: Date.now()
  });
}
```

### - [ ] Step 4.2: 转换 `loadVoiceSlot` 函数

Find function (around line 4483-4491):

```javascript
async function loadVoiceSlot(slotName) {
  const db = await openSrsDb();
  return new Promise((res, rej) => {
    const req = db.transaction(VOICE_SLOT_STORE, 'readonly')
                  .objectStore(VOICE_SLOT_STORE).get(slotName);
    req.onsuccess = e => res(e.target.result || null);
    req.onerror   = e => rej(e.target.error);
  });
}
```

**Replace** with:

```javascript
async function loadVoiceSlot(slotName) {
  return await idbGet('voiceSlots', slotName);
}
```

### - [ ] Step 4.3: 转换 `deleteVoiceSlot` 函数

Find function (around line 4493-4501):

```javascript
async function deleteVoiceSlot(slotName) {
  const db = await openSrsDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(VOICE_SLOT_STORE, 'readwrite');
    tx.objectStore(VOICE_SLOT_STORE).delete(slotName);
    tx.oncomplete = () => res();
    tx.onerror = e => rej(e.target.error);
  });
}
```

**Replace** with:

```javascript
async function deleteVoiceSlot(slotName) {
  await idbDelete('voiceSlots', slotName);
}
```

### - [ ] Step 4.4: 转换 `loadAllVoiceSlots` 函数

Find function (around line 4503-4511):

```javascript
async function loadAllVoiceSlots() {
  const db = await openSrsDb();
  return new Promise((res, rej) => {
    const req = db.transaction(VOICE_SLOT_STORE, 'readonly')
                  .objectStore(VOICE_SLOT_STORE).getAll();
    req.onsuccess = e => res(e.target.result || []);
    req.onerror   = e => rej(e.target.error);
  });
}
```

**Replace** with:

```javascript
async function loadAllVoiceSlots() {
  return await idbGetAll('voiceSlots');
}
```

### - [ ] Step 4.5: 跑回归

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
```

Expected: 全过

Note: voice slot 路径的 e2e 没有专门 Playwright 套件覆盖；ui_smoke 验证函数存在 + 不报错。

### - [ ] Step 4.6: Commit

```powershell
git add index.html
git commit -m "refactor(idb-p3c): voice slot 4 函数改用 helper (Task 4)"
```

---

## Task 5 (P3-D Media blob): 转换媒体 blob 8 处调用

**Files:**
- Modify: `index.html`（替换媒体模块的 ~8 处 `tx.objectStore(...)`）

### - [ ] Step 5.1: 转换 `saveMedia` 函数

Find function (around line 5354-5361):

```javascript
async function saveMedia(key, blob) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, key);
    tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
  });
}
```

**Replace** with:

```javascript
async function saveMedia(key, blob) {
  await idbPutWithKey('mediaBlobs', key, blob);
}
```

### - [ ] Step 5.2: 转换 `loadMedia` 函数

Find function (around line 5362-5369):

```javascript
async function loadMedia(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = e => res(e.target.result || null);
    req.onerror   = e => rej(e.target.error);
  });
}
```

**Replace** with:

```javascript
async function loadMedia(key) {
  return await idbGetByKey('mediaBlobs', key);
}
```

### - [ ] Step 5.3: 转换 `deleteMediaForDeck` 函数

Find function (around line 5370-5380):

```javascript
async function deleteMediaForDeck(deckKey) {
  const db = await openDB();
  const allKeys = await new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAllKeys();
    req.onsuccess = e => res(e.target.result); req.onerror = e => rej(e.target.error);
  });
  const tx = db.transaction(IDB_STORE, 'readwrite');
  const st = tx.objectStore(IDB_STORE);
  allKeys.filter(k => k.startsWith(deckKey + '_')).forEach(k => st.delete(k));
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = e => rej(e.target.error); });
}
```

**Replace** with:

```javascript
async function deleteMediaForDeck(deckKey) {
  const allKeys = await idbGetAllKeys('mediaBlobs');
  const toDelete = allKeys.filter(k => k.startsWith(deckKey + '_'));
  if (!toDelete.length) return;
  await idbTx(['mediaBlobs'], 'readwrite', async (tx) => {
    const st = tx.objectStore(IDB_STORES.mediaBlobs.name);
    toDelete.forEach(k => st.delete(k));
  });
}
```

### - [ ] Step 5.4: 转换 `checkMedia` 函数内的 getAllKeys

Find inside `checkMedia` function (around line 5392-5397):

```javascript
    const db = await openDB();
    const allKeys = await new Promise((res, rej) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAllKeys();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
```

**Replace** with:

```javascript
    const allKeys = await idbGetAllKeys('mediaBlobs');
```

### - [ ] Step 5.5: 转换 `checkMedia` 函数内的删除 tx（如果有）

Find later in `checkMedia` (around line 5450-5455) if a block deletes orphan keys:

```javascript
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const st = tx.objectStore(IDB_STORE);
    orphans.forEach(k => st.delete(k));
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = e => rej(e.target.error); });
```

**Replace** with:

```javascript
    if (orphans.length) {
      await idbTx(['mediaBlobs'], 'readwrite', async (tx) => {
        const st = tx.objectStore(IDB_STORES.mediaBlobs.name);
        orphans.forEach(k => st.delete(k));
      });
    }
```

Note: the orphan variable might be named differently (e.g., `extraKeys`, `unused`). Use the actual local variable name in the surrounding code.

### - [ ] Step 5.6: 转换 line ~11253 的媒体 tx（个人牌组 sync 路径）

Find around line 11250-11260, a block like:

```javascript
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const st = tx.objectStore(IDB_STORE);
          keys.forEach(k => st.delete(k));
```

**Replace** with:

```javascript
          await idbTx(['mediaBlobs'], 'readwrite', async (tx) => {
            const st = tx.objectStore(IDB_STORES.mediaBlobs.name);
            keys.forEach(k => st.delete(k));
          });
```

(If the surrounding function is async, this `await` works. If not, wrap the surrounding scope or use `.then(...)`.)

### - [ ] Step 5.7: 跑回归

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
node tests/_pw_idb_helpers.js
node tests/_pw_idb_migration.js
```

Expected: 全过

If `TEST_PASSWORD` available, also:
```powershell
node tests/_pw_cross_device.js
```
Expected: 39 断言全过（媒体路径关键）

### - [ ] Step 5.8: Commit

```powershell
git add index.html
git commit -m "refactor(idb-p3d): 媒体 blob 改用 helper (Task 5)"
```

---

## Task 6: 删除遗留常量 + 全回归 + memory

**Files:**
- Modify: `index.html`（删除 10 个遗留 const）
- Modify: memory file（更新进度）

**前提**：Tasks 2-5 已把所有调用点改用 helper / `IDB_STORES.xxx.name` 直接引用，遗留常量 `TRIAL_STORE`、`CS_STORE`、`EVT_STORE`、`EASY_STORE`、`VOICE_SLOT_STORE` 应不再被引用。

### - [ ] Step 6.1: Grep 验证遗留常量无引用

```powershell
node -e "const html = require('fs').readFileSync('index.html', 'utf8'); ['TRIAL_STORE','CS_STORE','EVT_STORE','EASY_STORE','VOICE_SLOT_STORE'].forEach(n => { const m = html.match(new RegExp('\\\\b' + n + '\\\\b', 'g')) || []; console.log(n, m.length, 'references'); });"
```

Expected output: each constant shows `1 references` (just the `const` declaration itself, no use sites).

If any shows `> 1 references`: list the lines that still use it and convert them before continuing.

### - [ ] Step 6.2: 检查 SRS_DB_NAME / SRS_DB_VER / IDB_NAME / IDB_VER / IDB_STORE 引用

```powershell
node -e "const html = require('fs').readFileSync('index.html', 'utf8'); ['SRS_DB_NAME','SRS_DB_VER','IDB_NAME','IDB_VER','IDB_STORE'].forEach(n => { const m = html.match(new RegExp('\\\\b' + n + '\\\\b', 'g')) || []; console.log(n, m.length, 'references'); });"
```

For each constant:
- `SRS_DB_NAME`: should be 2 references (declaration + `indexedDB.open(SRS_DB_NAME, ...)` in `openSrsDb`)
- `SRS_DB_VER`: should be 2 references (declaration + `openSrsDb` call)
- `IDB_NAME`: should be 2 references (declaration + `openDB` call)
- `IDB_VER`: should be 2 references (declaration + `openDB` call)
- `IDB_STORE`: should be 1 (declaration only, if Task 5 fully converted)

If `IDB_STORE` > 1: find remaining usages and convert; **otherwise it's safe to delete**.

`SRS_DB_NAME / SRS_DB_VER / IDB_NAME / IDB_VER` are still used in `openSrsDb` / `openDB` themselves — keep these or inline.

### - [ ] Step 6.3: 删除遗留 store 常量声明

In `C:\code\index.html`, find this block (around line 3337-3344, currently the delayed-reference form):

```javascript
const SRS_DB_NAME    = IDB_DBS.srs.name;
const SRS_DB_VER     = IDB_DBS.srs.version;
const EASY_STORE     = IDB_STORES.easyCardStates.name;
const CS_STORE       = IDB_STORES.syncCardStates.name;
const TRIAL_STORE    = IDB_STORES.syncTrials.name;
const EVT_STORE      = IDB_STORES.appEvents.name;
const VOICE_SLOT_STORE = IDB_STORES.voiceSlots.name;
```

**Delete** the 5 store-name constants (`EASY_STORE` / `CS_STORE` / `TRIAL_STORE` / `EVT_STORE` / `VOICE_SLOT_STORE`). Keep `SRS_DB_NAME` and `SRS_DB_VER` (still used by `openSrsDb` body).

After delete, the block reads:
```javascript
const SRS_DB_NAME    = IDB_DBS.srs.name;
const SRS_DB_VER     = IDB_DBS.srs.version;
```

Find the media constants line (around line 5232):

```javascript
const IDB_NAME = IDB_DBS.media.name, IDB_VER = IDB_DBS.media.version, IDB_STORE = IDB_STORES.mediaBlobs.name;
```

**Replace** with (removing only `IDB_STORE`):

```javascript
const IDB_NAME = IDB_DBS.media.name, IDB_VER = IDB_DBS.media.version;
```

### - [ ] Step 6.4: 跑全回归

Ensure HTTP server is running on port 8080. Run:

```powershell
node tests/run_test.js tests/run_all.js
node tests/run_test.js tests/_pw_ui_smoke.js
node tests/run_test.js tests/_pw_srs_e2e.js
node tests/run_test.js tests/_pw_idb_helpers.js
node tests/run_test.js tests/_pw_idb_migration.js
node tests/run_test.js tests/_pw_easy.js
```

Expected: 全过

If `TEST_PASSWORD` available, also:
```powershell
node tests/run_test.js tests/_pw_cloud_sync.js
node tests/run_test.js tests/_pw_cross_device.js
node tests/run_test.js tests/_pw_easy_sync.js
```
Expected: 32 / 39 / 18 断言全过

### - [ ] Step 6.5: memory 更新

Edit `C:\Users\chenl\.claude\projects\C--code\memory\project-naming-convention-todo.md`.

Find the existing IDB line (start with `🚧 **IDB（Phase 1 + Phase 2 完成）**`) and replace with:

```
- ✅ **IDB（Phase 1-3 完成）** — P1: IDB_DBS/IDB_STORES 注册表 + 11 个 helper + indexes 字段。P2: store 名 snake_case + schema bump + onupgradeneeded 删老建新。P3: 35+ 调用点改用 idbGet/Put/Delete/GetAll/Tx + 删除遗留 TRIAL_STORE/CS_STORE/EVT_STORE/EASY_STORE/VOICE_SLOT_STORE 常量。新增 idbGetAllKeys helper。record 字段保留 snake_case（spec §3.1）。spec: `docs/superpowers/specs/2026-06-13-idb-naming-convention-design.md`；plans: `docs/superpowers/plans/2026-06-13-idb-naming-p1.md` / `2026-06-14-idb-naming-p2.md` / `2026-06-14-idb-naming-p3.md`。P4 (文档定型 + lint 规则) 可选后续。
```

### - [ ] Step 6.6: Commit

```powershell
git add index.html
git commit -m "refactor(idb-p3): 删除遗留 TRIAL_STORE/CS_STORE/EVT_STORE/EASY_STORE/VOICE_SLOT_STORE 常量 (Task 6)"
```

---

## Self-Review 结果

**Spec 覆盖检查（对照 spec §8.3 P3）**：
- ✅ "50+ 调用点改用 helper" → Tasks 2-5（按模块分 4 个独立 PR）
- ✅ "按模块（SRS / sync / voice / media）独立 PR" → Tasks 2-5
- ✅ "每 PR 小、可控" → 每 task 通过现有测试即认为成功
- ✅ 新增 `idbGetAllKeys` 给媒体 → Task 1（spec §6.1 列举的 helper 基础 API 之一）
- ✅ "出问题时定位影响面清晰" → 5 个独立 commit，回滚单独某个 PR 不影响其他

**Type consistency**：
- ✅ storeKey 字符串（`'syncTrials'`、`'syncCardStates'`、`'easyCardStates'`、`'appEvents'`、`'voiceSlots'`、`'mediaBlobs'`）在所有 task 中拼写一致，且都在 IDB_STORES 注册表（P1/P2 已定义）
- ✅ helper 函数名（`idbGet/Put/Delete/GetAll/Count/Clear/PutWithKey/GetByKey/GetAllKeys/Tx`）所有 task 一致
- ✅ `idbGetAllKeys` 在 Task 1 加入，Task 5 使用 — 顺序正确

**Placeholder 扫描**：无 TBD / TODO / "implement later" / "similar to" 等。

**已知 risk**：
- Task 3 的 grep-and-replace 涉及不同 var / let / async 风格 — implementer 需根据实际代码块调整（plan 给的是典型 pattern；具体代码可能略有差异）
- Step 5.6 的 line 11253 区域是个人牌组 sync 内的媒体删除路径，可能需要扩展异步链 — 如果直接 `await` 不行，转 `.then(...)` 链或将外层标记 `async`

---

## 不在 P3 内的事

- ❌ schema 改动（P2 已完成）
- ❌ record 字段改名（spec §3.1 修正后明确不改）
- ❌ sync 层 Supabase mapping 重构（保留现状）
- ❌ release 发布 → 等用户「发布」指令
- ❌ lint 规则 / 工具引入（spec §8.4 P4 可选后续）
- ❌ 跨设备 IDB 同步层引入（设计外）

---

## 已知风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 某个调用点漏改 → Task 6 grep 报 `> 1 references` | 低 | Step 6.1 / 6.2 显式 grep 校验 |
| `idbPut` 替换破坏调用方的 await 链（同步代码改异步）| 低 | 现有写入路径几乎都已 async；非异步上下文用 `.then()` 兼容 |
| Step 5.6 line 11253 异步嵌套复杂 | 中 | 给出 idbTx 模板；implementer 评估上下文调整 |
| 删除遗留常量后，文件外脚本（如 admin 看板）引用 | 低 | grep 确认 `tests/`、`yihai_admin_v1.html`、`yh_diag.js` 不引用这些常量 |
| sync 路径行为变化（idbPut 比直接 tx 慢一点）| 低 | helper 内部就是 transaction；性能差距 <1ms，可忽略 |
