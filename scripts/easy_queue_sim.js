// easy_queue_sim.js — 模拟 easy 模式多天出卡
function computeEasyStructure(T) {
  if (T < 7) return { kind: "flat", size: T, warmup: 0, k: 0, r: 0 };
  const k = Math.floor((T - 3) / 4); const r = T - 3 - 4 * k;
  return { kind: "structured", size: T, warmup: 3, k, r };
}
function classifyEasyCard(state) {
  if (!state) return "unseen";
  const h = state.history || [];
  if (h.length === 3 && h.every(x => x === 1)) return "confident";
  return "learning";
}
function learningWeaknessKey(s) { const h = s.history || []; return [h.length ? h[h.length-1] : 1, -h.filter(x => x === 0).length, s.last_seen || 0]; }
function learningStabilityKey(s) { const h = s.history || []; return [-(h.length ? h[h.length-1] : 0), h.filter(x => x === 0).length, -(s.last_warmup || 0), s.last_seen || 0]; }
function cmpKey(a, b) { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; }
function pickLSlotCandidates(pools) {
  const list = [];
  for (const c of [...pools.unseen].sort(() => Math.random() - 0.5)) list.push({ card: c, tier: "unseen" });
  for (const e of [...pools.learning].sort((x, y) => cmpKey(learningWeaknessKey(x.state), learningWeaknessKey(y.state)))) list.push({ card: e.card, tier: "learning" });
  for (const e of [...pools.confident].sort((x, y) => (x.state.last_seen || 0) - (y.state.last_seen || 0))) list.push({ card: e.card, tier: "confident" });
  return list;
}
function pickCSlotCandidates(pools, roleHint) {
  const list = [];
  const confSort = roleHint === "warmup" ? (a, b) => ((a.state.last_warmup || 0) - (b.state.last_warmup || 0)) || ((a.state.last_seen || 0) - (b.state.last_seen || 0)) : (a, b) => (a.state.last_seen || 0) - (b.state.last_seen || 0);
  for (const e of [...pools.confident].sort(confSort)) list.push({ card: e.card, tier: "confident" });
  for (const e of [...pools.learning].sort((x, y) => cmpKey(learningStabilityKey(x.state), learningStabilityKey(y.state)))) list.push({ card: e.card, tier: "learning" });
  for (const c of pools.unseen) list.push({ card: c, tier: "unseen" });
  return list;
}
function buildEasyQueue({ cards, stateMap, T }) {
  const struct = computeEasyStructure(T);
  const conf = [], learn = [], unseen = [];
  for (const c of cards) { const st = stateMap[c.id]; const cls = classifyEasyCard(st); if (cls === "confident") conf.push({ card: c, state: st }); else if (cls === "learning") learn.push({ card: c, state: st }); else unseen.push(c); }
  const pools = { confident: conf, learning: learn, unseen };
  if (struct.kind === "flat" || cards.length < 7) { const all = [...cards].sort(() => Math.random() - 0.5).slice(0, Math.min(T, cards.length)); return { queue: all.map(c => ({ card: c })), pools }; }
  const usedIds = new Set(); const result = [];
  const takeFrom = (cands) => { for (const item of cands) { if (!usedIds.has(item.card.id)) { usedIds.add(item.card.id); return item.card; } } return null; };
  for (let i = 0; i < struct.warmup; i++) { const c = takeFrom(pickCSlotCandidates(pools, "warmup")); if (c) result.push({ card: c, _easyRole: "warmup", _easySlot: "C" }); }
  for (let g = 0; g < struct.k; g++) { const lCard = takeFrom(pickLSlotCandidates(pools)); if (lCard) result.push({ card: lCard, _easyRole: "core", _easySlot: "L" }); for (let i = 0; i < 3; i++) { const cCard = takeFrom(pickCSlotCandidates(pools, "core")); if (cCard) result.push({ card: cCard, _easyRole: "core", _easySlot: "C" }); } }
  for (let i = 0; i < struct.r; i++) { const c = takeFrom(pickCSlotCandidates(pools, "tail")); if (c) result.push({ card: c, _easyRole: "tail", _easySlot: "C" }); }
  return { queue: result, pools };
}

