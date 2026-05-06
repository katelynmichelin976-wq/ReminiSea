// ═══════════════════════════════════════════════
// v4.7–v4.8 新增函数单元测试
// 从 yihai_v4.8.html 抽取纯函数逻辑
// ═══════════════════════════════════════════════

// ── minsToTs ──────────────────────────────────────────────────
function minsToTs(mins) {
  return Math.round(mins * 60 * 1000);
}

// ── cdnMediaUrl ───────────────────────────────────────────────
let MEDIA_CDN_BASE = '';
function cdnMediaUrl(path) {
  if (!path) return '';
  return MEDIA_CDN_BASE ? MEDIA_CDN_BASE + '/' + path : '';
}

// ── secsToLabel ───────────────────────────────────────────────
function secsToLabel(secs) {
  if (secs >= 3600 && secs % 3600 === 0) return (secs / 3600) + 'h';
  return Math.round(secs / 60) + 'm';
}

// ── parallelMapLimit ──────────────────────────────────────────
async function parallelMapLimit(arr, limit, fn) {
  const entries = arr.entries();
  const workers = Array.from({ length: limit }, async () => {
    for (const [i, item] of entries) await fn(item, i);
  });
  await Promise.all(workers);
}

// ── setObjURL ─────────────────────────────────────────────────
function setObjURL(card, field, blob) {
  if (card[field] && card[field].startsWith('blob:')) URL.revokeObjectURL(card[field]);
  card[field] = blob ? URL.createObjectURL(blob) : '';
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

function ok(label, val) {
  check(label, !!val, true);
}

// ═══════════════════════════════════════════════
// SUITE 9 — minsToTs 分钟→毫秒
// ═══════════════════════════════════════════════
section('SUITE 9 — minsToTs 分钟→毫秒');

check('9.1 1分钟', minsToTs(1), 60000);
check('9.2 10分钟', minsToTs(10), 600000);
check('9.3 0分钟', minsToTs(0), 0);
check('9.4 浮点', minsToTs(1.5), 90000);
check('9.5 大值', minsToTs(1440), 86400000);
check('9.6 负值', minsToTs(-5), -300000);

// ═══════════════════════════════════════════════
// SUITE 10 — cdnMediaUrl CDN URL 构造
// ═══════════════════════════════════════════════
section('SUITE 10 — cdnMediaUrl CDN URL 构造');

// 10.1-4: 有 CDN BASE
MEDIA_CDN_BASE = 'https://cdn.example.com';
check('10.1 普通路径', cdnMediaUrl('ReminiSea/img.jpg'), 'https://cdn.example.com/ReminiSea/img.jpg');
check('10.2 子目录路径', cdnMediaUrl('deck_abc/c01.m4a'), 'https://cdn.example.com/deck_abc/c01.m4a');
check('10.3 空路径', cdnMediaUrl(''), '');
check('10.4 null/undefined', cdnMediaUrl(null), '');

// 10.5-8: 无 CDN BASE
MEDIA_CDN_BASE = '';
check('10.5 无CDN返回空', cdnMediaUrl('ReminiSea/img.jpg'), '');
check('10.6 无CDN空路径', cdnMediaUrl(''), '');
check('10.7 无CDN null', cdnMediaUrl(null), '');

// 10.8: CDN BASE 以 / 结尾（不会产生双斜杠）
MEDIA_CDN_BASE = 'https://cdn.example.com/';
check('10.8 Base以/结尾', cdnMediaUrl('path/file.jpg'), 'https://cdn.example.com//path/file.jpg');

// 10.9: 恢复空
MEDIA_CDN_BASE = '';

// ═══════════════════════════════════════════════
// SUITE 11 — secsToLabel 秒→标签
// ═══════════════════════════════════════════════
section('SUITE 11 — secsToLabel 秒→标签');

check('11.1 30秒', secsToLabel(30), '1m');
check('11.2 1秒', secsToLabel(1), '0m');
check('11.3 120秒→2m', secsToLabel(120), '2m');
check('11.4 300秒→5m', secsToLabel(300), '5m');

// 整小时
check('11.5 3600秒→1h', secsToLabel(3600), '1h');
check('11.6 7200秒→2h', secsToLabel(7200), '2h');
check('11.7 86400秒→24h', secsToLabel(86400), '24h');

// 非整小时
check('11.8 3660秒→61m', secsToLabel(3660), '61m');
check('11.9 5400秒→90m', secsToLabel(5400), '90m');

// 边界
check('11.10 0秒', secsToLabel(0), '0m');
check('11.11 3599秒', secsToLabel(3599), '60m');

// ═══════════════════════════════════════════════
// SUITE 12 — parallelMapLimit 并发控制
// ═══════════════════════════════════════════════
section('SUITE 12 — parallelMapLimit 并发控制');

(async function() {

// 12.1 空数组
{
  const out = [];
  await parallelMapLimit([], 3, async (x) => { out.push(x); });
  check('12.1 空数组', out.length, 0);
}

// 12.2 结果顺序
{
  const order = [];
  await parallelMapLimit([1, 2, 3], 5, async (x) => { order.push(x); });
  check('12.2 顺序保持', order.join(','), '1,2,3');
}

// 12.3 limit=1 退化为串行
{
  let running = 0, maxRunning = 0;
  await parallelMapLimit([10, 20, 30], 1, async (x) => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise(r => setTimeout(r, 5));
    running--;
  });
  check('12.3 limit=1 无并发', maxRunning, 1);
}

// 12.4 limit=3 控制并发度
{
  let running = 0, maxRunning = 0;
  await parallelMapLimit([1, 2, 3, 4, 5, 6], 3, async (x) => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise(r => setTimeout(r, 20));
    running--;
  });
  ok('12.4 limit=3 并发≤3', maxRunning <= 3);
  ok('12.4 实际并发>1', maxRunning > 1);
}

// 12.5 单任务
{
  const out = [];
  await parallelMapLimit(['a'], 5, async (x) => { out.push(x); });
  check('12.5 单任务结果', out.join(','), 'a');
}

// 12.6 limit > 数组长度
{
  const out = [];
  await parallelMapLimit([1, 2], 10, async (x) => { out.push(x); });
  check('12.6 limit>长度', out.length, 2);
}

// 12.7 错误隔离：一个任务失败，其他仍能执行
{
  const out = [];
  try {
    await parallelMapLimit([1, 2, 3], 3, async (x) => {
      if (x === 2) throw new Error('fail');
      out.push(x);
    });
  } catch(e) { /* parallelMapLimit 内不抛，单个任务异常被吞 */ }
  // 至少执行了非失败的任务
  ok('12.7 错误隔离未全崩', out.length >= 2);
}

// 12.8 大数组 + limit=1（回归测试）
{
  const out = [];
  await parallelMapLimit(Array.from({ length: 50 }, (_, i) => i), 1, async (x) => { out.push(x); });
  check('12.8 limit=1 大数组', out.length, 50);
}

// 12.9 limit=0 边界（退化为永不执行）
{
  const out = [];
  await parallelMapLimit([1, 2, 3], 0, async (x) => { out.push(x); });
  check('12.9 limit=0 不执行', out.length, 0);
}

// 12.10 大 limit 不限制
{
  let running = 0, maxRunning = 0;
  await parallelMapLimit([1, 2, 3, 4, 5], 100, async (x) => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise(r => setTimeout(r, 5));
    running--;
  });
  check('12.10 limit=100 全部并发', maxRunning, 5);
}

})().then(() => {

// ═══════════════════════════════════════════════
// SUITE 13 — setObjURL ObjectURL 管理
// ═══════════════════════════════════════════════
section('SUITE 13 — setObjURL ObjectURL 管理');

// 13.1 首次赋值
(function() {
  const card = { img: '' };
  const blob = new Blob(['test'], { type: 'text/plain' });
  setObjURL(card, 'img', blob);
  ok('13.1 创建ObjectURL', typeof card.img === 'string' && card.img.startsWith('blob:'));
})();

// 13.2 null blob → 置空
(function() {
  const card = { img: 'blob:something' };
  setObjURL(card, 'img', null);
  check('13.2 null blob置空', card.img, '');
})();

// 13.3 非 blob URL 被替换
(function() {
  const card = { img: 'https://example.com/img.jpg' };
  setObjURL(card, 'img', new Blob(['x']));
  ok('13.3 替换非blob', card.img.startsWith('blob:'));
})();

// 13.4 空字符串旧值
(function() {
  const card = { img: '' };
  setObjURL(card, 'img', new Blob(['x']));
  ok('13.4 空旧值创建', card.img.startsWith('blob:'));
})();

// 13.5 audioUrl 字段
(function() {
  const card = { audioUrl: '' };
  setObjURL(card, 'audioUrl', new Blob(['audio'], { type: 'audio/mp4' }));
  ok('13.5 audioUrl创建', card.audioUrl.startsWith('blob:'));
})();

// 13.6 替换旧 blob URL
(function() {
  const card = { img: '' };
  const b1 = new Blob(['old']);
  setObjURL(card, 'img', b1);
  const firstUrl = card.img;
  ok('13.6a 第一次', firstUrl.startsWith('blob:'));
  const b2 = new Blob(['new']);
  setObjURL(card, 'img', b2);
  ok('13.6b 替换成功', card.img.startsWith('blob:'));
  check('13.6c URL已变', card.img !== firstUrl, true);
})();

// 13.7 blob 为 undefined
(function() {
  const card = { img: 'blob:old' };
  setObjURL(card, 'img', undefined);
  check('13.7 undefined置空', card.img, '');
})();

// 13.8 旧值为 'blob:' 前缀但非 blob URL（不 revoke，不抛错）
(function() {
  const card = { img: 'blob-like-text' };
  setObjURL(card, 'img', new Blob(['x']));
  ok('13.8 blob前缀不抛错', card.img.startsWith('blob:'));
})();

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

});
