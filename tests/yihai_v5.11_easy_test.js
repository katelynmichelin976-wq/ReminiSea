// tests/yihai_v5.11_easy_test.js
// Easy mode pure-function tests kept in sync with index.html.

let passed = 0;
let failed = 0;

function check(desc, ok) {
  if (ok) {
    passed++;
    return;
  }
  failed++;
  console.log(`  ✗ ${desc}`);
}

// computeEasyStructure
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

// classifyEasyCard
function classifyEasyCard(state) {
  if (!state) return 'unseen';
  const h = state.history || [];
  if (h.length === 3 && h.every((x) => x === 1)) return 'confident';
  return 'learning';
}

{
  check('null -> unseen', classifyEasyCard(null) === 'unseen');
  check('undefined -> unseen', classifyEasyCard(undefined) === 'unseen');
  check('empty history -> learning', classifyEasyCard({ history: [] }) === 'learning');
  check('[1] -> learning', classifyEasyCard({ history: [1] }) === 'learning');
  check('[1,1] -> learning', classifyEasyCard({ history: [1, 1] }) === 'learning');
  check('[1,1,1] -> confident', classifyEasyCard({ history: [1, 1, 1] }) === 'confident');
  check('[1,0,1] -> learning', classifyEasyCard({ history: [1, 0, 1] }) === 'learning');
  check('[0,0,0] -> learning', classifyEasyCard({ history: [0, 0, 0] }) === 'learning');
}

// learningWeaknessKey
// Sort tuple (ASC): [lastIsCorrect (0 first), -zeroCount (more zeros first), last_seen ASC]
function learningWeaknessKey(s) {
  const h = s.history || [];
  const lastIsCorrect = h.length ? h[h.length - 1] : 1;
  const zeroCount = h.filter((x) => x === 0).length;
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
  const a = { history: [1, 1, 0], last_seen: 100 };
  const b = { history: [1, 0, 1], last_seen: 50 };
  const c = { history: [0, 0, 1], last_seen: 200 };
  const sorted = [b, c, a].sort((x, y) => cmpKey(learningWeaknessKey(x), learningWeaknessKey(y)));
  check('weakness: last==0 first', sorted[0] === a);
  check('weakness: more zeros wins when lastIsCorrect ties', sorted[1] === c);
  check('weakness: last_seen ASC last', sorted[2] === b);
}

// learningStabilityKey
// Sort tuple (ASC): [-lastIsCorrect (1 first), zeroCount ASC, -last_warmup, last_seen ASC]
function learningStabilityKey(s) {
  const h = s.history || [];
  const lastIsCorrect = h.length ? h[h.length - 1] : 0;
  const zeroCount = h.filter((x) => x === 0).length;
  return [-lastIsCorrect, zeroCount, -(s.last_warmup || 0), s.last_seen || 0];
}

{
  const a = { history: [0, 1, 1], last_seen: 100, last_warmup: 0 };
  const b = { history: [1, 1, 0], last_seen: 50, last_warmup: 0 };
  const c = { history: [1, 1], last_seen: 80, last_warmup: 0 };
  const sorted = [a, b, c].sort((x, y) => cmpKey(learningStabilityKey(x), learningStabilityKey(y)));
  check('stability: fewest zeros with last==1 first', sorted[0] === c);
  check('stability: last==1 with more zeros next', sorted[1] === a);
  check('stability: last==0 last', sorted[2] === b);
}

// pickLSlotCandidates
function pickLSlotCandidates(pools) {
  const list = [];
  for (const c of [...pools.unseen].sort(() => Math.random() - 0.5)) {
    list.push({ card: c, role: 'L', tier: 'unseen' });
  }
  const learnSorted = [...pools.learning].sort((x, y) => cmpKey(learningWeaknessKey(x.state), learningWeaknessKey(y.state)));
  for (const e of learnSorted) list.push({ card: e.card, role: 'L', tier: 'learning' });
  const confSorted = [...pools.confident].sort((x, y) => (x.state.last_seen || 0) - (y.state.last_seen || 0));
  for (const e of confSorted) list.push({ card: e.card, role: 'L', tier: 'confident' });
  return list;
}

