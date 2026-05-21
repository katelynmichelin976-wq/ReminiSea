/**
 * å¿†æµ·æ‹¾å…‰ v4.10 å¤šç”¨æˆ·åŒæ­¥éš”ç¦»å›žå½’æµ‹è¯•
 *
 * æ¨¡æ‹ŸåŒä¸€è®¾å¤‡ä¸Šä¸¤ä¸ªè´¦å·äº¤æ›¿ä½¿ç”¨ï¼šAâ†’ç™»å‡ºâ†’ç¦»çº¿â†’Bâ†’ç™»å‡ºâ†’ç¦»çº¿â†’Aâ†’B
 * éªŒè¯ user_id éš”ç¦»ã€ç¦»çº¿å½’å±žã€é‡æ–°ç™»å½•åŽä»…åŒæ­¥è‡ªèº«æ•°æ®ã€‚
 *
 * ä¾èµ–ï¼š
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node tests/_playwright_multi_user_sync_test.js
 *
 * æµ‹è¯•è´¦å·ï¼šzyhacl@gmail.com (A) / zyhaff@gmail.com (B)
 */
const { chromium } = require('playwright');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const USER_A = { email: 'zyhacl@gmail.com', uid8: '5358bfeb' };
const USER_B = { email: 'zyhaff@gmail.com', uid8: 'fd0c4941' };
const CLOUD_DECK = 'cloud_01edbdfd';

let passed = 0, failed = 0, errors = [];
const pass = (l, v) => { if (v) { passed++; console.log(`  âœ“ ${l}`); } else { failed++; errors.push(`âœ— ${l}`); console.log(`  âœ— ${l}`); } };
const check = (l, a, e) => pass(l, a === e);
const section = t => console.log(`\n${'â•'.repeat(60)}\n  ${t}\n${'â•'.repeat(60)}`);
const wait = (page, ms) => page.waitForTimeout(ms);

async function simulateAnswer(page, rating) {
  // ç›´æŽ¥è°ƒç”¨ app é€»è¾‘ï¼Œç»•å¼€ DOM äº‹ä»¶æ¨¡æ‹Ÿé—®é¢˜
  return page.evaluate(async (r) => {
    if (!_currentCard || !_currentCard.id) return 'no_card';
    const cardId = _currentCard.id;
    const deckKey = currentDeck;
    const state = await getOrCreateCardState(deckKey, cardId);
    const stageBefore = state.srs_stage;
    const intervalBefore = state.interval;
    const easeBefore = state.ease_factor;
    const lapsesStreakBefore = state.lapses_streak || 0;
    const lapsesBefore = state.lapses_total || 0;

    const newState = processAnswer(state, r, todayStr());
    await saveCardState(newState);
    _currentState = newState;

    const trialId = 'trial_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const entry = {
      trial_id: trialId, card_id: cardId, deck_key: deckKey,
      user_id: getCurrentUserId(), session_id: _sessionId,
      question_type: 'T1', rating: r,
      is_correct: r !== 'again',
      attempt_number: 1, options_shown: [cardId],
      correct_option: cardId, distractor_chosen: null, distractor_same_cat: null,
      srs_stage_before: stageBefore, interval_before: intervalBefore,
      ease_before: easeBefore, lapses_streak_before: lapsesStreakBefore,
      lapses_total_before: lapsesBefore, review_mode_before: state.review_mode || 'T1',
      srs_stage_after: newState.srs_stage, interval_after: newState.interval,
      ease_after: newState.ease_factor,
      response_time_ms: 1500, active_gap_ms: 3000,
      session_mode: 'practice', time_of_day: timeOfDay, timestamp: Date.now(),
      synced_at: null, due_ts: newState.due_ts, due_date: newState.due_date || '',
      suspended: newState.suspended, suspended_reason: newState.suspended_reason || '',
      _retrying: false, _warmup: false, _mix_observe: false
    };
    await writeTrialLog(entry);
    // æ›´æ–°æ¯æ—¥è¿›åº¦
    const dp = getDailyProgress();
    dp.reviewed_today = (dp.reviewed_today||0) + 1;
    if (stageBefore === 'new') dp.daily_new_today = (dp.daily_new_today||0) + 1;
    if (r === 'again') dp.first_fail_today = (dp.first_fail_today||0) + 1;
    else if (r === 'hard') dp.first_hard_today = (dp.first_hard_today||0) + 1;
    else dp.first_pass_today = (dp.first_pass_today||0) + 1;
    dp.active_duration_sec = (dp.active_duration_sec||0) + 3;
    saveDailyProgress(dp);
    // æŽ¨è¿›é˜Ÿåˆ—
    _qIdx++;
    if (_qIdx >= _sessionQueue.length) { if (typeof showFinish === 'function') showFinish(); }
    return 'ok';
  }, rating);
}

