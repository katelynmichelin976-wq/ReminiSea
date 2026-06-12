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

// 捕获输出做 sanity check（"0 通过 0 失败" = 测试空跑，可能是环境问题，不应缓存）
let captured = '';
const res = spawnSync('node', [test], { shell: false });
process.stdout.write(res.stdout);
process.stderr.write(res.stderr);
captured = (res.stdout || '').toString() + (res.stderr || '').toString();

const zeroAssertions = /通过:\s*0\s+失败:\s*0|0 passed,\s*0 failed/i.test(captured);
const okStatus = res.status === 0 && !zeroAssertions;

if (okStatus) {
  markPassed(test);
  console.log(`[cache] ✓ marked passed`);
} else if (zeroAssertions) {
  console.log(`[cache] ✗ 0 通过 0 失败（疑似环境异常或测试未执行），不缓存`);
  process.exit(2);
} else {
  console.log(`[cache] ✗ failed (exit ${res.status})`);
}
process.exit(res.status ?? 1);
