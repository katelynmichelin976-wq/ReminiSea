/**
 * 忆海拾光 跨设备同步场景测试 — v5.10+
 * 依赖：python -m http.server 8080 --directory C:\code
 *        $env:TEST_PASSWORD="xxx"
 * 运行：$env:TEST_PASSWORD="xxx"; node tests/_pw_sync_scenarios.js
 *
 * 覆盖：
 *   PHASE 0: A/B 登录 + 清旧云端数据
 *   PHASE 1: 导入 .yhspack → A 同步 → B 下载验证
 *   PHASE 2: A 重命名 → A 同步 → B 同步验证
 *   PHASE 3: A 修改媒体版本 → A 同步 → B 同步验证
 *   PHASE 4: A 删除卡片 → A 同步 → B 同步验证
 *   PHASE 5: 清理云端测试数据
 */
const { chromium } = require('playwright');
const JSZip = require('jszip');
const helper = require('./_playwright_helper');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhaff@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

const DECK_ID = '__sync_scen_' + Date.now();
const DECK_NAME = 'SyncScenTest';

async function waitSyncDone(page, maxWait) {
  const iterations = Math.ceil((maxWait || 90000) / 500);
  for (let i = 0; i < iterations; i++) {
    const done = await run(page, () => typeof _syncInFlight === 'undefined' || !_syncInFlight);
    if (done) return true;
    await wait(page, 500);
  }
  return false;
}

async function waitActiveSyncJobDone(page, deckKey, maxWait) {
  const iterations = Math.ceil((maxWait || 90000) / 500);
  for (let i = 0; i < iterations; i++) {
    const done = await run(page, (key) => {
      if (typeof _activeSyncJobs === 'undefined') return true;
      return !_activeSyncJobs.has(key);
    }, deckKey);
    if (done) return true;
    await wait(page, 500);
  }
  return false;
}

async function setupDevice(page, label) {
  await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(page, 2000);
  await run(page, async () => {
    localStorage.clear();
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) indexedDB.deleteDatabase(db.name);
    } catch (e) {}
  });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(page, 2000);
  pass(`${label} 登录成功`, await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));
  await waitSyncDone(page, 120000);
  await run(page, () => goHome());
  await wait(page, 500);
}

// 构造一个带 1x1 PNG 图片的 .yhspack Buffer（Node 端）
async function buildYhspack(deckId, deckName, cards) {
  const zip = new JSZip();
  // 最小合法 1x1 PNG (67 bytes)
  const png1x1 = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
    '2e00000000c4944415478016360f8cfc00000000200016fe72b000000000049' +
    '454e44ae426082',
    'hex'
  );
  const cardList = cards.map((c, i) => {
    const imgName = `img_${i}.png`;
    zip.file(imgName, png1x1);
    return { id: c.id, name: c.name, image: imgName, cardType: 'choice', ext: {} };
  });
  const deckJson = { deck: { id: deckId, name: deckName, language: 'zh-CN', cards: cardList } };
  zip.file('deck.json', JSON.stringify(deckJson));
  return zip.generateAsync({ type: 'nodebuffer' });
}

