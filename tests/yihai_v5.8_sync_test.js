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
  resetMod();
  _lastMod = Date.now() + 10000;
  const m1 = nextMod();
  const m2 = nextMod();
  check('时钟回拨仍单调', m2 === m1 + 1);
}

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

  saveDeckCards('k2', [{ id: 'c1', name: 'old' }]);
  const loaded2 = loadDeckCards('k2');
  check('无 mod 字段加载为 0', loaded2[0].mod === 0);
}

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
  markCardDeleted('d1', 'c1');
  check('墓碑去重', JSON.stringify(getDeletedCards('d1')) === '["c1","c2"]');

  clearDeletedCards('d1');
  check('清墓碑', getDeletedCards('d1').length === 0);
}

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

  ls['yihaiSyncAt:d2'] = '2026-06-01';
  ls['yihaiPushedAt:d2'] = '2026-06-05';
  migrateSyncWatermarks();
  check('已存在 pushedAt 不被覆盖', ls['yihaiPushedAt:d2'] === '2026-06-05');
}

// Test 7: computeDeckDiff
{
  function computeDeckDiff(localCards, deletedIds, remoteCardMeta, pushedAt, pulledAt) {
    const localMap  = new Map(localCards.map(c => [c.id, c]));
    const remoteMap = new Map(remoteCardMeta.map(r => [r.card_id, r.ts]));
    const toPush = localCards.filter(c => {
      if (!c.mod || c.mod <= pushedAt) return false;
      const rTs = remoteMap.get(c.id);
      return rTs === undefined || c.mod > rTs;
    });
    const toPull = remoteCardMeta.filter(r => {
      if (r.ts <= pulledAt) return false;
      const local = localMap.get(r.card_id);
      return !local || r.ts > (local.mod || 0);
    });
    const toDelete = deletedIds.filter(id => remoteMap.has(id));
    return { toPush, toPull, toDelete };
  }

  {
    const r = computeDeckDiff(
      [{ id: 'c1', mod: 100 }, { id: 'c2', mod: 50 }],
      [],
      [{ card_id: 'c2', ts: 50 }],
      50, 50
    );
    check('A: toPush=[c1]', r.toPush.length === 1 && r.toPush[0].id === 'c1');
    check('A: toPull 空', r.toPull.length === 0);
  }

  {
    const r = computeDeckDiff(
      [{ id: 'c1', mod: 50 }],
      [],
      [{ card_id: 'c1', ts: 50 }, { card_id: 'c2', ts: 100 }],
      50, 50
    );
    check('B: toPull=[c2]', r.toPull.length === 1 && r.toPull[0].card_id === 'c2');
    check('B: toPush 空', r.toPush.length === 0);
  }

  {
    const r = computeDeckDiff(
      [{ id: 'c1', mod: 200 }],
      [],
      [{ card_id: 'c1', ts: 150 }],
      100, 100
    );
    check('C: 本地赢', r.toPush.length === 1 && r.toPull.length === 0);
  }

  {
    const r = computeDeckDiff(
      [{ id: 'c1', mod: 150 }],
      [],
      [{ card_id: 'c1', ts: 200 }],
      100, 100
    );
    check('D: 云端赢', r.toPush.length === 0 && r.toPull.length === 1);
  }

  {
    const r = computeDeckDiff(
      [],
      ['c1'],
      [{ card_id: 'c1', ts: 100 }],
      50, 50
    );
    check('E: toDelete=[c1]', r.toDelete.length === 1 && r.toDelete[0] === 'c1');
  }

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

// Test 8: computeDeckSyncState 核心逻辑
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

  check('clean', computeDeckSyncState([{id:'c',mod:50}], [], {mod:50}, 2025, 100, 2025).status === 'clean');
  check('localDirty (card)', computeDeckSyncState([{id:'c',mod:200}], [], {mod:50}, 2025, 100, 2025).status === 'localDirty');
  check('localDirty (delete)', computeDeckSyncState([], ['x'], {mod:50}, 2025, 100, 2025).status === 'localDirty');
  check('localDirty (meta)', computeDeckSyncState([], [], {mod:200}, 2025, 100, 2025).status === 'localDirty');
  check('remoteAhead', computeDeckSyncState([{id:'c',mod:50}], [], {mod:50}, 2030, 2025, 2025).status === 'remoteAhead');
  check('bothChanged', computeDeckSyncState([{id:'c',mod:200}], [], {mod:50}, 2030, 100, 2025).status === 'bothChanged');
}

console.log(`\n  通过 ${passed} / 失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