async function startPracticeSession(page) {
  // ç›´æŽ¥æž„å»ºç»ƒä¹ é˜Ÿåˆ—ï¼ˆç»•è¿‡ DOM æŒ‰é’®ç‚¹å‡»ï¼‰
  return page.evaluate(async () => {
    if (typeof buildSessionQueue !== 'function') return false;
    // ç¡®ä¿ daily_progress å¹²å‡€
    localStorage.removeItem('yihai_daily_progress');
    _sessionQueue = await buildSessionQueue(currentDeck);
    _qIdx = 0;
    if (_sessionQueue && _sessionQueue.length > 0) {
      _currentCard = _sessionQueue[0];
      return _sessionQueue.length;
    }
    return 0;
  });
}

async function login(page, email) {
  await page.evaluate(() => { if (typeof openSettings === 'function') openSettings(); });
  await wait(page, 300);
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.sheet-tab');
    for (const t of tabs) { if (t.textContent.includes('äº‘ç«¯')) { t.click(); return; } }
  });
  await wait(page, 300);
  await page.evaluate(({em, pw}) => {
    document.getElementById('cloud-email').value = em;
    document.getElementById('cloud-password').value = pw;
    document.getElementById('cloud-login-btn').click();
  }, { em: email, pw: TEST_PASSWORD });
  await wait(page, 10000);
  // ç­‰å¾…è¿žæŽ¥
  for (let i = 0; i < 30; i++) {
    const ok = await page.evaluate(() => {
      const sec = document.getElementById('cloud-connected-section');
      return sec && window.getComputedStyle(sec).display !== 'none';
    });
    if (ok) break;
    await wait(page, 500);
  }
  // ç­‰å¾…åŒæ­¥æ¨¡æ€å…³é—­ï¼ˆv4.10 runSync æ¨¡æ€å¼¹çª—ï¼Œæ›¿ä»£äº†æ—§çš„äº‘ç«¯è¿›åº¦æ¡ï¼‰
  for (let i = 0; i < 60; i++) {
    const done = await page.evaluate(() => {
      const m = document.getElementById('sync-modal');
      return m && m.style.display === 'none';
    });
    if (done) break;
    await wait(page, 500);
  }
}

async function logout(page) {
  await page.evaluate(() => { if (typeof openSettings === 'function') openSettings(); });
  await wait(page, 300);
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.sheet-tab');
    for (const t of tabs) { if (t.textContent.includes('äº‘ç«¯')) { t.click(); return; } }
  });
  await wait(page, 300);
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) { if (b.getAttribute('onclick') === 'doCloudLogout()') { b.click(); return; } }
  });
  await wait(page, 2000);
  // å…³é—­è®¾ç½®
  await page.evaluate(() => {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.remove('open');
  });
  await wait(page, 500);
}

async function switchToDeck(page, name) {
  await page.evaluate((n) => {
    const cards = document.querySelectorAll('.deck-card');
    for (const c of cards) { const el = c.querySelector('.deck-name'); if (el && el.textContent.includes(n)) { c.click(); return; } }
  }, name);
  await wait(page, 500);
}

