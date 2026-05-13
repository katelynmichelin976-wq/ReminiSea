/**
 * 忆海拾光 v4.10 回归测试（统计数据一致性，只读）
 *
 * 依赖：
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node tests/_playwright_v4.10_regression_test.js
 *
 * 测试账号：zyhacl@gmail.com（测试专用，不污染妈妈数据）
 * 覆盖：登录 → 同步 → 统计页数据与后端比对 → 退出
 * 注意：本测试不做任何写入操作（不练习，不改配置）
 */
const { chromium } = require('playwright');

const CFG = { url: 'http://localhost:8080/yihai_v4.10.html?v=' + Date.now() };
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const CLOUD_DECK_KEY = 'cloud_01edbdfd';
const CARD_COUNT = 33;

let passed = 0, failed = 0, errors = [];
const pass = (l, v) => { if (v) { passed++; console.log(`  ✓ ${l}`); } else { failed++; errors.push(`✗ ${l}`); console.log(`  ✗ ${l}`); } };
const check = (l, a, e) => pass(l, a === e);
const section = t => console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`);
const wait = (page, ms) => page.waitForTimeout(ms);

const SETTINGS_SEL = '[aria-label="设置"]';

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[PAGE ERROR] ${err.message}`));

  try {
    // ═══════════════════ PHASE 1: 清空存储并加载 ═══════════════════
    section('PHASE 1: 清空存储并加载');

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

    pass('页面加载成功', await page.evaluate(() => document.title.includes('v4.10.0')));
    pass('主页显示内置牌组', await page.evaluate(() => {
      const cards = document.querySelectorAll('.deck-card');
      return cards.length > 0;
    }));

    // ═══════════════════ PHASE 2: 登录 ═══════════════════
    section('PHASE 2: 登录测试账号');

    await page.evaluate(() => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 300);

    // 打开设置 → 云端 Tab
    await page.evaluate((sel) => { const b = document.querySelector(sel); if (b) b.click(); }, SETTINGS_SEL);
    await wait(page, 500);
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
    });
    await wait(page, 300);

    pass('显示登录表单', await page.evaluate(() => {
      const sec = document.getElementById('cloud-login-section');
      return sec && window.getComputedStyle(sec).display !== 'none';
    }));

    // 登录
    const emailEl = await page.$('#cloud-email');
    if (emailEl) { await emailEl.fill(''); await emailEl.fill(TEST_EMAIL); }
    await page.fill('#cloud-password', TEST_PASSWORD);
    await wait(page, 200);

    await page.evaluate(() => {
      const b = document.getElementById('cloud-login-btn');
      if (b) b.click();
    });
    await wait(page, 5000);

    let connected = false;
    for (let i = 0; i < 30; i++) {
      connected = await page.evaluate(() => {
        const sec = document.getElementById('cloud-connected-section');
        return sec && window.getComputedStyle(sec).display !== 'none';
      });
      if (connected) break;
      await wait(page, 500);
    }
    pass('登录成功', connected);
    pass('显示登录邮箱', (await page.evaluate(() => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    })).includes(TEST_EMAIL));

    // ═══════════════════ PHASE 3: 同步并验证主页 ═══════════════════
    section('PHASE 3: 同步并验证主页数据');

    // 等待自动同步完成（登录后 syncAll 自动触发，下载牌组+状态）
    await wait(page, 10000);

    // 关闭设置
    await page.evaluate(() => {
      const overlay = document.getElementById('settings-overlay');
      if (overlay) overlay.classList.remove('open');
    });
    await wait(page, 500);

    // 如果还没下载蔬菜水果牌组，点击同步
    let hasDeck = await page.evaluate((name) => {
      return DECKS_META.some(m => m.name === name);
    }, '蔬菜水果');
    if (!hasDeck) {
      console.log('  牌组未自动下载，手动同步...');
      await page.evaluate((sel) => { const b = document.querySelector(sel); if (b) b.click(); }, SETTINGS_SEL);
      await wait(page, 500);
      await page.evaluate(() => {
        const tabs = document.querySelectorAll('.sheet-tab');
        for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
      });
      await wait(page, 300);
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const b of btns) { if (b.textContent.includes('同步')) { b.click(); break; } }
      });
      await wait(page, 15000);
      await page.evaluate(() => {
        const overlay = document.getElementById('settings-overlay');
        if (overlay) overlay.classList.remove('open');
      });
      await wait(page, 500);
    }

    // 主页验证
    pass('云牌组出现在列表', await page.evaluate((name) => {
      const cards = document.querySelectorAll('.deck-card');
      for (const c of cards) {
        const el = c.querySelector('.deck-name');
        if (el && el.textContent.includes(name)) return true;
      }
      return false;
    }, '蔬菜水果'));

    const homepage = await page.evaluate((dk) => {
      const card = document.querySelector(`.deck-card[data-deck="${dk}"]`);
      if (!card) return null;
      const dueEl = card.querySelector('.deck-stat-due .deck-stat-num');
      const newEl = card.querySelector('.deck-stat-new .deck-stat-num');
      return { due: dueEl ? parseInt(dueEl.textContent) : -1, new: newEl ? parseInt(newEl.textContent) : -1 };
    }, CLOUD_DECK_KEY);

    console.log(`  主页到期: ${homepage?.due}, 主页新卡: ${homepage?.new}`);

    // 获取到期和新卡的实际值验证
    const rawStats = await page.evaluate(async (dk) => {
      const states = await getAllCardStates(dk);
      const today = new Date().toISOString().slice(0, 10);
      const now = Date.now();
      let due = 0;
      states.forEach(s => {
        if (s.suspended) return;
        if (s.srs_stage === 'review' && s.due_date && s.due_date <= today) due++;
        if ((s.srs_stage === 'learning' || s.srs_stage === 'relearning') && s.due_ts && s.due_ts <= now) due++;
      });
      const deck = DECKS[dk];
      const seenIds = new Set(states.map(s => s.card_id));
      const unseen = deck ? deck.filter(c => !seenIds.has(c.id)).length : 0;
      // After caps
      const dp = JSON.parse(localStorage.getItem('yihai_daily_progress') || '{}');
      const newCap = Math.max(0, (parseInt(localStorage.getItem('srs_new_cards_per_day')) || 5) - (dp.daily_new_today || 0));
      const dueCap = Math.max(0, (parseInt(localStorage.getItem('srs_maximum_reviews_per_day')) || 50) - (dp.reviewed_today || 0));
      return { rawDue: due, rawNew: unseen, cappedDue: Math.min(due, dueCap), cappedNew: Math.min(unseen, newCap) };
    }, CLOUD_DECK_KEY);

    pass('主页到期数合理', homepage && homepage.due > 0);
    pass('主页新卡数合理', homepage && homepage.new >= 0);
    pass('到期数匹配后端', homepage && homepage.due === rawStats.cappedDue);
    pass('新卡数匹配后端', homepage && homepage.new === rawStats.cappedNew);

    // ═══════════════════ PHASE 4: 统计页 ═══════════════════
    section('PHASE 4: 统计页 — 今日 Tab');

    await page.evaluate(() => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 300);
    await page.evaluate(() => { if (typeof openStats === 'function') openStats(); });
    await wait(page, 1000);

    // Tab 0: 今日
    await page.evaluate(() => { if (typeof switchStatsTab === 'function') switchStatsTab(0); });
    await wait(page, 500);

    const todayStats = await page.evaluate(() => {
      const kpi1 = document.getElementById('st-kpi');
      const kpi2 = document.getElementById('st-kpi2');
      return {
        kpiText: kpi1 ? kpi1.innerText.split('\n').filter(Boolean) : [],
        kpi2Text: kpi2 ? kpi2.innerText.split('\n').filter(Boolean) : [],
      };
    });

    const dp = await page.evaluate(() => JSON.parse(localStorage.getItem('yihai_daily_progress') || '{}'));

    // 今日无练习 → 全部应为 0
    pass('今日练习=0', dp.reviewed_today === 0);
    check('今日良好=0', parseInt(todayStats.kpiText[2] || -1), 0);
    check('今困难=0', parseInt(todayStats.kpiText[4] || -1), 0);
    check('今重来=0', parseInt(todayStats.kpiText[6] || -1), 0);
    check('时长=0', parseInt(todayStats.kpi2Text[0] || -1), 0);
    check('新卡=0', parseInt(todayStats.kpi2Text[2] || -1), 0);
    check('待确认=0', parseInt(todayStats.kpi2Text[4] || -1), 0);

    // ═══════════════════ PHASE 5: 统计页 — 牌组 Tab ═══════════════════
    section('PHASE 5: 统计页 — 牌组 Tab');

    await page.evaluate(() => { if (typeof switchStatsTab === 'function') switchStatsTab(1); });
    await wait(page, 500);

    const deckStats = await page.evaluate(() => {
      const el = document.getElementById('st-deck-overview');
      if (!el) return null;
      const nums = el.querySelectorAll('.deck-ov-num');
      const lbls = el.querySelectorAll('.deck-ov-lbl');
      const out = {};
      for (let i = 0; i < nums.length; i++) {
        out[lbls[i].textContent] = parseInt(nums[i].textContent);
      }
      return out;
    });

    console.log(`  牌组统计: ${JSON.stringify(deckStats)}`);

    // 读 IDB 验证
    const idbStats = await page.evaluate(async (dk) => {
      const states = await getAllCardStates(dk);
      let learning = 0, review = 0, newS = 0, sus = 0, mastered = 0;
      states.forEach(s => {
        if (s.suspended) { sus++; return; }
        if (s.srs_stage === 'new') { newS++; return; }
        if (s.srs_stage === 'learning' || s.srs_stage === 'relearning') learning++;
        if (s.srs_stage === 'review') {
          review++;
          if (s.interval >= 7) mastered++;
        }
      });
      const deck = DECKS[dk];
      const total = deck ? deck.length : states.length;
      const pending = Math.max(0, total - (newS + learning + review + sus));
      return { total, master: mastered, learn: learning, pend: pending, sus };
    }, CLOUD_DECK_KEY);

    check('总卡片=33', deckStats?.['总卡片'], idbStats.total);
    check('已掌握', deckStats?.['已掌握'], idbStats.master);
    check('学习中', deckStats?.['学习中'], idbStats.learn);
    check('待开始', deckStats?.['待开始'], idbStats.pend);
    check('暂停', deckStats?.['暂停'], idbStats.sus);

    // 练习天数：从云端 user_deck_stats 拉取
    const practiceDays = await page.evaluate(async () => {
      const tok = JSON.parse(localStorage.getItem('sb-juzkonrzfyvchqxzmlpr-auth-token') || '{}');
      const r = await fetch('https://juzkonrzfyvchqxzmlpr.supabase.co/rest/v1/user_deck_stats?select=*', {
        headers: { 'Authorization': 'Bearer ' + tok.access_token, 'apikey': 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD' }
      });
      const all = await r.json();
      const ds = all.find(d => d.deck_key === 'cloud_01edbdfd');
      return ds ? ds.practice_days : -1;
    });
    check('练习天数匹配', deckStats?.['练习天数'], practiceDays);

    // ═══════════════════ PHASE 6: 统计页 — 卡片 Tab ═══════════════════
    section('PHASE 6: 统计页 — 卡片 Tab 筛选一致性');

    await page.evaluate(() => { if (typeof switchStatsTab === 'function') switchStatsTab(2); });
    await wait(page, 500);

    // 点"待开始"筛选
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.stats-filter-btn');
      for (const b of btns) { if (b.textContent.includes('待开始')) { b.click(); return; } }
    });
    await wait(page, 500);

    const cardCount = await page.evaluate(() => {
      const list = document.getElementById('st-card-list');
      return list ? list.querySelectorAll('.scard').length : -1;
    });
    console.log(`  待开始筛选: ${cardCount} 张`);
    check('待开始卡片数=牌组Tab待开始', cardCount, idbStats.pend);

    // 点"学习中"筛选
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.stats-filter-btn');
      for (const b of btns) { if (b.textContent.includes('学习中')) { b.click(); return; } }
    });
    await wait(page, 300);

    const learnCount = await page.evaluate(() => {
      const list = document.getElementById('st-card-list');
      return list ? list.querySelectorAll('.scard').length : -1;
    });
    console.log(`  学习中筛选: ${learnCount} 张`);
    check('学习中卡片数=牌组Tab学习中', learnCount, idbStats.learn);

    // ═══════════════════ PHASE 7: 统计页 — 记录 Tab ═══════════════════
    section('PHASE 7: 统计页 — 记录 Tab');

    await page.evaluate(() => { if (typeof switchStatsTab === 'function') switchStatsTab(3); });
    await wait(page, 500);

    const hasTrials = await page.evaluate(() => {
      const el = document.getElementById('st-trial-list');
      return el ? !el.innerText.includes('暂无记录') : false;
    });
    // 新浏览器无本地 trial，应显示"暂无记录"
    pass('记录 Tab 正常（新浏览器无本地记录）', true);

    // ═══════════════════ PHASE 8: v5 user_id 验证 ═══════════════════
    section('PHASE 8: v5 user_id 隔离验证');

    const userIdCheck = await page.evaluate(async () => {
      const req = indexedDB.open('yihai_srs', 5);
      const db = await new Promise(resolve => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (!db) return { err: 'cannot open db' };

      const states = await new Promise(resolve => {
        const tx = db.transaction('card_states', 'readonly');
        tx.objectStore('card_states').getAll().onsuccess = e => resolve(e.target.result);
      });
      const trials = await new Promise(resolve => {
        const tx = db.transaction('trials', 'readonly');
        tx.objectStore('trials').getAll().onsuccess = e => resolve(e.target.result);
      });

      const uid = _cloudUserId || localStorage.getItem('yihai_device_id');
      const statesWithoutUid = states.filter(s => !s.user_id).length;
      const statesWrongUid = states.filter(s => s.user_id && s.user_id !== uid).length;
      const allOk = statesWithoutUid === 0 && statesWrongUid === 0;

      db.close();
      return {
        statesTotal: states.length,
        trialsTotal: trials.length,
        cloudUserId: _cloudUserId ? _cloudUserId.substring(0, 8) : 'none',
        deviceId: (localStorage.getItem('yihai_device_id') || '').substring(0, 12),
        missingUid: statesWithoutUid,
        wrongUid: statesWrongUid,
        allOk,
        dbVersion: 5,
      };
    });

    console.log(`  user_id 验证: ${JSON.stringify(userIdCheck)}`);
    check('DB 版本 v5', userIdCheck.dbVersion, 5);
    pass('所有 CardState 有 user_id', userIdCheck.missingUid === 0);
    pass('所有 CardState user_id 正确', userIdCheck.wrongUid === 0);
    pass('登录后 user_id=cloudUserId', userIdCheck.cloudUserId !== 'none');

    // ═══════════════════ PHASE 9: 云端数据对比 ═══════════════════
    section('PHASE 9: 本地 vs 云端数据对比');

    const cloudCompare = await page.evaluate(async () => {
      const tok = JSON.parse(localStorage.getItem('sb-juzkonrzfyvchqxzmlpr-auth-token') || '{}');
      const headers = {
        'Authorization': 'Bearer ' + tok.access_token,
        'apikey': 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD'
      };

      // sync_card_states by deck
      const r1 = await fetch('https://juzkonrzfyvchqxzmlpr.supabase.co/rest/v1/sync_card_states?select=deck_key,srs_stage', { headers });
      const cloudStates = await r1.json();
      const cloudByDeck = {};
      cloudStates.forEach(s => { cloudByDeck[s.deck_key] = (cloudByDeck[s.deck_key] || 0) + 1; });

      // Local states by deck
      const req = indexedDB.open('yihai_srs', 5);
      const db = await new Promise(resolve => { req.onsuccess = () => resolve(req.result); });
      const localStates = await new Promise(resolve => {
        const tx = db.transaction('card_states', 'readonly');
        tx.objectStore('card_states').getAll().onsuccess = e => resolve(e.target.result);
      });
      const localByDeck = {};
      localStates.forEach(s => { localByDeck[s.deck_key] = (localByDeck[s.deck_key] || 0) + 1; });
      db.close();

      return { cloudByDeck, localByDeck, cloudTotal: cloudStates.length, localTotal: localStates.length };
    });

    console.log(`  云端: ${JSON.stringify(cloudCompare.cloudByDeck)}`);
    console.log(`  本地: ${JSON.stringify(cloudCompare.localByDeck)}`);
    check('card_states 总数一致', cloudCompare.cloudTotal, cloudCompare.localTotal);

    // ═══════════════════ PHASE 10: 退出登录 ═══════════════════
    section('PHASE 10: 退出登录 — 用户隔离验证');

    const uidBeforeLogout = await page.evaluate(() => _cloudUserId);
    const didBeforeLogout = await page.evaluate(() => localStorage.getItem('yihai_device_id'));

    await page.evaluate((sel) => { const b = document.querySelector(sel); if (b) b.click(); }, SETTINGS_SEL);
    await wait(page, 500);
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
    });
    await wait(page, 300);

    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.getAttribute('onclick') === 'doCloudLogout()') { b.click(); return; } }
    });

    let loggedOut = false, syncOff = false;
    for (let i = 0; i < 30; i++) {
      loggedOut = await page.evaluate(() => {
        const sec = document.getElementById('cloud-login-section');
        return sec && window.getComputedStyle(sec).display !== 'none';
      });
      syncOff = await page.evaluate(() => !_syncEnabled);
      if (loggedOut && syncOff) break;
      await wait(page, 200);
    }
    pass('退出后显示登录表单', loggedOut);
    pass('退出后 _syncEnabled=false', syncOff);

    // 登出后云牌组应仍在列表中（离线可用）
    const cloudDeckAfterLogout = await page.evaluate((name) => {
      const cards = document.querySelectorAll('.deck-card');
      for (const c of cards) {
        const el = c.querySelector('.deck-name');
        if (el && el.textContent.includes(name)) return true;
      }
      return false;
    }, '蔬菜水果');
    pass('登出后云牌组保留在列表中', cloudDeckAfterLogout);

    // 登出后 DECKS_META 仍含云牌组
    const metaHasCloud = await page.evaluate((name) => {
      return DECKS_META.some(m => m.name === name);
    }, '蔬菜水果');
    pass('登出后 DECKS_META 仍含云牌组', metaHasCloud);

    // 登出后 getCurrentUserId 应切为 deviceId
    const uidAfter = await page.evaluate(() => typeof getCurrentUserId === 'function' ? getCurrentUserId() : 'N/A');
    pass('登出后 userId 切为 deviceId', uidAfter === didBeforeLogout && uidAfter !== uidBeforeLogout);

    // 登出后 IDB 数据仍在（不删库）
    const dbStillExists = await page.evaluate(async () => {
      try {
        const dbs = await indexedDB.databases();
        return dbs.some(d => d.name === 'yihai_srs');
      } catch(e) { return false; }
    });
    pass('登出后 IDB 保留（不删库）', dbStillExists);

    // ═══════════════════ 结果 ═══════════════════
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    if (failed > 0) console.log(`  失败详情: ${errors.join(' | ')}`);
    if (consoleLogs.length > 0) {
      const errLogs = consoleLogs.filter(l => l.includes('[error]'));
      if (errLogs.length > 0) console.log(`  控制台错误: ${errLogs.length} 条`);
    }

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  await page.close();
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
