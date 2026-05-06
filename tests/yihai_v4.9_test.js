// ═══════════════════════════════════════════════
// v4.9 配置同步合并逻辑单元测试
// 从 yihai_v4.9.html 抽取 mergeConfig + collectLocalSrs/collectLocalUi
// 核心场景：不同设备间的参数配置不会互相冲掉（AD 预设保护）
// ═══════════════════════════════════════════════

// ── 配置合并（cloudPushConfig 中的核心逻辑）─────────────────────
function mergeConfig(cloudCfg, localSrs, localUi) {
  const mergedSrs = { ...(cloudCfg?.srs || {}), ...localSrs };
  const mergedUi  = { ...(cloudCfg?.ui  || {}), ...localUi  };
  return { srs: mergedSrs, ui: mergedUi };
}

// ── localSrs 收集（mock 版，注入 getItem + SRS_CONFIG）───────────
function collectLocalSrs(getItem, SRS_CONFIG) {
  const local = {};
  Object.keys(SRS_CONFIG).forEach(k => {
    const v = getItem('srs_' + k);
    if (v === null) return;
    const def = SRS_CONFIG[k];
    if (Array.isArray(def)) {
      try { local[k] = JSON.parse(v); } catch(e) {}
    } else if (typeof def === 'boolean') {
      local[k] = v === '1';
    } else if (typeof def === 'number') {
      local[k] = parseFloat(v);
    } else {
      local[k] = v;
    }
  });
  return local;
}

// ── localUi 收集（mock 版，注入 getItem）─────────────────────────
function collectLocalUi(getItem) {
  const local = {
    readHint:       getItem('readHint'),
    quizPromptOn:   getItem('quizPromptOn'),
    quizPromptDelay:getItem('quizPromptDelay'),
    optHintOn:      getItem('optHintOn'),
    optHintDelay:   getItem('optHintDelay'),
    wrongHintOn:    getItem('wrongHintOn'),
    confettiOn:     getItem('confettiOn'),
    correctHintOn:  getItem('correctHintOn'),
    phraseSelect:   getItem('phraseSelect'),
    phraseWrong:    getItem('phraseWrong'),
    phraseOptHint:  getItem('phraseOptHint'),
    phraseCorrect:  getItem('phraseCorrect'),
    ttsRate:        getItem('ttsRate'),
    ttsPitch:       getItem('ttsPitch'),
    ttsVoiceName:   getItem('ttsVoiceName'),
    delay:          getItem('delay'),
    browseDelay:    getItem('browseDelay'),
    browseAnsDelay: getItem('browseAnsDelay'),
    optCount:       getItem('optCount'),
    optTouchDelay:  getItem('optTouchDelay'),
    ndur:           getItem('ndur'),
    bdur:           getItem('bdur'),
    theme:          getItem('theme'),
  };
  ['fs-opt','fs-ans','fs-hint','fs-btn','ls-opt','ls-ans','ls-hint','ls-btn'].forEach(k => {
    const v = getItem(k);
    if (v) local[k] = v;
  });
  Object.keys(local).forEach(k => { if (local[k] === null) delete local[k]; });
  return local;
}

// ═══════════════════════════════════════════════
// 测试框架
// ═══════════════════════════════════════════════
let passed = 0, failed = 0;
const errors = [];

function check(label, actual, expected) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${label}: ${JSON.stringify(actual)}`);
  } else {
    failed++;
    const msg = `  ✗ ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
    console.log(msg);
    errors.push(msg);
  }
}

