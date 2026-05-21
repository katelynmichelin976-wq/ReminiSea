/**
 * è¯Šæ–­ï¼šå¯¹æ¯” IndexedDB vs Supabase çš„ CardState æ•°é‡
 *
 * ç”¨æ³•ï¼š
 *   node tests/_diag_sync_state.js
 */
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://juzkonrzfyvchqxzmlpr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD';
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '667788';
const CLOUD_DECK_KEY = 'cloud_01edbdfd';
const URL = 'http://localhost:8080/yihai_v4.10.html?v=' + Date.now();

(async () => {
  // 1. Supabaseï¼šæŸ¥äº‘ç«¯æœ‰å‡ æ¡
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  const { data: cloudStates } = await sb.from('sync_card_states')
    .select('*')
    .eq('deck_key', CLOUD_DECK_KEY);
  console.log(`\nã€äº‘ç«¯ã€‘sync_card_states (${CLOUD_DECK_KEY}): ${cloudStates.length} æ¡`);
  let due = 0, newC = 0;
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  cloudStates.forEach(s => {
    if (s.suspended) return;
    if (s.srs_stage === 'new') newC++;
    else if (s.srs_stage === 'review' && (!s.due_date || s.due_date <= today)) due++;
    else if ((s.srs_stage === 'learning' || s.srs_stage === 'relearning') && (!s.due_ts || s.due_ts <= now)) due++;
  });
  console.log(`  åˆ°æœŸ(äº‘ç«¯): ${due}, æ–°å¡(äº‘ç«¯): ${newC}`);
  await sb.auth.signOut();

  // 2. æµè§ˆå™¨ï¼šæŸ¥ IndexedDB æœ‰å‡ æ¡
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', msg => { if (msg.type() === 'error') console.log(`  [console.error] ${msg.text()}`); });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // æ¸…ç©º IndexedDB æ¨¡æ‹Ÿå…¨æ–°ç™»å½•
  await page.evaluate(() => {
    localStorage.clear();
    const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
    return dbs.then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)));
  });
  await page.waitForTimeout(500);

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // ç™»å½•
  const helper = require('./_playwright_helper');
  await helper.cloudLogin(page, TEST_EMAIL, TEST_PASSWORD);
  await helper.closeSettings(page);
  await helper.waitSyncModal(page, 60);
  console.log('\nã€æµè§ˆå™¨ã€‘ç™»å½•åŒæ­¥å®Œæˆ');

  // ç­‰ä¸»é¡µåˆ·æ–°
  await page.waitForTimeout(2000);

  // æŸ¥ IndexedDB
  const idbInfo = await page.evaluate((key) => {
    return new Promise((resolve) => {
      const r = indexedDB.open('yihai_srs', 6);
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction('card_states', 'readonly');
        const req = tx.objectStore('card_states').getAll();
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

  console.log(`  IndexedDB æ€»æ¡æ•°: ${idbInfo.totalInDb}`);
  console.log(`  ${CLOUD_DECK_KEY} æ¡æ•°: ${idbInfo.deckStates}`);
  console.log(`  åˆ°æœŸæ•°(æµè§ˆå™¨è®¡ç®—): ${idbInfo.dueCount}`);
  console.log(`  user_id: ${idbInfo.userId}`);
  console.log(`  æ‰€æœ‰ user_id: ${idbInfo.allUserIds}`);
  console.log(`  é˜¶æ®µåˆ†å¸ƒ: ${idbInfo.stages}`);

  // æŸ¥ localStorage ä¸Šé™
  const lsInfo = await page.evaluate(() => {
    return {
      newCardsPerDay: localStorage.getItem('srs_new_cards_per_day') || '5(é»˜è®¤)',
      maxReviews: localStorage.getItem('srs_maximum_reviews_per_day') || '50(é»˜è®¤)',
      dailyProgress: localStorage.getItem('yihai_daily_progress') || '{}',
    };
  });
  console.log(`\n  SRS ä¸Šé™: new=${lsInfo.newCardsPerDay}, max_review=${lsInfo.maxReviews}`);
  console.log(`  æ¯æ—¥è¿›åº¦: ${lsInfo.dailyProgress}`);

  // æŸ¥ä¸»é¡µå®žé™…æ˜¾ç¤º
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
  console.log(`  ä¸»é¡µæ˜¾ç¤º: åˆ°æœŸ=${displayInfo.displayedDue}, æ–°å¡=${displayInfo.displayedNew}`);

  await page.close();
  await browser.close();

  // ç»“è®º
  console.log('\nâ•â•â•â•â•â•â•â•â•â•â• è¯Šæ–­ç»“è®º â•â•â•â•â•â•â•â•â•â•â•');
  if (idbInfo.deckStates < cloudStates.length) {
    console.log(`  âŒ IndexedDB(${idbInfo.deckStates}) < äº‘ç«¯(${cloudStates.length})ï¼ŒåŒæ­¥ä¸å®Œæ•´`);
  } else {
    console.log(`  âœ… IndexedDB(${idbInfo.deckStates}) == äº‘ç«¯(${cloudStates.length})ï¼ŒåŒæ­¥å®Œæ•´`);
  }
  console.log(`  åˆ°æœŸ: æµè§ˆå™¨=${idbInfo.dueCount}, äº‘ç«¯=${due}`);
  process.exit(0);
})();

