/**
 * 从 V8 coverage raw 数据（coverage/raw/*.json）列出 index.html 中
 * 0 次执行的命名函数（across 所有套件取并集：任一套件执行过即算覆盖）。
 *
 * 用法：node scripts/list-uncovered-fns.js
 * 前置：先跑全量覆盖率（YIHAI_COVERAGE=1 node scripts/run-all-pw.js）填充 coverage/raw/
 */
const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, '..', 'coverage', 'raw');

if (!fs.existsSync(RAW_DIR)) {
  console.error('coverage/raw 不存在，先跑：YIHAI_COVERAGE=1 node scripts/run-all-pw.js');
  process.exit(1);
}

const files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.json'));
if (!files.length) { console.error('coverage/raw 为空'); process.exit(1); }

// key = name@startOffset → { name, start, executed }
const fns = new Map();
let source = null;

for (const f of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf8')); }
  catch (e) { console.warn('跳过损坏文件', f, e.message); continue; }
  for (const entry of data) {
    if (!entry.url || !entry.url.includes('index.html')) continue;
    if (!source && entry.source) source = entry.source;
    for (const fn of (entry.functions || [])) {
      const r0 = fn.ranges && fn.ranges[0];
      if (!r0) continue;
      const key = fn.functionName + '@' + r0.startOffset;
      const executed = r0.count > 0;
      const prev = fns.get(key);
      if (prev) prev.executed = prev.executed || executed;
      else fns.set(key, { name: fn.functionName || '(anonymous)', start: r0.startOffset, executed });
    }
  }
}

// offset → 行号
function lineOf(offset) {
  if (!source) return '?';
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source[i] === '\n') line++;
  return line;
}

const all = [...fns.values()];
const named = all.filter(f => f.name !== '(anonymous)');
const uncoveredNamed = named.filter(f => !f.executed).sort((a, b) => a.start - b.start);
const anonTotal = all.length - named.length;
const anonUncovered = all.filter(f => f.name === '(anonymous)' && !f.executed).length;

console.log('═'.repeat(60));
console.log('  index.html 函数覆盖（', files.length, '个 raw 文件并集）');
console.log('═'.repeat(60));
console.log('  命名函数：', named.length, ' 已覆盖：', named.length - uncoveredNamed.length, ' 未覆盖：', uncoveredNamed.length);
console.log('  匿名函数：', anonTotal, ' 未覆盖：', anonUncovered);
console.log('─'.repeat(60));
console.log('  0 次执行的命名函数（行号 升序）：\n');
for (const f of uncoveredNamed) {
  console.log(`  L${lineOf(f.start)}\t${f.name}`);
}

// 同时输出到文件，便于分类（写到 coverage 外，避免被 build-report 的 monocart 清理删掉）
const outPath = path.join(__dirname, '..', 'coverage-uncovered-fns.txt');
const txt = uncoveredNamed.map(f => `L${lineOf(f.start)}\t${f.name}`).join('\n');
fs.writeFileSync(outPath, txt + '\n');
console.log('\n  清单已写入 coverage/uncovered-fns.txt');
