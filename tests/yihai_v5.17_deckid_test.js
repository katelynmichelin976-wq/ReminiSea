// tests/yihai_v5.17_deckid_test.js
// 个人牌组 server id 加盐纯函数单测（toServerDeckId / fromServerDeckId）
// 直接从 index.html 抽取真实实现求值，避免复制漂移。

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

const src = extractFn('toServerDeckId') + '\n' + extractFn('fromServerDeckId');
// eslint-disable-next-line no-eval
eval(src);

let passed = 0, failed = 0;
function check(desc, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.log(`  ✗ ${desc} — ${e.message}`); }
}

const UID = 'b5b1343e-b619-4008-b0f2-7cc9790fea75';

check('personal: localKey 加盐为 localKey~userId', () => {
  assert.strictEqual(toServerDeckId('3e85da18', 'personal', UID), '3e85da18~' + UID);
});
check('preset: 不加盐，原样返回', () => {
  assert.strictEqual(toServerDeckId('abc12345', 'preset', UID), 'abc12345');
});
check('shared: 不加盐，原样返回', () => {
  assert.strictEqual(toServerDeckId('abc12345', 'shared', UID), 'abc12345');
});
check('personal 但 userId 为空: 退化为裸 key（防止生成 key~undefined）', () => {
  assert.strictEqual(toServerDeckId('3e85da18', 'personal', ''), '3e85da18');
  assert.strictEqual(toServerDeckId('3e85da18', 'personal', null), '3e85da18');
});
check('fromServerDeckId: 含 ~ 取第一段', () => {
  assert.strictEqual(fromServerDeckId('3e85da18~' + UID), '3e85da18');
});
check('fromServerDeckId: 不含 ~ 原样返回（preset / 旧裸 id）', () => {
  assert.strictEqual(fromServerDeckId('abc12345'), 'abc12345');
});
check('往返一致: fromServerDeckId(toServerDeckId(k)) === k', () => {
  assert.strictEqual(fromServerDeckId(toServerDeckId('3e85da18', 'personal', UID)), '3e85da18');
});
check('UUID 本地 key 不含 ~，往返安全', () => {
  const uuid = '167e8e6a-2d21-4f77-8731-ce7163af24df';
  assert.strictEqual(fromServerDeckId(toServerDeckId(uuid, 'personal', UID)), uuid);
});

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
if (failed > 0) process.exit(1);
