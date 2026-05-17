/**
 * å¿†æµ·æ‹¾å…‰ v4.9+ è·¨è®¾å¤‡åŒæ­¥å›žå½’æµ‹è¯•ï¼ˆæ€§èƒ½ä¼˜åŒ–ç‰ˆï¼‰
 *
 * åœºæ™¯å¤çŽ°ï¼š
 *   è®¾å¤‡ A ç»ƒä¹  3 å¼ å¡ï¼ˆnewâ†’reviewï¼‰ï¼Œäº‘ç«¯çŠ¶æ€æ­£ç¡®ä¸º 'review'
 *   è®¾å¤‡ Bï¼ˆæ–°è®¾å¤‡ï¼ŒIndexedDB ä¸ºç©ºï¼‰ç™»å½• â†’ æ‰“å¼€åŒä¸€ç‰Œç»„ â†’ è§¦å‘ buildSessionQueue
 *   â†’ buildSessionQueue ä¸ºæ¯å¼ å¡åˆ›å»º new çŠ¶æ€å¹¶å®žæ—¶åŒæ­¥è‡³äº‘ç«¯ï¼ˆsaveCardStateâ†’syncCardStateï¼‰
 *   â†’ è¦†å†™è®¾å¤‡ A çš„ review çŠ¶æ€ï¼ˆbugï¼‰
 *
 * ä¾èµ–ï¼š
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node _playwright_cross_device_sync_test.js
 *
 * æµ‹è¯•è´¦å·ï¼šzyhacl@gmail.com
 */
const { chromium } = require('playwright');

