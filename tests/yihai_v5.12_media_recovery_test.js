// tests/yihai_v5.12_media_recovery_test.js
// P1 #1 媒体批量 upsert 失败回滚的纯函数单测

let passed = 0, failed = 0;
function check(desc, ok) {
  if (ok) passed++;
  else { failed++; console.log(`  ✗ ${desc}`); }
}

// 与 index.html 中 rollbackUploadedSlots 实现保持同步
function rollbackUploadedSlots(uploadedSlots, failedCardSet) {
  for (const { card, slot } of uploadedSlots) {
    if (!failedCardSet.has(card)) continue;
    const s = card.media?.[slot];
    if (s) s.url = '';
  }
}

// ── 基础场景 ──────────────────────────────────────────────────────
{
  const c = { id: 'c1', media: { img: { url: 'p/c1_img.jpg', v: 0, _blob: 'blob:a' } } };
  rollbackUploadedSlots([], new Set([c]));
  check('empty uploadedSlots → 不动 url', c.media.img.url === 'p/c1_img.jpg');
}
{
  const c = { id: 'c1', media: { img: { url: 'p/c1_img.jpg', v: 0, _blob: 'blob:a' } } };
  rollbackUploadedSlots([{ card: c, slot: 'img' }], new Set());
  check('uploadedSlots 非空但 failedCardSet 空 → 不动 url', c.media.img.url === 'p/c1_img.jpg');
}
{
  const c = { id: 'c1', media: { img: { url: 'p/c1_img.jpg', v: 0, _blob: 'blob:a' } } };
  rollbackUploadedSlots([{ card: c, slot: 'img' }], new Set([c]));
  check('单 slot 失败 → url 清空', c.media.img.url === '');
  check('单 slot 失败 → _blob 保留', c.media.img._blob === 'blob:a');
  check('单 slot 失败 → v 保留', c.media.img.v === 0);
}

// ── 多 slot ──────────────────────────────────────────────────────
{
  const c = {
    id: 'c1',
    media: {
      img: { url: 'p/c1_img.jpg', v: 0, _blob: 'blob:a' },
      aud: { url: 'p/c1_aud.mp3', v: 0, _blob: 'blob:b' },
    },
  };
  rollbackUploadedSlots(
    [{ card: c, slot: 'img' }, { card: c, slot: 'aud' }],
    new Set([c])
  );
  check('两 slot 均失败 → 都清空 url', c.media.img.url === '' && c.media.aud.url === '');
}
{
  const c = {
    id: 'c1',
    media: {
      img: { url: 'p/c1_img.jpg', v: 0, _blob: 'blob:a' },
      aud: { url: 'p/c1_aud.mp3', v: 0, _blob: 'blob:b' },
    },
  };
  // 仅 img 本次上传过；aud 是上次留下的，本次未进 uploadedSlots → 不该被回滚
  rollbackUploadedSlots([{ card: c, slot: 'img' }], new Set([c]));
  check('只回滚本次上传 slot：img 清空', c.media.img.url === '');
  check('只回滚本次上传 slot：aud 不动', c.media.aud.url === 'p/c1_aud.mp3');
}

// ── 多卡混合 ─────────────────────────────────────────────────────
{
  const c1 = { id: 'c1', media: { img: { url: 'p/c1_img.jpg', v: 0, _blob: 'blob:a' } } };
  const c2 = { id: 'c2', media: { img: { url: 'p/c2_img.jpg', v: 0, _blob: 'blob:b' } } };
  rollbackUploadedSlots(
    [{ card: c1, slot: 'img' }, { card: c2, slot: 'img' }],
    new Set([c1])
  );
  check('多卡部分失败 → 失败卡 url 清', c1.media.img.url === '');
  check('多卡部分失败 → 成功卡 url 留', c2.media.img.url === 'p/c2_img.jpg');
}

// ── 防御性 ───────────────────────────────────────────────────────
{
  const c = { id: 'c1', media: {} };
  rollbackUploadedSlots([{ card: c, slot: 'img' }], new Set([c]));
  check('media 槽不存在 → 不抛错', true);
}
{
  const c = { id: 'c1' };
  rollbackUploadedSlots([{ card: c, slot: 'img' }], new Set([c]));
  check('无 media 字段 → 不抛错', true);
}

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
