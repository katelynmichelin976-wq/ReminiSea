const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'build', 'ios-web');
const vendorDir = path.join(outDir, 'vendor');
const supabaseSrc = path.join(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
const supabaseOut = path.join(vendorDir, 'supabase.js');
const supabaseCdnUrl = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.4/dist/umd/supabase.min.js';
const supabaseLocalUrl = './vendor/supabase.js';

const files = [
  'index.html',
  'manifest.json',
  'privacy.html',
  'privacy_en.html',
  'privacy_zh-Hant.html',
  'terms.html',
  'terms_en.html',
  'terms_zh-Hant.html',
  '.nojekyll',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(vendorDir, { recursive: true });

for (const file of files) {
  const src = path.join(root, file);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing iOS web asset: ${file}`);
  }
  fs.copyFileSync(src, path.join(outDir, file));
}

if (!fs.existsSync(supabaseSrc)) {
  throw new Error(`Missing Supabase SDK for iOS bundle: ${path.relative(root, supabaseSrc)}`);
}
fs.copyFileSync(supabaseSrc, supabaseOut);

const iosIndexPath = path.join(outDir, 'index.html');
const iosIndex = fs.readFileSync(iosIndexPath, 'utf8');
if (!iosIndex.includes(supabaseCdnUrl)) {
  throw new Error('Unable to rewrite Supabase SDK URL in iOS bundle');
}
fs.writeFileSync(iosIndexPath, iosIndex.replace(supabaseCdnUrl, supabaseLocalUrl));

console.log(`Prepared iOS web bundle: ${path.relative(root, outDir)}`);