const BASE_URL = getBaseUrl();
function pageUrl() { return BASE_URL + '?v=' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const TEST_DECK_NAME = '__test_xdev__';
const CARD_COUNT = 3;
const TEST_DECK_ID = '56d301aa';
const CLOUD_DECK_KEY = 'cloud_56d301aa';
const OLD_DECK_KEY = 'cloud___test_xdev__';

let passed = 0, failed = 0, errors = [];
const pass = (l, v) => { if (v) { passed++; console.log(`  âœ“ ${l}`); } else { failed++; errors.push(`âœ— ${l}`); console.log(`  âœ— ${l}`); } };
const check = (l, a, e) => pass(l, a === e);
const section = t => console.log(`\n${'â•'.repeat(60)}\n  ${t}\n${'â•'.repeat(60)}`);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const wait = (page, ms) => page.waitForTimeout(ms);
const waitWrite = (pg) => pg.evaluate(async () => { if (_lastSrsWrite) await _lastSrsWrite; });
const SETTINGS_SEL = '[aria-label="è®¾ç½®"]';
const ts = () => Date.now();

// â”€â”€ è¾…åŠ©ï¼šè½®è¯¢ç­‰å¾…æ¡ä»¶ â”€â”€
async function poll(page, fn, arg, label, timeoutMs = 15000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await run(page, fn, arg)) return true;
    await wait(page, intervalMs);
  }
  console.log(`  âš  pollè¶…æ—¶: ${label}`);
  return false;
}

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: è¯·è®¾ç½® TEST_PASSWORD çŽ¯å¢ƒå˜é‡'); process.exit(1); }

  const tStart = ts();
  const browser = await chromium.launch({ headless: true }); // æ— å¤´æ¨¡å¼æé€Ÿ
  let pageA, pageB, ctxB;

  try {
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 0: ç™»å½• + æ¸…ç† + åˆ›å»ºæ•°æ® â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const p0 = ts();
    section('PHASE 0: ç™»å½• + æ¸…ç† + åˆ›å»ºæ•°æ®');

    const loginPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await loginPage.goto(pageUrl(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(loginPage, 1000);

    // ç™»å½•ï¼ˆåˆå¹¶æ“ä½œå‡å°‘ evaluate æ¬¡æ•°ï¼‰
    await loginPage.click(SETTINGS_SEL);
    await wait(loginPage, 200);
    await run(loginPage, () => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('äº‘ç«¯')) { t.click(); return; } }
    });
    await wait(loginPage, 200);
    await loginPage.fill('#cloud-email', TEST_EMAIL);
    await loginPage.fill('#cloud-password', TEST_PASSWORD);
    await run(loginPage, () => { document.getElementById('cloud-login-btn').click(); });

    const loggedIn = await poll(loginPage, () => {
      const sec = document.getElementById('cloud-connected-section');
      return sec && window.getComputedStyle(sec).display !== 'none';
    }, null, 'login', 15000, 200);
    pass('ç™»å½•æˆåŠŸ', loggedIn);

    // æ¸…ç† + åˆ›å»ºæ•°æ®ï¼ˆå•æ¬¡ evaluate æ‰¹é‡å®Œæˆï¼‰
    const setupResult = await run(loginPage, async ({ deckId, deckName, count, oldKey, cloudKey }) => {
      const log = [];
      // èŽ·å– userId
      const uid = _cloudUserId;

      // åˆ é™¤æ—§ç‰Œç»„
      const { data: oldDeck } = await _sb.from('server_decks').select('id').eq('name', deckName).maybeSingle();
      if (oldDeck) {
        await _sb.from('server_deck_cards').delete().eq('deck_id', oldDeck.id);
        await _sb.from('server_decks').delete().eq('id', oldDeck.id);
        log.push('oldDeckDeleted');
      }

      // æ¸…ç†å„ deck_key çš„åŽ†å²æ•°æ®
      for (const dk of [cloudKey, oldKey]) {
        await _sb.from('sync_trials').delete().eq('user_id', uid).eq('deck_key', dk);
        await _sb.from('sync_card_states').delete().eq('user_id', uid).eq('deck_key', dk);
      }
      log.push('syncDataCleared');

      // åˆ›å»º 3 å¼ æµ‹è¯•å¡
      const cards = [
        { card_id: 'xdev_01', card_name: 'è‹¹æžœ', deck_name: deckName, source_file: 'test.yhspack' },
        { card_id: 'xdev_02', card_name: 'é¦™è•‰', deck_name: deckName, source_file: 'test.yhspack' },
        { card_id: 'xdev_03', card_name: 'æ©˜å­', deck_name: deckName, source_file: 'test.yhspack' },
      ];
      for (const c of cards) {
        await _sb.from('cards_pool').upsert(c, { onConflict: 'card_id,deck_name,source_file' });
      }

      // åˆ›å»ºç‰Œç»„
      await _sb.from('server_decks').upsert({ id: deckId, name: deckName, description: 'è·¨è®¾å¤‡åŒæ­¥å›žå½’æµ‹è¯•', card_count: count }, { onConflict: 'id' });

      // å…³è”å¡ç‰‡
      for (let i = 0; i < cards.length; i++) {
        await _sb.from('server_deck_cards').upsert({ deck_id: deckId, card_id: cards[i].card_id, sort_order: i }, { onConflict: 'deck_id,card_id' });
      }
      log.push('testDataCreated');
      log.push('uid:' + uid.substring(0, 8));
      return log;
    }, { deckId: TEST_DECK_ID, deckName: TEST_DECK_NAME, count: CARD_COUNT, oldKey: OLD_DECK_KEY, cloudKey: CLOUD_DECK_KEY });

    console.log(`  setup: ${setupResult.join(' â†’ ')}`);

    // é€€å‡ºç™»å½•
    await run(loginPage, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.getAttribute('onclick') === 'doCloudLogout()') { b.click(); return; } }
    });
    await wait(loginPage, 1000);
    await run(loginPage, () => { const o = document.getElementById('settings-overlay'); if (o) o.classList.remove('open'); });
    await wait(loginPage, 200);
    await loginPage.close();

    console.log(`  Phase 0 è€—æ—¶: ${((ts()-p0)/1000).toFixed(1)}s`);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 1: è®¾å¤‡ A â€” ç»ƒä¹  3 å¼ å¡ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const p1 = ts();
    section('PHASE 1: è®¾å¤‡ A â€” ç»ƒä¹  3 å¼ å¡ (new â†’ review)');

    pageA = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await pageA.goto(pageUrl(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(pageA, 1000);

    // ç™»å½•
    await pageA.click(SETTINGS_SEL); await wait(pageA, 200);
    await run(pageA, () => { const t = document.querySelectorAll('.sheet-tab'); for (const x of t) { if (x.textContent.includes('äº‘ç«¯')) { x.click(); return; } } });
    await wait(pageA, 200);
    await pageA.fill('#cloud-email', TEST_EMAIL);
    await pageA.fill('#cloud-password', TEST_PASSWORD);
    await run(pageA, () => { document.getElementById('cloud-login-btn').click(); });

    const connA = await poll(pageA, () => {
      const s = document.getElementById('cloud-connected-section');
      return s && window.getComputedStyle(s).display !== 'none';
    }, null, 'deviceA login', 15000, 200);
    pass('è®¾å¤‡ A ç™»å½•æˆåŠŸ', connA);

    // æ‰‹åŠ¨è§¦å‘åŒæ­¥ï¼ˆv4.10 ä¸è‡ªåŠ¨åŒæ­¥ï¼‰
    await run(pageA, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('åŒæ­¥')) { b.click(); break; } }
    });
    for (let i = 0; i < 40; i++) {
      const done = await run(pageA, () => {
        const modal = document.getElementById('sync-modal');
        return modal && modal.style.display === 'none';
      });
      if (done) break;
      await wait(pageA, 500);
    }

    // å…³é—­è®¾ç½®
    await run(pageA, () => { const o = document.getElementById('settings-overlay'); if (o) o.classList.remove('open'); });
    await wait(pageA, 300);

    // ç­‰å¾…æµ‹è¯•ç‰Œç»„å‡ºçŽ°
    const deckFoundA = await poll(pageA, (name) => {
      const cards = document.querySelectorAll('.deck-card');
      for (const c of cards) { if (c.querySelector('.deck-name')?.textContent.includes(name)) return true; }
      return false;
    }, TEST_DECK_NAME, 'deck appearance A', 20000, 200);
    pass('æµ‹è¯•ç‰Œç»„å‡ºçŽ°åœ¨é¦–é¡µ', deckFoundA);

    // è¯»å–ç‰Œç»„ä¿¡æ¯
    const deckMetaA = await run(pageA, (name) => {
      const m = (DECKS_META || []).find(x => x.name === name);
      return m ? { key: m.key, cardCount: (DECKS[m.key] || []).length } : null;
    }, TEST_DECK_NAME);
    const deckKeyA = deckMetaA.key;
    check(`ç‰Œç»„ ${CARD_COUNT} å¼ å¡`, deckMetaA.cardCount, CARD_COUNT);
    console.log(`  deck_key: ${deckKeyA}`);

    // é€‰ä¸­ç‰Œç»„ + è®¾ç½®å­¦ä¹ å‚æ•°
    await run(pageA, (key) => {
      const c = document.querySelector(`.deck-card[data-deck="${key}"]`);
      if (c) c.click();
    }, deckKeyA);
    await wait(pageA, 200);

    await run(pageA, () => { saveSrsConfigKey('learning_steps', [0.1]); NDUR = 0; });
    await wait(pageA, 100);

    const dpBefore = await run(pageA, () => {
      const dp = getDailyProgress();
      return { r: dp.reviewed_today || 0, n: dp.daily_new_today || 0, d: dp.active_duration_sec || 0 };
    });
    console.log(`  DPå‰: r=${dpBefore.r} n=${dpBefore.n} d=${dpBefore.d}`);

    // é‡ç½®æ¯æ—¥è¿›åº¦ï¼ˆé¿å… daily_new_today å·²è¾¾ä¸Šé™å¯¼è‡´ buildSessionQueue è¿”å›žç©ºé˜Ÿåˆ—ï¼‰
    await run(pageA, () => { localStorage.removeItem('yihai_daily_progress'); });

    // è¿›å…¥ç»ƒä¹ 
    await run(pageA, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('å¼€å§‹ç»ƒä¹ ')) { b.click(); return; } }
    });
    await wait(pageA, 3000);

    const inQuiz = await run(pageA, () => document.getElementById('screen-quiz').classList.contains('active'));
    pass('è¿›å…¥ç»ƒä¹ å±', inQuiz);

    // ç»ƒä¹  3 å¼ å¡
    let answered = 0;
    for (let ci = 0; ci < CARD_COUNT; ci++) {
      // ç­‰å¾…å¡ç‰‡å°±ç»ªï¼ˆæ£€æµ‹æ—§å¡ç‰‡ transition å®Œæˆ + æ–° opt å‡ºçŽ°ï¼‰
      const cardReady = await poll(pageA, () => {
        if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
        // åŒæ—¶æ£€æŸ¥ revealed=falseï¼ˆç¡®ä¿æ˜¯æ–°å¡ï¼‰å’Œ opt å­˜åœ¨
        return !revealed && document.querySelectorAll('.opt').length > 0 ? 'ready' : null;
      }, null, `card ${ci+1} ready`, 15000, 150);
      if (cardReady === 'finish') { console.log(`  å¡${ci+1}: finish early`); break; }
      if (!cardReady) { console.log(`  å¡${ci+1}: æœªå°±ç»ª`); break; }

      await run(pageA, () => {
        const o = document.querySelector('.opt[data-idx="0"]');
        if (o && !revealed) onSel(new MouseEvent('mouseup', {bubbles: true}), 0, o);
      });
      await wait(pageA, 100);
      await waitWrite(pageA);
      answered++;

      // ç‚¹å‡»ä¸‹ä¸€å¼ 
      const nxtResult = await poll(pageA, () => {
        const nxt = document.getElementById('nxtbtn');
        if (nxt && nxt.classList.contains('show') && !nxt.disabled) { nxt.click(); return 'ok'; }
        const fin = document.getElementById('screen-finish');
        if (fin && fin.classList.contains('active')) return 'finish';
        return null;
      }, null, `card ${ci+1} next`, 10000, 100);

      if (nxtResult === 'finish') { console.log(`  å¡${ci+1}: å®Œæˆç•Œé¢`); break; }
      if (!nxtResult) { console.log(`  å¡${ci+1}: ä¸‹ä¸€å¼ è¶…æ—¶`); break; }

      // ç­‰å¾… render() å®Œæˆï¼ˆonNext çš„ 200ms setTimeoutï¼‰
      await wait(pageA, 400);
    }

    check(`å·²å›žç­” ${CARD_COUNT} å¼ `, answered, CARD_COUNT);
    console.log(`  å®Œæˆ ${answered} å¼ `);

    // å›žåˆ°é¦–é¡µ
    await run(pageA, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('è¿”å›žé¦–é¡µ')) { b.click(); return; } }
    });
    await wait(pageA, 500);

    // æ‰‹åŠ¨åŒæ­¥ï¼ˆä½¿ç”¨ UI æŒ‰é’® + ç­‰å¾…æ¨¡æ€å…³é—­ï¼‰
    await pageA.click(SETTINGS_SEL); await wait(pageA, 200);
    await run(pageA, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('åŒæ­¥')) { b.click(); break; } }
    });
    for (let i = 0; i < 40; i++) {
      const done = await run(pageA, () => {
        const modal = document.getElementById('sync-modal');
        return modal && modal.style.display === 'none';
      });
      if (done) break;
      await wait(pageA, 500);
    }
    await run(pageA, () => { const o = document.getElementById('settings-overlay'); if (o) o.classList.remove('open'); });
    await wait(pageA, 200);

    // éªŒè¯é¦–é¡µç»Ÿè®¡
    const statsA = await run(pageA, (key) => getDeckStatsSrs(key), deckKeyA);
    console.log(`  é¦–é¡µ: due=${statsA.due} new=${statsA.new} done=${statsA.done}`);
    pass('done > 0', statsA.done > 0);

    // éªŒè¯äº‘ç«¯ CardState
    const statesA = await run(pageA, async ({ key }) => {
      const { data, error } = await _sb.from('sync_card_states')
        .select('card_id,srs_stage,interval,device_id').eq('deck_key', key);
      return { data: data || [], error };
    }, { key: CLOUD_DECK_KEY });
    const revA = (statesA.data || []).filter(s => s.srs_stage === 'review').length;
    const newA = (statesA.data || []).filter(s => s.srs_stage === 'new').length;
    console.log(`  äº‘ç«¯: ${statesA.data.length}æ¡ review=${revA} new=${newA}`);
    pass('1B: äº‘ç«¯å…¨ä¸º review', revA === CARD_COUNT && newA === 0);

    // è®°å½• DP
    const dpA = await run(pageA, () => {
      const dp = getDailyProgress();
      return { r: dp.reviewed_today || 0, n: dp.daily_new_today || 0, d: dp.active_duration_sec || 0 };
    });
    console.log(`  DPåŽ: r=${dpA.r} n=${dpA.n} d=${dpA.d}`);
    pass('1C: daily_new_today >= 3', dpA.n >= CARD_COUNT);
    pass('1D: reviewed_today >= 3', dpA.r >= CARD_COUNT);
    pass('1E: active_duration_sec > 0', dpA.d > 0);

    // è¯Šæ–­ï¼šæ£€æŸ¥ IndexedDB trials å’Œ cloud trials
    const diagA = await run(pageA, async ({ key }) => {
      // æœ¬åœ° trials
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 5);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
      const localTrials = await new Promise((res, rej) => {
        const tx = db.transaction('trials', 'readonly');
        const g = tx.objectStore('trials').getAll();
        g.onsuccess = e => res((e.target.result || []).filter(t => t.deck_key === key));
        g.onerror = e => rej(e.target.error);
      });
      // äº‘ç«¯ trials
      const { data: cloudTrials } = await _sb.from('sync_trials')
        .select('card_id,trial_id').eq('user_id', _cloudUserId).eq('deck_key', key);
      return {
        localTrialCount: localTrials.length,
        localUnsaved: localTrials.filter(t => !t.synced_at).length,
        cloudTrialCount: (cloudTrials || []).length,
      };
    }, { key: deckKeyA });
    console.log(`  [è¯Šæ–­] Aæœ¬åœ°trials=${diagA.localTrialCount} æœªä¸Šä¼ =${diagA.localUnsaved} äº‘ç«¯trials=${diagA.cloudTrialCount}`);

    console.log(`  Phase 1 è€—æ—¶: ${((ts()-p1)/1000).toFixed(1)}s`);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 2: è®¾å¤‡ B â€” æ‰“å¼€ç‰Œç»„ä½†ä¸ç­”é¢˜ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const p2 = ts();
    section('PHASE 2: è®¾å¤‡ B â€” æ–°è®¾å¤‡æ‰“å¼€ç‰Œç»„ä½†ä¸ç­”é¢˜');

    ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    pageB = await ctxB.newPage();

    await pageB.goto(pageUrl(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(pageB, 1000);

    // è®¾å¤‡ B ç™»å½•
    await pageB.click(SETTINGS_SEL); await wait(pageB, 200);
    await run(pageB, () => { const t = document.querySelectorAll('.sheet-tab'); for (const x of t) { if (x.textContent.includes('äº‘ç«¯')) { x.click(); return; } } });
    await wait(pageB, 200);
    await pageB.fill('#cloud-email', TEST_EMAIL);
    await pageB.fill('#cloud-password', TEST_PASSWORD);
    await run(pageB, () => { document.getElementById('cloud-login-btn').click(); });

    const connB = await poll(pageB, () => {
      const s = document.getElementById('cloud-connected-section');
      return s && window.getComputedStyle(s).display !== 'none';
    }, null, 'deviceB login', 15000, 200);
    pass('è®¾å¤‡ B ç™»å½•æˆåŠŸ', connB);

    // æ‰‹åŠ¨åŒæ­¥ï¼ˆv4.10 ä¸å†è‡ªåŠ¨åŒæ­¥ï¼‰
    await run(pageB, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('åŒæ­¥')) { b.click(); break; } }
    });
    for (let i = 0; i < 40; i++) {
      const done = await run(pageB, () => {
        const modal = document.getElementById('sync-modal');
        return modal && modal.style.display === 'none';
      });
      if (done) break;
      await wait(pageB, 500);
    }

    await run(pageB, () => { const o = document.getElementById('settings-overlay'); if (o) o.classList.remove('open'); });
    await wait(pageB, 300);

    // è¯Šæ–­ï¼šæ£€æŸ¥ login syncAll æ˜¯å¦åŒæ­¥äº† daily_progress å’Œ trials
    const diagBlogin = await run(pageB, async () => {
      const dp = getDailyProgress();
      // æ£€æŸ¥ IndexedDB æ˜¯å¦æœ‰äº‘ç«¯åŒæ­¥ä¸‹æ¥çš„ card states
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 5);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
      const allStates = await new Promise((res, rej) => {
        const tx = db.transaction('card_states', 'readonly');
        const g = tx.objectStore('card_states').getAll();
        g.onsuccess = e => res(e.target.result || []);
        g.onerror = e => rej(e.target.error);
      });
      return {
        dp_r: dp.reviewed_today || 0,
        dp_n: dp.daily_new_today || 0,
        dp_d: dp.active_duration_sec || 0,
        localStateCount: allStates.length,
      };
    });
    console.log(`  [è¯Šæ–­] Bç™»å½•åŽ DP: r=${diagBlogin.dp_r} n=${diagBlogin.dp_n} d=${diagBlogin.dp_d} localStates=${diagBlogin.localStateCount}`);
    // v4.10: DP ä¸åŒæ­¥ï¼ˆä»…æœ¬åœ°è®¡ç®—ï¼‰ï¼Œä½† card states åº”ä»Žäº‘ç«¯æ‹‰å›ž
    pass('ç™»å½•åŒæ­¥åŽ card states > 0', diagBlogin.localStateCount > 0);

    // ç­‰å¾…æµ‹è¯•ç‰Œç»„
    const deckFoundB = await poll(pageB, (name) => {
      const cards = document.querySelectorAll('.deck-card');
      for (const c of cards) { if (c.querySelector('.deck-name')?.textContent.includes(name)) return true; }
      return false;
    }, TEST_DECK_NAME, 'deck appearance B', 20000, 200);
    pass('è®¾å¤‡ B é¦–é¡µæ˜¾ç¤ºæµ‹è¯•ç‰Œç»„', deckFoundB);

    const deckMetaB = await run(pageB, (name) => {
      const m = (DECKS_META || []).find(x => x.name === name);
      return m ? { key: m.key, cardCount: (DECKS[m.key] || []).length } : null;
    }, TEST_DECK_NAME);
    check(`è®¾å¤‡ B ç‰Œç»„ ${CARD_COUNT} å¼ å¡`, deckMetaB.cardCount, CARD_COUNT);
    console.log(`  B deck_key: ${deckMetaB.key}`);

    // â˜… å…³é”®æ­¥éª¤ï¼šæ‰“å¼€ç‰Œç»„ â†’ å¼€å§‹ç»ƒä¹  â†’ è§¦å‘ buildSessionQueue â†’ ä¸ç­”é¢˜
    await run(pageB, (key) => {
      const c = document.querySelector(`.deck-card[data-deck="${key}"]`);
      if (c) c.click();
    }, deckMetaB.key);
    await wait(pageB, 200);

    await run(pageB, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('å¼€å§‹ç»ƒä¹ ')) { b.click(); return; } }
    });
    await wait(pageB, 2000);

    const enteredB = await run(pageB, () => document.getElementById('screen-quiz').classList.contains('active'));
    console.log(`  Bè¿›å…¥ç»ƒä¹ å±: ${enteredB}`);

    // ä¸ç­”é¢˜ï¼Œç›´æŽ¥è¿”å›žé¦–é¡µ
    await run(pageB, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('è¿”å›žé¦–é¡µ')) { b.click(); return; } }
    });
    await wait(pageB, 500);

    // è¯Šæ–­ï¼šbuildSessionQueue åŽ B çš„æœ¬åœ°çŠ¶æ€
    const diagBafterOpen = await run(pageB, async ({ key }) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 5);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
      const states = await new Promise((res, rej) => {
        const tx = db.transaction('card_states', 'readonly');
        const g = tx.objectStore('card_states').getAll();
        g.onsuccess = e => res((e.target.result || []).filter(s => s.deck_key === key));
        g.onerror = e => rej(e.target.error);
      });
      const stages = {};
      states.forEach(s => { stages[s.srs_stage] = (stages[s.srs_stage] || 0) + 1; });
      return { stateCount: states.length, stages, dirtyCount: states.filter(s => !s.synced_at).length };
    }, { key: deckMetaB.key });
    console.log(`  [è¯Šæ–­] Bæ‰“å¼€ç‰Œç»„åŽæœ¬åœ°: ${diagBafterOpen.stateCount}æ¡ ${JSON.stringify(diagBafterOpen.stages)} dirty=${diagBafterOpen.dirtyCount}`);

    // è®¾å¤‡ B æ‰‹åŠ¨åŒæ­¥ï¼ˆä½¿ç”¨ UI æŒ‰é’® + ç­‰å¾…æ¨¡æ€å…³é—­ï¼‰
    await pageB.click(SETTINGS_SEL); await wait(pageB, 200);
    await run(pageB, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('åŒæ­¥')) { b.click(); break; } }
    });
    for (let i = 0; i < 40; i++) {
      const done = await run(pageB, () => {
        const modal = document.getElementById('sync-modal');
        return modal && modal.style.display === 'none';
      });
      if (done) break;
      await wait(pageB, 500);
    }
    await run(pageB, () => { const o = document.getElementById('settings-overlay'); if (o) o.classList.remove('open'); });
    await wait(pageB, 200);

    console.log(`  Phase 2 è€—æ—¶: ${((ts()-p2)/1000).toFixed(1)}s`);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 3: éªŒè¯ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const p3 = ts();
    section('PHASE 3: éªŒè¯');

    // æ ¸å¿ƒéªŒè¯ï¼šäº‘ç«¯ CardStateï¼ˆåº”ä»Ž pageB æŸ¥è¯¢ï¼ŒpageB çš„ _sb å·²ç™»å½•ï¼‰
    const statesFinal = await run(pageB, async ({ key }) => {
      const { data, error } = await _sb.from('sync_card_states')
        .select('card_id,srs_stage,interval,device_id').eq('deck_key', key);
      return { data: data || [], error };
    }, { key: CLOUD_DECK_KEY });
    const fData = statesFinal.data;
    const revF = fData.filter(s => s.srs_stage === 'review').length;
    const newF = fData.filter(s => s.srs_stage === 'new').length;
    console.log(`  äº‘ç«¯: ${fData.length}æ¡ review=${revF} new=${newF}`);
    if (fData.length > 0) fData.forEach(s => console.log(`    ${s.card_id}: ${s.srs_stage} dev=${(s.device_id||'').substring(0,20)}`));

    // æ ¸å¿ƒæ–­è¨€
    pass('éªŒè¯1: æ‰€æœ‰å¡ä»ä¸º reviewï¼ˆæœªè¢«è¦†å†™ä¸º newï¼‰', revF === CARD_COUNT && newF === 0);

    // éªŒè¯ B çš„æœ¬åœ° DPï¼ˆv4.10: DP ä¸åŒæ­¥ï¼Œä»…æœ¬åœ°ç´¯ç§¯ï¼Œæ­¤å¤„åº”ä¸º 0ï¼‰
    const dpB = await run(pageB, () => {
      const dp = getDailyProgress();
      return { r: dp.reviewed_today || 0, n: dp.daily_new_today || 0, d: dp.active_duration_sec || 0 };
    });
    console.log(`  Bæœ€ç»ˆDP: r=${dpB.r} n=${dpB.n} d=${dpB.d}`);

    // äº‘ç«¯ trials éªŒè¯
    const todayTrials = await run(pageB, async ({ uid, dk }) => {
      const today = new Date();
      const dt = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const { data, error } = await _sb.from('sync_trials')
        .select('card_id,srs_stage_before,active_gap_ms').eq('user_id', uid).eq('trial_date', dt);
      return { data: data || [], error, date: dt };
    }, { uid: await run(pageB, () => _cloudUserId), dk: CLOUD_DECK_KEY });
    const tData = todayTrials.data || [];
    const newCards = new Set(tData.filter(t => t.srs_stage_before === 'new').map(t => t.card_id));
    const dur = tData.reduce((s, t) => s + (t.active_gap_ms || 0), 0);
    console.log(`  äº‘ç«¯trials(${todayTrials.date}): ${tData.length}æ¡ æ–°å¡=${newCards.size} æ—¶é•¿=${dur}ms`);
    if (tData.length > 0) tData.forEach(t => console.log(`    ${t.card_id}: stage_before=${t.srs_stage_before} gap=${t.active_gap_ms}ms`));
    pass('éªŒè¯3a: æ–°å¡æ•° = 3', newCards.size >= CARD_COUNT);
    pass('éªŒè¯3b: æ€»æ—¶é•¿ > 0', dur > 0);

    console.log(`  Phase 3 è€—æ—¶: ${((ts()-p3)/1000).toFixed(1)}s`);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ç»“æžœ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('ç»“æžœ');
    console.log(`  é€šè¿‡: ${passed}  å¤±è´¥: ${failed}  æ€»è€—æ—¶: ${((ts()-tStart)/1000).toFixed(1)}s`);
    if (failed > 0) console.log(`  å¤±è´¥: ${errors.join(' | ')}`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  // æ¸…ç†æµ‹è¯•æ•°æ®ï¼ˆæ— è®ºæˆåŠŸå¤±è´¥ï¼‰
  try {
    const loginPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await loginPage.goto(pageUrl(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await loginPage.waitForTimeout(1000);
    await loginPage.click('[aria-label="è®¾ç½®"]');
    await loginPage.waitForTimeout(200);
    await loginPage.evaluate(() => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('äº‘ç«¯')) { t.click(); return; } }
    });
    await loginPage.waitForTimeout(200);
    await loginPage.fill('#cloud-email', TEST_EMAIL);
    await loginPage.fill('#cloud-password', TEST_PASSWORD);
    await loginPage.evaluate(() => { document.getElementById('cloud-login-btn').click(); });
    // ç­‰ç™»å½•
    for (let i = 0; i < 20; i++) {
      const ok = await loginPage.evaluate(() => {
        const s = document.getElementById('cloud-connected-section');
        return s && window.getComputedStyle(s).display !== 'none';
      });
      if (ok) break;
      await loginPage.waitForTimeout(500);
    }
    const uid = await loginPage.evaluate(() => _cloudUserId);
    if (uid) {
      await loginPage.evaluate(async ({ uid, dk, oldKey }) => {
        for (const d of [dk, oldKey]) {
          await _sb.from('sync_trials').delete().eq('user_id', uid).eq('deck_key', d);
          await _sb.from('sync_card_states').delete().eq('user_id', uid).eq('deck_key', d);
        }
        await _sb.from('server_deck_cards').delete().eq('deck_id', dk);
        await _sb.from('server_decks').delete().eq('id', dk);
        await _sb.from('cards_pool').delete().eq('deck_name', '__test_xdev__');
      }, { uid, dk: TEST_DECK_ID, oldKey: OLD_DECK_KEY });
      // æ¸…ç†æœ¬åœ° localStorageï¼ˆé˜²æ­¢æ®‹ç•™åˆ°åŒä¸€ Profile çš„ä¸‹æ¬¡è¿è¡Œï¼‰
      await loginPage.evaluate(({ dk, oldKey }) => {
        localStorage.removeItem('yihai_deck_cloud_' + dk);
        localStorage.removeItem('yihai_deck_' + oldKey);
        const idx = JSON.parse(localStorage.getItem('yihai_decks_index') || '[]');
        const filtered = idx.filter(m => m.key !== 'cloud_' + dk && m.key !== oldKey);
        localStorage.setItem('yihai_decks_index', JSON.stringify(filtered));
      }, { dk: TEST_DECK_ID, oldKey: OLD_DECK_KEY });
    }
    await loginPage.close();
    console.log('  æµ‹è¯•æ•°æ®å·²æ¸…ç†ï¼ˆäº‘ç«¯ + æœ¬åœ°ï¼‰');
  } catch(e) { console.warn('  æ¸…ç†å‡ºé”™:', e.message); }

  if (pageB) { await pageB.close(); }
  if (ctxB) { await ctxB.close(); }
  if (pageA) { await pageA.close(); }
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
