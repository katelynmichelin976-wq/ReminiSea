/**
 * 忆海拾光 云端同步回归测试 — v5.1+
 * 依赖：python -m http.server 8080 --directory C:\code
 *        $env:TEST_PASSWORD="xxx"
 * 运行：$env:TEST_PASSWORD="xxx"; node tests/_pw_cloud_sync.js
 *
 * 覆盖：登录 → decks 表下载 → 练习同步 → session restore → user_id 隔离
 *        → 登出数据保留 → 重新登录 → if(!_sb) 双客户端防护
 *        → 意见反馈 E2E（登录态真实写库，31 断言）
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, check, section, wait, run, getCounts, getBaseUrl, cloudLogin, cloudLogout } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhaff@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const TEST_DECK_NAME = '蔬菜水果';

/** 等待 _syncInFlight 变 false（登录后自动同步完成），最长 120s */
async function waitSyncDone(page) {
  for (let i = 0; i < 240; i++) {
    const inFlight = await run(page, () => typeof _syncInFlight !== 'undefined' ? _syncInFlight : false);
    if (!inFlight) return true;
    await wait(page, 500);
  }
  return false;
}

/** 等待 DECKS_META 包含目标 deck — runSync watchdog 30s 后会强置 _syncInFlight=false，但下载仍在后台继续 */
async function waitDeckInMeta(page, deckName, maxMs) {
  const iters = Math.ceil((maxMs || 120000) / 500);
  for (let i = 0; i < iters; i++) {
    const found = await run(page, (name) =>
      typeof DECKS_META !== 'undefined' && DECKS_META.some(m => m.name && m.name.includes(name))
    , deckName);
    if (found) return true;
    await wait(page, 500);
  }
  return false;
}

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', err => console.log(`  [PAGE ERROR] ${err.message}`));
  await helper.startCoverage(page);

  try {
    // ════ PHASE 1: 清空存储 ════
    section('PHASE 1: 清空存储');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);
    await run(page, async () => {
      localStorage.clear();
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) indexedDB.deleteDatabase(db.name);
      } catch (e) { /* ignore */ }
    });
    await wait(page, 300);
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    // ════ PHASE 2: 登录 ════
    section('PHASE 2: 登录');
    pass('登录成功', await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));
    pass('显示登录邮箱', (await run(page, () => _cloudUserEmail || '')).includes(TEST_EMAIL));

    // ════ PHASE 3: 下载云端牌组（decks 表，v5.1.4 schema）════
    section('PHASE 3: 下载云端牌组（decks 表）');
    // 用新 decks 表查询预设牌组
    const presetsOnServer = await run(page, async () => {
      try {
        const { data } = await _sb.from('decks').select('id,name').eq('deck_type', 'preset');
        return data ? data.map(d => d.name) : [];
      } catch (e) { return []; }
    });
    pass('decks 表有预设牌组', presetsOnServer.length > 0);

    // v5.13.12+: 登录不再自动下载 preset，需显式调用 runSync({ decks: true })
    // 先等登录 sync 完成再发起 deck 下载（等 500ms 让 _syncInFlight 先变 true）
    await wait(page, 500);
    await waitSyncDone(page);
    await run(page, () => runSync({ decks: true }));
    pass('云端 deck 加入 DECKS_META', await waitDeckInMeta(page, TEST_DECK_NAME, 120000));

    await run(page, () => goHome());
    await wait(page, 500);

    const deckFound = await run(page, (name) => {
      const cards = Array.from(document.querySelectorAll('.deck-card'));
      return cards.some(c => {
        const nm = c.querySelector('.deck-name');
        return nm && nm.textContent.includes(name);
      });
    }, TEST_DECK_NAME);
    pass('云端牌组出现在首页列表', deckFound);
    pass('DECKS_META 包含牌组', await run(page, (name) =>
      DECKS_META.some(m => m.name && m.name.includes(name))
    , TEST_DECK_NAME));

    // ════ PHASE 4: 练习并验证同步 ════
    section('PHASE 4: 练习并验证同步');
    const deckKey = await run(page, (name) => {
      const m = DECKS_META.find(d => d.name && d.name.includes(name));
      return m ? m.key : null;
    }, TEST_DECK_NAME);

    let practicedCards = 0;
    if (deckKey) {
      await run(page, (key) => { currentDeck = key; }, deckKey);
      await wait(page, 300);
      await run(page, () => { _launchBusy = false; onFabTap(); });
      await wait(page, 1500);

      const inQuiz = await run(page, () =>
        document.getElementById('screen-quiz')?.classList.contains('active')
      );
      pass('进入练习屏', inQuiz);

      if (inQuiz) {
        // 答 3 题
        for (let i = 0; i < 3; i++) {
          const done = await run(page, () =>
            document.getElementById('screen-finish')?.classList.contains('active') ||
            document.getElementById('screen-home')?.classList.contains('active')
          );
          if (done) break;

          const answered = await run(page, () => {
            const q = typeof Qs !== 'undefined' ? Qs[qIdx] : null;
            if (!q) return false;
            const isRevealed = document.getElementById('content')?.classList.contains('revealed');
            if (isRevealed) {
              const btn = document.getElementById('nxtbtn');
              if (btn) btn.click();
              return 'next';
            }
            const opts = Array.from(document.querySelectorAll('#opts .opt'));
            if (opts.length === 0) return false;
            const correct = opts.find(b => parseInt(b.dataset.idx) === q.correct);
            (correct || opts[0]).dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            return true;
          });
          if (answered === true) practicedCards++;
          await wait(page, 500);
          if (answered === 'next') continue;
          // 翻牌后下一题
          await run(page, () => {
            const btn = document.getElementById('nxtbtn');
            if (btn) btn.click();
          });
          await wait(page, 400);
        }
      }
    } else {
      pass('进入练习屏', false);
    }

    pass('练习至少 1 张卡', practicedCards > 0);
    await run(page, () => goHome());
    await wait(page, 1000);

    const localData = await run(page, async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const states = await new Promise(res => {
        const r = db.transaction('sync_card_states', 'readonly').objectStore('sync_card_states').getAll();
        r.onsuccess = () => res(r.result);
      });
      const trials = await new Promise(res => {
        const r = db.transaction('sync_trials', 'readonly').objectStore('sync_trials').getAll();
        r.onsuccess = () => res(r.result);
      });
      return { states: states.length, trials: trials.length };
    });
    pass('本地有 CardState', localData.states > 0);
    pass('本地有 TrialLog', localData.trials > 0);

    // ════ PHASE 5: 配置同步推送 ════
    section('PHASE 5: 配置同步推送');
    const pushOk = await run(page, async () => {
      try { await cloudPushConfig(); return true; } catch (e) { return false; }
    });
    pass('配置推送成功', pushOk);

    // ════ PHASE 6: 刷新后 session 恢复 ════
    section('PHASE 6: 刷新后 session 恢复');
    await page.reload({ waitUntil: 'networkidle' });
    await wait(page, 3000);
    pass('刷新后 UI 已渲染', await run(page, () => !!document.querySelector('.home-version')));

    // session 恢复后需先导航到账户屏，用 showAccount() 同时触发 renderAccount()
    await run(page, () => { if (typeof showAccount === 'function') showAccount(); else showScreen('screen-account'); });
    await wait(page, 500);

    let restored = false;
    for (let i = 0; i < 20; i++) {
      restored = await run(page, () => {
        const sec = document.getElementById('account-state-logged-in');
        return sec && getComputedStyle(sec).display !== 'none';
      });
      if (restored) break;
      await wait(page, 500);
    }
    pass('刷新后自动恢复登录', restored);
    pass('刷新后邮箱显示正确', (await run(page, () => _cloudUserEmail || '')).includes(TEST_EMAIL));

    await run(page, () => goHome());
    await wait(page, 300);
    pass('刷新后牌组列表不为空', await run(page, () =>
      document.querySelectorAll('.deck-card').length > 0
    ));

    // ════ PHASE 7: user_id 隔离 ════
    section('PHASE 7: user_id 隔离');
    const uidCheck = await run(page, async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const states = await new Promise(res => {
        const r = db.transaction('sync_card_states', 'readonly').objectStore('sync_card_states').getAll();
        r.onsuccess = () => res(r.result);
      });
      const cloudId = typeof _cloudUserId !== 'undefined' ? _cloudUserId : 'none';
      const missing = states.filter(s => !s.user_id).length;
      const wrong = states.filter(s => s.user_id && s.user_id !== cloudId).length;
      return { total: states.length, missingUid: missing, wrongUid: wrong, cloudUserId: cloudId };
    });
    pass('所有 CardState 有 user_id', uidCheck.missingUid === 0);
    pass('所有 CardState user_id 正确', uidCheck.wrongUid === 0);
    pass('cloudUserId 不为空', uidCheck.cloudUserId !== 'none');

    // ════ PHASE 8: 退出登录，数据保留 ════
    section('PHASE 8: 退出登录');
    const uidBeforeLogout = uidCheck.cloudUserId;
    const firstDeckCount = await run(page, () => document.querySelectorAll('.deck-card').length);

    const { loggedOut, syncDisabled } = await cloudLogout(page);
    pass('退出后显示未登录态', loggedOut);
    pass('退出后 _syncEnabled=false', syncDisabled);

    await run(page, () => goHome());
    await wait(page, 500);

    pass('登出后云牌组保留在列表', await run(page, () =>
      document.querySelectorAll('.deck-card').length > 0
    ));
    pass('登出后 IDB 保留（不清库）', await run(page, async () => {
      try {
        const dbs = await indexedDB.databases();
        return dbs.some(d => d.name === 'yihai_srs');
      } catch (e) { return true; }
    }));
    pass('登出后 cloudUserId 保留', await run(page, (uid) => {
      const id = typeof _cloudUserId !== 'undefined' ? _cloudUserId : 'none';
      return id === uid;
    }, uidBeforeLogout));

    // ════ PHASE 9: 重新登录 ════
    section('PHASE 9: 重新登录');
    pass('重新登录成功', await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));
    // 等待重新登录触发的同步完成
    await waitSyncDone(page);
    await run(page, () => goHome());
    await wait(page, 500);
    const secondCount = await run(page, () => document.querySelectorAll('.deck-card').length);
    pass('重新登录后有云牌组', secondCount > 0);
    pass('重新登录牌组数 ≥ 首次', secondCount >= firstDeckCount);

    // ════ PHASE 10: if (!_sb) 双客户端防护回归 ════
    section('PHASE 10: if (!_sb) 防护 — 二次登录不替换已有 _sb 实例');
    // 此时已登录，_sb 应存在
    const sbExists = await run(page, () => typeof _sb !== 'undefined' && _sb !== null);
    pass('前置条件：_sb 实例已存在', sbExists);

    if (sbExists) {
      // 给当前 _sb 客户端打标记
      await run(page, () => { _sb.__testMarker = 'original'; });

      // 导航到账号页，填表再次触发 doAccountLogin()
      await run(page, () => { showScreen('screen-account'); });
      await wait(page, 500);
      await run(page, ({ em, pw }) => {
        const e = document.getElementById('account-email');
        const p = document.getElementById('account-password');
        if (e) e.value = em;
        if (p) p.value = pw;
        const b = document.getElementById('account-login-btn');
        if (b) b.click();
      }, { em: TEST_EMAIL, pw: TEST_PASSWORD });
      // 等登录完成（signInWithPassword + onAuthStateChange）
      await wait(page, 8000);

      // _sb 引用的标记应仍然存在（未被重新创建）
      const markerPreserved = await run(page, () =>
        typeof _sb !== 'undefined' && _sb !== null && _sb.__testMarker === 'original'
      );
      pass('二次登录后 _sb 实例未被替换（if (!_sb) 防护生效）', markerPreserved);
    }

    // ════ PHASE 11: 意见反馈 E2E（登录态真实写库）════
    section('PHASE 11: 意见反馈 E2E — 已登录，真实写入 feedback 表');
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 200);

    // 直接调用 submitFeedback，验证主通道（Supabase INSERT）成功
    const fbDesc = 'Playwright E2E 自动测试 ' + Date.now();
    const fbResult = await run(page, async (desc) => {
      try { return await submitFeedback(desc); } catch(e) { return 'error:' + e.message; }
    }, fbDesc);
    pass('submitFeedback 已登录 → 主通道 success', fbResult === 'success');

    // 成功路径不写 pending，localStorage 应无暂存
    pass('success 路径无 yihaiPendingFeedback 暂存', await run(page, () =>
      !localStorage.getItem('yihaiPendingFeedback')
    ));

    // UI 路径：开 sheet → 填文字 → await handleFeedbackSend() → 验证按钮成功文字
    await run(page, () => showScreen('screen-mine'));
    await wait(page, 300);
    await run(page, () => openFeedbackSheet());
    await wait(page, 300);
    pass('feedback sheet 已打开', await run(page, () => {
      const el = document.getElementById('feedback-overlay');
      return el && el.style.display !== 'none';
    }));
    await run(page, () => {
      const ta = document.getElementById('feedback-textarea');
      if (ta) { ta.value = 'UI路径 E2E 测试'; ta.dispatchEvent(new Event('input')); }
    });
    await wait(page, 200);
    // 直接 await handleFeedbackSend()，确保 Supabase 请求完成后立即读按钮文字
    const uiSendResult = await run(page, async () => {
      try { await handleFeedbackSend(); } catch(e) { return 'ERROR:' + e.message; }
      return document.getElementById('feedback-send-btn')?.textContent || '';
    });
    pass('UI 点击发送 → 按钮显示「✓ 已发送」', uiSendResult.includes('已发送'));

  } finally {
    const { passed, failed } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    await helper.stopAndCollectCoverage(page, '_pw_cloud_sync');
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
