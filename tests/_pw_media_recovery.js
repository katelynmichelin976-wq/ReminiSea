/**
 * 忆海拾光 媒体 upsert 失败恢复测试 — P1 #1
 * 依赖：python -m http.server 8080 --directory C:\code
 *        $env:TEST_PASSWORD="667788"
 * 运行：$env:TEST_PASSWORD="667788"; node tests/_pw_media_recovery.js
 *
 * 覆盖：① stub upsertCardsMediaBatch 让 media upsert 失败一次
 *       ② 验证 s.url 被回滚为空 + SyncJob 进 error
 *       ③ 解 stub 重跑同步，验证 url 重新写入 + DB row 有 media
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhaff@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const DECK_KEY = '__media_recovery_test__';

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  [PAGE ERROR] ${e.message}`));

  try {
    section('PHASE 0: 登录 + 清理');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);
    await run(page, async () => {
      localStorage.clear();
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) indexedDB.deleteDatabase(db.name);
      } catch (e) { /* ignore */ }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await wait(page, 2000);
    const loginOk = await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD);
    pass('登录成功', loginOk);
    if (!loginOk) throw new Error('登录失败，终止测试');

    await run(page, async (key) => {
      try { await _sb.from('deck_cards').delete().eq('deck_id', key); } catch (e) {}
      try { await _sb.from('decks').delete().eq('id', key); } catch (e) {}
    }, DECK_KEY);

    section('PHASE 1: 造一张带图卡 + stub upsert 失败');
    await run(page, async (key) => {
      const card = {
        id: 'tc1', name: 'Test', nameLang: 'zh-CN',
        img: '', audioUrl: '', mod: Date.now(),
        media: { img: { url: '', v: 0, _blob: 'blob:test' } },
        cardType: 'choice', ext: {},
      };
      DECKS[key] = [card];
      DECKS_META.push({ key, name: 'P1#1 测试', deck_type: 'personal', mod: Date.now() });
      saveDeckIndex();
      saveDeckCards(key, [card]);

      // 真实 Blob（4 字节 JPEG magic），让 loadMedia 能返回非空
      const blob = new Blob([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])], { type: 'image/jpeg' });
      await saveMedia(`${key}_tc1_img`, blob);
      card.media.img._blob = URL.createObjectURL(blob);

      // 先让 decks / deck_cards 行存在，否则 FK 写不进
      await upsertDeckRow(key);
      await upsertCardsBatch(key, [card]);

      // stub: 让 upsertCardsMediaBatch 返回全失败
      window.__PW_ORIG_UPSERT = upsertCardsMediaBatch;
      window.upsertCardsMediaBatch = async function (deckKey, cards) {
        return { failed: cards.map(c => ({ card: c, err: 'PW stubbed media upsert fail' })) };
      };
    }, DECK_KEY);

    section('PHASE 2: 触发同步 → 期望 SyncJob 抛错 + s.url 回滚');
    const syncResult1 = await run(page, async (key) => {
      try { await syncDeck(key); return { ok: true }; }
      catch (e) { return { ok: false, err: e.message }; }
    }, DECK_KEY);
    pass('同步应抛 upsert fail 错', !syncResult1.ok && /upsert fail/i.test(syncResult1.err));

    const localState1 = await run(page, (key) => {
      const card = DECKS[key] && DECKS[key][0];
      if (!card) return { url: 'NO_CARD', hasBlob: false };
      return { url: card.media.img.url, hasBlob: !!card.media.img._blob };
    }, DECK_KEY);
    pass('s.url 应被 rollback 为空', localState1.url === '');
    pass('_blob 不应丢', localState1.hasBlob);

    section('PHASE 3: 解 stub + 重跑同步 → 期望成功 + DB 有 media');
    await run(page, () => {
      window.upsertCardsMediaBatch = window.__PW_ORIG_UPSERT;
    });
    const syncResult2 = await run(page, async (key) => {
      try { await syncDeck(key); return { ok: true }; }
      catch (e) { return { ok: false, err: e.message }; }
    }, DECK_KEY);
    pass(`重试同步应成功（实际：${JSON.stringify(syncResult2)}）`, syncResult2.ok);

    const localState2 = await run(page, (key) => {
      const card = DECKS[key] && DECKS[key][0];
      return card ? card.media.img.url : '';
    }, DECK_KEY);
    pass(`重试后 s.url 应非空（实际：${localState2}）`, localState2 !== '');

    const dbState = await run(page, async (key) => {
      const { data } = await _sb.from('deck_cards')
        .select('media').eq('deck_id', key).eq('card_id', 'tc1').maybeSingle();
      return data && data.media && data.media.img ? data.media.img.url : null;
    }, DECK_KEY);
    pass(`DB row 应有 media.img.url（实际：${dbState}）`, !!dbState);

    section('PHASE 4: cleanup');
    await run(page, async (key) => {
      try { await _sb.from('deck_cards').delete().eq('deck_id', key); } catch (e) {}
      try { await _sb.from('decks').delete().eq('id', key); } catch (e) {}
    }, DECK_KEY);

    const counts = getCounts();
    console.log(`\n通过: ${counts.passed} 失败: ${counts.failed}`);
    process.exit(counts.failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('FATAL:', e);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