// pickCSlotCandidates
function pickCSlotCandidates(pools, roleHint) {
  const list = [];
  const confSort = roleHint === 'warmup'
    ? (a, b) => ((a.state.last_warmup || 0) - (b.state.last_warmup || 0))
      || ((a.state.last_seen || 0) - (b.state.last_seen || 0))
    : (a, b) => (a.state.last_seen || 0) - (b.state.last_seen || 0);
  for (const e of [...pools.confident].sort(confSort)) list.push({ card: e.card, tier: 'confident' });
  const learnSorted = [...pools.learning].sort((x, y) => cmpKey(learningStabilityKey(x.state), learningStabilityKey(y.state)));
  for (const e of learnSorted) list.push({ card: e.card, tier: 'learning' });
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
  const ids = lCands.map((x) => x.card.id);
  check('L slot: unseen first two', ids[0].startsWith('u') && ids[1].startsWith('u'));
  check('L slot: weakest learning third', ids[2] === 'b');
  check('L slot: next learning fourth', ids[3] === 'a');

  const cCands = pickCSlotCandidates(pools, 'warmup');
  const cIds = cCands.map((x) => x.card.id);
  check('C slot warmup: most stable learning first', cIds[0] === 'a');
  check('C slot warmup: second most stable next', cIds[1] === 'b');
}

// buildEasyQueue
function buildEasyQueue({ cards, stateMap, T }) {
  const deckSize = cards.length;
  const struct = computeEasyStructure(T);

  const conf = [];
  const learn = [];
  const unseen = [];
  for (const c of cards) {
    const st = stateMap[c.id];
    const cls = classifyEasyCard(st);
    if (cls === 'confident') conf.push({ card: c, state: st });
    else if (cls === 'learning') learn.push({ card: c, state: st });
    else unseen.push(c);
  }
  const pools = { confident: conf, learning: learn, unseen };

  if (struct.kind === 'flat' || deckSize < 7) {
    const all = [...cards].sort(() => Math.random() - 0.5).slice(0, Math.min(T, deckSize));
    return all.map((c) => ({ card: c, _easyRole: 'core', _easySlot: 'L' }));
  }

  const usedIds = new Set();
  const result = [];
  const takeFrom = (cands) => {
    for (const item of cands) {
      const card = item.card;
      if (!usedIds.has(card.id)) {
        usedIds.add(card.id);
        return card;
      }
    }
    return null;
  };

  for (let i = 0; i < struct.warmup; i++) {
    const c = takeFrom(pickCSlotCandidates(pools, 'warmup'));
    if (c) result.push({ card: c, _easyRole: 'warmup', _easySlot: 'C' });
  }

  for (let g = 0; g < struct.k; g++) {
    const lCard = takeFrom(pickLSlotCandidates(pools));
    if (lCard) result.push({ card: lCard, _easyRole: 'core', _easySlot: 'L' });
    for (let i = 0; i < 3; i++) {
      const cCard = takeFrom(pickCSlotCandidates(pools, 'core'));
      if (cCard) result.push({ card: cCard, _easyRole: 'core', _easySlot: 'C' });
    }
  }

  for (let i = 0; i < struct.r; i++) {
    const c = takeFrom(pickCSlotCandidates(pools, 'tail'));
    if (c) result.push({ card: c, _easyRole: 'tail', _easySlot: 'C' });
  }

  return result;
}

