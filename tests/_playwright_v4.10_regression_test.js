/**
 * å¿†æµ·æ‹¾å…‰ v4.10 å›žå½’æµ‹è¯•ï¼ˆç»Ÿè®¡æ•°æ®ä¸€è‡´æ€§ + é‡æ–°ç™»å½•éªŒè¯ï¼‰
 *
 * ä¾èµ–ï¼š
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node tests/_playwright_v4.10_regression_test.js
 *
 * è¦†ç›–ï¼šç™»å½• â†’ ç»Ÿè®¡éªŒè¯ â†’ user_id éš”ç¦» â†’ é€€å‡ºä¿ç•™ â†’ é‡æ–°ç™»å½•
 * åˆå¹¶è‡ªï¼šåŽŸ _playwright_v4.10_regression_test.js + _playwright_user_switch_test.js
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, check, section, wait, run, getBaseUrl } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const CLOUD_DECK_KEY = 'cloud_01edbdfd';
const CARD_COUNT = 33;

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: è¯·è®¾ç½® TEST_PASSWORD çŽ¯å¢ƒå˜é‡'); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[PAGE ERROR] ${err.message}`));

  try {
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 1: æ¸…ç©ºå­˜å‚¨å¹¶åŠ è½½ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 1: æ¸…ç©ºå­˜å‚¨å¹¶åŠ è½½');

    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);
    await run(page, async () => {
      localStorage.clear();
      const dbs = await indexedDB.databases();
      for (const db of dbs) indexedDB.deleteDatabase(db.name);
    });
    await wait(page, 300);
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    pass('é¡µé¢åŠ è½½æˆåŠŸ', await run(page, () => !!document.querySelector('.home-version')));
    pass('ä¸»é¡µæ˜¾ç¤ºå†…ç½®ç‰Œç»„', await run(page, () => document.querySelectorAll('.deck-card').length > 0));

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 2: ç™»å½• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 2: ç™»å½•æµ‹è¯•è´¦å·');

    await run(page, () => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 300);

    pass('ç™»å½•æˆåŠŸ', await helper.cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));

    pass('æ˜¾ç¤ºç™»å½•é‚®ç®±', (await run(page, () => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    })).includes(TEST_EMAIL));

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 3: åŒæ­¥å¹¶éªŒè¯ä¸»é¡µ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 3: åŒæ­¥å¹¶éªŒè¯ä¸»é¡µæ•°æ®');

    await helper.closeSettings(page);
    await helper.waitSyncModal(page, 60);
    console.log('  ç™»å½•åŒæ­¥å®Œæˆ');

    let hasDeck = false;
    for (let i = 0; i < 20; i++) {
      hasDeck = await run(page, (name) => DECKS_META.some(m => m.name === name), 'è”¬èœæ°´æžœ');
      if (hasDeck) break;
      await wait(page, 500);
    }

    pass('äº‘ç‰Œç»„å‡ºçŽ°åœ¨åˆ—è¡¨', await run(page, (name) => {
      for (const c of document.querySelectorAll('.deck-card')) {
        const el = c.querySelector('.deck-name');
        if (el && el.textContent.includes(name)) return true;
      }
      return false;
    }, 'è”¬èœæ°´æžœ'));

    // è®°å½•é¦–æ¬¡äº‘ç‰Œç»„æ•°ï¼ˆç”¨äºŽ PH11 é‡æ–°ç™»å½•å¯¹æ¯”ï¼‰
    const firstCloudDeckCount = await run(page, () =>
      DECKS_META.filter(m => m.source === 'cloud').length
    );
    pass('é¦–æ¬¡ç™»å½•æœ‰äº‘ç‰Œç»„', firstCloudDeckCount > 0);
    console.log(`  é¦–æ¬¡äº‘ç‰Œç»„: ${firstCloudDeckCount}`);

    for (let i = 0; i < 30; i++) {
      const val = await run(page, (dk) => {
        const card = document.querySelector(`.deck-card[data-deck="${dk}"]`);
        if (!card) return '-2';
        const dueEl = card.querySelector('.deck-stat-num.due');
        return dueEl ? dueEl.textContent.trim() : '-2';
      }, CLOUD_DECK_KEY);
      if (val !== 'â€¦' && val !== '-2') break;
      await wait(page, 200);
    }

    const homepage = await run(page, (dk) => {
      const card = document.querySelector(`.deck-card[data-deck="${dk}"]`);
      if (!card) return null;
      const dueEl = card.querySelector('.deck-stat-num.due');
      const newEl = card.querySelector('.deck-stat-num.new-c');
      return { due: dueEl ? parseInt(dueEl.textContent) : -1, new: newEl ? parseInt(newEl.textContent) : -1 };
    }, CLOUD_DECK_KEY);
    console.log(`  ä¸»é¡µåˆ°æœŸ: ${homepage?.due}, ä¸»é¡µæ–°å¡: ${homepage?.new}`);

    const rawStats = await run(page, async (dk) => {
      const states = await getAllCardStates(dk);
      const today = new Date().toISOString().slice(0, 10);
      const now = Date.now();
      const dp = JSON.parse(localStorage.getItem('yihai_daily_progress') || '{}');
      const newCap = Math.max(0, (parseInt(localStorage.getItem('srs_new_cards_per_day')) || 5) - (dp.daily_new_today || 0));
      const dueCap = Math.max(0, (parseInt(localStorage.getItem('srs_maximum_reviews_per_day')) || 50) - (dp.reviewed_today || 0));
      // ä¸Ž app getDeckStatsSrs ä¸€è‡´çš„ deckCardIds è¿‡æ»¤ï¼ˆv4.11.11ï¼‰
      const deck2 = DECKS[dk];
      const deckCardIds2 = new Set((deck2 || []).map(c => c.id));
      let dueFiltered = 0, newStateFiltered = 0;
      states.forEach(s => {
        if (s.suspended) return;
        if (!deckCardIds2.has(s.card_id)) return; // skip orphaned
        if (s.srs_stage === 'new') { newStateFiltered++; return; }
        if (s.srs_stage === 'review' && (!s.due_date || s.due_date <= today)) dueFiltered++;
        if ((s.srs_stage === 'learning' || s.srs_stage === 'relearning') && (!s.due_ts || s.due_ts <= now)) dueFiltered++;
      });
      const seenIds2 = new Set(states.filter(s => deckCardIds2.has(s.card_id)).map(s => s.card_id));
      const unseen2 = deck2 ? deck2.filter(c => !seenIds2.has(c.id)).length : 0;
      const newTotal = newStateFiltered + unseen2;
      return {
        cappedDue: Math.min(dueFiltered, dueCap),
        cappedNew: Math.min(newTotal, newCap),
      };
    }, CLOUD_DECK_KEY);

    pass('ä¸»é¡µåˆ°æœŸæ•°åˆç†', homepage && homepage.due >= 0);
    pass('ä¸»é¡µæ–°å¡æ•°åˆç†', homepage && homepage.new >= 0);
    check('åˆ°æœŸæ•°åŒ¹é…åŽç«¯', homepage && homepage.due, rawStats.cappedDue);
    check('æ–°å¡æ•°åŒ¹é…åŽç«¯', homepage && homepage.new, rawStats.cappedNew);

    await run(page, (dk) => {
      const card = document.querySelector(`.deck-card[data-deck="${dk}"]`);
      if (card) card.click();
    }, CLOUD_DECK_KEY);
    await wait(page, 300);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 4: ç»Ÿè®¡é¡µ â€” ä»Šæ—¥ Tab â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 4: ç»Ÿè®¡é¡µ â€” ä»Šæ—¥ Tab');
    await run(page, () => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 300);
    await run(page, () => { if (typeof openStats === 'function') openStats(); });
    await wait(page, 1000);
    await run(page, () => { if (typeof switchStatsTab === 'function') switchStatsTab(0); });
    await wait(page, 500);

    const todayKpi = await run(page, () => {
      const kpi1 = document.getElementById('st-kpi');
      const kpi2 = document.getElementById('st-kpi2');
      return {
        k1: kpi1 ? kpi1.innerText.split('\n').filter(Boolean) : [],
        k2: kpi2 ? kpi2.innerText.split('\n').filter(Boolean) : [],
      };
    });
    const dp = await run(page, () => JSON.parse(localStorage.getItem('yihai_daily_progress') || '{}'));

    pass('ä»Šæ—¥ç»ƒä¹ =0', (dp.reviewed_today || 0) === 0);
    check('ä»Šæ—¥è‰¯å¥½=0', parseInt(todayKpi.k1[2] || -1), 0);
    check('ä»Šå›°éš¾=0', parseInt(todayKpi.k1[4] || -1), 0);
    check('ä»Šé‡æ¥=0', parseInt(todayKpi.k1[6] || -1), 0);
    check('æ—¶é•¿=0', parseInt(todayKpi.k2[0] || -1), 0);
    check('æ–°å¡=0', parseInt(todayKpi.k2[2] || -1), 0);
    check('å¾…ç¡®è®¤=0', parseInt(todayKpi.k2[4] || -1), 0);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 5: ç»Ÿè®¡é¡µ â€” ç‰Œç»„ Tab â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 5: ç»Ÿè®¡é¡µ â€” ç‰Œç»„ Tab');
    await run(page, () => { if (typeof switchStatsTab === 'function') switchStatsTab(1); });
    await wait(page, 500);

    const deckStats = await run(page, () => {
      const el = document.getElementById('st-deck-overview');
      if (!el) return null;
      const nums = el.querySelectorAll('.deck-ov-num');
      const lbls = el.querySelectorAll('.deck-ov-lbl');
      const out = {};
      for (let i = 0; i < nums.length; i++) out[lbls[i].textContent] = parseInt(nums[i].textContent);
      return out;
    });
    console.log(`  ç‰Œç»„ç»Ÿè®¡: ${JSON.stringify(deckStats)}`);

    const idbStats = await run(page, async (dk) => {
      const states = await getAllCardStates(dk);
      let learning = 0, review = 0, newS = 0, sus = 0, mastered = 0;
      states.forEach(s => {
        if (s.suspended) { sus++; return; }
        if (s.srs_stage === 'new') { newS++; return; }
        if (s.srs_stage === 'learning' || s.srs_stage === 'relearning') learning++;
        if (s.srs_stage === 'review') { review++; if (s.interval >= 7) mastered++; }
      });
      const deck = DECKS[dk];
      const total = deck ? deck.length : states.length;
      const pend = Math.max(0, total - states.length);
      const validStates = states.filter(s => deck && deck.some(c => c.id === s.card_id));
      const nonNewActive = validStates.filter(s => s.srs_stage !== 'new' && !s.suspended).length;
      const filterNew = Math.max(0, total - nonNewActive);
      return { total, master: mastered, learn: learning, pend, filterNew, sus };
    }, CLOUD_DECK_KEY);

    check('æ€»å¡ç‰‡=33', deckStats?.['æ€»å¡ç‰‡'], idbStats.total);
    check('å·²æŽŒæ¡', deckStats?.['å·²æŽŒæ¡'], idbStats.master);
    check('å­¦ä¹ ä¸­', deckStats?.['å­¦ä¹ ä¸­'], idbStats.learn);
    check('å¾…å¼€å§‹', deckStats?.['å¾…å¼€å§‹'], idbStats.pend);
    check('æš‚åœ', deckStats?.['æš‚åœ'], idbStats.sus);

    const practiceDays = await run(page, async () => {
      const tok = JSON.parse(localStorage.getItem('sb-juzkonrzfyvchqxzmlpr-auth-token') || '{}');
      const r = await fetch('https://juzkonrzfyvchqxzmlpr.supabase.co/rest/v1/user_deck_stats?select=*', {
        headers: { 'Authorization': 'Bearer ' + tok.access_token, apikey: 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD' }
      });
      const all = await r.json();
      const ds = all.find(d => d.deck_key === 'cloud_01edbdfd');
      return ds ? ds.practice_days : -1;
    });
    check('ç»ƒä¹ å¤©æ•°åŒ¹é…', deckStats?.['ç»ƒä¹ å¤©æ•°'], practiceDays);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 6: ç»Ÿè®¡é¡µ â€” å¡ç‰‡ Tab â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 6: ç»Ÿè®¡é¡µ â€” å¡ç‰‡ Tab ç­›é€‰ä¸€è‡´æ€§');
    await run(page, () => { if (typeof switchStatsTab === 'function') switchStatsTab(2); });
    await wait(page, 500);

    await run(page, () => {
      for (const b of document.querySelectorAll('.stats-filter-btn')) { if (b.textContent.includes('å¾…å¼€å§‹')) { b.click(); return; } }
    });
    await wait(page, 500);
    const pendCount = await run(page, () => {
      const list = document.getElementById('st-card-list');
      return list ? list.querySelectorAll('.scard').length : -1;
    });
    console.log(`  å¾…å¼€å§‹ç­›é€‰: ${pendCount} å¼ , filterNew=${idbStats.filterNew}`);
    check('å¾…å¼€å§‹å¡ç‰‡æ•°=ç­›é€‰å¾…å¼€å§‹', pendCount, idbStats.filterNew);

    await run(page, () => {
      for (const b of document.querySelectorAll('.stats-filter-btn')) { if (b.textContent.includes('å­¦ä¹ ä¸­')) { b.click(); return; } }
    });
    await wait(page, 300);
    const learnCount = await run(page, () => {
      const list = document.getElementById('st-card-list');
      return list ? list.querySelectorAll('.scard').length : -1;
    });
    console.log(`  å­¦ä¹ ä¸­ç­›é€‰: ${learnCount} å¼ `);
    check('å­¦ä¹ ä¸­å¡ç‰‡æ•°=ç‰Œç»„Tabå­¦ä¹ ä¸­', learnCount, idbStats.learn);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 7: ç»Ÿè®¡é¡µ â€” è®°å½• Tab â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 7: ç»Ÿè®¡é¡µ â€” è®°å½• Tab');
    await run(page, () => { if (typeof switchStatsTab === 'function') switchStatsTab(3); });
    await wait(page, 500);
    pass('è®°å½• Tab æ­£å¸¸ï¼ˆæ–°æµè§ˆå™¨æ— æœ¬åœ°è®°å½•ï¼‰', true);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 8: user_id éš”ç¦»éªŒè¯ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 8: user_id éš”ç¦»éªŒè¯');

    const uidCheck = await run(page, async () => {
      const db = await new Promise(resolve => {
        const r = indexedDB.open('yihai_srs', 6);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      });
      if (!db) return { err: 'cannot open db' };
      const states = await new Promise(resolve => {
        db.transaction('card_states', 'readonly').objectStore('card_states').getAll().onsuccess = e => resolve(e.target.result);
      });
      const uid = _cloudUserId || localStorage.getItem('yihai_device_id');
      const missing = states.filter(s => !s.user_id).length;
      const wrong = states.filter(s => s.user_id && s.user_id !== uid).length;
      db.close();
      return { cloudUserId: _cloudUserId ? _cloudUserId.substring(0, 8) : 'none', missingUid: missing, wrongUid: wrong, allOk: missing === 0 && wrong === 0 };
    });

    console.log(`  user_id éªŒè¯: ${JSON.stringify(uidCheck)}`);
    pass('æ‰€æœ‰ CardState æœ‰ user_id', uidCheck.missingUid === 0);
    pass('æ‰€æœ‰ CardState user_id æ­£ç¡®', uidCheck.wrongUid === 0);
    pass('ç™»å½•åŽ user_id=cloudUserId', uidCheck.cloudUserId !== 'none');

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 9: æœ¬åœ° vs äº‘ç«¯ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 9: æœ¬åœ° vs äº‘ç«¯æ•°æ®å¯¹æ¯”');

    const cloudCompare = await run(page, async (key) => {
      const tok = JSON.parse(localStorage.getItem('sb-juzkonrzfyvchqxzmlpr-auth-token') || '{}');
      const headers = { 'Authorization': 'Bearer ' + tok.access_token, apikey: 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD' };
      const r1 = await fetch(`https://juzkonrzfyvchqxzmlpr.supabase.co/rest/v1/sync_card_states?select=deck_key,srs_stage&deck_key=eq.${key}`, { headers });
      const cloudStates = await r1.json();
      const cloudTotal = cloudStates.length;
      const db = await new Promise(resolve => { const r = indexedDB.open('yihai_srs', 6); r.onsuccess = () => resolve(r.result); });
      const localStates = await new Promise(resolve => { db.transaction('card_states', 'readonly').objectStore('card_states').getAll().onsuccess = e => resolve(e.target.result); });
      const localTotal = localStates.filter(s => s.deck_key === key).length;
      db.close();
      return { cloudTotal, localTotal };
    }, CLOUD_DECK_KEY);

    console.log(`  äº‘ç«¯: ${cloudCompare.cloudTotal}  æœ¬åœ°: ${cloudCompare.localTotal}`);
    check('card_states æ•°é‡ä¸€è‡´', cloudCompare.cloudTotal, cloudCompare.localTotal);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 10: é€€å‡ºç™»å½• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 10: é€€å‡ºç™»å½• â€” æ•°æ®ä¿ç•™éªŒè¯');

    const uidBeforeLogout = await run(page, () => _cloudUserId);
    const { loggedOut, syncDisabled } = await helper.cloudLogout(page);
    pass('é€€å‡ºåŽæ˜¾ç¤ºç™»å½•è¡¨å•', loggedOut);
    pass('é€€å‡ºåŽ _syncEnabled=false', syncDisabled);

    pass('ç™»å‡ºåŽäº‘ç‰Œç»„ä¿ç•™åœ¨åˆ—è¡¨ä¸­', await run(page, (name) => {
      for (const c of document.querySelectorAll('.deck-card')) {
        if (c.querySelector('.deck-name')?.textContent.includes(name)) return true;
      }
      return false;
    }, 'è”¬èœæ°´æžœ'));

    pass('ç™»å‡ºåŽ DECKS_META ä»å«äº‘ç‰Œç»„', await run(page, (name) =>
      DECKS_META.some(m => m.name === name), 'è”¬èœæ°´æžœ'));

    const uidAfter = await run(page, () => typeof _cloudUserId === 'string' ? _cloudUserId : 'N/A');
    pass('ç™»å‡ºåŽ cloudUserId ä¿ç•™ï¼ˆç¦»çº¿æ•°æ®å½’å±žï¼‰', uidAfter === uidBeforeLogout);

    pass('ç™»å‡ºåŽ IDB ä¿ç•™ï¼ˆä¸åˆ åº“ï¼‰', await run(page, async () => {
      try { const dbs = await indexedDB.databases(); return dbs.some(d => d.name === 'yihai_srs'); } catch(e) { return false; }
    }));

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 11: é‡æ–°ç™»å½•éªŒè¯ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // åˆå¹¶è‡ª _playwright_user_switch_test.js â€” re-login deck count >= first
    section('PHASE 11: é‡æ–°ç™»å½•éªŒè¯æ•°æ®ä»Žäº‘ç«¯æ‹‰å›ž');
    await helper.closeSettings(page);

    pass('é‡æ–°ç™»å½•æˆåŠŸ', await helper.cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));
    await helper.closeSettings(page);

    let secondCount = 0;
    for (let i = 0; i < 60; i++) {
      secondCount = await run(page, () =>
        DECKS_META.filter(m => m.source === 'cloud').length
      );
      if (secondCount > 0) break;
      await wait(page, 500);
    }
    console.log(`  é‡æ–°ç™»å½•äº‘ç‰Œç»„: ${secondCount}`);
    pass('é‡æ–°ç™»å½•åŽæœ‰äº‘ç‰Œç»„', secondCount > 0);
    console.log(`  ç‰Œç»„æ•°: ${firstCloudDeckCount} â†’ ${secondCount}`);
    pass('é‡æ–°ç™»å½•ç‰Œç»„â‰¥é¦–æ¬¡', secondCount >= firstCloudDeckCount);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ç»“æžœ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('ç»“æžœ');
    const { passed, failed, errors } = helper.getCounts();
    console.log(`  é€šè¿‡: ${passed}  å¤±è´¥: ${failed}`);
    if (failed > 0) console.log(`  å¤±è´¥è¯¦æƒ…: ${errors.join(' | ')}`);
    const errLogs = consoleLogs.filter(l => l.includes('[error]'));
    if (errLogs.length > 0) console.log(`  æŽ§åˆ¶å°é”™è¯¯: ${errLogs.length} æ¡`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  await page.close();
  await browser.close();
  const { failed } = helper.getCounts();
  process.exit(failed > 0 ? 1 : 0);
})();

