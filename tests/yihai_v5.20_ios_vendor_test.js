const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

const root = path.join(__dirname, '..');
const prepare = spawnSync('node', [path.join(root, 'scripts', 'prepare-ios-web.js')], {
  cwd: root,
  encoding: 'utf8',
});

check('ios prepare script exits successfully', prepare.status === 0, prepare.stderr || prepare.stdout);

const outDir = path.join(root, 'build', 'ios-web');
const indexPath = path.join(outDir, 'index.html');
const vendorPath = path.join(outDir, 'vendor', 'supabase.js');
const indexHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';

check('iOS bundle includes local Supabase SDK', fs.existsSync(vendorPath));
check(
  'iOS index loads local Supabase SDK',
  indexHtml.includes('./vendor/supabase.js'),
  'expected ./vendor/supabase.js in build/ios-web/index.html'
);
check(
  'iOS index does not depend on Supabase CDN',
  !indexHtml.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js'),
  'remote CDN dependency can leave window.supabase undefined in packaged WebView'
);

const vendorJs = fs.existsSync(vendorPath) ? fs.readFileSync(vendorPath, 'utf8') : '';
check('vendored Supabase SDK exposes createClient', vendorJs.includes('createClient'));

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