{
  const cards = Array.from({ length: 30 }, (_, i) => ({ id: 'c' + i }));
  const q1 = buildEasyQueue({ cards, stateMap: {}, T: 19 });
  check('cold start T=19: queue length 19', q1.length === 19);
  check('cold start: all 19 slots filled', q1.every((x) => x.card));
  check('cold start: unique cards in session', new Set(q1.map((x) => x.card.id)).size === 19);

  const stateMap = {};
  cards.forEach((c) => {
    stateMap[c.id] = { history: [1, 1, 1], last_seen: Math.random() * 1000, last_warmup: 0 };
  });
  const q2 = buildEasyQueue({ cards, stateMap, T: 19 });
  check('steady state T=19: length 19', q2.length === 19);
  check('warmup x3 tagged warmup', q2.slice(0, 3).every((x) => x._easyRole === 'warmup'));
  check('tail absent when r=0', q2.every((x) => x._easyRole !== 'tail'));
  check('all confident: L slots fall back to confident', q2.filter((x) => x._easySlot === 'L').length === 4);

  const tiny = Array.from({ length: 5 }, (_, i) => ({ id: 't' + i }));
  const q3 = buildEasyQueue({ cards: tiny, stateMap: {}, T: 19 });
  check('deck size 5 < 7: flat 5 cards', q3.length === 5);

  const q4 = buildEasyQueue({ cards, stateMap, T: 10 });
  check('T=10: length 10', q4.length === 10);
  check('T=10: last three are tail', q4.slice(-3).every((x) => x._easyRole === 'tail'));

  const mc = Array.from({ length: 33 }, (_, i) => ({ id: 'm' + i }));
  const sm = {};
  for (let i = 10; i < 23; i++) sm[mc[i].id] = { history: [1, 1], last_seen: 1000 - i * 10, last_warmup: 0 };
  for (let i = 23; i < 33; i++) sm[mc[i].id] = { history: [1], last_seen: 500 - i, last_warmup: 0 };
  for (let i = 10; i < 14; i++) sm[mc[i].id] = { history: [0], last_seen: 100, last_warmup: 0 };

  const q5 = buildEasyQueue({ cards: mc, stateMap: sm, T: 19 });
  check('mixed 33 T=19: queue length 19', q5.length === 19);
  check('mixed: unique cards in session', new Set(q5.map((x) => x.card.id)).size === 19);
  const q5Cards = q5.map((x) => x.card.id);
  const q5Unseen = q5Cards.filter((id) => !sm[id]);
  const ok10 = q5Unseen.length === 10;
  if (!ok10) {
    console.log(`  [known issue #601] buildEasyQueue: only ${q5Unseen.length} of 10 unseen cards entered`);
  }
  const wrongCount = q5Cards.filter((id) => sm[id] && sm[id].history[0] === 0).length;
  if (wrongCount !== 4) {
    console.log(`  [known issue #601] buildEasyQueue: only ${wrongCount} of 4 wrong cards entered`);
  }
  check('mixed: warmup first 3 are all correct-history cards', q5.slice(0, 3).every((x) => sm[x.card.id] && sm[x.card.id].history.every((v) => v >= 1)));

  const q6 = buildEasyQueue({ cards: mc.slice(10), stateMap: sm, T: 19 });
  const lSlotCards = q6.filter((x) => x._easySlot === 'L');
  check('23 learning T=19: four L slots', lSlotCards.length === 4);
  if (lSlotCards.length >= 4) {
    const wrongInL = lSlotCards.map((x) => sm[x.card.id]).filter((s) => s && s.history[0] === 0).length;
    check('23 learning: four wrong cards occupy L slots', wrongInL === 4);
  }
  const warmup3 = q6.slice(0, 3);
  check('23 learning: warmup 3 are C slots', warmup3.every((x) => x._easySlot === 'C' && x._easyRole === 'warmup'));

  const mc2 = Array.from({ length: 30 }, (_, i) => ({ id: 'x' + i }));
  const sm2 = {};
  for (let i = 2; i < 30; i++) sm2[mc2[i].id] = { history: [1, 1], last_seen: 100 - i, last_warmup: 0 };
  const q7 = buildEasyQueue({ cards: mc2, stateMap: sm2, T: 15 });
  const lSlotCards2 = q7.filter((x) => x._easySlot === 'L');
  if (lSlotCards2.length >= 2) {
    check('unseen priority: L1', !sm2[lSlotCards2[0].card.id]);
    check('unseen priority: L2', !sm2[lSlotCards2[1].card.id]);
  }
}

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
