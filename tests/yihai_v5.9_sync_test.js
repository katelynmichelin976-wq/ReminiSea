// tests/yihai_v5.9_sync_test.js
// 复制并扩展纯函数（与 index.html 保持同步）

let passed = 0, failed = 0;
function check(desc, ok) {
  if (ok) passed++;
  else { failed++; console.log(`  ✗ ${desc}`); }
}

// ── hasMedia ──────────────────────────────────────────────────────
function hasMedia(card, slot) {
  const s = card.media?.[slot];
  return !!(s?.url || s?._blob);
}

{
  check('hasMedia: no media field → false', !hasMedia({}, 'img'));
  check('hasMedia: empty slot → false', !hasMedia({ media: { img: { url: '', v: 0, _blob: '' } } }, 'img'));
  check('hasMedia: url non-empty → true', hasMedia({ media: { img: { url: 'path/x.jpg', v: 0 } } }, 'img'));
  check('hasMedia: _blob non-empty → true', hasMedia({ media: { img: { url: '', v: 0, _blob: 'blob:...' } } }, 'img'));
}

// ── mediaLoaded ───────────────────────────────────────────────────
function mediaLoaded(card, slot) {
  if (!hasMedia(card, slot)) return true;
  return !!(card.media?.[slot]?._blob);
}

{
  check('mediaLoaded: no media → true（无媒体不缺失）', mediaLoaded({}, 'img'));
  check('mediaLoaded: url set, _blob empty → false', !mediaLoaded({ media: { img: { url: 'x.jpg', v: 0, _blob: '' } } }, 'img'));
  check('mediaLoaded: url set, _blob set → true', mediaLoaded({ media: { img: { url: 'x.jpg', v: 0, _blob: 'blob:...' } } }, 'img'));
  check('mediaLoaded: only _blob（未上传）→ true', mediaLoaded({ media: { img: { url: '', v: 0, _blob: 'blob:...' } } }, 'img'));
}

// ── cardMediaComplete ─────────────────────────────────────────────
function cardMediaComplete(card) {
  return Object.keys(card.media || {}).every(slot => mediaLoaded(card, slot));
}

{
  check('cardMediaComplete: no media → true', cardMediaComplete({ media: {} }));
  check('cardMediaComplete: all slots loaded → true',
    cardMediaComplete({ media: { img: { url: 'x.jpg', v: 0, _blob: 'blob:...' }, aud: { url: 'x.mp3', v: 0, _blob: 'blob:...' } } }));
  check('cardMediaComplete: one slot missing _blob → false',
    !cardMediaComplete({ media: { img: { url: 'x.jpg', v: 0, _blob: 'blob:...' }, aud: { url: 'x.mp3', v: 0, _blob: '' } } }));
}

// ── serializeMedia ────────────────────────────────────────────────
function serializeMedia(media) {
  return Object.fromEntries(
    Object.entries(media).map(([slot, s]) => [slot, { url: s.url || '', v: s.v ?? 0 }])
  );
}

{
  const result = serializeMedia({ img: { url: 'path/x.jpg', v: 2, _blob: 'blob:...' } });
  check('serializeMedia: strips _blob', !('_blob' in result.img));
  check('serializeMedia: preserves url', result.img.url === 'path/x.jpg');
  check('serializeMedia: preserves v', result.img.v === 2);
  check('serializeMedia: v=0 kept', serializeMedia({ img: { url: '', v: 0, _blob: '' } }).img.v === 0);
}

// ── mergeCard ─────────────────────────────────────────────────────
function mergeCard(local, remote) {
  const merged = { ...local, ...remote };
  merged.media = merged.media || {};
  for (const slot of Object.keys(remote.media || {})) {
    const rs = remote.media[slot];
    const ls = local.media?.[slot] || {};
    const sameVersion = rs.url === ls.url && rs.v === (ls.v ?? 0);
    merged.media[slot] = {
      url:   rs.url,
      v:     rs.v ?? 0,
      _blob: sameVersion ? (ls._blob || '') : '',
    };
  }
  return merged;
}

{
  // 同版本 → 保留 _blob
  const local  = { id: 'c1', name: 'a', mod: 50, media: { img: { url: 'x.jpg', v: 0, _blob: 'blob:existing' } } };
  const remote = { id: 'c1', name: 'a', mod: 50, media: { img: { url: 'x.jpg', v: 0 } } };
  const m1 = mergeCard(local, remote);
  check('mergeCard: 同 url+v → 保留 _blob', m1.media.img._blob === 'blob:existing');

  // 新版本 → 清空 _blob
  const remote2 = { id: 'c1', name: 'a', mod: 60, media: { img: { url: 'x_v1.jpg', v: 1 } } };
  const m2 = mergeCard(local, remote2);
  check('mergeCard: 新 url/v → 清空 _blob', m2.media.img._blob === '');
  check('mergeCard: 新 v 值正确', m2.media.img.v === 1);

  // remote 字段覆盖 local 字段（last-write-wins）
  const local3  = { id: 'c1', name: 'old', mod: 30, media: {} };
  const remote3 = { id: 'c1', name: 'new', mod: 60, media: {} };
  check('mergeCard: remote name 覆盖 local name', mergeCard(local3, remote3).name === 'new');
}

