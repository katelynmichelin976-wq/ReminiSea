/**
 * 诊断：对比 IndexedDB vs Supabase 的 CardState 数量
 *
 * 用法：
 *   node tests/_diag_sync_state.js
 */
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://juzkonrzfyvchqxzmlpr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD';
const TEST_EMAIL = 'zyhaff@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '667788';
const CLOUD_DECK_KEY = 'cloud_01edbdfd';
const URL = 'http://localhost:8080/yihai_v4.10.html?v=' + Date.now();

(async () => {
  // 1. Supabase：查云端有几条
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  const { data: cloudStates } = await sb.from('sync_card_states')
    .select('*')
    .eq('deck_key', CLOUD_DECK_KEY);
  console.log(`\n【云端】sync_card_states (${CLOUD_DECK_KEY}): ${cloudStates.length} 条`);
  let due = 0, newC = 0;
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  cloudStates.forEach(s => {
    if (s.suspended) return;
    if (s.srs_stage === 'new') newC++;
    else if (s.srs_stage === 'review' && (!s.due_date || s.due_date <= today)) due++;
    else if ((s.srs_stage === 'learning' || s.srs_stage === 'relearning') && (!s.due_ts || s.due_ts <= now)) due++;
  });
  console.log(`  到期(云端): ${due}, 新卡(云端): ${newC}`);
  await sb.auth.signOut();

  // 2. 浏览器：查 IndexedDB 有几条
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', msg => { if (msg.type() === 'error') console.log(`  [console.error] ${msg.text()}`); });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 清空 IndexedDB 模拟全新登录
  await page.evaluate(() => {
    localStorage.clear();
    const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
    return dbs.then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)));
  });
  await page.waitForTimeout(500);

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 登录
  const helper = require('./_playwright_helper');
  await helper.cloudLogin(page, TEST_EMAIL, TEST_PASSWORD);
  await helper.closeSettings(page);
  await helper.waitSyncModal(page, 60);
  console.log('\n【浏览器】登录同步完成');

  // 等主页刷新
  await page.waitForTimeout(2000);

  // 查 IndexedDB
  const idbInfo = await page.evaluate((key) => {
    return new Promise((resolve) => {
      const r = indexedDB.open('yihai_srs', 6);
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction('sync_card_states', 'readonly');
        const req = tx.objectStore('sync_card_states').getAll();
        req.onsuccess = () => {
          const all = req.target.result;
          const deck = all.filter(s => s.deck_key === key);
          const uid = _cloudUserId || 'N/A';
          db.close();
          resolve({
            totalInDb: all.length,
            deckStates: deck.length,
            userId: uid.substring(0, 12),
            allUserIds: [...new Set(all.map(s => s.user_id || 'undefined'))].join(', '),
            stages: [...new Set(deck.map(s => s.srs_stage))].join(', '),
            dueCount: deck.filter(s => {
              if (s.suspended) return false;
              const today = new Date().toISOString().slice(0, 10);
              if (s.srs_stage === 'review' && (!s.due_date || s.due_date <= today)) return true;
              if ((s.srs_stage === 'learning' || s.srs_stage === 'relearning') && (!s.due_ts || s.due_ts <= Date.now())) return true;
              return false;
            }).length,
          });
        };
      };
      r.onerror = () => resolve({ error: 'cannot open db' });
    });
  }, CLOUD_DECK_KEY);

  console.log(`  IndexedDB 总条数: ${idbInfo.totalInDb}`);
  console.log(`  ${CLOUD_DECK_KEY} 条数: ${idbInfo.deckStates}`);
  console.log(`  到期数(浏览器计算): ${idbInfo.dueCount}`);
  console.log(`  user_id: ${idbInfo.userId}`);
  console.log(`  所有 user_id: ${idbInfo.allUserIds}`);
  console.log(`  阶段分布: ${idbInfo.stages}`);

  // 查 localStorage 上限
  const lsInfo = await page.evaluate(() => {
    return {
      newCardsPerDay: localStorage.getItem('srs_new_cards_per_day') || '5(默认)',
      maxReviews: localStorage.getItem('srs_maximum_reviews_per_day') || '50(默认)',
      dailyProgress: localStorage.getItem('yihai_daily_progress') || '{}',
    };
  });
  console.log(`\n  SRS 上限: new=${lsInfo.newCardsPerDay}, max_review=${lsInfo.maxReviews}`);
  console.log(`  每日进度: ${lsInfo.dailyProgress}`);

  // 查主页实际显示
  const displayInfo = await page.evaluate((key) => {
    const card = document.querySelector(`.deck-card[data-deck="${key}"]`);
    if (!card) return { error: 'deck card not found' };
    const dueEl = card.querySelector('.deck-stat-num.due');
    const newEl = card.querySelector('.deck-stat-num.new-c');
    return {
      displayedDue: dueEl ? dueEl.textContent : 'N/A',
      displayedNew: newEl ? newEl.textContent : 'N/A',
    };
  }, CLOUD_DECK_KEY);
  console.log(`  主页显示: 到期=${displayInfo.displayedDue}, 新卡=${displayInfo.displayedNew}`);

  await page.close();
  await browser.close();

  // 结论
  console.log('\n═══════════ 诊断结论 ═══════════');
  if (idbInfo.deckStates < cloudStates.length) {
    console.log(`  ❌ IndexedDB(${idbInfo.deckStates}) < 云端(${cloudStates.length})，同步不完整`);
  } else {
    console.log(`  ✅ IndexedDB(${idbInfo.deckStates}) == 云端(${cloudStates.length})，同步完整`);
  }
  console.log(`  到期: 浏览器=${idbInfo.dueCount}, 云端=${due}`);
  process.exit(0);
})();