function checkDeep(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ✓ ${label}: ${a}`);
  } else {
    failed++;
    const msg = `  ✗ ${label}: got ${a}, expected ${e}`;
    console.log(msg);
    errors.push(msg);
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function ok(label, val) {
  check(label, !!val, true);
}

// ═══════════════════════════════════════════════
// SUITE 1 — mergeConfig 配置合并
// ═══════════════════════════════════════════════
section('SUITE 1 — mergeConfig 配置合并');

// 1.1: 核心场景 — 云端有完整 AD 预设，本地只改了部分参数
// 云端先由设备 A（妈妈的 AD 预设）上传：[1,5,10,30], starting_ease=1.30, ...
// 本地由设备 B（手机登录查看）只有 2 个参数
// 合并结果：AD 参数完整保留，本地参数覆盖对应项
{
  const cloudAd = {
    learning_steps: [1,5,10,30],
    starting_ease: 1.30,
    easy_bonus: 1.20,
    interval_modifier: 0.80,
    maximum_interval: 36500,
    graduating_interval: 1,
    easy_interval: 2,
  };
  const localSrs = { graduating_interval: 3, easy_interval: 4 };
  const result = mergeConfig({ srs: cloudAd, ui: {} }, localSrs, {});
  checkDeep('1.1 AD learning_steps preserved', result.srs.learning_steps, [1,5,10,30]);
  checkDeep('1.1 AD starting_ease preserved', result.srs.starting_ease, 1.30);
  checkDeep('1.1 AD easy_bonus preserved',    result.srs.easy_bonus, 1.20);
  checkDeep('1.1 local overrides graduating_interval', result.srs.graduating_interval, 3);
  checkDeep('1.1 local overrides easy_interval',       result.srs.easy_interval, 4);
  check('1.1 total srs keys', Object.keys(result.srs).length, 7);
}

// 1.2: 云端无配置（首次同步），本地有参数
{
  const localSrs = { learning_steps: [1,10], starting_ease: 2.50 };
  const result = mergeConfig(null, localSrs, {});
  checkDeep('1.2 no cloud → use local', result.srs, localSrs);
}

// 1.3: 云端有配置，本地无改动
{
  const cloudSrs = { learning_steps: [1,5,10,30], starting_ease: 1.30 };
  const result = mergeConfig({ srs: cloudSrs, ui: {} }, {}, {});
  checkDeep('1.3 no local → use cloud', result.srs, cloudSrs);
}

// 1.4: 本地覆盖云端相同 key
{
  const cloudSrs = { learning_steps: [1,5,10,30], starting_ease: 1.30, easy_bonus: 1.20 };
  const localSrs = { learning_steps: [1,10], starting_ease: 2.50 };
  const result = mergeConfig({ srs: cloudSrs, ui: {} }, localSrs, {});
  checkDeep('1.4 local wins learning_steps', result.srs.learning_steps, [1,10]);
  checkDeep('1.4 local wins starting_ease',  result.srs.starting_ease, 2.50);
  checkDeep('1.4 cloud preserved easy_bonus', result.srs.easy_bonus, 1.20);
}

// 1.5: cloudCfg 为 undefined
{
  const localSrs = { learning_steps: [1,10] };
  const result = mergeConfig(undefined, localSrs, {});
  checkDeep('1.5 undefined cloud', result.srs, localSrs);
}

// 1.6: cloudCfg.srs 缺失
{
  const localSrs = { learning_steps: [1,10] };
  const result = mergeConfig({ ui: {} }, localSrs, {});
  checkDeep('1.6 missing srs in cloud', result.srs, localSrs);
}

// 1.7: localStorage 全空（新设备首次打开）
{
  const result = mergeConfig({ srs: { learning_steps: [1,5,10,30] }, ui: {} }, {}, {});
  checkDeep('1.7 empty local', result.srs, { learning_steps: [1,5,10,30] });
}

// 1.8: 云端有多个版本迭代后的参数（v4.8 → v4.9 可能新增字段）
// 旧设备没有新字段，云端已存在，不应被冲掉
{
  const cloudSrs = { learning_steps: [1,5,10,30], new_param_v49: 42, another_new: true };
  const localSrs = { learning_steps: [1,10] };
  const result = mergeConfig({ srs: cloudSrs, ui: {} }, localSrs, {});
  checkDeep('1.8 new_param_v49 preserved', result.srs.new_param_v49, 42);
  checkDeep('1.8 another_new preserved',   result.srs.another_new, true);
}

// 1.9: UI 参数合并
{
  const cloudUi = { readHint: '1', ttsRate: '0.8', theme: 'blue' };
  const localUi = { ttsRate: '1.0' };
  const result = mergeConfig({ ui: cloudUi, srs: {} }, {}, localUi);
  check('1.9 cloud readHint preserved', result.ui.readHint, '1');
  check('1.9 local ttsRate wins',       result.ui.ttsRate, '1.0');
  check('1.9 cloud theme preserved',    result.ui.theme, 'blue');
  check('1.9 total ui keys', Object.keys(result.ui).length, 3);
}

// 1.10: 纯云端配置（无本地 SRS 和 UI）
{
  const cloud = { srs: { a: 1 }, ui: { b: 'x' } };
  const result = mergeConfig(cloud, {}, {});
  checkDeep('1.10 all from cloud', result, { srs: { a: 1 }, ui: { b: 'x' } });
}

// ═══════════════════════════════════════════════
// SUITE 2 — collectLocalSrs 类型转换
// ═══════════════════════════════════════════════
section('SUITE 2 — collectLocalSrs 类型转换');

const MOCK_SRS = {
  learning_steps: [1, 10],
  starting_ease: 2.50,
  graduating_interval: 1,
  easy_interval: 2,
};

function mockGetItem(map) {
  return k => map.hasOwnProperty(k) ? map[k] : null;
}

// 2.1: number 参数
{
  const store = { 'srs_starting_ease': '2.50', 'srs_graduating_interval': '3' };
  const result = collectLocalSrs(mockGetItem(store), MOCK_SRS);
  check('2.1 parseFloat starting_ease', result.starting_ease, 2.50);
  check('2.1 parseFloat graduating_interval', result.graduating_interval, 3);
}

// 2.2: array 参数
{
  const store = { 'srs_learning_steps': '[1,5,10,30]' };
  const result = collectLocalSrs(mockGetItem(store), MOCK_SRS);
  checkDeep('2.2 JSON.parse array', result.learning_steps, [1,5,10,30]);
}

// 2.3: 参数不在 localStorage 中 → 跳过
{
  const result = collectLocalSrs(mockGetItem({}), MOCK_SRS);
  check('2.3 missing key skipped', result.hasOwnProperty('learning_steps'), false);
  check('2.3 all empty', Object.keys(result).length, 0);
}

// 2.4: 部分参数存在
{
  const store = { 'srs_starting_ease': '1.30' };
  const result = collectLocalSrs(mockGetItem(store), MOCK_SRS);
  check('2.4 only present key', Object.keys(result).length, 1);
  check('2.4 value correct', result.starting_ease, 1.30);
}

// 2.5: 无效 JSON 数组（malformed）
{
  const store = { 'srs_learning_steps': '[1,5' };
  const result = collectLocalSrs(mockGetItem(store), MOCK_SRS);
  check('2.5 malformed JSON skipped', result.hasOwnProperty('learning_steps'), false);
}

// ═══════════════════════════════════════════════
// SUITE 3 — collectLocalUi 参数收集
// ═══════════════════════════════════════════════
section('SUITE 3 — collectLocalUi 参数收集');

// 3.1: 无 UI 参数 → 空对象
{
  const result = collectLocalUi(mockGetItem({}));
  check('3.1 no ui params', Object.keys(result).length, 0);
}

// 3.2: 有部分参数，null 被过滤
{
  const store = { readHint: '1', ttsRate: '0.9', theme: 'dark' };
  const result = collectLocalUi(mockGetItem(store));
  check('3.2 readHint present', result.readHint, '1');
  check('3.2 ttsRate present',  result.ttsRate, '0.9');
  check('3.2 theme present',    result.theme, 'dark');
  check('3.2 null keys removed', result.hasOwnProperty('ttsVoiceName'), false);
  check('3.2 total count', Object.keys(result).length, 3);
}

// 3.3: fs-* 和 ls-* 字体参数收集
{
  const store = { 'fs-opt': '1.2', 'fs-ans': '1.1', 'ls-opt': '1.0' };
  const result = collectLocalUi(mockGetItem(store));
  check('3.3 fs-opt', result['fs-opt'], '1.2');
  check('3.3 fs-ans', result['fs-ans'], '1.1');
  check('3.3 ls-opt', result['ls-opt'], '1.0');
  check('3.3 fs-btn not set', result.hasOwnProperty('fs-btn'), false);
}

// 3.4: fs-* 空字符串不被收集（if (v) 判断）
{
  const store = { 'fs-opt': '' };
  const result = collectLocalUi(mockGetItem(store));
  check('3.4 empty fs-opt skipped', result.hasOwnProperty('fs-opt'), false);
}

// ═══════════════════════════════════════════════
// SUITE 4 — 完整场景：模拟设备 A（AD 预设）→ 云端 → 设备 B 同步
// ═══════════════════════════════════════════════
section('SUITE 4 — 完整 AD 预设保护场景');

// 模拟妈妈的设备（设备 A）有完整 AD 预设
const momSrs = {
  learning_steps: [1,5,10,30],
  starting_ease: 1.30,
  easy_bonus: 1.20,
  interval_modifier: 0.80,
  graduating_interval: 1,
  easy_interval: 2,
  maximum_interval: 36500,
  minimum_interval: 1,
  new_interval: 0.0,
};

// 模拟妈妈的设备上传到云端
const cloudData = { srs: { ...momSrs }, ui: {} };

// 模拟手机登录妈妈账号（设备 B），仅触发了一部分参数变化
const phoneLocalSrs = { graduating_interval: 2, easy_interval: 3 };

// 合并：手机上传时不应冲掉 AD 预设
const merged = mergeConfig(cloudData, phoneLocalSrs, {});

check('4.1 AD learning_steps=[1,5,10,30]', JSON.stringify(merged.srs.learning_steps), JSON.stringify([1,5,10,30]));
check('4.2 AD starting_ease=1.30', merged.srs.starting_ease, 1.30);
check('4.3 AD easy_bonus=1.20', merged.srs.easy_bonus, 1.20);
check('4.4 AD interval_modifier=0.80', merged.srs.interval_modifier, 0.80);
check('4.5 AD maximum_interval=36500', merged.srs.maximum_interval, 36500);
check('4.6 phone graduating_interval=2 (override)', merged.srs.graduating_interval, 2);
check('4.7 phone easy_interval=3 (override)', merged.srs.easy_interval, 3);
check('4.8 total keys = 9 (7 AD + 2 phone)', Object.keys(merged.srs).length, 9);

// ═══════════════════════════════════════════════
// 结果汇总
// ═══════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  结果：${passed} 通过  ${failed} 失败`);
if (failed > 0) {
  console.log(`\n  失败详情：`);
  errors.forEach(e => console.log(e));
}
console.log('═'.repeat(60));
if (failed > 0) process.exit(1);
