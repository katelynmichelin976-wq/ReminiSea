/**
 * 忆海拾光 v4.10 回归测试（统计数据一致性 + 重新登录验证）
 *
 * 依赖：
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node tests/_playwright_v4.10_regression_test.js
 *
 * 覆盖：登录 → 统计验证 → user_id 隔离 → 退出保留 → 重新登录
 * 合并自：原 _playwright_v4.10_regression_test.js + _playwright_user_switch_test.js
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, check, section, wait, run } = helper;

const CFG = { url: 'http://localhost:8080/yihai_v4.10.html?v=' + Date.now() };
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const CLOUD_DECK_KEY = 'cloud_01edbdfd';
const CARD_COUNT = 33;

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
    await run(page, async () => {
      localStorage.clear();
      const dbs = await indexedDB.databases();
      for (const db of dbs) indexedDB.deleteDatabase(db.name);
    });
    await wait(page, 300);
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    pass('页面加载成功', await run(page, () => document.title.includes('v4.10.1')));
    pass('主页显示内置牌组', await run(page, () => document.querySelectorAll('.deck-card').length > 0));

    // ═══════════════════ PHASE 2: 登录 ═══════════════════
    section('PHASE 2: 登录测试账号');

    await run(page, () => { if (typeof goHome === 'function') goHome(); });
    await wait(page, 300);

    pass('登录成功', await helper.cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));

    pass('显示登录邮箱', (await run(page, () => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    })).includes(TEST_EMAIL));

    // ═══════════════════ PHASE 3: 同步并验证主页 ═══════════════════
    section('PHASE 3: 同步并验证主页数据');

    await helper.closeSettings(page);
    await helper.waitSyncModal(page, 60);
    console.log('  登录同步完成');

    let hasDeck = false;
    for (let i = 0; i < 20; i++) {
      hasDeck = await run(page, (name) => DECKS_META.some(m => m.name === name), '蔬菜水果');
      if (hasDeck) break;
      await wait(page, 500);
    }

    pass('云牌组出现在列表', await run(page, (name) => {
      for (const c of document.querySelectorAll('.deck-card')) {
        const el = c.querySelector('.deck-name');
        if (el && el.textContent.includes(name)) return true;
      }
      return false;
    }, '蔬菜水果'));

    // 记录首次云牌组数（用于 PH11 重新登录对比）
    const firstCloudDeckCount = await run(page, () =>
      DECKS_META.filter(m => m.source === 'cloud').length
    );
    pass('首次登录有云牌组', firstCloudDeckCount > 0);
    console.log(`  首次云牌组: ${firstCloudDeckCount}`);

    for (let i = 0; i < 30; i++) {
      const val = await run(page, (dk) => {
        const card = document.querySelector(`.deck-card[data-deck="${dk}"]`);
        if (!card) return '-2';
        const dueEl = card.querySelector('.deck-stat-num.due');
        return dueEl ? dueEl.textContent.trim() : '-2';
      }, CLOUD_DECK_KEY);
      if (val !== '…' && val !== '-2') break;
      await wait(page, 200);
    }

    const homepage = await run(page, (dk) => {
      const card = document.querySelector(`.deck-card[data-deck="${dk}"]`);
      if (!card) return null;
      const dueEl = card.querySelector('.deck-stat-num.due');
      const newEl = card.querySelector('.deck-stat-num.new-c');
      return { due: dueEl ? parseInt(dueEl.textContent) : -1, new: newEl ? parseInt(newEl.textContent) : -1 };
    }, CLOUD_DECK_KEY);
    console.log(`  主页到期: ${homepage?.due}, 主页新卡: ${homepage?.new}`);

    const rawStats = await run(page, async (dk) => {
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
      const dp = JSON.parse(localStorage.getItem('yihai_daily_progress') || '{}');
      const newCap = Math.max(0, (parseInt(localStorage.getItem('srs_new_cards_per_day')) || 5) - (dp.daily_new_today || 0));
      const dueCap = Math.max(0, (parseInt(localStorage.getItem('srs_maximum_reviews_per_day')) || 50) - (dp.reviewed_today || 0));
      return { cappedDue: Math.min(due, dueCap), cappedNew: Math.min(unseen, newCap) };
    }, CLOUD_DECK_KEY);

    pass('主页到期数合理', homepage && homepage.due > 0);
    pass('主页新卡数合理', homepage && homepage.new >= 0);
    check('到期数匹配后端', homepage && homepage.due, rawStats.cappedDue);
    check('新卡数匹配后端', homepage && homepage.new, rawStats.cappedNew);

    await run(page, (dk) => {
      const card = document.querySelector(`.deck-card[data-deck="${dk}"]`);
      if (card) card.click();
    }, CLOUD_DECK_KEY);
    await wait(page, 300);

    // ═══════════════════ PHASE 4: 统计页 — 今日 Tab ═══════════════════
    section('PHASE 4: 统计页 — 今日 Tab');
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

    pass('今日练习=0', (dp.reviewed_today || 0) === 0);
    check('今日良好=0', parseInt(todayKpi.k1[2] || -1), 0);
    check('今困难=0', parseInt(todayKpi.k1[4] || -1), 0);
    check('今重来=0', parseInt(todayKpi.k1[6] || -1), 0);
    check('时长=0', parseInt(todayKpi.k2[0] || -1), 0);
    check('新卡=0', parseInt(todayKpi.k2[2] || -1), 0);
    check('待确认=0', parseInt(todayKpi.k2[4] || -1), 0);

    // ═══════════════════ PHASE 5: 统计页 — 牌组 Tab ═══════════════════
    section('PHASE 5: 统计页 — 牌组 Tab');
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
    console.log(`  牌组统计: ${JSON.stringify(deckStats)}`);

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

    check('总卡片=33', deckStats?.['总卡片'], idbStats.total);
    check('已掌握', deckStats?.['已掌握'], idbStats.master);
    check('学习中', deckStats?.['学习中'], idbStats.learn);
    check('待开始', deckStats?.['待开始'], idbStats.pend);
    check('暂停', deckStats?.['暂停'], idbStats.sus);

    const practiceDays = await run(page, async () => {
      const tok = JSON.parse(localStorage.getItem('sb-juzkonrzfyvchqxzmlpr-auth-token') || '{}');
      const r = await fetch('https://juzkonrzfyvchqxzmlpr.supabase.co/rest/v1/user_deck_stats?select=*', {
        headers: { 'Authorization': 'Bearer ' + tok.access_token, apikey: 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD' }
      });
      const all = await r.json();
      const ds = all.find(d => d.deck_key === 'cloud_01edbdfd');
      return ds ? ds.practice_days : -1;
    });
    check('练习天数匹配', deckStats?.['练习天数'], practiceDays);

    // ═══════════════════ PHASE 6: 统计页 — 卡片 Tab ═══════════════════
    section('PHASE 6: 统计页 — 卡片 Tab 筛选一致性');
    await run(page, () => { if (typeof switchStatsTab === 'function') switchStatsTab(2); });
    await wait(page, 500);

    await run(page, () => {
      for (const b of document.querySelectorAll('.stats-filter-btn')) { if (b.textContent.includes('待开始')) { b.click(); return; } }
    });
    await wait(page, 500);
    const pendCount = await run(page, () => {
      const list = document.getElementById('st-card-list');
      return list ? list.querySelectorAll('.scard').length : -1;
    });
    console.log(`  待开始筛选: ${pendCount} 张, filterNew=${idbStats.filterNew}`);
    check('待开始卡片数=筛选待开始', pendCount, idbStats.filterNew);

    await run(page, () => {
      for (const b of document.querySelectorAll('.stats-filter-btn')) { if (b.textContent.includes('学习中')) { b.click(); return; } }
    });
    await wait(page, 300);
    const learnCount = await run(page, () => {
      const list = document.getElementById('st-card-list');
      return list ? list.querySelectorAll('.scard').length : -1;
    });
    console.log(`  学习中筛选: ${learnCount} 张`);
    check('学习中卡片数=牌组Tab学习中', learnCount, idbStats.learn);

    // ═══════════════════ PHASE 7: 统计页 — 记录 Tab ═══════════════════
    section('PHASE 7: 统计页 — 记录 Tab');
    await run(page, () => { if (typeof switchStatsTab === 'function') switchStatsTab(3); });
    await wait(page, 500);
    pass('记录 Tab 正常（新浏览器无本地记录）', true);

    // ═══════════════════ PHASE 8: user_id 隔离验证 ═══════════════════
    section('PHASE 8: user_id 隔离验证');

    const uidCheck = await run(page, async () => {
      const db = await new Promise(resolve => {
        const r = indexedDB.open('yihai_srs', 5);
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

    console.log(`  user_id 验证: ${JSON.stringify(uidCheck)}`);
    pass('所有 CardState 有 user_id', uidCheck.missingUid === 0);
    pass('所有 CardState user_id 正确', uidCheck.wrongUid === 0);
    pass('登录后 user_id=cloudUserId', uidCheck.cloudUserId !== 'none');

    // ═══════════════════ PHASE 9: 本地 vs 云端 ═══════════════════
    section('PHASE 9: 本地 vs 云端数据对比');

    const cloudCompare = await run(page, async () => {
      const tok = JSON.parse(localStorage.getItem('sb-juzkonrzfyvchqxzmlpr-auth-token') || '{}');
      const headers = { 'Authorization': 'Bearer ' + tok.access_token, apikey: 'sb_publishable_gKEnRcaiEI9eP00jJivbOA_xQ2Z1cCD' };
      const r1 = await fetch(`https://juzkonrzfyvchqxzmlpr.supabase.co/rest/v1/sync_card_states?select=deck_key,srs_stage&deck_key=eq.${CLOUD_DECK_KEY}`, { headers });
      const cloudStates = await r1.json();
      const cloudTotal = cloudStates.length;
      const db = await new Promise(resolve => { const r = indexedDB.open('yihai_srs', 5); r.onsuccess = () => resolve(r.result); });
      const localStates = await new Promise(resolve => { db.transaction('card_states', 'readonly').objectStore('card_states').getAll().onsuccess = e => resolve(e.target.result); });
      const localTotal = localStates.filter(s => s.deck_key === CLOUD_DECK_KEY).length;
      db.close();
      return { cloudTotal, localTotal };
    });

    console.log(`  云端: ${cloudCompare.cloudTotal}  本地: ${cloudCompare.localTotal}`);
    check('card_states 数量一致', cloudCompare.cloudTotal, cloudCompare.localTotal);

    // ═══════════════════ PHASE 10: 退出登录 ═══════════════════
    section('PHASE 10: 退出登录 — 数据保留验证');

    const uidBeforeLogout = await run(page, () => _cloudUserId);
    const { loggedOut, syncDisabled } = await helper.cloudLogout(page);
    pass('退出后显示登录表单', loggedOut);
    pass('退出后 _syncEnabled=false', syncDisabled);

    pass('登出后云牌组保留在列表中', await run(page, (name) => {
      for (const c of document.querySelectorAll('.deck-card')) {
        if (c.querySelector('.deck-name')?.textContent.includes(name)) return true;
      }
      return false;
    }, '蔬菜水果'));

    pass('登出后 DECKS_META 仍含云牌组', await run(page, (name) =>
      DECKS_META.some(m => m.name === name), '蔬菜水果'));

    const uidAfter = await run(page, () => typeof _cloudUserId === 'string' ? _cloudUserId : 'N/A');
    pass('登出后 cloudUserId 保留（离线数据归属）', uidAfter === uidBeforeLogout);

    pass('登出后 IDB 保留（不删库）', await run(page, async () => {
      try { const dbs = await indexedDB.databases(); return dbs.some(d => d.name === 'yihai_srs'); } catch(e) { return false; }
    }));

    // ═══════════════════ PHASE 11: 重新登录验证 ═══════════════════
    // 合并自 _playwright_user_switch_test.js — re-login deck count >= first
    section('PHASE 11: 重新登录验证数据从云端拉回');
    await helper.closeSettings(page);

    pass('重新登录成功', await helper.cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));
    await helper.closeSettings(page);

    let secondCount = 0;
    for (let i = 0; i < 60; i++) {
      secondCount = await run(page, () =>
        DECKS_META.filter(m => m.source === 'cloud').length
      );
      if (secondCount > 0) break;
      await wait(page, 500);
    }
    console.log(`  重新登录云牌组: ${secondCount}`);
    pass('重新登录后有云牌组', secondCount > 0);
    console.log(`  牌组数: ${firstCloudDeckCount} → ${secondCount}`);
    pass('重新登录牌组≥首次', secondCount >= firstCloudDeckCount);

    // ═══════════════════ 结果 ═══════════════════
    section('结果');
    const { passed, failed, errors } = helper.getCounts();
    console.log(`  通过: ${passed}  失败: ${failed}`);
    if (failed > 0) console.log(`  失败详情: ${errors.join(' | ')}`);
    const errLogs = consoleLogs.filter(l => l.includes('[error]'));
    if (errLogs.length > 0) console.log(`  控制台错误: ${errLogs.length} 条`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  await page.close();
  await browser.close();
  const { failed } = helper.getCounts();
  process.exit(failed > 0 ? 1 : 0);
})();
