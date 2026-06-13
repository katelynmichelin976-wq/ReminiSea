/**
 * IDB Naming Convention Phase 1 — 注册表静态校验
 *
 * 覆盖：IDB_DBS / IDB_STORES 常量完整性、唯一性、字段格式
 * 运行：node tests/yihai_v5.13.10_idb_p1_test.js
 */
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + label); }
  else      { failed++; console.log('  \x1b[31m✗\x1b[0m ' + label); }
}

// 从 index.html 抽取 IDB_DBS / IDB_STORES 常量定义并 eval
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function extractConst(name) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*(\\{[\\s\\S]*?\\});', 'm');
  const m = html.match(re);
  if (!m) throw new Error('Cannot find const ' + name + ' in index.html');
  // eslint-disable-next-line no-eval
  return eval('(' + m[1] + ')');
}

console.log('\n══════ IDB Naming P1 — 注册表静态校验 ══════');

let IDB_DBS, IDB_STORES;
try {
  IDB_DBS    = extractConst('IDB_DBS');
  IDB_STORES = extractConst('IDB_STORES');
  assert('IDB_DBS 与 IDB_STORES 常量存在', true);
} catch (e) {
  assert('IDB_DBS 与 IDB_STORES 常量存在', false);
  console.log('  ' + e.message);
  process.exit(1);
}

// IDB_DBS 校验
assert('IDB_DBS 含 srs 条目',   !!IDB_DBS.srs);
assert('IDB_DBS 含 media 条目', !!IDB_DBS.media);
assert('IDB_DBS.srs.name == "yihai_srs"',     IDB_DBS.srs && IDB_DBS.srs.name === 'yihai_srs');
assert('IDB_DBS.srs.version == 10（P2 bump）', IDB_DBS.srs && IDB_DBS.srs.version === 10);
assert('IDB_DBS.media.name == "yihai_media"',  IDB_DBS.media && IDB_DBS.media.name === 'yihai_media');
assert('IDB_DBS.media.version == 2（P2 bump）', IDB_DBS.media && IDB_DBS.media.version === 2);

// IDB_STORES 完整性
const expectedStoreKeys = ['syncTrials','syncCardStates','easyCardStates','appEvents','voiceSlots','mediaBlobs'];
expectedStoreKeys.forEach(k => {
  assert(`IDB_STORES.${k} 存在`, !!IDB_STORES[k]);
  if (IDB_STORES[k]) {
    assert(`  ${k}.db ∈ IDB_DBS`,   !!IDB_DBS[IDB_STORES[k].db]);
    assert(`  ${k}.name 是字符串`, typeof IDB_STORES[k].name === 'string' && IDB_STORES[k].name.length > 0);
  }
});

// store 名 P2 规范名
assert('syncTrials.name == "sync_trials"（P2 规范）',          IDB_STORES.syncTrials && IDB_STORES.syncTrials.name === 'sync_trials');
assert('syncCardStates.name == "sync_card_states"（P2 规范）', IDB_STORES.syncCardStates && IDB_STORES.syncCardStates.name === 'sync_card_states');
assert('easyCardStates.name == "easy_card_states"（P2 规范）', IDB_STORES.easyCardStates && IDB_STORES.easyCardStates.name === 'easy_card_states');
assert('appEvents.name == "app_events"（不变）',             IDB_STORES.appEvents && IDB_STORES.appEvents.name === 'app_events');
assert('voiceSlots.name == "voice_slots"（P2 规范）',         IDB_STORES.voiceSlots && IDB_STORES.voiceSlots.name === 'voice_slots');
assert('mediaBlobs.name == "media_blobs"（P2 规范）',         IDB_STORES.mediaBlobs && IDB_STORES.mediaBlobs.name === 'media_blobs');

// store 名唯一性（同 DB 内不重名）
const byDb = {};
Object.entries(IDB_STORES).forEach(([k, v]) => {
  byDb[v.db] = byDb[v.db] || new Set();
  byDb[v.db].add(v.name);
});
Object.entries(byDb).forEach(([db, names]) => {
  const count = Object.values(IDB_STORES).filter(s => s.db === db).length;
  assert(`db=${db}: store 名唯一（${names.size} unique / ${count} total）`, names.size === count);
});

console.log(`\n  结果: ${passed} 通过, ${failed} 失败`);
if (failed) process.exit(1);
