# 个人牌组同步重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把个人牌组同步重做为「卡片级 mod 增量 + SyncJob 三阶段（结构/卡片/媒体） + 状态可视化 + 暂停续传」。

**Architecture:** 客户端加 `mod` 时间戳与删除墓碑追踪本地变更；`computeDeckSyncState` 计算 per-deck 状态；`SyncJob` 类封装三阶段并支持暂停；新入口 `syncDeck` / `syncAllDirtyDecks` 替换 `uploadMissingPersonalDecks`；UI 状态徽章接入现有 `showCloudDecks`。云端 schema 不改。详见 `docs/superpowers/specs/2026-06-05-personal-deck-sync-design.md`。

**Tech Stack:** 单文件 `index.html`、IndexedDB、Supabase JS SDK、Node.js 单测（`tests/run_all.js`）、Playwright E2E（`tests/_pw_*.js`）。

**约束：**
- 不改云端 schema
- 不改无关代码
- 沿用 camelCase（[[db-naming]] / [[batch-file-edit]]）
- 浏览器端改动先写 Playwright 测试（CLAUDE.md 规则 8）
- 不写注释，不"顺手"清理（CLAUDE.md Coding Rule 2/4）
- 单元测试用 Node.js 风格，pure-JS helper 可独立测；DOM/SDK 集成靠 Playwright

---

## 文件变更总览

| 文件 | 变更类型 | 大致位置 |
|------|---------|---------|
| `index.html` | 加 `nextMod` / `setDeckLocalDirty` / `markCardDeleted` / 水位迁移 | DECKS_META 定义附近（~4368）+ startup 路径 |
| `index.html` | 加 `computeDeckSyncState` / `computeDeckDiff` | 新区块（云同步函数附近） |
| `index.html` | 拆分 `uploadDeckToCloud` 为 `upsertDeckRow` / `upsertCardsBatch` / `deleteCardsBatch` | 9481 行附近 |
| `index.html` | 新增 `SyncJob` 类 + `syncDeck` + `syncAllDirtyDecks` | 云同步函数附近 |
| `index.html` | 改 `runSync` 链：`uploadMissingPersonalDecks` → `syncAllDirtyDecks` | 5527 / 5557 |
| `index.html` | 在 `importYhspack` / `createEmptyDeck` / `renameDeck` / `deleteDeck` / 媒体上传成功后打 mod | 各编辑入口 |
| `index.html` | `showCloudDecks` 接入状态徽章 + 单牌组「同步」按钮挂 `syncDeck` | 5565 |
| `tests/yihai_v5.8_sync_test.js` | **新建** — 纯 JS 单测（nextMod/diff/state） | 新文件 |
| `tests/run_all.js` | 注册新单测 | 14 行 UNIT_SUITES |
| `tests/_pw_cross_device.js` | 扩展 — 增量上传/暂停续传/迁移 | 已有 |
| `CLAUDE.md` | 更新版本号与测试断言数 | 发布时一并改 |
| `docs/忆海拾光_训练App_README.md` | 加 v5.8.0 条目 | 发布时改 |
| `docs/yihai_变更记录_CLAUDE参考.md` | 加 v5.8.0 详细记录 | 发布时改 |

---

## Task 1：单调时间戳 `nextMod()`

**Files:**
- Modify: `index.html`（DECKS_META 定义附近，约 4369 行）
- Create: `tests/yihai_v5.8_sync_test.js`
- Modify: `tests/run_all.js:14`

