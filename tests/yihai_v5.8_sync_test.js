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

console.log(`\n  通过 ${passed} / 失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
