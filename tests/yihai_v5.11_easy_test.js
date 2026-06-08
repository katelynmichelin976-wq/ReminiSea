// tests/yihai_v5.11_easy_test.js
// Easy 模式纯函数单测（与 index.html 保持同步）

let passed = 0, failed = 0;
function check(desc, ok) {
  if (ok) passed++;
  else { failed++; console.log(`  ✗ ${desc}`); }
}

// ── computeEasyStructure ──────────────────────────────────────────
function computeEasyStructure(T) {
  if (T < 7) return { kind: 'flat', size: T, warmup: 0, k: 0, r: 0 };
  const k = Math.floor((T - 3) / 4);
  const r = T - 3 - 4 * k;
  return { kind: 'structured', size: T, warmup: 3, k, r };
}

{
  const a = computeEasyStructure(10);
  check('T=10: k=1 r=3', a.warmup === 3 && a.k === 1 && a.r === 3);
  const b = computeEasyStructure(15);
  check('T=15: k=3 r=0', b.warmup === 3 && b.k === 3 && b.r === 0);
  const c = computeEasyStructure(19);
  check('T=19: k=4 r=0 (default)', c.warmup === 3 && c.k === 4 && c.r === 0);
  const d = computeEasyStructure(20);
  check('T=20: k=4 r=1', d.warmup === 3 && d.k === 4 && d.r === 1);
  const e = computeEasyStructure(23);
  check('T=23: k=5 r=0', e.warmup === 3 && e.k === 5 && e.r === 0);
  const f = computeEasyStructure(30);
  check('T=30: k=6 r=3', f.warmup === 3 && f.k === 6 && f.r === 3);
  const g = computeEasyStructure(6);
  check('T=6: flat (no structure)', g.kind === 'flat' && g.size === 6);
  const h = computeEasyStructure(19);
  check('T=19: total length == T', 3 + h.k * 4 + h.r === 19);
  const i = computeEasyStructure(20);
  check('T=20: total length == T', 3 + i.k * 4 + i.r === 20);
}

// ── classifyEasyCard ──────────────────────────────────────────────
function classifyEasyCard(state) {
  if (!state) return 'unseen';
  const h = state.history || [];
  if (h.length === 3 && h.every(x => x === 1)) return 'confident';
  return 'learning';
}

{
  check('null → unseen', classifyEasyCard(null) === 'unseen');
  check('undefined → unseen', classifyEasyCard(undefined) === 'unseen');
  check('empty history → learning', classifyEasyCard({ history: [] }) === 'learning');
  check('[1] → learning', classifyEasyCard({ history: [1] }) === 'learning');
  check('[1,1] → learning', classifyEasyCard({ history: [1, 1] }) === 'learning');
  check('[1,1,1] → confident', classifyEasyCard({ history: [1, 1, 1] }) === 'confident');
  check('[1,0,1] → learning', classifyEasyCard({ history: [1, 0, 1] }) === 'learning');
  check('[0,0,0] → learning', classifyEasyCard({ history: [0, 0, 0] }) === 'learning');
}

// ── learningWeaknessKey (for L slot: weakest first) ───────────────
// Sort tuple (ASC): [lastIsCorrect (0 first), -zeroCount (more zeros first), last_seen ASC]
function learningWeaknessKey(s) {
  const h = s.history || [];
  const lastIsCorrect = h.length ? h[h.length - 1] : 1;
  const zeroCount = h.filter(x => x === 0).length;
  return [lastIsCorrect, -zeroCount, s.last_seen || 0];
}

