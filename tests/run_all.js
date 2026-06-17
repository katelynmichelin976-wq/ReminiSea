/**
 * ç»Ÿä¸€æµ‹è¯•å…¥å£ â€” ä¸²è”æ‰€æœ‰å•å…ƒæµ‹è¯•å¥—ä»¶
 *
 * ç”¨æ³•ï¼š
 *   node tests/run_all.js          # ä»…å•å…ƒæµ‹è¯•
 *   npm test                       # åŒä¸Š
 *
 * Playwright æµ‹è¯•éœ€è¦ HTTP æœåŠ¡å™¨ + TEST_PASSWORDï¼Œå•ç‹¬è¿è¡Œï¼š
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
];

const COL_W = 24;
let totalPassed = 0, totalFailed = 0, anyError = false;

console.log('\n' + 'â•'.repeat(60));
console.log('  å¿†æµ·æ‹¾å…‰ Â· å•å…ƒæµ‹è¯•');
console.log('â•'.repeat(60));

for (const suite of UNIT_SUITES) {
  const filePath = path.join(__dirname, suite);
  const result = spawnSync('node', [filePath], { encoding: 'utf8' });

  const output = ((result.stdout || '') + (result.stderr || '')).trim();
  const match  = output.match(/ç»“æžœï¼š(\d+) é€šè¿‡\s+(\d+) å¤±è´¥/)
             || output.match(/ç»“æžœ:\s*(\d+) é€šè¿‡,\s*(\d+) å¤±è´¥/)
             || output.match(/é€šè¿‡ (\d+) \/ å¤±è´¥ (\d+)/)
             || output.match(/(\d+) passed, (\d+) failed/);

  if (!match) {
    console.log(`  âœ— ${suite.padEnd(COL_W)} â€” è¿è¡Œå¤±è´¥`);
    if (result.error) console.log(`    ${result.error.message}`);
    anyError = true;
    continue;
  }

  const passed = parseInt(match[1]);
  const failed = parseInt(match[2]);
  totalPassed += passed;
  totalFailed += failed;

  const icon   = failed === 0 ? '\x1b[32mâœ“\x1b[0m' : '\x1b[31mâœ—\x1b[0m';
  const detail = failed === 0
    ? `${passed} passed`
    : `${passed} passed, \x1b[31m${failed} FAILED\x1b[0m`;
  console.log(`  ${icon} ${suite.padEnd(COL_W)} â€” ${detail}`);

  if (failed > 0) {
    // æ‰“å°å¤±è´¥è¯¦æƒ…
    const lines = output.split('\n').filter(l => l.includes('âœ—'));
    lines.forEach(l => console.log('    ' + l.trim()));
  }
}

console.log('â”€'.repeat(60));
const totalIcon = (totalFailed === 0 && !anyError) ? '\x1b[32mâœ“\x1b[0m' : '\x1b[31mâœ—\x1b[0m';
console.log(`  ${totalIcon} åˆè®¡ ${UNIT_SUITES.length} å¥—ä»¶ï¼Œ${totalPassed + totalFailed} ä¸ªæ–­è¨€ï¼Œ${totalFailed} ä¸ªå¤±è´¥`);
console.log('â•'.repeat(60) + '\n');

if (totalFailed > 0 || anyError) {
  console.log('  Playwright æµ‹è¯•ï¼ˆéœ€è¦ HTTP æœåŠ¡å™¨ï¼Œéƒ¨åˆ†éœ€ TEST_PASSWORDï¼‰ï¼š');
  console.log('    node tests/_pw_ui_smoke.js');
  console.log('    node tests/_pw_srs_e2e.js');
  console.log('    $env:TEST_PASSWORD="xxx"; node tests/_pw_cloud_sync.js');
  console.log('    $env:TEST_PASSWORD="xxx"; node tests/_pw_cross_device.js\n');
  process.exit(1);
}

console.log('  Playwright æµ‹è¯•ï¼ˆå¯é€‰ï¼Œéœ€ HTTP æœåŠ¡å™¨ï¼‰ï¼š');
console.log('    node tests/_pw_ui_smoke.js');
console.log('    node tests/_pw_srs_e2e.js\n');