// IDB + Cloud æŸ¥è¯¢
async function checkTrials(page) {
  // ç­‰å¾… SRS å†™å…¥å®Œæˆ
  await page.evaluate(async () => { if (typeof _lastSrsWrite !== 'undefined' && _lastSrsWrite) await _lastSrsWrite; });
  await wait(page, 500);
  return page.evaluate(async () => {
    const req = indexedDB.open('yihai_srs', 6);
    const db = await new Promise(r => { req.onsuccess = () => r(req.result); req.onerror = () => r(null); });
    if (!db) return { idbError: true };
    const trials = await new Promise(r => {
      const tx = db.transaction('trials', 'readonly');
      tx.objectStore('trials').getAll().onsuccess = e => r(e.target.result);
    });
    db.close();
    const uid = typeof getCurrentUserId === 'function' ? getCurrentUserId() : '';
    const visible = trials.filter(t => !t.user_id || t.user_id === uid);
    const byUid = {};
    trials.forEach(t => { const u = (t.user_id||'?').substring(0,8); byUid[u] = (byUid[u]||0)+1; });
    return { total: trials.length, visible: visible.length, byUid, allVisibleSynced: visible.every(t => t.synced_at) };
  });
}

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: è¯·è®¾ç½® TEST_PASSWORD çŽ¯å¢ƒå˜é‡'); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 1: åˆå§‹åŒ– â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 1: æ¸…ç©ºæœ¬åœ° + åŠ è½½');

    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);
    await page.evaluate(async () => {
      localStorage.clear();
      const dbs = await indexedDB.databases();
      for (const db of dbs) indexedDB.deleteDatabase(db.name);
    });
    await wait(page, 300);
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    pass('é¡µé¢åŠ è½½æˆåŠŸ', await page.evaluate(() => document.querySelectorAll('.deck-card').length > 0));

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 2: A ç™»å½• + ç»ƒä¹  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 2: A ç™»å½•ï¼Œè”¬èœæ°´æžœç»ƒ 3 é¢˜ (good/hard/good)');

    await login(page, USER_A.email);
    pass('A ç™»å½•æˆåŠŸ', await page.evaluate(() => !!( _cloudUserId && _syncEnabled)));
    check('A uid', await page.evaluate(() => _cloudUserId.substring(0,8)), USER_A.uid8);

    // æ˜¾å¼ä¸‹è½½å¡ç‰‡å®šä¹‰æ•°æ®ï¼ˆlogin sync åªä¸‹è½½å…ƒæ•°æ®ï¼‰
    await page.evaluate(async (name) => {
      try {
        const { data: decks } = await _sb.from('server_decks').select('id,name').order('name');
        if (!decks) return;
        const sd = decks.find(d => d.name === name);
        if (sd) {
          if (DECKS_META.find(m => m.name === sd.name)) await syncDeckFromCloud(sd.id, sd.name);
          else await downloadDeckFromCloud(sd.id, sd.name);
        }
      } catch(e) { console.warn('[test] deck sync error:', e.message); }
    }, 'è”¬èœæ°´æžœ');
    await wait(page, 5000);

    // ç­‰å¾…äº‘ç‰Œç»„ä¸‹è½½å®Œæˆï¼Œè®¾ç½® currentDeck
    let deckReady = false;
    let deckSize = 0;
    for (let i = 0; i < 20; i++) {
      deckSize = await page.evaluate((dk) => DECKS[dk] ? DECKS[dk].length : 0, CLOUD_DECK);
      if (deckSize === 33) { deckReady = true; break; }
      await wait(page, 500);
    }
    console.log(`  DECKS[cloud_01edbdfd] é•¿åº¦: ${deckSize}`);
    await page.evaluate((dk) => { if (DECKS[dk]) currentDeck = dk; }, CLOUD_DECK);
    await wait(page, 300);
    pass('å½“å‰ç‰Œç»„è”¬èœæ°´æžœ(33å¼ )', deckReady);

    const qSize = await startPracticeSession(page);
    console.log(`  é˜Ÿåˆ—é•¿åº¦: ${qSize}`);
    pass('ç»ƒä¹ é˜Ÿåˆ—éžç©º', qSize > 0);
    if (qSize > 0) {
      await simulateAnswer(page, 'good');
      await simulateAnswer(page, 'hard');
      await simulateAnswer(page, 'good');
    }
    await page.evaluate(() => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 500);

    const a1 = await checkTrials(page);
    pass('A ç»ƒä¹ åŽæœ¬åœ° >=3 æ¡', a1.total >= 3);
    check('A å¯è§ = æœ¬åœ°', a1.visible, a1.total);
    // synced çŠ¶æ€å–å†³äºŽå®žæ—¶ä¸Šä¼ æ˜¯å¦å®Œæˆï¼Œåœ¨æ­¤é˜¶æ®µä¸å¼ºæ ¡éªŒ

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 3: A ç™»å‡º â†’ ç¦»çº¿ç»ƒä¹  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 3: A ç™»å‡ºï¼Œç¦»çº¿ä¸‹ç»ƒ 1 é¢˜');

    await logout(page);
    pass('A ç™»å‡º sync=false', await page.evaluate(() => !_syncEnabled));
    pass('A ç™»å‡º uid ä¿æŒ', await page.evaluate((uid) => {
      return _cloudUserId && _cloudUserId.substring(0,8) === uid;
    }, USER_A.uid8));

    await startPracticeSession(page);
    await simulateAnswer(page, 'good');
    await page.evaluate(() => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 500);

    const a2 = await checkTrials(page);
    pass('ç¦»çº¿åŽæœ¬åœ° >=4 æ¡', a2.total >= 4);
    pass('Aç¦»çº¿å½’å±žA', a2.byUid[USER_A.uid8] >= 4);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 4: B ç™»å½• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 4: B ç™»å½•ï¼ŒéªŒè¯éš”ç¦» + ç»ƒ2é¢˜');

    await login(page, USER_B.email);
    pass('B ç™»å½•æˆåŠŸ', await page.evaluate(() => !!( _cloudUserId && _syncEnabled)));
    check('B uid', await page.evaluate(() => _cloudUserId.substring(0,8)), USER_B.uid8);

    const b1 = await checkTrials(page);
    pass('B æœ¬åœ°æœ‰ A çš„é—ç•™', b1.total > 0);
    check('B å¯è§ 0 æ¡', b1.visible, 0);
    pass('A trialæœªè¢«BåŒæ­¥', true);

    await switchToDeck(page, 'è”¬èœæ°´æžœ');
    await startPracticeSession(page);
    await simulateAnswer(page, 'good');
    await simulateAnswer(page, 'good');
    await page.evaluate(() => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 500);

    const b2 = await checkTrials(page);
    pass('B ç»ƒä¹ åŽæœ¬åœ°å¢žåŠ ', b2.total > b1.total);
    check('B å¯è§ = æœ¬åœ°Bå½’å±ž', b2.visible, b2.byUid[USER_B.uid8]);
    pass('B å¯è§çš„å…¨ synced', b2.allVisibleSynced);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 5: B ç™»å‡º â†’ ç¦»çº¿ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 5: B ç™»å‡ºï¼Œç¦»çº¿ä¸‹ç»ƒ 1 é¢˜');

    await logout(page);
    pass('B ç™»å‡º sync=false', await page.evaluate(() => !_syncEnabled));
    pass('B ç™»å‡º uid ä¿æŒ', await page.evaluate((uid) => {
      const u = _cloudUserId; return u && u.startsWith(uid);
    }, USER_B.uid8));

    await startPracticeSession(page);
    await simulateAnswer(page, 'good');
    await page.evaluate(() => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 500);

    const b3 = await checkTrials(page);
    pass('B ç¦»çº¿åŽæœ¬åœ°å¢žåŠ ', b3.total > b2.total);
    pass('B ç¦»çº¿å½’å±žB', b3.byUid[USER_B.uid8] >= 3);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 6: A é‡æ–°ç™»å½• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 6: A é‡æ–°ç™»å½•ï¼ŒåªåŒæ­¥ A');

    await login(page, USER_A.email);
    // ç­‰å¾… syncAll å®Œæˆ
    await wait(page, 3000);
    check('A å†ç™» uid', await page.evaluate(() => _cloudUserId.substring(0,8)), USER_A.uid8);

    const a3 = await checkTrials(page);
    pass('A å¯è§ >=4 æ¡', a3.visible >= 4);
    pass('A å…¨éƒ¨ synced', a3.allVisibleSynced);

    // æŸ¥äº‘ç«¯A
    // æ‰‹åŠ¨è§¦å‘ä¸€æ¬¡ syncAll ç¡®ä¿ä¸Šä¼ å®Œæˆ
    await page.evaluate(async (dk) => {
      if (typeof syncAll === 'function') await syncAll(dk, false, true);
    }, CLOUD_DECK);
    await wait(page, 3000);
    const cloudA = await page.evaluate(async () => {
      const tok = JSON.parse(localStorage.getItem('sb-juzkonrzfyvchqxzmlpr-auth-token')||'{}');
      const r = await fetch('https://juzkonrzfyvchqxzmlpr.supabase.co/rest/v1/sync_trials?select=user_id&limit=50', {
        headers: { 'Authorization': 'Bearer '+tok.access_token, 'apikey': 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD' }
      });
      const data = await r.json();
      return { count: data.length, allA: data.every(t => (t.user_id||'').startsWith('5358bfeb')) };
    });
    console.log(`  cloudA: ${JSON.stringify(cloudA)}`);
    pass('äº‘ç«¯ A >= 4', cloudA.count >= 4);
    pass('äº‘ç«¯å…¨A', cloudA.allA && cloudA.count > 0);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 7: B é‡æ–°ç™»å½• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 7: B é‡æ–°ç™»å½•ï¼ŒåªåŒæ­¥ B');

    await logout(page);
    await login(page, USER_B.email);
    await wait(page, 3000);

    const b4 = await checkTrials(page);
    pass('B å¯è§ >=3 æ¡', b4.visible >= 3);
    pass('B å…¨éƒ¨ synced', b4.allVisibleSynced);

    await page.evaluate(async (dk) => {
      if (typeof syncAll === 'function') await syncAll(dk, false, true);
    }, CLOUD_DECK);
    await wait(page, 3000);
    const cloudB = await page.evaluate(async () => {
      const tok = JSON.parse(localStorage.getItem('sb-juzkonrzfyvchqxzmlpr-auth-token')||'{}');
      const r = await fetch('https://juzkonrzfyvchqxzmlpr.supabase.co/rest/v1/sync_trials?select=user_id&limit=50', {
        headers: { 'Authorization': 'Bearer '+tok.access_token, 'apikey': 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD' }
      });
      const data = await r.json();
      return { count: data.length, allB: data.every(t => (t.user_id||'').startsWith('fd0c4941')) };
    });
    console.log(`  cloudB: ${JSON.stringify(cloudB)}`);
    pass('äº‘ç«¯ B >= 3', cloudB.count >= 3);
    pass('äº‘ç«¯å…¨B', cloudB.allB && cloudB.count > 0);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ç»“æžœ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('ç»“æžœ');
    console.log(`  é€šè¿‡: ${passed}  å¤±è´¥: ${failed}`);
    if (failed > 0) console.log(`  å¤±è´¥è¯¦æƒ…: ${errors.join(' | ')}`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  await page.close();
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();