// ── buildPath ─────────────────────────────────────────────────────
function buildPath(userId, deckId, cardId, slot, v, ext) {
  const base = `personal/${userId}/${deckId}/${cardId}_${slot}`;
  return v > 0 ? `${base}_v${v}.${ext}` : `${base}.${ext}`;
}

{
  check('buildPath: v=0 无 _v 后缀', buildPath('u1','d1','c1','img',0,'jpg') === 'personal/u1/d1/c1_img.jpg');
  check('buildPath: v>0 有 _v 后缀', buildPath('u1','d1','c1','img',2,'jpg') === 'personal/u1/d1/c1_img_v2.jpg');
  check('buildPath: aud slot', buildPath('u1','d1','c1','aud',0,'mp3') === 'personal/u1/d1/c1_aud.mp3');
}

// ── computeDeckDiff（字段 .ts 版）────────────────────────────────
// 注意：remoteCardMeta 字段名改为 .ts（epoch ms），不再是 .updated_at
function computeDeckDiff(localCards, deletedIds, remoteCardMeta, pushedAt, pulledAt) {
  const localMap  = new Map(localCards.map(c => [c.id, c]));
  const remoteMap = new Map(remoteCardMeta.map(r => [r.card_id, r.ts]));
  const toPush = localCards.filter(c => {
    if (!c.mod || c.mod <= pushedAt) return false;
    const rTs = remoteMap.get(c.id);
    return rTs === undefined || c.mod > rTs;
  });
  const toPull = remoteCardMeta.filter(r => {
    if (r.ts <= pulledAt) return false;
    const local = localMap.get(r.card_id);
    return !local || r.ts > (local.mod || 0);
  });
  const toDelete = deletedIds.filter(id => remoteMap.has(id));
  return { toPush, toPull, toDelete };
}

{
  const r1 = computeDeckDiff(
    [{ id: 'c1', mod: 100 }, { id: 'c2', mod: 50 }],
    [],
    [{ card_id: 'c2', ts: 50 }],
    50, 50
  );
  check('diff A: toPush=[c1]', r1.toPush.length === 1 && r1.toPush[0].id === 'c1');
  check('diff A: toPull 空', r1.toPull.length === 0);

  const r2 = computeDeckDiff(
    [{ id: 'c1', mod: 200 }],
    [],
    [{ card_id: 'c1', ts: 150 }],
    100, 100
  );
  check('diff C: 本地赢', r2.toPush.length === 1 && r2.toPull.length === 0);

  const r3 = computeDeckDiff(
    [{ id: 'c1', mod: 150 }],
    [],
    [{ card_id: 'c1', ts: 200 }],
    100, 100
  );
  check('diff D: 云端赢', r3.toPush.length === 0 && r3.toPull.length === 1);

  const r4 = computeDeckDiff([], ['c1'], [{ card_id: 'c1', ts: 100 }], 50, 50);
  check('diff E: toDelete', r4.toDelete.length === 1);
}

// ── computeDeckSyncState mediaIncomplete 分支 ─────────────────────
// （只测纯函数逻辑，不依赖全局 DECKS/DECKS_META）
function computeDeckSyncStatePure(cards, deleted, meta, remoteUpdatedAt, pushedAt, pulledAt) {
  const localChanged = cards.some(c => c.mod && c.mod > pushedAt)
    || deleted.length > 0
    || (meta.mod && meta.mod > pushedAt);
  const remoteAhead  = remoteUpdatedAt && remoteUpdatedAt > pulledAt;
  const mediaOk      = cards.every(c => Object.keys(c.media || {}).every(slot => {
    const s = c.media[slot];
    return !s.url || !!s._blob;   // 无 url 或有 _blob 均算 ok
  }));
  if (localChanged && remoteAhead) return 'bothChanged';
  if (localChanged)  return 'localDirty';
  if (remoteAhead)   return 'remoteAhead';
  if (!mediaOk)      return 'mediaIncomplete';
  return 'clean';
}

{
  const noMedia  = { mod: 50, media: {} };
  const loaded   = { mod: 50, media: { img: { url: 'x.jpg', v: 0, _blob: 'blob:x' } } };
  const missing  = { mod: 50, media: { img: { url: 'x.jpg', v: 0, _blob: '' } } };

  check('syncState: clean（全部 loaded）',
    computeDeckSyncStatePure([loaded], [], { mod: 50 }, 100, 100, 100) === 'clean');
  check('syncState: clean（无媒体卡）',
    computeDeckSyncStatePure([noMedia], [], { mod: 50 }, 100, 100, 100) === 'clean');
  check('syncState: mediaIncomplete（有 url 无 _blob）',
    computeDeckSyncStatePure([missing], [], { mod: 50 }, 100, 100, 100) === 'mediaIncomplete');
  check('syncState: remoteAhead 遮盖 mediaIncomplete',
    computeDeckSyncStatePure([missing], [], { mod: 50 }, 200, 100, 100) === 'remoteAhead');
  check('syncState: localDirty',
    computeDeckSyncStatePure([{ mod: 200, media: {} }], [], { mod: 50 }, 100, 100, 100) === 'localDirty');
}

console.log(`\n  通过 ${passed} / 失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
