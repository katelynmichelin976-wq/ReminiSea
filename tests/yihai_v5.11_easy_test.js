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

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
