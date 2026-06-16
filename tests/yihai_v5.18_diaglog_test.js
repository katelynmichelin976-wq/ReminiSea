// tests/yihai_v5.18_diaglog_test.js
// 诊断日志按模块配额选取纯函数单测（selectDiagnosticLog）
// 直接从 index.html 抽取真实实现求值。

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(name) {
  const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = html.match(re);
  if (!m) throw new Error('function not found: ' + name);
  let i = m.index + m[0].length, depth = 1;
  while (i < html.length && depth > 0) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') depth--;
    i++;
  }
  return html.slice(m.index, i);
}

// eslint-disable-next-line no-eval
eval(extractFn('selectDiagnosticLog'));

let passed = 0, failed = 0;
function check(desc, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.log(`  ✗ ${desc} — ${e.message}`); }
}

const mk = (t, lv, m, e) => ({ t, lv, m, e: e || 'evt' });

check('保留所有 warn/error（任何模块，不限量）', () => {
  const logs = [];
  for (let i = 0; i < 50; i++) logs.push(mk(i, 'warn', 'sync', 'w' + i));
  for (let i = 0; i < 50; i++) logs.push(mk(100 + i, 'error', 'voice', 'e' + i));
  const out = selectDiagnosticLog(logs, { voiceMax: 10, otherMax: 10 });
  const severe = out.filter(l => l.lv === 'warn' || l.lv === 'error');
  assert.strictEqual(severe.length, 100);
});

check('voice info 截到 voiceMax（保留最近 N）', () => {
  const logs = [];
  for (let i = 0; i < 200; i++) logs.push(mk(i, 'info', 'voice', 'v' + i));
  const out = selectDiagnosticLog(logs, { voiceMax: 60, otherMax: 240 });
  const voice = out.filter(l => l.m === 'voice');
  assert.strictEqual(voice.length, 60);
  assert.strictEqual(voice[voice.length - 1].e, 'v199'); // 最近的在
  assert.strictEqual(voice[0].e, 'v140');                // 最早保留的是倒数第 60 条
});

check('非 voice info 截到 otherMax（保留最近 N）', () => {
  const logs = [];
  for (let i = 0; i < 500; i++) logs.push(mk(i, 'info', 'sync', 's' + i));
  const out = selectDiagnosticLog(logs, { voiceMax: 60, otherMax: 240 });
  const other = out.filter(l => l.m !== 'voice');
  assert.strictEqual(other.length, 240);
  assert.strictEqual(other[other.length - 1].e, 's499');
});

check('voice 刷屏不挤掉非 voice info（核心场景）', () => {
  const logs = [];
  // 10 条早期 sync，然后 1000 条 voice 刷屏
  for (let i = 0; i < 10; i++) logs.push(mk(i, 'info', 'sync', 'sync' + i));
  for (let i = 0; i < 1000; i++) logs.push(mk(100 + i, 'info', 'voice', 'v' + i));
  const out = selectDiagnosticLog(logs, { voiceMax: 60, otherMax: 240 });
  const syncKept = out.filter(l => l.m === 'sync');
  assert.strictEqual(syncKept.length, 10); // 10 条 sync 全保留（< otherMax）
});

check('结果按时间戳升序', () => {
  const logs = [
    mk(5, 'info', 'voice', 'a'),
    mk(1, 'error', 'sync', 'b'),
    mk(9, 'info', 'srs', 'c'),
    mk(3, 'warn', 'voice', 'd'),
  ];
  const out = selectDiagnosticLog(logs, { voiceMax: 60, otherMax: 240 });
  const ts = out.map(l => l.t);
  const sorted = [...ts].sort((a, b) => a - b);
  assert.deepStrictEqual(ts, sorted);
});

check('默认配额 voiceMax=60 / otherMax=240', () => {
  const logs = [];
  for (let i = 0; i < 100; i++) logs.push(mk(i, 'info', 'voice', 'v' + i));
  for (let i = 0; i < 400; i++) logs.push(mk(1000 + i, 'info', 'sync', 's' + i));
  const out = selectDiagnosticLog(logs); // 不传 opts
  assert.strictEqual(out.filter(l => l.m === 'voice').length, 60);
  assert.strictEqual(out.filter(l => l.m !== 'voice').length, 240);
});

check('空输入返回空数组', () => {
  assert.deepStrictEqual(selectDiagnosticLog([]), []);
});

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
if (failed > 0) process.exit(1);