// Mama's 33 cards + 23 EasyState labels
const ALL = [
  "3a9627e6","3a96f7de","3aa40f06","3aafee0e","3ac6bd69","3afc05eb","3afd584a","3b468528","3b4a5035","3b71512d",
  "3b938b75","7580ab1f","7580d1bd","758195ad","75835c04","7584bf62","7584cdf5","75850032","75867e24","758696ac",
  "75869d9b","7586b32f","75891c22",
  "3b3f9199","75815e5f","7581d514","7581ef9a","7583e123","7583fe1e","75869ca3","7586bdbb","75890158","7589f3f0",
].map(id => ({ id }));

const CARDS = ALL.map(c => ({ id: c.id, name: c.id }));

function initLabels() {
  return {
    "3a9627e6":[2,[1,1]],"3a96f7de":[2,[1,1]],"3aa40f06":[2,[1,1]],"3aafee0e":[1,[0]],"3ac6bd69":[2,[1,1]],
    "3afc05eb":[1,[0]],"3afd584a":[2,[1,0]],"3b468528":[1,[1]],"3b4a5035":[2,[1,1]],"3b71512d":[2,[1,1]],
    "3b938b75":[2,[1,1]],"7580ab1f":[1,[0]],"7580d1bd":[1,[1]],"758195ad":[2,[1,1]],"75835c04":[2,[1,0]],
    "7584bf62":[2,[1,1]],"7584cdf5":[2,[1,1]],"75850032":[1,[1]],"75867e24":[1,[1]],"758696ac":[2,[1,1]],
    "75869d9b":[2,[1,1]],"7586b32f":[1,[0]],"75891c22":[2,[1,1]],
  };
}
function buildSM(labels, ts) {
  const m = {};
  for (const [k, [seen, hist]] of Object.entries(labels)) m[k] = { history: hist, seen, last_seen: ts + 100, last_warmup: 0 };
  return m;
}

function runSession(labels, ts) {
  const sm = buildSM(labels, ts);
  const r = buildEasyQueue({ cards: CARDS, stateMap: sm, T: 19 });
  const ids = r.queue.map(x => x.card.id);
  const unseen = ids.filter(id => !sm[id]);
  const wrong  = ids.filter(id => sm[id] && sm[id].history.some(x => x === 0));
  const right  = ids.filter(id => sm[id] && sm[id].history.every(x => x === 1));
  // update EasyState (simulate 80% correct)
  for (const id of ids) {
    if (!labels[id]) labels[id] = [0, []];
    labels[id][0] += 1;
    const correct = Math.random() < (wrong.includes(id) ? 0.5 : 0.88);
    labels[id][1].push(correct ? 1 : 0);
  }
  return { ids, unseen, wrong, right, poolU: r.pools.unseen.length, poolL: r.pools.learning.length };
}

console.log("day  total unseen wrong right poolU poolL unseenIds");
const L = initLabels();
for (let d = 1; d <= 5; d++) {
  const s = runSession(L, d * 1e9);
  const uStr = s.unseen.slice(0,5).join(",") || "none";
  const wStr = s.wrong.slice(0,5).join(",") || "none";
  console.log(`D${d}   ${s.ids.length}     ${s.unseen.length}      ${s.wrong.length}     ${s.right.length}     ${s.poolU}     ${s.poolL}     U:[${uStr}] W:[${wStr}]`);
  // verbose: full id list
  const ids = s.ids.map(id => id.slice(-4) + (sm => sm && sm[id] ? (sm[id].history.some(x=>x===0) ? "E" : "R") : "U")(buildSM(L,0))).join(" ");
  console.log("     " + ids);
}
