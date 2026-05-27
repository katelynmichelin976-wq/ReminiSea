/**
 * 统一测试入口 — 串联所有单元测试套件
 *
 * 用法：
 *   node tests/run_all.js          # 仅单元测试
 *   npm test                       # 同上
 *
 * Playwright 测试需要 HTTP 服务器 + TEST_PASSWORD，单独运行：
 *   $env:TEST_PASSWORD="xxx"; node tests/_playwright_test.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const UNIT_SUITES = [
  'srs_test.js',
  'yihai_v4.4_test.js',
  'yihai_v4.8_test.js',
  'yihai_v4.9_test.js',
  'yihai_v5.0_i18n_test.js',
];

const COL_W = 24;
let totalPassed = 0, totalFailed = 0, anyError = false;

console.log('\n' + '═'.repeat(60));
console.log('  忆海拾光 · 单元测试');
console.log('═'.repeat(60));

for (const suite of UNIT_SUITES) {
  const filePath = path.join(__dirname, suite);
  const result = spawnSync('node', [filePath], { encoding: 'utf8' });

  const output = (result.stdout || '') + (result.stderr || '');
  const match  = output.match(/结果：(\d+) 通过\s+(\d+) 失败/)
             || output.match(/通过 (\d+) \/ 失败 (\d+)/);

  if (!match) {
    console.log(`  ✗ ${suite.padEnd(COL_W)} — 运行失败`);
    if (result.error) console.log(`    ${result.error.message}`);
    anyError = true;
    continue;
  }

  const passed = parseInt(match[1]);
  const failed = parseInt(match[2]);
  totalPassed += passed;
  totalFailed += failed;

  const icon   = failed === 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const detail = failed === 0
    ? `${passed} passed`
    : `${passed} passed, \x1b[31m${failed} FAILED\x1b[0m`;
  console.log(`  ${icon} ${suite.padEnd(COL_W)} — ${detail}`);

  if (failed > 0) {
    // 打印失败详情
    const lines = output.split('\n').filter(l => l.includes('✗'));
    lines.forEach(l => console.log('    ' + l.trim()));
  }
}

console.log('─'.repeat(60));
const totalIcon = (totalFailed === 0 && !anyError) ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
console.log(`  ${totalIcon} 合计 ${UNIT_SUITES.length} 套件，${totalPassed + totalFailed} 个断言，${totalFailed} 个失败`);
console.log('═'.repeat(60) + '\n');

if (totalFailed > 0 || anyError) {
  console.log('  Playwright 测试（需要 HTTP 服务器，部分需 TEST_PASSWORD）：');
  console.log('    node tests/_pw_ui_smoke.js');
  console.log('    node tests/_pw_srs_e2e.js');
  console.log('    $env:TEST_PASSWORD="xxx"; node tests/_pw_cloud_sync.js');
  console.log('    $env:TEST_PASSWORD="xxx"; node tests/_pw_cross_device.js\n');
  process.exit(1);
}

console.log('  Playwright 测试（可选，需 HTTP 服务器）：');
console.log('    node tests/_pw_ui_smoke.js');
console.log('    node tests/_pw_srs_e2e.js\n');
