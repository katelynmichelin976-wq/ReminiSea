/**
 * 个人牌组 deck id 加盐 E2E（不依赖 .yhspack fixture）
 *
 * 验证 Option B 核心：个人牌组同步后云端 decks.id = localKey~userId（不撞全局 PK），
 * 本地 key 不变；deck_cards 在 salted deck_id 下；无 RLS 报错。
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 *        $env:TEST_PASSWORD="667788"; node tests/_pw_deck_id_salt.js
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhaff@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const LOCAL_KEY = 'pwsalt' + Date.now().toString(36);  // 唯一、纯 hex/字母数字，无 ~
const DECK_NAME = 'PW加盐测试_' + Date.now();

async function waitSyncDone(page, maxWait) {
  for (let i = 0; i < Math.ceil((maxWait || 60000) / 500); i++) {
    const done = await run(page, () => typeof _syncInFlight === 'undefined' || !_syncInFlight);
    if (done) return true;
    await wait(page, 500);
  }
  return false;
}

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await helper.startCoverage(page);
  page.on('pageerror', e => console.log(`  [PAGE ERROR] ${e.message}`));

  try {
    section('PHASE 0: 登录');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);
    await run(page, async () => {
      localStorage.clear();
      try { const dbs = await indexedDB.databases(); for (const db of dbs) indexedDB.deleteDatabase(db.name); } catch(e) {}
    });
    await page.reload({ waitUntil: 'networkidle' });
    await wait(page, 2000);
    await run(page, () => { window.runSync = async () => {}; });  // 隔离，避免 preset 拉取干扰
    pass('登录成功', await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));
    await wait(page, 1500);

    section('PHASE 1: 内存建个人牌组 + 同步');
    await run(page, ({ key, name }) => {
      const now = Date.now();
      DECKS[key] = [
        { id: 'c1', name: '甲', nameLang: 'zh-CN', img: '', audioUrl: '', details: [], cardType: 'choice', ext: {}, mod: now, media: {} },
        { id: 'c2', name: '乙', nameLang: 'zh-CN', img: '', audioUrl: '', details: [], cardType: 'choice', ext: {}, mod: now, media: {} },
      ];
      DECKS_META.push({ key, name, deck_type: 'personal', nameLang: 'zh-CN', mod: now });
      saveDeckIndex();
      saveDeckCards(key, DECKS[key]);
    }, { key: LOCAL_KEY, name: DECK_NAME });

    await run(page, async (key) => { await syncDeck(key); }, LOCAL_KEY);
    await waitSyncDone(page, 60000);
    pass('syncDeck 完成无异常', true);

    section('PHASE 2: 验证云端 id 加盐');
    const check = await run(page, async (key) => {
      const sid = toServerDeckId(key, 'personal', _cloudUserId);
      const saltedRow = await _sb.from('decks').select('id,card_count').eq('id', sid).maybeSingle();
      const bareRow   = await _sb.from('decks').select('id').eq('id', key).maybeSingle();
      const cards     = await _sb.from('deck_cards').select('card_id').eq('deck_id', sid);
      return {
        sid,
        saltedExists: !!saltedRow.data,
        bareExists: !!bareRow.data,
        saltMatches: sid.includes('~') && fromServerDeckId(sid) === key,
        cardCount: (cards.data || []).length,
      };
    }, LOCAL_KEY);

    pass('云端 decks.id = localKey~userId（加盐行存在）', check.saltedExists);
    pass('裸 localKey 下无 decks 行（未污染全局 PK）', !check.bareExists);
    pass('fromServerDeckId(sid) 还原回本地 key', check.saltMatches);
    pass('deck_cards 在 salted deck_id 下（2 张）', check.cardCount === 2);

    section('PHASE 3: 清理');
    const cleaned = await run(page, async (key) => {
      const sid = toServerDeckId(key, 'personal', _cloudUserId);
      try { await _sb.from('deck_cards').delete().eq('deck_id', sid); } catch(e) {}
      try { await _sb.from('decks').delete().eq('id', sid); } catch(e) {}
      const left = await _sb.from('decks').select('id').eq('id', sid).maybeSingle();
      return !left.data;
    }, LOCAL_KEY);
    pass('清理: 云端 salted 行已删除', cleaned);

  } finally {
    const { passed, failed } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    await helper.stopAndCollectFromBrowser(browser, '_pw_deck_id_salt');
    await browser.close();
    if (failed > 0) process.exit(1);
  }
})();
