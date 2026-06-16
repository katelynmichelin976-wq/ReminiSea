const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDir = path.join(__dirname, '..', 'tests');
const files = fs.readdirSync(testsDir)
  .filter(f => /^_pw_.+\.js$/.test(f))
  .sort();

if (!process.env.YIHAI_COVERAGE) {
  console.warn('提示：未设 YIHAI_COVERAGE=1，将跑测试但不采集覆盖率');
}
if (!process.env.TEST_PASSWORD) {
  console.warn('提示：未设 TEST_PASSWORD，需登录的套件会 skip');
}

const results = [];
const tStart = Date.now();
for (const f of files) {
  const filePath = path.join(testsDir, f);
  const t0 = Date.now();
  console.log(`\n${'═'.repeat(60)}\n  ${f}\n${'═'.repeat(60)}`);
  const r = spawnSync('node', [filePath], { stdio: 'inherit', env: process.env });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = r.status === 0;
  const skipped = r.status === 2;
  results.push({ file: f, ok, skipped, status: r.status, dt });
  console.log(`\n  → ${ok ? '✓' : skipped ? '○ skipped' : '✗ FAIL'} (${dt}s)`);
}

const total = ((Date.now() - tStart) / 1000).toFixed(1);
console.log(`\n${'═'.repeat(60)}\n  汇总 (${total}s)\n${'═'.repeat(60)}`);
for (const r of results) {
  const icon = r.ok ? '\x1b[32m✓\x1b[0m' : r.skipped ? '\x1b[33m○\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${icon} ${r.file.padEnd(36)} ${r.dt}s`);
}
const failed = results.filter(r => !r.ok && !r.skipped).length;
console.log(`\n  通过 ${results.filter(r => r.ok).length} / 跳过 ${results.filter(r => r.skipped).length} / 失败 ${failed}`);
if (failed > 0) process.exit(1);