function cmpKey(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

{
  const a = { history: [1, 1, 0], last_seen: 100 };  // last=0, zeros=1
  const b = { history: [1, 0, 1], last_seen: 50  };  // last=1, zeros=1
  const c = { history: [0, 0, 1], last_seen: 200 }; // last=1, zeros=2
  const sorted = [b, c, a].sort((x, y) =>
    cmpKey(learningWeaknessKey(x), learningWeaknessKey(y))
  );
  check('weakness: last==0 排首', sorted[0] === a);
  check('weakness: 同 lastIsCorrect 时 zeros 多者优先', sorted[1] === c);
  check('weakness: 最后 last_seen ASC', sorted[2] === b);
}

// ── learningStabilityKey (for C slot fallback: most stable first) ─
// Sort tuple (ASC): [-lastIsCorrect (1 first), zeroCount ASC (fewer zeros first),
//                    -last_warmup (recent warmup deprio), last_seen ASC]
function learningStabilityKey(s) {
  const h = s.history || [];
  const lastIsCorrect = h.length ? h[h.length - 1] : 0;
  const zeroCount = h.filter(x => x === 0).length;
  return [-lastIsCorrect, zeroCount, -(s.last_warmup || 0), s.last_seen || 0];
}

{
  const a = { history: [0, 1, 1], last_seen: 100, last_warmup: 0 };  // last=1, zeros=1
  const b = { history: [1, 1, 0], last_seen: 50,  last_warmup: 0 };  // last=0, zeros=1
  const c = { history: [1, 1],    last_seen: 80,  last_warmup: 0 };  // last=1, zeros=0
  const sorted = [a, b, c].sort((x, y) =>
    cmpKey(learningStabilityKey(x), learningStabilityKey(y))
  );
  check('stability: zeros 最少且 last==1 优先', sorted[0] === c);
  check('stability: last==1 但 zeros 多者次之', sorted[1] === a);
  check('stability: last==0 排末', sorted[2] === b);
}

// ── pickLSlotCandidates ──────────────────────────────────────────
// Order matters: unseen first (random), then learning by weakness, then far confident
function pickLSlotCandidates(pools) {
  const list = [];
  // shuffled unseen
  for (const c of [...pools.unseen].sort(() => Math.random() - 0.5)) list.push({ card: c, role: 'L', tier: 'unseen' });
  // learning by weakness
  const learnSorted = [...pools.learning].sort((x, y) =>
    cmpKey(learningWeaknessKey(x.state), learningWeaknessKey(y.state)));
  for (const e of learnSorted) list.push({ card: e.card, role: 'L', tier: 'learning' });
  // far confident fallback
  const confSorted = [...pools.confident].sort((x, y) =>
    (x.state.last_seen || 0) - (y.state.last_seen || 0));
  for (const e of confSorted) list.push({ card: e.card, role: 'L', tier: 'confident' });
  return list;
}

// ── pickCSlotCandidates ──────────────────────────────────────────
// roleHint: 'warmup' | 'core' | 'tail'
function pickCSlotCandidates(pools, roleHint) {
  const list = [];
  const confSort = roleHint === 'warmup'
    ? (a, b) => ((a.state.last_warmup || 0) - (b.state.last_warmup || 0))
                || ((a.state.last_seen || 0) - (b.state.last_seen || 0))
    : (a, b) => (a.state.last_seen || 0) - (b.state.last_seen || 0);
  for (const e of [...pools.confident].sort(confSort)) list.push({ card: e.card, tier: 'confident' });
  // learning fallback by stability
  const learnSorted = [...pools.learning].sort((x, y) =>
    cmpKey(learningStabilityKey(x.state), learningStabilityKey(y.state)));
  for (const e of learnSorted) list.push({ card: e.card, tier: 'learning' });
  // unseen 仅极端兜底（不洗牌；调用方需要判断）
  for (const c of pools.unseen) list.push({ card: c, tier: 'unseen' });
  return list;
}

{
  const pools = {
    confident: [],
    learning: [
      { card: { id: 'a' }, state: { history: [1, 1], last_seen: 10, last_warmup: 0 } },
      { card: { id: 'b' }, state: { history: [0, 0, 0], last_seen: 5, last_warmup: 0 } },
    ],
    unseen: [{ id: 'u1' }, { id: 'u2' }],
  };
  const lCands = pickLSlotCandidates(pools);
  const ids = lCands.map(x => x.card.id);
  check('L 槽：unseen 排前 2', ids[0].startsWith('u') && ids[1].startsWith('u'));
  check('L 槽：最弱 learning 排第 3 (b: zeros=3)', ids[2] === 'b');
  check('L 槽：次弱 learning 排第 4 (a)', ids[3] === 'a');

  const cCands = pickCSlotCandidates(pools, 'warmup');
  const cIds = cCands.map(x => x.card.id);
  check('C 槽（冷启动）：最稳 learning 排首 (a: lastIsCorrect=1, zeros=0)', cIds[0] === 'a');
  check('C 槽（冷启动）：次稳 (b)', cIds[1] === 'b');
}

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
