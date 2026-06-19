/**
 * 统一测试入口 - 串联所有单元测试套件
 *
 * 用法：
 *   node tests/run_all.js
 *   npm test
 */
const { spawnSync } = require('child_process');
const path = require('path');

const unitSuites = [
  'srs_test.js',
  'yihai_v4.4_test.js',
  'yihai_v4.8_test.js',
  'yihai_v4.9_test.js',
  'yihai_v5.0_i18n_test.js',
  'yihai_v5.2_voice_test.js',
  'yihai_v5.8_sync_test.js',
  'yihai_v5.9_sync_test.js',
  'yihai_v5.11_easy_test.js',
  'yihai_v5.12_media_recovery_test.js',
  'yihai_v5.14_ls_test.js',
  'yihai_v5.15_log_test.js',
  'yihai_v5.16_lang_phrases_test.js',
  'yihai_v5.13.10_idb_p1_test.js',
  'yihai_v5.17_deckid_test.js',
  'yihai_v5.18_diaglog_test.js',
  'yihai_v5.13.13_consent_test.js',
  'yihai_v5.19_encoding_test.js',
  'yihai_v5.20_ios_vendor_test.js',
];

const colWidth = 28;
let totalPassed = 0;
let totalFailed = 0;
let anyError = false;

const summaryPatterns = [
  /结果：\s*(\d+)\s*通过\s+(\d+)\s*失败/,
  /结果:\s*(\d+)\s*通过,\s*(\d+)\s*失败/,
  /通过\s*(\d+)\s*\/\s*失败\s*(\d+)/,
  /(\d+)\s*passed,\s*(\d+)\s*failed/i,
];

function parseSummary(output) {
  for (const pattern of summaryPatterns) {
    const match = output.match(pattern);
    if (match) {
      return {
        passed: parseInt(match[1], 10),
        failed: parseInt(match[2], 10),
      };
    }
  }
  return null;
}

console.log('\n' + '═'.repeat(60));
console.log('  忆海拾光 · 单元测试');
console.log('═'.repeat(60));

for (const suite of unitSuites) {
  const filePath = path.join(__dirname, suite);
  const result = spawnSync('node', [filePath], { encoding: 'utf8' });
  const output = ((result.stdout || '') + (result.stderr || '')).trim();
  const summary = parseSummary(output);

  if (!summary) {
    console.log(`  ✗ ${suite.padEnd(colWidth)} — 运行失败`);
    if (result.error) {
      console.log(`    ${result.error.message}`);
    }
    anyError = true;
    continue;
  }

  totalPassed += summary.passed;
  totalFailed += summary.failed;

  const icon = summary.failed === 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const detail = summary.failed === 0
    ? `${summary.passed} passed`
    : `${summary.passed} passed, \x1b[31m${summary.failed} FAILED\x1b[0m`;
  console.log(`  ${icon} ${suite.padEnd(colWidth)} — ${detail}`);

  if (summary.failed > 0) {
    const failingLines = output
      .split('\n')
      .filter((line) => line.includes('✗') || /FAILED/i.test(line));
    failingLines.forEach((line) => console.log('    ' + line.trim()));
  }
}

console.log('─'.repeat(60));
const totalIcon = totalFailed === 0 && !anyError ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
console.log(`  ${totalIcon} 合计 ${unitSuites.length} 套件，${totalPassed + totalFailed} 个断言，${totalFailed} 个失败`);
console.log('═'.repeat(60) + '\n');

if (totalFailed > 0 || anyError) {
  console.log('  Playwright 测试（需要 HTTP 服务器，部分需要 TEST_PASSWORD）：');
  console.log('    node tests/_pw_ui_smoke.js');
  console.log('    node tests/_pw_srs_e2e.js');
  console.log('    TEST_PASSWORD="xxx" node tests/_pw_cloud_sync.js');
  console.log('    TEST_PASSWORD="xxx" node tests/_pw_cross_device.js\n');
  process.exit(1);
}

console.log('  Playwright 测试（可选，需要 HTTP 服务器）：');
console.log('    node tests/_pw_ui_smoke.js');
console.log('    node tests/_pw_srs_e2e.js\n');
