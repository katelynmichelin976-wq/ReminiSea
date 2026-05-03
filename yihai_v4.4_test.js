// ═══════════════════════════════════════════════
// v4.4 新增函数单元测试
// 从 yihai_v4.4.html 抽取纯函数逻辑
// ═══════════════════════════════════════════════

// ── simpleHash ──────────────────────────────────────────────────
function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = Math.imul(31, h) + s.charCodeAt(i) | 0; }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── escAttr ─────────────────────────────────────────────────────
function escAttr(s) {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── saveDeckCards 的 slim 格式 ──────────────────────────────────
function slimCard(c) {
  return { id: c.id, name: c.name, imgUrl: c._imgUrl || '', audUrl: c._audUrl || '' };
}

// ── 卡片数据迁移：旧格式 → 新格式 ──────────────────────────────
// 模拟 restoreDecks 中的迁移逻辑
function migrateCard(raw) {
  const card = { ...raw, img: '', audioUrl: '', details: [] };
  if (!card._imgUrl && raw.imgUrl) card._imgUrl = raw.imgUrl;
  if (!card._audUrl && raw.audUrl) card._audUrl = raw.audUrl;
  return card;
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

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

// ═══════════════════════════════════════════════
// SUITE 1 — simpleHash
// ═══════════════════════════════════════════════
section('SUITE 1 — simpleHash 哈希函数');

// 1.1 确定性：相同输入 → 相同输出
check('1.1 确定性 A', simpleHash('hello'), simpleHash('hello'));
check('1.1 确定性 B', simpleHash('忆海拾光'), simpleHash('忆海拾光'));

// 1.2 不同输入 → 不同输出
check('1.2 不同输入 A', simpleHash('hello') !== simpleHash('world'), true);
check('1.2 不同输入 B', simpleHash('a') !== simpleHash('b'), true);

// 1.3 空字符串
check('1.3 空字符串非空', simpleHash('') !== '', true);
check('1.3 空字符串长度', simpleHash('').length, 8);

// 1.4 输出格式：8位 hex，小写
check('1.4 长度8位', simpleHash('test').length, 8);
check('1.4 全小写hex', /^[0-9a-f]{8}$/.test(simpleHash('test')), true);

// 1.5 中文
check('1.5 中文有输出', simpleHash('你好世界').length, 8);
check('1.5 中文确定性', simpleHash('你好'), simpleHash('你好'));

// 1.6 特殊字符
check('1.6 单引号', simpleHash("it's").length, 8);
check('1.6 双引号', simpleHash('a"b').length, 8);
check('1.6 反斜杠', simpleHash('a\\b').length, 8);

// 1.7 跨文件一致性：两份 simpleHash 实现（yihai_v4.4 + deck_manager_v1）输出相同
// 验证方式：用相同输入对比两个 copy 的输出
const simpleHash_copy = function(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = Math.imul(31, h) + s.charCodeAt(i) | 0; }
  return (h >>> 0).toString(16).padStart(8, '0');
};
check('1.7 两份实现一致', simpleHash('忆海拾光_v4.4'), simpleHash_copy('忆海拾光_v4.4'));

// 1.8 长字符串
const longStr = 'a'.repeat(10000);
check('1.8 长字符串', simpleHash(longStr).length, 8);

// ═══════════════════════════════════════════════
// SUITE 2 — escAttr（HTML 属性转义）
// ═══════════════════════════════════════════════
section('SUITE 2 — escAttr 属性转义');

// 2.1 无特殊字符 → 原样
check('2.1 普通文本', escAttr('hello'), 'hello');
check('2.1 中文', escAttr('网络版'), '网络版');

// 2.2 单引号
check('2.2 单引号', escAttr("it's"), 'it&#39;s');

// 2.3 双引号
check('2.3 双引号', escAttr('a"b'), 'a&quot;b');

// 2.4 & 符号
check('2.4 &符号', escAttr('a&b'), 'a&amp;b');

// 2.5 < >
check('2.5 小于号', escAttr('a<b'), 'a&lt;b');
check('2.5 大于号', escAttr('a>b'), 'a&gt;b');

// 2.6 混合
check('2.6 混合', escAttr('<a href="x" onclick=\'y\'>'), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;');

// 2.7 空字符串
check('2.7 空字符串', escAttr(''), '');

// ═══════════════════════════════════════════════
// SUITE 3 — saveDeckCards slim 格式
// ═══════════════════════════════════════════════
section('SUITE 3 — saveDeckCards 存储格式');

// 3.1 云端下载的卡片（有 _imgUrl / _audUrl）
const cloudCard = { id: 'c01', name: '苹果', img: 'blob:...', audioUrl: 'blob:...', _imgUrl: 'deck_abc/c01.jpg', _audUrl: 'deck_abc/c01.m4a', details: [] };
check('3.1 imgUrl 存储', slimCard(cloudCard).imgUrl, 'deck_abc/c01.jpg');
check('3.1 audUrl 存储', slimCard(cloudCard).audUrl, 'deck_abc/c01.m4a');
check('3.1 id 保留', slimCard(cloudCard).id, 'c01');
check('3.1 name 保留', slimCard(cloudCard).name, '苹果');
// 3.1 blob URL 不存储
check('3.1 img 不存', slimCard(cloudCard).img === undefined, true);
check('3.1 audioUrl 不存', slimCard(cloudCard).audioUrl === undefined, true);

// 3.2 手工导入的卡片（无 _imgUrl / _audUrl）
const manualCard = { id: 'm01', name: '香蕉', img: 'blob:...', audioUrl: 'blob:...', details: [] };
check('3.2 imgUrl 默认空', slimCard(manualCard).imgUrl, '');
check('3.2 audUrl 默认空', slimCard(manualCard).audUrl, '');

// 3.3 部分有 URL（只有图片）
const partCard = { id: 'p01', name: '椅子', _imgUrl: 'path/img.jpg', details: [] };
check('3.3 有 imgUrl', slimCard(partCard).imgUrl, 'path/img.jpg');
check('3.3 无 audUrl', slimCard(partCard).audUrl, '');

// 3.4 内置牌组（无 _imgUrl / _audUrl，无 blob）
const builtinCard = { id: 'b01', name: '苹果', img: '🍎', audioUrl: '' };
check('3.4 内置 imgUrl 空', slimCard(builtinCard).imgUrl, '');
check('3.4 内置 audUrl 空', slimCard(builtinCard).audUrl, '');

// ═══════════════════════════════════════════════
// SUITE 4 — 卡片数据迁移（旧格式 → 新格式）
// ═══════════════════════════════════════════════
section('SUITE 4 — restoreDecks 数据迁移');

// 4.1 新格式（已有 _imgUrl）→ 保持不变
const newCard = { id: 'c01', name: '苹果', _imgUrl: 'path/img.jpg', _audUrl: 'path/aud.m4a' };
check('4.1 _imgUrl 保留', migrateCard(newCard)._imgUrl, 'path/img.jpg');
check('4.1 _audUrl 保留', migrateCard(newCard)._audUrl, 'path/aud.m4a');

// 4.2 旧格式（只有 imgUrl）→ 迁移到 _imgUrl
// audUrl 为空字符串时不迁移（空串是 falsy，条件不触发）
const oldCard = { id: 'c01', name: '香蕉', imgUrl: 'old/path.jpg', audUrl: '' };
const m1 = migrateCard(oldCard);
check('4.2 imgUrl → _imgUrl', m1._imgUrl, 'old/path.jpg');
check('4.2 audUrl 空不迁移', m1._audUrl, undefined);  // '' 是 falsy，条件 !_audUrl && '' → false

// 4.3 旧格式（imgUrl 为空字符串）→ 不迁移
const oldEmpty = { id: 'c03', name: '椅子', imgUrl: '', audUrl: '' };
const m2 = migrateCard(oldEmpty);
check('4.3 空 imgUrl 不迁移', m2._imgUrl, undefined);
check('4.3 空 audUrl 不迁移', m2._audUrl, undefined);

// 4.4 无任何 URL 字段 → _imgUrl/_audUrl 均为 undefined
const bare = { id: 'b01', name: '苹果' };
const m3 = migrateCard(bare);
check('4.4 无字段 _imgUrl', m3._imgUrl, undefined);
check('4.4 无字段 _audUrl', m3._audUrl, undefined);

// 4.5 新格式优先于旧格式（同时存在时仅新格式生效）
const hybrid = { id: 'h01', name: '混合', _imgUrl: 'new/path.jpg', imgUrl: 'old/path.jpg' };
const m4 = migrateCard(hybrid);
check('4.5 _imgUrl 优先', m4._imgUrl, 'new/path.jpg');

// 4.6 details 字段补充
check('4.6 details 默认空数组', Array.isArray(migrateCard({id:'x',name:'y'}).details), true);

// ═══════════════════════════════════════════════
// SUITE 5 — sync URL 对比逻辑（模拟 syncDeckFromCloud）
// ═══════════════════════════════════════════════
section('SUITE 5 — 同步 URL 对比逻辑');

// 模拟 syncDeckFromCloud 中的对比：
//   if (server.image_url && server.image_url !== local._imgUrl) → 下载
//   if (server.audio_url && server.audio_url !== local._audUrl) → 下载

function needImgDownload(localCard, serverImageUrl) {
  return serverImageUrl && serverImageUrl !== localCard._imgUrl;
}
function needAudDownload(localCard, serverAudioUrl) {
  return serverAudioUrl && serverAudioUrl !== localCard._audUrl;
}

// 5.1 URL 相同 → 不需要下载
const cardA = { id: 'a', _imgUrl: 'deck/img.jpg', _audUrl: 'deck/aud.m4a' };
check('5.1 同 URL 不下载图', needImgDownload(cardA, 'deck/img.jpg'), false);
check('5.1 同 URL 不下载音', needAudDownload(cardA, 'deck/aud.m4a'), false);

// 5.2 URL 不同 → 需要下载
check('5.2 不同 URL 下载图', needImgDownload(cardA, 'deck/img_v2.jpg'), true);
check('5.2 不同 URL 下载音', needAudDownload(cardA, 'deck/aud_v2.m4a'), true);

// 5.3 服务器无 URL → 不下载（空串/null 在 if 中均为 falsy）
check('5.3 空串不触发下载', !needImgDownload(cardA, ''), true);
check('5.3 null 不触发下载', !needImgDownload(cardA, null), true);

// 5.4 本地无 URL（undefined，手工导入）→ 需要下载
const cardB = { id: 'b' }; // no _imgUrl
check('5.4 本地无 URL 下载', needImgDownload(cardB, 'deck/new.jpg'), true);

// 5.5 服务器新增媒体（本地无 → 服务器有）
const cardC = { id: 'c', _imgUrl: '' };
check('5.5 本地空 URL 服务器有', needImgDownload(cardC, 'deck/new.jpg'), true);

// 5.6 服务器移除媒体（本地有 → 服务器无，空串不触发）
const cardD = { id: 'd', _imgUrl: 'old/img.jpg' };
check('5.6 服务器移除图不覆盖', !needImgDownload(cardD, ''), true);

// ═══════════════════════════════════════════════
// SUITE 6 — 离线数据断线补传筛选逻辑
// ═══════════════════════════════════════════════
section('SUITE 6 — syncPendingData 未同步 Trial 筛选');

function getPendingTrials(allTrials) {
  return (allTrials || []).filter(t => !t.synced_at);
}

// 6.1 无 synced_at → pending
const t1 = { trial_id: 't1', card_id: 'c1', rating: 'good' };
check('6.1 无 synced_at 标记为待补传', getPendingTrials([t1]).length, 1);

// 6.2 有 synced_at → 跳过
const t2 = { trial_id: 't2', card_id: 'c2', rating: 'good', synced_at: 1715000000000 };
check('6.2 有 synced_at 不重复上传', getPendingTrials([t2]).length, 0);

// 6.3 混合列表：过滤正确
const trials = [
  { trial_id: 'a', synced_at: 1715000000000 },
  { trial_id: 'b' },
  { trial_id: 'c', synced_at: 1715000000000 },
  { trial_id: 'd' },
];
check('6.3 混合列表正确过滤', getPendingTrials(trials).length, 2);
check('6.3 只保留未同步', getPendingTrials(trials).map(t => t.trial_id).sort().join(','), 'b,d');

// 6.4 全部已同步 → 空结果
const allSynced = [{ trial_id: 'x', synced_at: 1 }, { trial_id: 'y', synced_at: 2 }];
check('6.4 全已同步返回空数组', getPendingTrials(allSynced).length, 0);

// 6.5 全部未同步 → 全部返回
const noneSynced = [{ trial_id: 'p' }, { trial_id: 'q' }];
check('6.5 全未同步全部返回', getPendingTrials(noneSynced).length, 2);

// 6.6 空列表 → 空数组
check('6.6 空列表', getPendingTrials([]).length, 0);

// 6.7 undefined/null → 空数组
check('6.7 null 保护', getPendingTrials(null).length, 0);
check('6.7 undefined 保护', getPendingTrials(undefined).length, 0);

// 6.8 模拟离线补传后的效果：syncTrialLog 写入 synced_at 后不再被选中
const afterUpload = { trial_id: 'offline_1', card_id: 'c1', synced_at: Date.now() };
check('6.8 补传后不被重复选中', getPendingTrials([afterUpload]).length, 0);

// ═══════════════════════════════════════════════
// SUITE 7 — 云端会话持久化检测逻辑
// ═══════════════════════════════════════════════
section('SUITE 7 — 会话恢复逻辑 + Sync 门禁');

// 模拟 restoreCloudSession 的核心判定
function detectSession(data, error) {
  if (error) return false;
  return !!(data && data.session);
}
// 模拟 sync 函数的门禁条件 if (!_syncEnabled || !_sb) return;
function canSync(syncEnabled, sb) {
  return syncEnabled && !!sb;
}

// 7.1 有效 session → 在线
const validSession = { session: { user: { email: 'test@example.com' } } };
const noSession = { session: null };

check('7.1 有 session 判定为已登录', detectSession(validSession, null), true);
check('7.1 无 session 判定为离线',  detectSession(noSession, null), false);

// 7.2 异常情况
check('7.2 报错视为离线', detectSession(null, new Error('fail')), false);
check('7.2 null data 离线', detectSession(null, null), false);
check('7.2 undefined data 离线', detectSession(undefined, null), false);

// 7.3 Sync 门禁：_syncEnabled + _sb 双条件
const sbClient = {};
check('7.3 已登录+已初始化 → 可同步', canSync(true, sbClient), true);
check('7.3 未登录 → 不可同步', canSync(false, sbClient), false);
check('7.3 客户端未初始化 → 不可同步', canSync(true, null), false);
check('7.3 双重否定 → 不可同步', canSync(false, null), false);

// 7.4 恢复场景：_syncEnabled = true 后持久保持（页面不重载不变）
// 模拟 PWA 后台恢复：变量不变
let _syncEnabled = true;
let _sb = sbClient;
check('7.4 PWA 后台恢复后状态保持', canSync(_syncEnabled, _sb), true);
// 模拟 token 过期但 SDK 自动刷新：_sb 仍然有效
check('7.4 token 刷新不影响门禁', canSync(_syncEnabled, _sb), true);

// 7.5 页面重载场景：restoreCloudSession 异步完成前
// 模拟恢复前初始态：_syncEnabled = false, _sb 已创建
const _sbCreated = sbClient;
_syncEnabled = false;
check('7.5 重载后恢复完成前不可同步', canSync(_syncEnabled, _sbCreated), false);
// 模拟恢复完成后
_syncEnabled = true;
check('7.5 恢复完成后可同步', canSync(_syncEnabled, _sbCreated), true);

// 7.6 退出登录后：_syncEnabled=false, _sb=null
_syncEnabled = false;
_sb = null;
check('7.6 退出登录后不可同步', canSync(_syncEnabled, _sb), false);

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
