const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(desc, ok, detail) {
  if (ok) {
    passed++;
    return;
  }
  failed++;
  console.log(`  ✗ ${desc}`);
  if (detail) console.log(`    ${detail}`);
}

const targets = [
  'run_all.js',
  'yihai_v5.11_easy_test.js',
  '_diagnose_app_events.js',
];

const mojibakePatterns = [
  /ç»|æ—|å¤±|é€šè¿‡|âœ|â•|ï¼š|ðŸ/,
];

for (const file of targets) {
  const fullPath = path.join(__dirname, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  const matched = mojibakePatterns.find((pattern) => pattern.test(content));
  check(`${file}: no mojibake markers`, !matched, matched ? `matched ${matched}` : '');
}

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