(async () => {
  if (!TEST_PASSWORD) {
    console.error('FATAL: 请设置 TEST_PASSWORD 环境变量');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await ctxA.newPage();
  await helper.startCoverage(pageA);
  pageA.on('pageerror', e => console.log(`  [A PAGE ERROR] ${e.message}`));
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageB = await ctxB.newPage();
  await helper.startCoverage(pageB);
  pageB.on('pageerror', e => console.log(`  [B PAGE ERROR] ${e.message}`));

  try {
    // ════ PHASE 0: A/B 登录 + 清旧云端数据 ════
    section('PHASE 0: A/B 登录 + 清旧云端数据');
    await setupDevice(pageA, '设备 A');
    await setupDevice(pageB, '设备 B');

    const cleanErr = await run(pageA, async (deckId) => {
      try {
        await _sb.from('deck_cards').delete().eq('deck_id', deckId);
        await _sb.from('decks').delete().eq('id', deckId);
        return null;
      } catch (e) { return e.message; }
    }, DECK_ID);
    pass('PHASE 0: 清旧云端数据', cleanErr === null);
    pass('PHASE 0: 设备 A _syncEnabled', await run(pageA, () => !!_syncEnabled));
    pass('PHASE 0: 设备 B _syncEnabled', await run(pageB, () => !!_syncEnabled));

    // ════ PHASE 1: 导入 .yhspack → A 同步 → B 下载 ════
    section('PHASE 1: 导入跨设备');

    const packBuf = await buildYhspack(DECK_ID, DECK_NAME, [
      { id: 'sc1', name: '卡片一' },
      { id: 'sc2', name: '卡片二' },
    ]);

    // 通过 CDP 注入 File 对象并调用 importYhspack
    await pageA.evaluate(({ id, name, bufHex }) => {
      const bytes = new Uint8Array(bufHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
      const blob = new Blob([bytes], { type: 'application/zip' });
      const file = new File([blob], name + '.yhspack', { type: 'application/zip' });
      return importYhspack(file);
    }, { id: DECK_ID, name: DECK_NAME, bufHex: packBuf.toString('hex') });
    await wait(pageA, 3000);

    const deckLenA = await run(pageA, (key) => (DECKS[key] || []).length, DECK_ID);
    pass('PHASE 1: A 导入后本地有 2 张卡', deckLenA === 2);

    const modCheck = await run(pageA, (key) => {
      const cards = DECKS[key] || [];
      return cards.every(c => c.mod > 0);
    }, DECK_ID);
    pass('PHASE 1: A 导入后每张卡 mod 非零', modCheck === true);

    const syncErrP1 = await run(pageA, async (key) => {
      try { await syncDeck(key); return null; } catch (e) { return e.message; }
    }, DECK_ID);
    await waitActiveSyncJobDone(pageA, DECK_ID, 60000);
    pass('PHASE 1: A syncDeck 成功', syncErrP1 === null);

    const cloudDeck = await run(pageA, async (key) => {
      try {
        const { data } = await _sb.from('decks').select('id,name,card_count').eq('id', key);
        return data && data[0] ? data[0] : null;
      } catch (e) { return null; }
    }, DECK_ID);
    pass('PHASE 1: 云端 decks 行存在', !!cloudDeck);
    pass('PHASE 1: 云端 card_count = 2', cloudDeck && cloudDeck.card_count === 2);

    const dlErr = await run(pageB, async (args) => {
      try { await downloadPersonalDeckFromCloud(args.id, args.name, 'zh-CN', null); return null; }
      catch (e) { return e.message; }
    }, { id: DECK_ID, name: DECK_NAME });
    await wait(pageB, 5000);
    pass('PHASE 1: B downloadPersonalDeckFromCloud 无异常', dlErr === null);

    const deckLenB = await run(pageB, (key) => (DECKS[key] || []).length, DECK_ID);
    pass('PHASE 1: B 下载后本地有 2 张卡', deckLenB === 2);

    const metaNameB = await run(pageB, (key) => {
      const m = DECKS_META.find(d => d.key === key);
      return m ? m.name : null;
    }, DECK_ID);
    pass('PHASE 1: B meta.name 匹配', metaNameB === DECK_NAME);

    const mediaCheckB = await run(pageB, (key) => {
      const cards = DECKS[key] || [];
      return cards.some(c => c.media && c.media.img && c.media.img.url);
    }, DECK_ID);
    pass('PHASE 1: B 至少一张卡 media.img.url 非空', mediaCheckB === true);

    // ════ PHASE 2: A 重命名 → A 同步 → B 同步 ════
    section('PHASE 2: 重命名跨设备');

    const newName = 'SyncScenTest_Renamed';
    await run(pageA, async (args) => {
      const meta = DECKS_META.find(m => m.key === args.key);
      if (!meta) return;
      meta.name = args.name;
      meta.mod = nextMod();
      saveDeckIndex();
      await syncDeck(args.key);
    }, { key: DECK_ID, name: newName });
    await waitActiveSyncJobDone(pageA, DECK_ID, 60000);

    const cloudDeckName = await run(pageA, async (key) => {
      try {
        const { data } = await _sb.from('decks').select('name').eq('id', key);
        return data && data[0] ? data[0].name : null;
      } catch (e) { return null; }
    }, DECK_ID);
    pass('PHASE 2: A 同步后云端 name 已更新', cloudDeckName === newName);

    const syncErrB2 = await run(pageB, async (key) => {
      try { await syncDeck(key); return null; } catch (e) { return e.message; }
    }, DECK_ID);
    await waitActiveSyncJobDone(pageB, DECK_ID, 60000);
    pass('PHASE 2: B syncDeck 无异常', syncErrB2 === null);

    const metaNameB2 = await run(pageB, (key) => {
      const m = DECKS_META.find(d => d.key === key);
      return m ? m.name : null;
    }, DECK_ID);
    pass('PHASE 2: B meta.name 同步到云端新名', metaNameB2 === newName);
    pass('PHASE 2: B 卡片数量仍为 2', await run(pageB, (key) => (DECKS[key] || []).length, DECK_ID) === 2);

    // ════ PHASE 3: A 修改媒体版本 → A 同步 → B 同步 ════
    section('PHASE 3: 修改媒体版本跨设备');

    // 构造新 png（不同字节，1x1 蓝色 PNG）
    const newPng = Buffer.from(
      '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
      '01 2e00000000c4944415478016360f8ffff0000000200019de34f000000' +
      '0049454e44ae426082'.replace(/ /g, ''),
      'hex'
    );

    // 构造：url=''（未上传），_blob 有值，v=1 → runMediaPhase 会上传并写 url
    const syncErrP3 = await run(pageA, async (args) => {
      try {
        const cards = DECKS[args.key] || [];
        if (!cards.length) return 'no cards';
        const card = cards[0];
        const newBlob = new Blob([new Uint8Array(args.pngBytes)], { type: 'image/png' });
        const blobUrl = URL.createObjectURL(newBlob);
        // 清 url，让 runMediaPhase 触发上传；v=1 → buildPath 生成 _v1.png
        card.media = card.media || {};
        card.media.img = { url: '', v: 1, _blob: blobUrl };
        card.img = blobUrl;
        card.mod = nextMod();
        const idbKey = args.key + '_' + card.id + '_img';
        await saveMedia(idbKey, newBlob).catch(() => {});
        saveDeckCards(args.key, DECKS[args.key]);
        await syncDeck(args.key);
        return null;
      } catch (e) { return e.message; }
    }, { key: DECK_ID, pngBytes: Array.from(newPng) });
    await waitActiveSyncJobDone(pageA, DECK_ID, 60000);
    pass('PHASE 3: A 修改媒体并 syncDeck 成功', syncErrP3 === null);

    const cloudMediaUrl = await run(pageA, async (args) => {
      try {
        const { data } = await _sb.from('deck_cards')
          .select('card_id,media').eq('deck_id', args.key).eq('card_id', 'sc1');
        if (!data || !data[0]) return null;
        return data[0].media?.img?.url || null;
      } catch (e) { return null; }
    }, { key: DECK_ID });
    pass('PHASE 3: 云端 media.img.url 存在', !!cloudMediaUrl);
    pass('PHASE 3: 云端 media.img.url 含 _v1（buildPath v>0 逻辑）', cloudMediaUrl && cloudMediaUrl.includes('_v1'));

    const syncErrB3 = await run(pageB, async (key) => {
      try { await syncDeck(key); return null; } catch (e) { return e.message; }
    }, DECK_ID);
    await waitActiveSyncJobDone(pageB, DECK_ID, 60000);
    await wait(pageB, 3000);
    pass('PHASE 3: B syncDeck 无异常', syncErrB3 === null);

    const bMediaCheck = await run(pageB, (key) => {
      const cards = DECKS[key] || [];
      if (!cards.length) return { hasUrl: false, blobLoaded: false };
      const c = cards[0];
      return {
        hasUrl: !!(c.media?.img?.url),
        blobLoaded: !!(c.media?.img?._blob),
      };
    }, DECK_ID);
    pass('PHASE 3: B 卡片 media.img.url 与云端一致', bMediaCheck.hasUrl === true);
    pass('PHASE 3: B media.img._blob 有值（mediaLoaded）', bMediaCheck.blobLoaded === true);

    // ════ PHASE 4: A 删除卡片 → A 同步 → B 同步 ════
    section('PHASE 4: 删除卡片跨设备');

    const deleteErr = await run(pageA, async (key) => {
      try {
        const cards = DECKS[key] || [];
        if (cards.length < 2) return 'not enough cards';
        const toDelete = cards[1];
        markCardDeleted(key, toDelete.id);
        DECKS[key] = cards.filter(c => c.id !== toDelete.id);
        const meta = DECKS_META.find(m => m.key === key);
        if (meta) { meta.mod = nextMod(); }
        saveDeckIndex();
        saveDeckCards(key, DECKS[key]);
        await syncDeck(key);
        return null;
      } catch (e) { return e.message; }
    }, DECK_ID);
    await waitActiveSyncJobDone(pageA, DECK_ID, 60000);
    pass('PHASE 4: A 删除卡片并 syncDeck 成功', deleteErr === null);

    const localLenA = await run(pageA, (key) => (DECKS[key] || []).length, DECK_ID);
    pass('PHASE 4: A 本地剩余 1 张卡', localLenA === 1);

    const cloudCountP4 = await run(pageA, async (key) => {
      try {
        const { data } = await _sb.from('deck_cards').select('card_id').eq('deck_id', key);
        return data ? data.length : -1;
      } catch (e) { return -1; }
    }, DECK_ID);
    pass('PHASE 4: 云端 deck_cards 剩余 1 行', cloudCountP4 === 1);

    const syncErrB4 = await run(pageB, async (key) => {
      try { await syncDeck(key); return null; } catch (e) { return e.message; }
    }, DECK_ID);
    await waitActiveSyncJobDone(pageB, DECK_ID, 60000);
    await wait(pageB, 2000);
    pass('PHASE 4: B syncDeck 无异常', syncErrB4 === null);

    const localLenB4 = await run(pageB, (key) => (DECKS[key] || []).length, DECK_ID);
    pass('PHASE 4: B 同步后本地剩 1 张卡', localLenB4 === 1);
    pass('PHASE 4: B 本地 sc1 保留', await run(pageB, (key) => (DECKS[key] || []).some(c => c.id === 'sc1'), DECK_ID));
    pass('PHASE 4: B 本地 sc2 已移除', !(await run(pageB, (key) => (DECKS[key] || []).some(c => c.id === 'sc2'), DECK_ID)));

    // ════ PHASE 5: 清理 ════
    section('PHASE 5: 清理云端测试数据');
    const cleanErr5 = await run(pageA, async (key) => {
      try {
        await _sb.from('deck_cards').delete().eq('deck_id', key);
        await _sb.from('decks').delete().eq('id', key);
        return null;
      } catch (e) { return e.message; }
    }, DECK_ID);
    pass('PHASE 5: 云端清理完成', cleanErr5 === null);

  } catch (e) {
    console.error(`\n  [ERROR] ${e.message}`);
    console.error(e.stack);
  } finally {
    const counts = getCounts();
    console.log('\n' + '═'.repeat(60));
    console.log('  结果');
    console.log('═'.repeat(60));
    console.log(`  通过: ${counts.passed}  失败: ${counts.failed}`);
    if (counts.errors && counts.errors.length) {
      console.log('\n  失败项:');
      counts.errors.forEach(e => console.log('  ' + e));
    }
    await helper.stopAndCollectFromBrowser(browser, '_pw_sync_scenarios');
    await browser.close();
    process.exit(counts.failed > 0 ? 1 : 0);
  }
})();
