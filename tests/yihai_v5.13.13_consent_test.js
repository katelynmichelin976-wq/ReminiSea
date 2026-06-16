const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m1 = html.match(/function _compareConsentVersion\(a, b\) \{[\s\S]+?\n\}/);
const m2 = html.match(/function _mergeConsent\(local, cloud\) \{[\s\S]+?\n\}/);
if (!m1 || !m2) throw new Error('consent functions not found in index.html');
eval(m1[0]);
eval(m2[0]);

let passed = 0, failed = 0;
const errors = [];
function assert(name, cond) {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; errors.push(`✗ ${name}`); console.log(`  \x1b[31m✗\x1b[0m ${name}`); }
}

console.log('\n─── _compareConsentVersion ───');
assert('v1 < v2', _compareConsentVersion('v1', 'v2') < 0);
assert('v2 > v1', _compareConsentVersion('v2', 'v1') > 0);
assert('v1 == v1', _compareConsentVersion('v1', 'v1') === 0);
assert('v10 > v2', _compareConsentVersion('v10', 'v2') > 0);
assert('null vs v1 → cloud wins (na=0)', _compareConsentVersion(null, 'v1') < 0);
assert('v1 vs null → local wins', _compareConsentVersion('v1', null) > 0);
assert('garbage vs v1 → cloud wins', _compareConsentVersion('garbage', 'v1') < 0);
assert('undefined vs undefined → 0', _compareConsentVersion(undefined, undefined) === 0);
assert('large v100 > v9', _compareConsentVersion('v100', 'v9') > 0);
assert('missing prefix "1" → 0 vs v1 → cloud wins', _compareConsentVersion('1', 'v1') < 0);

console.log('\n─── _mergeConsent ───');
const AT_OLD = '2026-06-10T00:00:00.000Z';
const AT_NEW = '2026-06-15T00:00:00.000Z';

assert('null null → null', _mergeConsent(null, null) === null);
assert('local only → local', _mergeConsent({ version: 'v1', at: AT_OLD }, null).at === AT_OLD);
assert('cloud only → cloud', _mergeConsent(null, { version: 'v1', at: AT_NEW }).at === AT_NEW);

const r1 = _mergeConsent({ version: 'v1', at: AT_OLD }, { version: 'v1', at: AT_NEW });
assert('same version → max(at) (cloud newer)', r1.at === AT_NEW);

const r2 = _mergeConsent({ version: 'v1', at: AT_NEW }, { version: 'v1', at: AT_OLD });
assert('same version → max(at) (local newer)', r2.at === AT_NEW);

const r3 = _mergeConsent({ version: 'v2', at: AT_OLD }, { version: 'v1', at: AT_NEW });
assert('cross-version local v2 > cloud v1 → local', r3.version === 'v2' && r3.at === AT_OLD);

const r4 = _mergeConsent({ version: 'v1', at: AT_NEW }, { version: 'v2', at: AT_OLD });
assert('cross-version cloud v2 > local v1 → cloud', r4.version === 'v2' && r4.at === AT_OLD);

const r5 = _mergeConsent({ version: 'v1', at: AT_NEW }, { version: 'v1', at: AT_NEW });
assert('identical → either (here local)', r5.at === AT_NEW);

const sameLocal = { version: 'v1', at: AT_OLD };
const sameCloud = { version: 'v1', at: AT_NEW };
const ab = _mergeConsent(sameLocal, sameCloud);
const ba = _mergeConsent(sameCloud, sameLocal);
assert('symmetry (newer wins both directions)', ab.at === AT_NEW && ba.at === AT_NEW);

assert('invalid at string tolerated', _mergeConsent({ version: 'v1', at: 'garbage' }, { version: 'v1', at: AT_NEW }).at === AT_NEW);
assert('both invalid at → local first arg (tl=tc=0, >= returns local)', _mergeConsent({ version: 'v1', at: 'x' }, { version: 'v1', at: 'y' }).at === 'x');

const r9 = _mergeConsent({ version: 'v2', at: AT_NEW }, { version: 'v2', at: AT_OLD });
assert('same v2 → max(at)', r9.at === AT_NEW);

const r10 = _mergeConsent({ version: null, at: AT_NEW }, { version: 'v1', at: AT_OLD });
assert('local null version vs cloud v1 → cloud wins', r10.version === 'v1');

const r11 = _mergeConsent({ version: 'v1', at: AT_OLD }, { version: null, at: AT_NEW });
assert('local v1 vs cloud null version → local wins', r11.version === 'v1');

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed) { errors.forEach(e => console.log('  ' + e)); process.exit(1); }
