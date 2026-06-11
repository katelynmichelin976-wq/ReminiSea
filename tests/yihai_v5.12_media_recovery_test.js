// tests/yihai_v5.12_media_recovery_test.js
// crash-mid-sync 恢复纯函数单测（与 index.html 保持同步）

let passed = 0, failed = 0;
function check(desc, ok) {
  if (ok) passed++;
  else { failed++; console.log(`  ✗ ${desc}`); }
}

// ── rollbackUploadedSlots ─────────────────────────────────────────
function rollbackUploadedSlots(uploadedSlots, failedCardSet) {
  for (const { card, slot } of uploadedSlots) {
    if (!failedCardSet.has(card)) continue;
    const s = card.media?.[slot];
    if (s) s.url = '';
  }
}

{
  const c = { id: 'c1', media: { img: { url: 'p/c1_img.jpg', v: 0, _blob: 'blob:a' } } };
  rollbackUploadedSlots([{ card: c, slot: 'img' }], new Set([c]));
  check('rollback: 失败卡的 url 清空', c.media.img.url === '');
  check('rollback: _blob 不动', c.media.img._blob === 'blob:a');
}
{
  const c = { id: 'c1', media: { img: { url: 'p/c1_img.jpg', v: 0, _blob: 'blob:a' } } };
  rollbackUploadedSlots([{ card: c, slot: 'img' }], new Set());
  check('rollback: 不在 failedSet → url 不动', c.media.img.url === 'p/c1_img.jpg');
}
{
  const c1 = { id: 'c1', media: { img: { url: 'p/c1.jpg', v: 0, _blob: 'b1' } } };
  const c2 = { id: 'c2', media: { img: { url: 'p/c2.jpg', v: 0, _blob: 'b2' } } };
  rollbackUploadedSlots(
    [{ card: c1, slot: 'img' }, { card: c2, slot: 'img' }],
    new Set([c1])
  );
  check('rollback: 部分失败 → 仅 c1 url 清空', c1.media.img.url === '' && c2.media.img.url === 'p/c2.jpg');
}

// ── commitUploadedSlots ────────────────────────────────────────────
function commitUploadedSlots(uploadedSlots, succeededCardSet) {
  for (const { card, slot } of uploadedSlots) {
    if (!succeededCardSet.has(card)) continue;
    const s = card.media?.[slot];
    if (s) s.confirmed = true;
  }
}

{
  const c = { id: 'c1', media: { img: { url: 'p/c1_img.jpg', v: 0, _blob: 'blob:a' } } };
  commitUploadedSlots([{ card: c, slot: 'img' }], new Set([c]));
  check('commit: 成功卡的 slot 置 confirmed=true', c.media.img.confirmed === true);
  check('commit: url 不动', c.media.img.url === 'p/c1_img.jpg');
  check('commit: _blob 不动', c.media.img._blob === 'blob:a');
}
{
  const c = { id: 'c1', media: { img: { url: 'p/c1_img.jpg', v: 0, _blob: 'blob:a' } } };
  commitUploadedSlots([{ card: c, slot: 'img' }], new Set());
  check('commit: 不在 succeededSet → confirmed 不变', c.media.img.confirmed !== true);
}
{
  const c1 = { id: 'c1', media: { img: { url: 'p/c1.jpg', v: 0, _blob: 'b1' } } };
  const c2 = { id: 'c2', media: { img: { url: 'p/c2.jpg', v: 0, _blob: 'b2' } } };
  commitUploadedSlots(
    [{ card: c1, slot: 'img' }, { card: c2, slot: 'img' }],
    new Set([c1])
  );
  check('commit: 部分成功 → 仅 c1 置 confirmed', c1.media.img.confirmed === true && c2.media.img.confirmed !== true);
}

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);