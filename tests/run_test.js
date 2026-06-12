// tests/run_test.js
// 测试运行包装器：检查缓存 → 跳过或运行 → 通过则记录
// 用法：node tests/run_test.js <test-file>
// 退出码：0 = 跳过或通过；非 0 = 失败

const { spawnSync } = require('child_process');
const path = require('path');
const { markPassed, shouldSkip, normTest } = require('./_cache');

const test = process.argv[2];
if (!test) {
  console.error('Usage: node tests/run_test.js <test-file>');
  process.exit(2);
}

const r = shouldSkip(test);
if (r.skip) {
  console.log(`[cache] SKIP ${normTest(test)} (${r.reason}, sha ${r.sha.slice(0,7)})`);
  process.exit(0);
}

console.log(`[cache] RUN ${normTest(test)} (${r.reason})`);
const res = spawnSync('node', [test], { stdio: 'inherit', shell: false });
if (res.status === 0) {
  markPassed(test);
  console.log(`[cache] ✓ marked passed`);
} else {
  console.log(`[cache] ✗ failed (exit ${res.status})`);
}
process.exit(res.status ?? 1);