- [ ] **Step 1：写失败的单测**

  创建 `tests/yihai_v5.8_sync_test.js`，写入以下内容：

  ```js
  const assert = require('assert');

  // 复制 index.html 中的 nextMod 实现（保持同步）
  let _lastMod = 0;
  function nextMod() {
    const now = Date.now();
    _lastMod = Math.max(now, _lastMod + 1);
    return _lastMod;
  }
  function resetMod() { _lastMod = 0; }

  let passed = 0, failed = 0;
  function check(desc, ok) {
    if (ok) passed++;
    else { failed++; console.log(`  ✗ ${desc}`); }
  }

  // Test 1: 单调递增
  {
    resetMod();
    const a = nextMod();
    const b = nextMod();
    const c = nextMod();
    check('单调递增 a<b<c', a < b && b < c);
  }

  // Test 2: 与系统时钟挂钩
  {
    resetMod();
    const before = Date.now();
    const m = nextMod();
    const after = Date.now();
    check('mod 在 [before, after] 之间', m >= before && m <= after + 1);
  }

  // Test 3: 时钟回拨时仍单调
  {
    _lastMod = Date.now() + 10000;
    const m1 = nextMod();
    const m2 = nextMod();
    check('时钟回拨仍单调', m2 === m1 + 1);
  }

  console.log(`\n  通过 ${passed} / 失败 ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
  ```

- [ ] **Step 2：运行单测确认失败**

  ```powershell
  node tests/yihai_v5.8_sync_test.js
  ```

  预期：测试运行通过（因为 nextMod 在测试文件里复制了）。这步只是确认测试本身正确。

- [ ] **Step 3：在 `index.html` 中实现 `nextMod`**

  在 `index.html` 约第 4369 行（`let DECKS_META = [];` 之后）插入：

  ```js
  let _lastMod = 0;
  function nextMod() {
    const now = Date.now();
    _lastMod = Math.max(now, _lastMod + 1);
    return _lastMod;
  }
  ```

- [ ] **Step 4：把新单测注册到 `run_all.js`**

  在 `tests/run_all.js:20` 后插入：

  ```js
    'yihai_v5.8_sync_test.js',
  ```

- [ ] **Step 5：运行完整单测套件**

  ```powershell
  node tests/run_all.js
  ```

  预期：所有套件 PASS，断言总数 +3。

- [ ] **Step 6：提交**

  ```powershell
  git add index.html tests/yihai_v5.8_sync_test.js tests/run_all.js
  git commit -m "feat: 加 nextMod 单调时间戳 (sync redesign Task 1)"
  ```

---

## Task 2：卡片/牌组 `mod` 字段持久化

**Files:**
- Modify: `index.html` — `saveDeckCards`（4442 行）、`saveDeckIndex`（4437 行）、加载路径
- Modify: `tests/yihai_v5.8_sync_test.js`

- [ ] **Step 1：写失败的单测（持久化 round-trip）**

  在 `tests/yihai_v5.8_sync_test.js` 末尾（`console.log` 之前）插入：

  ```js
  // Test 4: saveDeckCards 序列化保留 mod
  {
    const ls = {};
    function saveDeckCards(key, cards) {
      const slim = cards.map(c => ({
        id: c.id, name: c.name, nameLang: c.nameLang || '',
        imgUrl: c._imgUrl || '', audUrl: c._audUrl || '',
        cardType: c.cardType || 'choice', ext: c.ext || {},
        mod: c.mod || 0
      }));
      ls['yihai_deck_' + key] = JSON.stringify(slim);
    }
    function loadDeckCards(key) {
      const arr = JSON.parse(ls['yihai_deck_' + key] || '[]');
      return arr.map(c => ({ ...c, mod: c.mod || 0 }));
    }

    saveDeckCards('k1', [{ id: 'c1', name: 'apple', mod: 12345 }]);
    const loaded = loadDeckCards('k1');
    check('mod 持久化往返', loaded[0].mod === 12345);

    saveDeckCards('k2', [{ id: 'c1', name: 'old' }]); // 无 mod
    const loaded2 = loadDeckCards('k2');
    check('无 mod 字段加载为 0', loaded2[0].mod === 0);
  }
  ```

- [ ] **Step 2：运行单测确认失败之前的实现（这里测试用本地函数定义，无失败步骤——直接进入修改 index.html）**

  ```powershell
  node tests/yihai_v5.8_sync_test.js
  ```

  预期：4 通过。这步纯验证测试逻辑。

- [ ] **Step 3：修改 `index.html:4442` 的 `saveDeckCards`**

  ```js
  function saveDeckCards(key, cards) {
    const slim = cards.map(c => ({
      id: c.id, name: c.name, nameLang: c.nameLang || '',
      imgUrl: c._imgUrl || '', audUrl: c._audUrl || '',
      cardType: c.cardType || 'choice', ext: c.ext || {},
      mod: c.mod || 0
    }));
    localStorage.setItem(LS_DECK_PREFIX + key, JSON.stringify(slim));
  }
  ```

- [ ] **Step 4：在加载路径填默认 mod**

  在 `index.html:4597`（`const card = { ...c, img: '', audioUrl: '', details: [] };`）之后插入：

  ```js
  card.mod = c.mod || 0;
  ```

  完整改后：
  ```js
  const card = { ...c, img: '', audioUrl: '', details: [] };
  card.mod = c.mod || 0;
  card.cardType = card.cardType || card.card_type || 'choice';
  ```

- [ ] **Step 5：修改 `saveDeckIndex`（4437）持久化 meta.mod**

  ```js
  function saveDeckIndex() {
    localStorage.setItem(LS_INDEX, JSON.stringify(
      DECKS_META.filter(m => !m.builtin).map(m => ({
        key: m.key, name: m.name, deck_type: m.deck_type,
        nameLang: m.nameLang, mod: m.mod || 0
      }))
    ));
  }
  ```

  同时找到 `DECKS_META = idx.map(...)`（约 4585 行）的还原路径，补 `mod: m.mod || 0`。

- [ ] **Step 6：跑单测 + 启动 app 烟测**

  ```powershell
  node tests/run_all.js
  python -m http.server 8080 --directory C:\code
  ```

  另开窗口跑 UI 烟测：

  ```powershell
  node tests/_pw_ui_smoke.js
  ```

  预期：单测全 PASS，UI 烟测全 PASS。

- [ ] **Step 7：提交**

  ```powershell
  git add index.html tests/yihai_v5.8_sync_test.js
  git commit -m "feat: 持久化 card.mod 与 meta.mod (sync redesign Task 2)"
  ```

---

## Task 3：删除墓碑 `yihaiDeletedCards`

**Files:**
- Modify: `index.html`（4878 行 `deleteDeck` 附近 + 新建 `markCardDeleted` helper）
- Modify: `tests/yihai_v5.8_sync_test.js`

- [ ] **Step 1：单测 — `markCardDeleted` 入墓碑、`getDeletedCards` 读出**

  追加到 `tests/yihai_v5.8_sync_test.js`：

  ```js
  // Test 5: 删除墓碑
  {
    const ls = {};
    function markCardDeleted(deckKey, cardId) {
      const k = 'yihaiDeletedCards:' + deckKey;
      const arr = JSON.parse(ls[k] || '[]');
      if (!arr.includes(cardId)) arr.push(cardId);
      ls[k] = JSON.stringify(arr);
    }
    function getDeletedCards(deckKey) {
      return JSON.parse(ls['yihaiDeletedCards:' + deckKey] || '[]');
    }
    function clearDeletedCards(deckKey) {
      delete ls['yihaiDeletedCards:' + deckKey];
    }

    markCardDeleted('d1', 'c1');
    markCardDeleted('d1', 'c2');
    markCardDeleted('d1', 'c1'); // duplicate
    check('墓碑去重', JSON.stringify(getDeletedCards('d1')) === '["c1","c2"]');

    clearDeletedCards('d1');
    check('清墓碑', getDeletedCards('d1').length === 0);
  }
  ```

- [ ] **Step 2：跑单测**

  ```powershell
  node tests/yihai_v5.8_sync_test.js
  ```

  预期：6 通过。

- [ ] **Step 3：在 `index.html` 中实现 helper（紧跟 `nextMod` 之后）**

  ```js
  function markCardDeleted(deckKey, cardId) {
    const k = 'yihaiDeletedCards:' + deckKey;
    const arr = JSON.parse(localStorage.getItem(k) || '[]');
    if (!arr.includes(cardId)) arr.push(cardId);
    localStorage.setItem(k, JSON.stringify(arr));
  }
  function getDeletedCards(deckKey) {
    return JSON.parse(localStorage.getItem('yihaiDeletedCards:' + deckKey) || '[]');
  }
  function clearDeletedCards(deckKey) {
    localStorage.removeItem('yihaiDeletedCards:' + deckKey);
  }
  ```

- [ ] **Step 4：在 `deleteDeck`（4876）末尾清掉本牌组的墓碑（牌组整删，云端会级联 DELETE）**

  在 `localStorage.removeItem('yihaiSyncAt:' + key);`（4897）之后插入：

  ```js
  clearDeletedCards(key);
  ```

- [ ] **Step 5：跑回归**

  ```powershell
  node tests/run_all.js
  ```

- [ ] **Step 6：提交**

  ```powershell
  git add index.html tests/yihai_v5.8_sync_test.js
  git commit -m "feat: 删除墓碑 markCardDeleted/getDeletedCards (sync redesign Task 3)"
  ```

---

## Task 4：localStorage 水位迁移 `yihaiSyncAt` → `yihaiPushedAt` + `yihaiPulledAt`

**Files:**
- Modify: `index.html`（在 startup 路径加迁移函数；查 `restoreCloudSession` 或 `_launch` 附近）
- Modify: `tests/yihai_v5.8_sync_test.js`

- [ ] **Step 1：单测 — 迁移逻辑**

  追加到 `tests/yihai_v5.8_sync_test.js`：

  ```js
  // Test 6: 水位迁移
  {
    const ls = {};
    function migrateSyncWatermarks() {
      const keys = Object.keys(ls).filter(k => k.startsWith('yihaiSyncAt:'));
      for (const k of keys) {
        const deckKey = k.substring('yihaiSyncAt:'.length);
        const v = ls[k];
        if (!ls['yihaiPushedAt:' + deckKey]) ls['yihaiPushedAt:' + deckKey] = v;
        if (!ls['yihaiPulledAt:' + deckKey]) ls['yihaiPulledAt:' + deckKey] = v;
      }
    }

    ls['yihaiSyncAt:d1'] = '2026-06-01T00:00:00Z';
    migrateSyncWatermarks();
    check('迁移生成 pushedAt', ls['yihaiPushedAt:d1'] === '2026-06-01T00:00:00Z');
    check('迁移生成 pulledAt', ls['yihaiPulledAt:d1'] === '2026-06-01T00:00:00Z');

    // 已存在的不覆盖
    ls['yihaiSyncAt:d2'] = '2026-06-01';
    ls['yihaiPushedAt:d2'] = '2026-06-05';
    migrateSyncWatermarks();
    check('已存在 pushedAt 不被覆盖', ls['yihaiPushedAt:d2'] === '2026-06-05');
  }
  ```

- [ ] **Step 2：跑单测**

  ```powershell
  node tests/yihai_v5.8_sync_test.js
  ```

  预期：9 通过。

- [ ] **Step 3：在 `index.html` 中实现迁移函数**

  在 `nextMod` 函数之后插入：

  ```js
  function migrateSyncWatermarks() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('yihaiSyncAt:')) keys.push(k);
    }
    for (const k of keys) {
      const deckKey = k.substring('yihaiSyncAt:'.length);
      const v = localStorage.getItem(k);
      if (!localStorage.getItem('yihaiPushedAt:' + deckKey)) {
        localStorage.setItem('yihaiPushedAt:' + deckKey, v);
      }
      if (!localStorage.getItem('yihaiPulledAt:' + deckKey)) {
        localStorage.setItem('yihaiPulledAt:' + deckKey, v);
      }
    }
  }
  ```

- [ ] **Step 4：在启动路径调用一次**

  在 `index.html:9804`（`await restoreDecks();`）之后插入：

  ```js
  migrateSyncWatermarks();
  ```

- [ ] **Step 5：跑 UI 烟测**

  ```powershell
  node tests/_pw_ui_smoke.js
  ```

- [ ] **Step 6：提交**

  ```powershell
  git add index.html tests/yihai_v5.8_sync_test.js
  git commit -m "feat: 水位迁移 yihaiSyncAt 拆为 pushedAt+pulledAt (sync redesign Task 4)"
  ```

---

## Task 5：`computeDeckDiff`（纯函数）

**Files:**
- Modify: `index.html`（新增函数到云同步区块）
- Modify: `tests/yihai_v5.8_sync_test.js`

- [ ] **Step 1：单测 — diff 算法覆盖各分支**

  追加到 `tests/yihai_v5.8_sync_test.js`：

  ```js
  // Test 7: computeDeckDiff
  {
    function computeDeckDiff(localCards, deletedIds, remoteCardMeta, pushedAt, pulledAt) {
      const localMap = new Map(localCards.map(c => [c.id, c]));
      const remoteMap = new Map(remoteCardMeta.map(r => [r.card_id, r.updated_at]));
      const toPush = localCards.filter(c => {
        if (c.mod <= pushedAt) return false;
        const rUpd = remoteMap.get(c.id);
        return !rUpd || c.mod > rUpd;
      });
      const toPull = remoteCardMeta.filter(r => {
        if (r.updated_at <= pulledAt) return false;
        const local = localMap.get(r.card_id);
        return !local || r.updated_at > local.mod;
      });
      const toDelete = deletedIds.filter(id => remoteMap.has(id));
      return { toPush, toPull, toDelete };
    }

    // 场景 A：本地新增
    {
      const r = computeDeckDiff(
        [{ id: 'c1', mod: 100 }, { id: 'c2', mod: 50 }],
        [],
        [{ card_id: 'c2', updated_at: 50 }],
        50, 50
      );
      check('A: toPush=[c1]', r.toPush.length === 1 && r.toPush[0].id === 'c1');
      check('A: toPull 空', r.toPull.length === 0);
    }

    // 场景 B：云端新增
    {
      const r = computeDeckDiff(
        [{ id: 'c1', mod: 50 }],
        [],
        [{ card_id: 'c1', updated_at: 50 }, { card_id: 'c2', updated_at: 100 }],
        50, 50
      );
      check('B: toPull=[c2]', r.toPull.length === 1 && r.toPull[0].card_id === 'c2');
      check('B: toPush 空', r.toPush.length === 0);
    }

    // 场景 C：双向冲突，本地赢
    {
      const r = computeDeckDiff(
        [{ id: 'c1', mod: 200 }],
        [],
        [{ card_id: 'c1', updated_at: 150 }],
        100, 100
      );
      check('C: 本地赢', r.toPush.length === 1 && r.toPull.length === 0);
    }

    // 场景 D：双向冲突，云端赢
    {
      const r = computeDeckDiff(
        [{ id: 'c1', mod: 150 }],
        [],
        [{ card_id: 'c1', updated_at: 200 }],
        100, 100
      );
      check('D: 云端赢', r.toPush.length === 0 && r.toPull.length === 1);
    }

    // 场景 E：删除墓碑
    {
      const r = computeDeckDiff(
        [],
        ['c1'],
        [{ card_id: 'c1', updated_at: 100 }],
        50, 50
      );
      check('E: toDelete=[c1]', r.toDelete.length === 1 && r.toDelete[0] === 'c1');
    }

    // 场景 F：mod=0 不传
    {
      const r = computeDeckDiff(
        [{ id: 'c1', mod: 0 }],
        [],
        [],
        50, 50
      );
      check('F: mod=0 不进 toPush', r.toPush.length === 0);
    }
  }
  ```

- [ ] **Step 2：跑单测**

  ```powershell
  node tests/yihai_v5.8_sync_test.js
  ```

  预期：16 通过。

- [ ] **Step 3：在 `index.html` 中实现（紧跟 `uploadDeckToCloud` 之后，约 9512 行）**

  ```js
  function computeDeckDiff(localCards, deletedIds, remoteCardMeta, pushedAt, pulledAt) {
    const localMap = new Map(localCards.map(c => [c.id, c]));
    const remoteMap = new Map(remoteCardMeta.map(r => [r.card_id, r.updated_at]));
    const toPush = localCards.filter(c => {
      if (!c.mod || c.mod <= pushedAt) return false;
      const rUpd = remoteMap.get(c.id);
      return !rUpd || c.mod > rUpd;
    });
    const toPull = remoteCardMeta.filter(r => {
      if (r.updated_at <= pulledAt) return false;
      const local = localMap.get(r.card_id);
      return !local || r.updated_at > (local.mod || 0);
    });
    const toDelete = deletedIds.filter(id => remoteMap.has(id));
    return { toPush, toPull, toDelete };
  }
  ```

- [ ] **Step 4：跑回归**

  ```powershell
  node tests/run_all.js
  ```

- [ ] **Step 5：提交**

  ```powershell
  git add index.html tests/yihai_v5.8_sync_test.js
  git commit -m "feat: computeDeckDiff 纯函数 (sync redesign Task 5)"
  ```

---

## Task 6：`computeDeckSyncState`（纯函数）

**Files:**
- Modify: `index.html`
- Modify: `tests/yihai_v5.8_sync_test.js`

- [ ] **Step 1：单测**

  追加到 `tests/yihai_v5.8_sync_test.js`：

  ```js
  // Test 8: computeDeckSyncState
  {
    function computeDeckSyncState(localCards, deletedIds, localMeta, remoteUpdatedAt, pushedAt, pulledAt) {
      const localChanged = localCards.some(c => c.mod && c.mod > pushedAt)
        || deletedIds.length > 0
        || (localMeta.mod && localMeta.mod > pushedAt);
      const remoteAhead = remoteUpdatedAt && remoteUpdatedAt > pulledAt;
      if (localChanged && remoteAhead) return { status: 'bothChanged' };
      if (localChanged) return { status: 'localDirty' };
      if (remoteAhead) return { status: 'remoteAhead' };
      return { status: 'clean' };
    }

    check('clean', computeDeckSyncState([{id:'c',mod:50}], [], {mod:50}, '2025', 100, 100).status === 'clean');
    check('localDirty (card)', computeDeckSyncState([{id:'c',mod:200}], [], {mod:50}, '2025', 100, 100).status === 'localDirty');
    check('localDirty (delete)', computeDeckSyncState([], ['x'], {mod:50}, '2025', 100, 100).status === 'localDirty');
    check('localDirty (meta)', computeDeckSyncState([], [], {mod:200}, '2025', 100, 100).status === 'localDirty');
    check('remoteAhead', computeDeckSyncState([{id:'c',mod:50}], [], {mod:50}, '2030', '2025', '2025').status === 'remoteAhead');
    check('bothChanged', computeDeckSyncState([{id:'c',mod:200}], [], {mod:50}, '2030', 100, '2025').status === 'bothChanged');
  }
  ```

- [ ] **Step 2：跑单测**

  ```powershell
  node tests/yihai_v5.8_sync_test.js
  ```

  预期：22 通过。

- [ ] **Step 3：在 `index.html` 中实现（紧跟 `computeDeckDiff` 之后）**

  ```js
  function computeDeckSyncState(deckKey) {
    const meta = DECKS_META.find(m => m.key === deckKey);
    if (!meta || meta.deck_type !== 'personal') return { status: 'clean' };
    const cards = DECKS[deckKey] || [];
    const deleted = getDeletedCards(deckKey);
    const pushedAt = parseInt(localStorage.getItem('yihaiPushedAt:' + deckKey) || '0');
    const pulledAt = parseInt(localStorage.getItem('yihaiPulledAt:' + deckKey) || '0');
    const remoteUpdatedAt = meta._remoteUpdatedAt ? Date.parse(meta._remoteUpdatedAt) : 0;
    const localChanged = cards.some(c => c.mod && c.mod > pushedAt)
      || deleted.length > 0
      || (meta.mod && meta.mod > pushedAt);
    const pushCount = cards.filter(c => c.mod && c.mod > pushedAt).length + deleted.length;
    const remoteAhead = remoteUpdatedAt && remoteUpdatedAt > pulledAt;
    if (localChanged && remoteAhead) return { status: 'bothChanged', pushCount };
    if (localChanged) return { status: 'localDirty', pushCount };
    if (remoteAhead) return { status: 'remoteAhead' };
    return { status: 'clean' };
  }
  ```

  **注意：** `pushedAt`/`pulledAt` 在水位中存的是 ISO 字符串（来自 `new Date().toISOString()`）或数字（新生成的 mod）。需要统一为数字时间戳。在 Task 4 迁移和后续写入中**全部用 `Date.parse()` 转毫秒**。先在此函数用 `Date.parse` 兼容两种：

  ```js
  function parseWatermark(v) {
    if (!v) return 0;
    if (/^\d+$/.test(v)) return parseInt(v);
    return Date.parse(v) || 0;
  }
  ```

  把 `parseInt(localStorage.getItem(...))` 换成 `parseWatermark(localStorage.getItem(...))`。

- [ ] **Step 4：跑回归**

  ```powershell
  node tests/run_all.js
  ```

- [ ] **Step 5：提交**

  ```powershell
  git add index.html tests/yihai_v5.8_sync_test.js
  git commit -m "feat: computeDeckSyncState (sync redesign Task 6)"
  ```

---

## Task 7：拆分 `uploadDeckToCloud` 为三个原子函数

**Files:**
- Modify: `index.html:9481-9512`

- [ ] **Step 1：紧挨 `uploadDeckToCloud` 之上新增三个原子函数**

  在 `index.html` 第 9481 行之前插入：

  ```js
  async function upsertDeckRow(deckKey) {
    const meta = DECKS_META.find(m => m.key === deckKey);
    if (!meta || meta.deck_type !== 'personal') return;
    const cards = DECKS[deckKey] || [];
    const { error } = await _sb.from('decks').upsert({
      id: deckKey,
      user_id: _cloudUserId,
      name: meta.name,
      deck_type: 'personal',
      card_count: cards.length,
      name_lang: meta.nameLang || 'zh-CN',
      updated_at: new Date().toISOString()
    }, { onConflict: 'id', ignoreDuplicates: false });
    if (error) throw new Error('upsertDeckRow: ' + error.message);
  }

  async function upsertCardsBatch(deckKey, cards) {
    if (!cards.length) return;
    const rows = cards.map((c, i) => ({
      deck_id: deckKey, card_id: c.id, name: c.name,
      image_url: c._imgUrl || null, audio_url: c._audUrl || null, sort_order: i,
      card_type: c.cardType || 'choice', ext: c.ext || {},
      updated_at: new Date(c.mod || Date.now()).toISOString()
    }));
    for (let b = 0; b < rows.length; b += 100) {
      const { error } = await _sb.from('deck_cards')
        .upsert(rows.slice(b, b + 100), { onConflict: 'deck_id,card_id' });
      if (error) throw new Error('upsertCardsBatch: ' + error.message);
    }
  }

  async function deleteCardsBatch(deckKey, cardIds) {
    if (!cardIds.length) return;
    for (let b = 0; b < cardIds.length; b += 100) {
      const slice = cardIds.slice(b, b + 100);
      const { error } = await _sb.from('deck_cards')
        .delete().eq('deck_id', deckKey).in('card_id', slice);
      if (error) throw new Error('deleteCardsBatch: ' + error.message);
    }
  }
  ```

  **注意：** 现有 `deck_cards` 表无 `unique(deck_id, card_id)` 约束（迁移 010）。需要在 Supabase 加一次性约束。详见 Task 7 Step 2。

- [ ] **Step 2：补 unique constraint（一次性，手动 SQL）**

  在 Supabase SQL Editor 跑：

  ```sql
  -- 个人牌组上传从 delete+insert 改为 upsert 所需的唯一约束
  ALTER TABLE deck_cards ADD CONSTRAINT deck_cards_deck_card_uk UNIQUE (deck_id, card_id);
  ```

  同步把这段加到 `sql/supabase_schema.sql` 末尾（持久化）：

  ```sql
  -- 个人牌组 upsert 所需唯一约束（v5.8）
  ALTER TABLE deck_cards ADD CONSTRAINT IF NOT EXISTS deck_cards_deck_card_uk UNIQUE (deck_id, card_id);
  ```

- [ ] **Step 3：保留旧 `uploadDeckToCloud` 不动作为 wrapper**

  把现有 `uploadDeckToCloud` 改为基于新原子函数的薄包装（保兼容，下游一处仍在用：`importYhspack`）：

  ```js
  async function uploadDeckToCloud(key) {
    if (!_syncEnabled || !_sb || !_cloudUserId) return;
    const meta = DECKS_META.find(m => m.key === key);
    if (!meta || meta.deck_type !== 'personal') return;
    const cards = DECKS[key] || [];
    try {
      await upsertDeckRow(key);
      await _sb.from('deck_cards').delete().eq('deck_id', key);
      await upsertCardsBatch(key, cards);
      const now = Date.now();
      localStorage.setItem('yihaiPushedAt:' + key, String(now));
      localStorage.setItem('yihaiSyncAt:' + key, new Date(now).toISOString());
      console.log('[cloud] uploadDeckToCloud ok:', key, cards.length, 'cards');
    } catch(e) {
      console.warn('[cloud] uploadDeckToCloud fail:', e.message);
    }
  }
  ```

- [ ] **Step 4：跑回归 + Playwright 云端测试**

  ```powershell
  node tests/run_all.js
  $env:TEST_PASSWORD="667788"; node tests/_pw_cloud_sync.js
  ```

  预期：全 PASS。

- [ ] **Step 5：提交**

  ```powershell
  git add index.html sql/supabase_schema.sql
  git commit -m "refactor: 拆分 uploadDeckToCloud 为 upsertDeckRow/upsertCardsBatch/deleteCardsBatch (sync redesign Task 7)"
  ```

---

## Task 8：`SyncJob` 类 — Phase 1（结构同步）

**Files:**
- Modify: `index.html`（紧跟 `deleteCardsBatch` 之后）

- [ ] **Step 1：写 SyncJob 骨架 + Phase 1**

  ```js
  class SyncJob {
    constructor(deckKey, opts = {}) {
      this.deckKey = deckKey;
      this.onProgress = opts.onProgress || (() => {});
      this.phase = 'idle';
      this.progress = { done: 0, total: 0 };
      this._paused = false;
      this._pausePromise = null;
      this._pauseResolve = null;
      this._cancelled = false;
    }
    pause() {
      if (this._paused) return;
      this._paused = true;
      this._pausePromise = new Promise(r => { this._pauseResolve = r; });
    }
    resume() {
      if (!this._paused) return;
      this._paused = false;
      if (this._pauseResolve) { this._pauseResolve(); this._pauseResolve = null; }
    }
    cancel() { this._cancelled = true; this.resume(); }
    async _checkpoint() {
      if (this._cancelled) throw new Error('cancelled');
      if (this._paused) await this._pausePromise;
    }
    _setPhase(p, done = 0, total = 0) {
      this.phase = p;
      this.progress = { done, total };
      this.onProgress(this);
    }
    async runStructurePhase() {
      this._setPhase('structure', 0, 1);
      const meta = DECKS_META.find(m => m.key === this.deckKey);
      const pushedAt = parseWatermark(localStorage.getItem('yihaiPushedAt:' + this.deckKey));
      if (meta && meta.mod && meta.mod > pushedAt) await upsertDeckRow(this.deckKey);
      const remote = await fetchAllDeckCards(this.deckKey, 'card_id,updated_at');
      const remoteMeta = (remote || []).map(r => ({
        card_id: r.card_id,
        updated_at: Date.parse(r.updated_at) || 0
      }));
      const cards = DECKS[this.deckKey] || [];
      const deleted = getDeletedCards(this.deckKey);
      const pulledAt = parseWatermark(localStorage.getItem('yihaiPulledAt:' + this.deckKey));
      const diff = computeDeckDiff(cards, deleted, remoteMeta, pushedAt, pulledAt);
      this._setPhase('structure', 1, 1);
      return { diff, remoteRows: remote };
    }
    async run() {
      try {
        const { diff } = await this.runStructurePhase();
        await this._checkpoint();
        await this.runCardsPhase(diff);
        await this._checkpoint();
        this.runMediaPhase().catch(e => console.warn('[sync] media phase:', e.message));
        this._setPhase('done', 1, 1);
      } catch(e) {
        this._setPhase('error', 0, 0);
        throw e;
      }
    }
    async runCardsPhase(diff) { /* Task 9 实现 */ }
    async runMediaPhase() { /* Task 10 实现 */ }
  }
  ```

- [ ] **Step 2：跑 UI 烟测确认 SDK 类定义未崩**

  ```powershell
  node tests/_pw_ui_smoke.js
  ```

- [ ] **Step 3：提交**

  ```powershell
  git add index.html
  git commit -m "feat: SyncJob 类 + Phase 1 结构同步 (sync redesign Task 8)"
  ```

---

## Task 9：`SyncJob` Phase 2（卡片增量）

**Files:**
- Modify: `index.html`（`SyncJob.runCardsPhase`）

- [ ] **Step 1：实现 runCardsPhase**

  把 `runCardsPhase(diff) { /* Task 9 实现 */ }` 替换为：

  ```js
  async runCardsPhase(diff) {
    const { toPush, toPull, toDelete } = diff;
    const total = toPush.length + toPull.length + (toDelete.length > 0 ? 1 : 0);
    let done = 0;
    this._setPhase('cards', done, total);

    // Push
    for (let b = 0; b < toPush.length; b += 100) {
      await this._checkpoint();
      const batch = toPush.slice(b, b + 100);
      await upsertCardsBatch(this.deckKey, batch);
      const maxMod = batch.reduce((m, c) => Math.max(m, c.mod || 0), 0);
      const curPushed = parseWatermark(localStorage.getItem('yihaiPushedAt:' + this.deckKey));
      if (maxMod > curPushed) localStorage.setItem('yihaiPushedAt:' + this.deckKey, String(maxMod));
      done += batch.length;
      this._setPhase('cards', done, total);
    }

    // Pull
    for (let b = 0; b < toPull.length; b += 100) {
      await this._checkpoint();
      const ids = toPull.slice(b, b + 100).map(r => r.card_id);
      const { data, error } = await _sb.from('deck_cards')
        .select('card_id,name,image_url,audio_url,sort_order,card_type,ext,updated_at')
        .eq('deck_id', this.deckKey).in('card_id', ids);
      if (error) throw new Error('pull cards: ' + error.message);
      const cards = DECKS[this.deckKey] || (DECKS[this.deckKey] = []);
      for (const r of data || []) {
        const remoteMod = Date.parse(r.updated_at) || 0;
        const idx = cards.findIndex(c => c.id === r.card_id);
        const merged = {
          id: r.card_id, name: r.name, nameLang: '',
          _imgUrl: r.image_url || '', _audUrl: r.audio_url || '',
          img: '', audioUrl: '', details: [],
          cardType: r.card_type || 'choice', ext: r.ext || {},
          mod: remoteMod
        };
        if (idx >= 0) cards[idx] = merged;
        else cards.push(merged);
      }
      const maxRemoteMod = data.reduce((m, r) => Math.max(m, Date.parse(r.updated_at) || 0), 0);
      const curPulled = parseWatermark(localStorage.getItem('yihaiPulledAt:' + this.deckKey));
      if (maxRemoteMod > curPulled) localStorage.setItem('yihaiPulledAt:' + this.deckKey, String(maxRemoteMod));
      done += ids.length;
      this._setPhase('cards', done, total);
    }
    saveDeckCards(this.deckKey, DECKS[this.deckKey] || []);

    // Delete
    if (toDelete.length) {
      await this._checkpoint();
      await deleteCardsBatch(this.deckKey, toDelete);
      clearDeletedCards(this.deckKey);
      done += 1;
      this._setPhase('cards', done, total);
    }
  }
  ```

- [ ] **Step 2：跑 UI 烟测确认无语法错误**

  ```powershell
  node tests/_pw_ui_smoke.js
  ```

- [ ] **Step 3：提交**

  ```powershell
  git add index.html
  git commit -m "feat: SyncJob Phase 2 卡片增量 push/pull/delete (sync redesign Task 9)"
  ```

---

## Task 10：`SyncJob` Phase 3（媒体）+ `syncDeck` 入口

**Files:**
- Modify: `index.html`（`SyncJob.runMediaPhase` + 新增 `syncDeck` / `syncAllDirtyDecks`）

- [ ] **Step 1：实现 runMediaPhase（沿用现有 uploadPersonalDeckMedia）**

  ```js
  async runMediaPhase() {
    await uploadPersonalDeckMedia(this.deckKey);
    localStorage.setItem('yihaiPushedMediaAt:' + this.deckKey, String(Date.now()));
  }
  ```

  **注意：** 现有 `uploadPersonalDeckMedia` 上传成功后会调 `uploadDeckToCloud`（写回 `_imgUrl/_audUrl`）。Task 7 改造后这条路径仍能正确推进 `yihaiPushedAt`，无需改动。

- [ ] **Step 2：新增 `syncDeck` 主入口**

  在 SyncJob 类之后插入：

  ```js
  const _activeSyncJobs = new Map();

  async function syncDeck(deckKey, opts = {}) {
    if (!_syncEnabled || !_sb || !_cloudUserId) return;
    if (_activeSyncJobs.has(deckKey)) return _activeSyncJobs.get(deckKey);
    const job = new SyncJob(deckKey, opts);
    _activeSyncJobs.set(deckKey, job);
    try { await job.run(); }
    catch(e) { console.warn('[sync] syncDeck fail:', deckKey, e.message); throw e; }
    finally { _activeSyncJobs.delete(deckKey); }
    return job;
  }

  async function syncAllDirtyDecks() {
    if (!_syncEnabled || !_sb || !_cloudUserId) return;
    const personals = DECKS_META.filter(m => m.deck_type === 'personal');
    for (const m of personals) {
      const state = computeDeckSyncState(m.key);
      if (state.status === 'clean' || state.status === 'remoteAhead') continue;
      try { await syncDeck(m.key); }
      catch(e) { console.warn('[sync] dirty deck fail:', m.key, e.message); }
    }
  }

  function getActiveSyncJob(deckKey) {
    return _activeSyncJobs.get(deckKey) || null;
  }
  ```

- [ ] **Step 3：把 `runSync` 链中的 `uploadMissingPersonalDecks` 替换为 `syncAllDirtyDecks`**

  在 `index.html` 第 5529 行附近：

  原：
  ```js
  .then(() => uploadMissingPersonalDecks())
  ```

  改：
  ```js
  .then(() => syncAllDirtyDecks())
  ```

  同样改第 5558 行 `function() { return uploadMissingPersonalDecks(); }` 为 `function() { return syncAllDirtyDecks(); }`。

  把第 5559 行 `.then(function() { return checkPersonalDeckUpdates(); })` 删除（其拉取功能由 syncDeck Phase 2 替代）。

  把第 5560 行的 `uploadPersonalDeckMedia` forEach 删除（由 SyncJob.runMediaPhase 自动接管）。

- [ ] **Step 4：保留 `uploadMissingPersonalDecks` 作为兼容 wrapper**

  把 `index.html:9514` 的 `uploadMissingPersonalDecks` 改为：

  ```js
  async function uploadMissingPersonalDecks() {
    return syncAllDirtyDecks();
  }
  ```

- [ ] **Step 5：跑 Playwright 云端 + 跨设备**

  ```powershell
  $env:TEST_PASSWORD="667788"; node tests/_pw_cloud_sync.js
  $env:TEST_PASSWORD="667788"; node tests/_pw_cross_device.js
  ```

- [ ] **Step 6：提交**

  ```powershell
  git add index.html
  git commit -m "feat: SyncJob Phase 3 + syncDeck/syncAllDirtyDecks 入口；接管 runSync 链 (sync redesign Task 10)"
  ```

---

## Task 11：在所有编辑入口打 `mod` 标记

**Files:**
- Modify: `index.html`（`importYhspack` 4666、`createEmptyDeck` 5245、`renameDeck` 4905、`deleteDeck` 4876、`downloadPersonalDeckFromCloud` 9620）

- [ ] **Step 1：`importYhspack`（4666）— 给每张卡 + meta 打 mod**

  在 `index.html:4687`（`const card = { id: c.id || ..., ext: c.ext || {} };`）改为：

  ```js
  const card = { id: c.id || String(i), name: nf.text, nameLang: nf.lang, img: '', audioUrl: '', details: [],
                 cardType: c.cardType || c.card_type || 'choice', ext: c.ext || {}, mod: nextMod() };
  ```

  在 4729 行附近，写入 meta 时加 `mod`：

  ```js
  const metaMod = nextMod();
  if (existing >= 0) DECKS_META[existing] = { key, name, deck_type: 'personal', nameLang: deckLangVal, mod: metaMod };
  else DECKS_META.push({ key, name, deck_type: 'personal', nameLang: deckLangVal, mod: metaMod });
  ```

  把 4736 行 `localStorage.setItem('yihaiSyncAt:' + key, ...)` 删除（由 syncDeck 推进水位）。

  把 4737 行 `uploadDeckToCloud(key).catch(() => {});` 改为：

  ```js
  syncDeck(key).catch(() => {});
  ```

- [ ] **Step 2：`createEmptyDeck`（5245）— meta 打 mod**

  改 5250：

  ```js
  DECKS_META.push({ key: key, name: name.trim(), deck_type: 'personal', mod: nextMod() });
  ```

  删 5253 `localStorage.setItem('yihaiSyncAt:' + key, ...)`，改 5254 `uploadDeckToCloud(key)` 为 `syncDeck(key)`。

- [ ] **Step 3：`renameDeck`（4905）— meta 打 mod + 触发同步**

  在 4910 `meta.name = newName.trim();` 之后插入：

  ```js
  meta.mod = nextMod();
  ```

  在 `saveDeckIndex();` 之后插入：

  ```js
  if (meta.deck_type === 'personal' && _syncEnabled) syncDeck(key).catch(() => {});
  ```

- [ ] **Step 4：`deleteDeck`（4876）— 已在 Task 3 清墓碑；这里删掉云端直删并改走标准路径**

  删 4894-4895（`_sb.from('deck_cards').delete()` / `_sb.from('decks').delete()`）保持不变即可（牌组整删走级联 DELETE，仍可立刻）。

  无需额外打 mod，整个牌组从 DECKS_META 移除即可。

- [ ] **Step 5：`downloadPersonalDeckFromCloud`（9620）— 拉下时把 mod = 云端 updated_at**

  Grep `makeCard` 函数（9628）改为：

  ```js
  const makeCard = c => ({
    id: c.card_id, name: c.name, img: '', audioUrl: '', details: [],
    cardType: c.card_type || 'choice', ext: c.ext || {},
    mod: Date.parse(c.updated_at) || 0
  });
  ```

  对应 SELECT 字段补 `updated_at`（9623）：

  ```js
  const cards = await fetchAllDeckCards(this.deckKey, 'card_id,name,image_url,audio_url,card_type,ext,updated_at');
  ```

  **注意：** 不是 `this.deckKey`，是 `deckId`（旧函数）。改为：

  ```js
  const cards = await fetchAllDeckCards(deckId, 'card_id,name,image_url,audio_url,card_type,ext,updated_at');
  ```

  下载完成后在 `saveDeckCards(deckId, ...)` 后立即设置水位：

  ```js
  const maxMod = (cards || []).reduce((m, c) => Math.max(m, Date.parse(c.updated_at) || 0), 0);
  if (maxMod) {
    localStorage.setItem('yihaiPushedAt:' + deckId, String(maxMod));
    localStorage.setItem('yihaiPulledAt:' + deckId, String(maxMod));
  }
  ```

- [ ] **Step 6：跑完整 Playwright**

  ```powershell
  $env:TEST_PASSWORD="667788"; node tests/_pw_cloud_sync.js
  $env:TEST_PASSWORD="667788"; node tests/_pw_cross_device.js
  node tests/_pw_ui_smoke.js
  ```

- [ ] **Step 7：提交**

  ```powershell
  git add index.html
  git commit -m "feat: 在编辑入口打 mod 标记并接入 syncDeck (sync redesign Task 11)"
  ```

---

## Task 12：`showCloudDecks` 接入同步状态徽章

**Files:**
- Modify: `index.html:5565-5610` (`showCloudDecks`)

- [ ] **Step 1：拉云端时同时记 `_remoteUpdatedAt` 到本地 meta**

  在 `showCloudDecks` 5577 行（拿到 cloudDecks 之后）插入：

  ```js
  for (const cd of cloudDecks) {
    const m = DECKS_META.find(x => x.key === cd.id);
    if (m) m._remoteUpdatedAt = cd.updated_at;
  }
  ```

- [ ] **Step 2：渲染时按状态显示徽章**

  把 5581 行起的 `cloudDecks.map(d => {...})` 替换为：

  ```js
  listEl.innerHTML = cloudDecks.map(d => {
    const dl = _downloading.get(d.id);
    const job = getActiveSyncJob(d.id);
    const local = DECKS_META.find(m => m.key === d.id);
    const state = local ? computeDeckSyncState(d.id) : { status: 'remoteAhead' };
    const nameArg = `'${d.id}','${esc(d.name).replace(/'/g,'&#39;')}','${d.name_lang||'zh-CN'}'`;

    let badge = '';
    if (job) badge = `<span style="color:#888">同步中 ${job.progress.done}/${job.progress.total}</span>`;
    else if (state.status === 'clean') badge = `<span style="color:#888">已同步</span>`;
    else if (state.status === 'localDirty') badge = `<span style="color:#d97706">待上传 ${state.pushCount}</span>`;
    else if (state.status === 'remoteAhead') badge = `<span style="color:#2563eb">待下载</span>`;
    else if (state.status === 'bothChanged') badge = `<span style="color:#7c3aed">双向 +${state.pushCount}</span>`;

    let btn;
    if (dl) {
      const txt = dl.total > 0 ? `${dl.done}/${dl.total}` : '…';
      const pauseLabel = dl.paused ? '继续' : '暂停';
      btn = `<div style="display:flex;gap:8px;align-items:center">
        <span id="dl-prog-${d.id}" style="font-size:13px;color:var(--text-sub);min-width:72px;text-align:right">${txt}</span>
        <button class="account-sync-btn" onclick="toggleDownloadPause('${d.id}')">${pauseLabel}</button>
      </div>`;
    } else if (job) {
      const pauseLabel = job._paused ? '继续' : '暂停';
      btn = `<button class="account-sync-btn" onclick="toggleSyncJobPause('${d.id}')">${pauseLabel}</button>`;
    } else if (local) {
      btn = `<button class="account-sync-btn" onclick="doSyncDeckAction('${d.id}',this)">同步</button>`;
    } else {
      btn = `<button class="account-btn account-btn-primary" style="padding:6px 16px;min-height:0;font-size:14px" onclick="doCloudDeckAction(${nameArg},this)">下载</button>`;
    }

    const sub = dl ? (dl.paused ? '已暂停' : '下载中…')
              : `${d.card_count || 0} 张卡片${local ? ' · ' : ''}${badge}`;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-weight:600;color:var(--text)">${esc(d.name)}</div>
        <div style="font-size:12px;color:var(--text-sub);margin-top:2px">${sub}</div>
      </div>
      ${btn}
    </div>`;
  }).join('');
  ```

- [ ] **Step 3：实现 `doSyncDeckAction` + `toggleSyncJobPause`（放在 `doCloudDeckAction` 5612 之后）**

  ```js
  async function doSyncDeckAction(deckId, btnEl) {
    if (getActiveSyncJob(deckId)) return;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '同步中…'; }
    try {
      await syncDeck(deckId, { onProgress: () => showCloudDecks() });
      showCloudToast('同步完成');
    } catch(e) {
      showCloudToast('同步失败：' + e.message, true);
    } finally {
      await showCloudDecks();
    }
  }

  function toggleSyncJobPause(deckId) {
    const job = getActiveSyncJob(deckId);
    if (!job) return;
    if (job._paused) job.resume(); else job.pause();
    showCloudDecks();
  }
  ```

- [ ] **Step 4：跑 Playwright 云端测试**

  ```powershell
  $env:TEST_PASSWORD="667788"; node tests/_pw_cloud_sync.js
  ```

- [ ] **Step 5：提交**

  ```powershell
  git add index.html
  git commit -m "feat: showCloudDecks 接入同步状态徽章 + 单牌组同步按钮 (sync redesign Task 12)"
  ```

---

## Task 13：扩展 `_pw_cross_device.js` — 增量上传 / 暂停续传 / 迁移

**Files:**
- Modify: `tests/_pw_cross_device.js`

- [ ] **Step 1：在文件末尾追加三个新场景**

  打开 `tests/_pw_cross_device.js`，参考现有用例风格在最后一个测试之前插入：

  ```js
  // ── 场景：增量上传（编辑单张卡只传该卡） ─────────────────────
  await test('设备 A 编辑单卡，云端 deck_cards 只更新该行', async () => {
    // 1. 设备 A 登录 → 导入一个 3 卡的小牌组
    // 2. 等首次同步完成
    // 3. 改第 2 张卡的 name → 触发 syncDeck
    // 4. 查云端 deck_cards：只该卡的 updated_at 改变
    // （具体写法参考已有的设备 A/B 框架）
  });

  // ── 场景：暂停续传 ───────────────────────────────────────────
  await test('同步中暂停后续传，不重传已传卡片', async () => {
    // 1. 导入大牌组（>200 卡触发分批）
    // 2. 开始 syncDeck
    // 3. 等第一批完成后 pause()
    // 4. 记录 pushedAt 水位
    // 5. resume()
    // 6. 验证最终上传完成 + 第一批未重传（可通过监听 supabase 请求数）
  });

  // ── 场景：旧 yihaiSyncAt 迁移不重复全传 ──────────────────────
  await test('升级版本后水位迁移生效，首次同步不全量重传', async () => {
    // 1. localStorage 注入旧 key: yihaiSyncAt:dX = 某时间戳，无 pushedAt
    // 2. 启动 app → migrateSyncWatermarks 触发
    // 3. 验证 yihaiPushedAt 已生成
    // 4. 触发 syncDeck，验证 toPush 为空（因水位已对齐）
  });
  ```

  **注意：** 具体 Playwright 写法（如何调 syncDeck、如何 mock 编辑）参考文件已有的 `evaluate` 调用模式。

- [ ] **Step 2：跑新测试**

  ```powershell
  $env:TEST_PASSWORD="667788"; node tests/_pw_cross_device.js
  ```

  预期：所有断言 PASS。

- [ ] **Step 3：提交**

  ```powershell
  git add tests/_pw_cross_device.js
  git commit -m "test: 跨设备测试增量上传/暂停续传/水位迁移 (sync redesign Task 13)"
  ```

---

## Task 14：清理与文档更新（发布前）

**Files:**
- Modify: `index.html`（清理）
- Modify: `CLAUDE.md`、`docs/忆海拾光_训练App_README.md`、`docs/yihai_变更记录_CLAUDE参考.md`

- [ ] **Step 1：在 `index.html` 删除/标记 deprecation**

  - `uploadMissingPersonalDecks`（兼容 wrapper，留一个版本）：函数体加注释 `// deprecated: replaced by syncAllDirtyDecks (v5.8)，下版本删除`
  - `checkPersonalDeckUpdates`（9576）：函数体改为单行 `return syncAllDirtyDecks();` 加同样注释

- [ ] **Step 2：更新 `CLAUDE.md`**

  - "当前版本：v5.8.0"
  - "v5.8.0：个人牌组同步重做 — SyncJob 三阶段（结构/卡片/媒体）+ 卡片级 mod 增量 + 删除墓碑 + 暂停续传 + 状态徽章；deck_cards 加 unique(deck_id, card_id) 约束；yihaiSyncAt 拆为 pushedAt/pulledAt"
  - 测试断言数更新（新增 `yihai_v5.8_sync_test.js`）

- [ ] **Step 3：更新 `docs/忆海拾光_训练App_README.md`** 加 v5.8.0 条目

- [ ] **Step 4：更新 `docs/yihai_变更记录_CLAUDE参考.md`** 加 v5.8.0 详细记录

- [ ] **Step 5：bump version（发布时由 release skill 处理；本任务不动）**

  跳过 — 等用户发"发布"指令时 release skill 会处理。

- [ ] **Step 6：跑全量回归确认无回退**

  ```powershell
  node tests/run_all.js
  node tests/_pw_ui_smoke.js
  node tests/_pw_srs_e2e.js
  $env:TEST_PASSWORD="667788"; node tests/_pw_cloud_sync.js
  $env:TEST_PASSWORD="667788"; node tests/_pw_cross_device.js
  ```

- [ ] **Step 7：提交**

  ```powershell
  git add index.html CLAUDE.md docs/忆海拾光_训练App_README.md docs/yihai_变更记录_CLAUDE参考.md
  git commit -m "docs: v5.8.0 同步重设计 — 文档与 deprecation 标记 (sync redesign Task 14)"
  ```

---

## 完成后

- 等用户验收 + 发"发布"指令
- 发布走 `release` skill：版本号 bump → tag → push → gh release
- 释放后 1-2 个版本（v5.9+）再清理 `uploadMissingPersonalDecks` / `checkPersonalDeckUpdates` 兼容 wrapper
- 同步重设计验证稳定后，回头执行 `docs/superpowers/plans/2026-06-05-deck-management.md`（牌组管理页 UI），在 `renderDeckMgmtList` 内调 `computeDeckSyncState(key)` 接状态徽章

## 风险提示

- **Task 7 Step 2** 的 unique constraint 是云端一次性操作 — 必须先在 Supabase 跑 SQL，否则 Task 7 之后所有 `upsertCardsBatch` 调用都会失败。可以在 PR 描述里强调此步必须先做。
- **Task 11 Step 5** 修改 `downloadPersonalDeckFromCloud` 时注意 `parallelMapLimit` 内的 `c` 是带 `updated_at` 的远端 row；如果回写到 `makeCard` 后丢失 `updated_at`，水位会算不对。新 `makeCard` 把 `mod` 设为 `Date.parse(c.updated_at)`。
- 系统时钟乱跳由 `nextMod` 兜底，但跨设备的"墙钟一致性"靠云端 `updated_at`。两台设备 mod 都用本地 Date.now() 是 OK 的，因为最终 last-write-wins 比较的是云端 `updated_at`。
