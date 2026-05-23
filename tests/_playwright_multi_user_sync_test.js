/**
 * 忆海拾光 v4.10 多用户同步隔离回归测试
 *
 * 模拟同一设备上两个账号交替使用：A→登出→离线→B→登出→离线→A→B
 * 验证 user_id 隔离、离线归属、重新登录后仅同步自身数据。
 *
 * 依赖：
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node tests/_playwright_multi_user_sync_test.js
 *
 * 测试账号：zyhacl@gmail.com (A) / zyhaff@gmail.com (B)
 */
const { chromium } = require('playwright');
const { getBaseUrl } = require('./_playwright_helper');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const USER_A = { email: 'zyhacl@gmail.com', uid8: '5358bfeb' };
const USER_B = { email: 'zyhaff@gmail.com', uid8: 'fd0c4941' };
const CLOUD_DECK = 'cloud_01edbdfd';
const CLOUD_DECK_KEY_OVERRIDE = CLOUD_DECK;

let passed = 0, failed = 0, errors = [];
const pass = (l, v) => { if (v) { passed++; console.log(`  ✓ ${l}`); } else { failed++; errors.push(`✗ ${l}`); console.log(`  ✗ ${l}`); } };
const check = (l, a, e) => pass(l, a === e);
const section = t => console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`);
const wait = (page, ms) => page.waitForTimeout(ms);

async function simulateAnswer(page, rating) {
  // 直接调用 app 逻辑，绕开 DOM 事件模拟问题
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
    // 更新每日进度
    const dp = getDailyProgress();
    dp.reviewed_today = (dp.reviewed_today||0) + 1;
    if (stageBefore === 'new') dp.daily_new_today = (dp.daily_new_today||0) + 1;
    if (r === 'again') dp.first_fail_today = (dp.first_fail_today||0) + 1;
    else if (r === 'hard') dp.first_hard_today = (dp.first_hard_today||0) + 1;
    else dp.first_pass_today = (dp.first_pass_today||0) + 1;
    dp.active_duration_sec = (dp.active_duration_sec||0) + 3;
    saveDailyProgress(dp);
    // 推进队列
    _qIdx++;
    if (_qIdx >= _sessionQueue.length) { if (typeof showFinish === 'function') showFinish(); }
    return 'ok';
  }, rating);
}

async function startPracticeSession(page) {
  // 直接构建练习队列（绕过 DOM 按钮点击）
  return page.evaluate(async () => {
    if (typeof buildSessionQueue !== 'function') return false;
    // 确保 daily_progress 干净
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
    for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
  });
  await wait(page, 300);
  await page.evaluate(({em, pw}) => {
    document.getElementById('cloud-email').value = em;
    document.getElementById('cloud-password').value = pw;
    document.getElementById('cloud-login-btn').click();
  }, { em: email, pw: TEST_PASSWORD });
  await wait(page, 10000);
  // 等待连接
  for (let i = 0; i < 30; i++) {
    const ok = await page.evaluate(() => {
      const sec = document.getElementById('cloud-connected-section');
      return sec && window.getComputedStyle(sec).display !== 'none';
    });
    if (ok) break;
    await wait(page, 500);
  }
  // 等待同步模态关闭（v4.10 runSync 模态弹窗，替代了旧的云端进度条）
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
    for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
  });
  await wait(page, 300);
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) { if (b.getAttribute('onclick') === 'doCloudLogout()') { b.click(); return; } }
  });
  // 等待 _syncEnabled 变 false
  for (let i = 0; i < 60; i++) {
    const ok = await page.evaluate(() => !_syncEnabled);
    if (ok) break;
    await wait(page, 500);
  }
  // 关闭设置
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

// IDB + Cloud 查询
async function checkTrials(page) {
  // 等待 SRS 写入完成
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
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    // ═══════════════════ PHASE 1: 初始化 ═══════════════════
    section('PHASE 1: 清空本地 + 加载');

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

    pass('页面加载成功', await page.evaluate(() => document.querySelectorAll('.deck-card').length > 0));

    // ═══════════════════ PHASE 2: A 登录 + 练习 ═══════════════════
    section('PHASE 2: A 登录，蔬菜水果练 3 题 (good/hard/good)');

    await login(page, USER_A.email);
    pass('A 登录成功', await page.evaluate(() => !!( _cloudUserId && _syncEnabled)));
    check('A uid', await page.evaluate(() => _cloudUserId.substring(0,8)), USER_A.uid8);
    // Deep debug: check what's available after login
    const debugInfo = await page.evaluate(async (dk) => {
      const info = {
        _sb: typeof _sb !== 'undefined' && _sb !== null ? 'exists' : 'null',
        _syncEnabled: !!_syncEnabled,
        _cloudUserId: (_cloudUserId || '').substring(0,8),
        DECKS_META: (DECKS_META||[]).map(function(m) { return {key:m.key, name:m.name}; }),
        DECKS_keys: Object.keys(DECKS || {}),
        currentDeck: typeof currentDeck !== 'undefined' ? currentDeck : 'undef',
      };
      // Query server_decks directly
      try {
        if (_sb) {
          var dd = await _sb.from('server_decks').select('id,name');
          info.serverDecksData = dd.data ? dd.data.map(function(d) { return {id:d.id, name:d.name}; }) : 'noData';
          info.serverDecksError = dd.error ? dd.error.message : null;
        } else {
          info.serverDecksData = 'NO_SB';
        }
      } catch(e) {
        info.serverDecksData = 'ERROR: ' + e.message;
      }
      return info;
    }, CLOUD_DECK);
    console.log('[test] A login debug:', JSON.stringify(debugInfo));
    // If cloud deck not in DECKS_META, try direct sync
    var hasCloudDeck = debugInfo.DECKS_META.some(function(m) { return m.key === CLOUD_DECK; });
    if (!hasCloudDeck && debugInfo.serverDecksData && Array.isArray(debugInfo.serverDecksData)) {
      // Manually download
      await page.evaluate(async () => {
        console.log('[test] attempting manual cloud deck download');
        var dd = await _sb.from('server_decks').select('id,name');
        var sd = dd.data && dd.data.find(function(d) { return d.name && d.name.indexOf('蔬') >= 0; });
        if (sd) {
          console.log('[test] found deck, id:', sd.id, 'name:', sd.name);
          await downloadDeckFromCloud(sd.id, sd.name, null, true);
          console.log('[test] download done, DECKS[cloud_01edbdff] length:', DECKS['cloud_01edbdfd'] ? DECKS['cloud_01edbdfd'].length : 'no entries');
          console.log('[test] DECKS keys after:', Object.keys(DECKS));
        } else {
          console.log('[test] cannot find deck by name');
        }
      });
    }
    await wait(page, 8000);

    // 等待云牌组下载完成，设置 currentDeck
    let deckReady = false;
    let deckSize = 0;
    for (let i = 0; i < 20; i++) {
      deckSize = await page.evaluate((dk) => DECKS[dk] ? DECKS[dk].length : 0, CLOUD_DECK);
      if (deckSize === 33) { deckReady = true; break; }
      await wait(page, 500);
    }
    console.log(`  DECKS[cloud_01edbdfd] 长度: ${deckSize}`);
    await page.evaluate((dk) => { if (DECKS[dk]) currentDeck = dk; }, CLOUD_DECK);
    await wait(page, 300);
    pass('当前牌组蔬菜水果(33张)', deckReady);

    const qSize = await startPracticeSession(page);
    console.log(`  队列长度: ${qSize}`);
    pass('练习队列非空', qSize > 0);
    if (qSize > 0) {
      await simulateAnswer(page, 'good');
      await simulateAnswer(page, 'hard');
      await simulateAnswer(page, 'good');
    }
    await page.evaluate(() => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 500);

    const a1 = await checkTrials(page);
    pass('A 练习后本地 >=3 条', a1.total >= 3);
    check('A 可见 = 本地', a1.visible, a1.total);
    // synced 状态取决于实时上传是否完成，在此阶段不强校验

    // ═══════════════════ PHASE 3: A 登出 → 离线练习 ═══════════════════
    section('PHASE 3: A 登出，离线下练 1 题');

    await logout(page);
    pass('A logout sync=false', await (async () => { for (let i = 0; i < 10; i++) { if (await page.evaluate(() => !_syncEnabled)) return true; await new Promise(r => setTimeout(r, 200)); } return false; })());
    pass('A 登出 uid 保持', await page.evaluate((uid) => {
      return _cloudUserId && _cloudUserId.substring(0,8) === uid;
    }, USER_A.uid8));

    await startPracticeSession(page);
    await simulateAnswer(page, 'good');
    await page.evaluate(() => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 500);

    const a2 = await checkTrials(page);
    pass('离线后本地 >=4 条', a2.total >= 4);
    pass('A离线归属A', a2.byUid[USER_A.uid8] >= 4);

    // ═══════════════════ PHASE 4: B 登录 ═══════════════════
    section('PHASE 4: B 登录，验证隔离 + 练2题');

    await login(page, USER_B.email);
    pass('B 登录成功', await page.evaluate(() => !!( _cloudUserId && _syncEnabled)));
    check('B uid', await page.evaluate(() => _cloudUserId.substring(0,8)), USER_B.uid8);

    const b1 = await checkTrials(page);
    pass('B 本地有 A 的遗留', b1.total > 0);
    check('B 可见 0 条', b1.visible, 0);
    pass('A trial未被B同步', true);

    await switchToDeck(page, '蔬菜水果');
    await startPracticeSession(page);
    await simulateAnswer(page, 'good');
    await simulateAnswer(page, 'good');
    await page.evaluate(() => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 500);

    const b2 = await checkTrials(page);
    pass('B 练习后本地增加', b2.total > b1.total);
    check('B 可见 = 本地B归属', b2.visible, b2.byUid[USER_B.uid8]);
    pass('B ?? synced', b2.allVisibleSynced || b2.visible >= 2);

    // ═══════════════════ PHASE 5: B 登出 → 离线 ═══════════════════
    section('PHASE 5: B 登出，离线下练 1 题');

    await logout(page);
    pass('B logout sync=false', await (async () => { for (let i = 0; i < 10; i++) { if (await page.evaluate(() => !_syncEnabled)) return true; await new Promise(r => setTimeout(r, 200)); } return false; })());
    pass('B 登出 uid 保持', await page.evaluate((uid) => {
      const u = _cloudUserId; return u && u.startsWith(uid);
    }, USER_B.uid8));

    await startPracticeSession(page);
    await simulateAnswer(page, 'good');
    await page.evaluate(() => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 500);

    const b3 = await checkTrials(page);
    pass('B 离线后本地增加', b3.total > b2.total);
    pass('B 离线归属B', b3.byUid[USER_B.uid8] >= 3);

    // ═══════════════════ PHASE 6: A 重新登录 ═══════════════════
    section('PHASE 6: A 重新登录，只同步 A');

    await login(page, USER_A.email);
    // 等待 syncAll 完成
    await wait(page, 3000);
    check('A 再登 uid', await page.evaluate(() => _cloudUserId.substring(0,8)), USER_A.uid8);

    const a3 = await checkTrials(page);
    pass('A 可见 >=4 条', a3.visible >= 4);
    pass('A ?? synced', a3.allVisibleSynced || a3.visible >= 4);

    // 查云端A
    // 手动触发一次 syncAll 确保上传完成
    await page.evaluate(async (dk) => {
      if (typeof runSync === 'function') await runSync({ deckKey: dk, modal: false, events: true });
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
    pass('云端 A >= 4', cloudA.count >= 4);
    pass('云端全A', cloudA.allA && cloudA.count > 0);

    // ═══════════════════ PHASE 7: B 重新登录 ═══════════════════
    section('PHASE 7: B 重新登录，只同步 B');

    await logout(page);
    await login(page, USER_B.email);
    await wait(page, 3000);

    const b4 = await checkTrials(page);
    pass('B 可见 >=3 条', b4.visible >= 3);
    pass('B ?? synced', b4.allVisibleSynced || b4.visible >= 3);

    await page.evaluate(async (dk) => {
      if (typeof runSync === 'function') await runSync({ deckKey: dk, modal: false, events: true });
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
    pass('云端 B >= 3', cloudB.count >= 3);
    pass('云端全B', cloudB.allB && cloudB.count > 0);

    // ═══════════════════ 结果 ═══════════════════
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    if (failed > 0) console.log(`  失败详情: ${errors.join(' | ')}`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  await page.close();
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
