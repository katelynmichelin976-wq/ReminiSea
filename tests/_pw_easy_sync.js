/**
 * 忆海拾光 Easy 模式跨设备同步测试 — v5.11+
 * 依赖：python -m http.server 8080 --directory C:\code
 *        $env:TEST_PASSWORD="xxx"
 * 运行：$env:TEST_PASSWORD="xxx"; node tests/_pw_easy_sync.js
 *
 * 覆盖：设备 A 练 easy → trial 上传 → trigger 维护 easy_card_states
 *       → 设备 B pull → IDB 合并 → last_warmup 仅本地
 *       → 双向: B 续练 → A 重 pull → 进度合并
 *
 * 独立脚本，不依赖 _pw_cross_device.js 的其它 phase
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhaff@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const TEST_DECK_NAME = '蔬菜水果';   // 与 _pw_cross_device 相同的内置测试牌组
const SESSION_SIZE = 7;               // 小一点避免长循环

async function waitSyncDone(page, maxWait) {
  const iterations = Math.ceil((maxWait || 60000) / 500);
  for (let i = 0; i < iterations; i++) {
    const done = await run(page, () => typeof _syncInFlight === 'undefined' || !_syncInFlight);
    if (done) return true;
    await wait(page, 500);
  }
  return false;
}

async function setupDevice(page, label) {
  await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(page, 2000);
  await run(page, async () => {
    localStorage.clear();
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) indexedDB.deleteDatabase(db.name);
    } catch (e) {}
  });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(page, 2000);
  pass(`${label} 登录成功`, await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));
  await waitSyncDone(page, 120000);
  await run(page, () => goHome());
  await wait(page, 500);
}

async function findTestDeckKey(page) {
  return await run(page, (name) => {
    const m = DECKS_META.find(d => d.name && d.name.includes(name));
    return m ? m.key : null;
  }, TEST_DECK_NAME);
}

async function runEasySessionAllCorrect(page, expected) {
  let answered = 0;
  for (let i = 0; i < expected + 10; i++) {
    const finished = await run(page, () =>
      document.getElementById('screen-finish')?.classList.contains('active') ||
      document.getElementById('screen-home')?.classList.contains('active'));
    if (finished) break;
    const state = await run(page, () => {
      if (typeof Qs === 'undefined' || qIdx >= Qs.length) return 'noq';
      const isRevealed = document.getElementById('content')?.classList.contains('revealed');
      if (isRevealed) return 'revealed';
      const q = Qs[qIdx];
      const opts = Array.from(document.querySelectorAll('#opts .opt'));
      if (!opts.length) return 'noopts';
      const correctBtn = opts.find(b => parseInt(b.dataset.idx) === q.correct);
      (correctBtn || opts[0]).dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return 'answered';
    });
    if (state === 'noq' || state === 'noopts') { await wait(page, 250); continue; }
    if (state === 'revealed') {
      await run(page, () => { const b = document.getElementById('nxtbtn'); if (b) b.click(); });
      answered++; await wait(page, 350); continue;
    }
    await wait(page, 550);
    const rev = await run(page, () =>
      document.getElementById('content')?.classList.contains('revealed'));
    if (rev) {
      await run(page, () => { const b = document.getElementById('nxtbtn'); if (b) b.click(); });
      answered++; await wait(page, 350);
    }
  }
  return answered;
}

(async () => {
  if (!TEST_PASSWORD) {
    console.error('FATAL: 请设置 TEST_PASSWORD 环境变量');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await ctxA.newPage();
  pageA.on('pageerror', e => console.log(`  [A PAGE ERROR] ${e.message}`));
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageB = await ctxB.newPage();
  pageB.on('pageerror', e => console.log(`  [B PAGE ERROR] ${e.message}`));

  try {
    // ════ PHASE 0: A/B 登录 + 拉到测试牌组 ════
    section('PHASE 0: 设备 A/B 登录');
    await setupDevice(pageA, '设备 A');
    const deckKey = await findTestDeckKey(pageA);
    pass('设备 A 找到测试牌组', !!deckKey);
    if (!deckKey) throw new Error('找不到测试牌组');

    await setupDevice(pageB, '设备 B');
    const deckKeyB = await findTestDeckKey(pageB);
    pass('设备 B 同步到相同测试牌组', deckKeyB === deckKey);

    // ════ PHASE 1: 清云端测试 cleanup（删之前 run 留下的 easy_card_states）════
    section('PHASE 1: 清云端遗留 easy_card_states');
    const cleanup = await run(pageA, async (key) => {
      try {
        const { error } = await _sb.from('easy_card_states').delete().eq('deck_key', key);
        return error ? error.message : 'ok';
      } catch (e) { return e.message; }
    }, deckKey);
    pass('清云端 easy_card_states', cleanup === 'ok');

    // 同时清两台设备的 IDB easyCardStates 与水位（确保从零开始）
    for (const page of [pageA, pageB]) {
      await run(page, async (key) => {
        localStorage.removeItem('yihaiEasyPulledAt');
        try {
          const db = await openSrsDb();
          const tx = db.transaction(EASY_STORE, 'readwrite');
          const idx = tx.objectStore(EASY_STORE).index('deck_key');
          const req = idx.getAll(IDBKeyRange.only(key));
          await new Promise(res => {
            req.onsuccess = () => {
              const all = req.result || [];
              const tx2 = db.transaction(EASY_STORE, 'readwrite');
              const st = tx2.objectStore(EASY_STORE);
              for (const s of all) st.delete([s.deck_key, s.card_id]);
              tx2.oncomplete = () => res();
            };
          });
        } catch (e) {}
      }, deckKey);
    }

    // ════ PHASE 2: 设备 A 跑 easy session ════
    section('PHASE 2: 设备 A 练 easy session');
    await run(pageA, () => {
      setSrsMode('easy');
      SRS_CONFIG.easy_session_size = 7;
      SRS_CONFIG.easy_retry_on_wrong = true;
      Object.keys(localStorage).forEach(k => { if (k.startsWith('yh_fr_')) localStorage.removeItem(k); });
    });
    await run(pageA, (key) => { currentDeck = key; }, deckKey);
    await run(pageA, () => { _launchBusy = false; onFabTap(); });
    await wait(pageA, 1500);
    pass('A 进入 easy 练习屏', await run(pageA, () =>
      document.getElementById('screen-quiz')?.classList.contains('active')));

    const ansA = await runEasySessionAllCorrect(pageA, SESSION_SIZE);
    pass(`A session 答完 ≥${Math.min(5, SESSION_SIZE)} 张`, ansA >= 5);

    await run(pageA, () => goHome());
    await wait(pageA, 500);

    const aLocalStates = await run(pageA, (key) => getAllEasyStates(key), deckKey);
    pass('A 本地 EasyState 已写入', aLocalStates.length >= 5);

    // ════ PHASE 3: 触发同步 — A 上传 trial → trigger 维护 easy_card_states ════
    section('PHASE 3: A 同步');
    await run(pageA, () => runSync({ modal: false, decks: false }));
    await waitSyncDone(pageA, 60000);
    await wait(pageA, 3000);

    // 验云端 easy_card_states 有数据
    const cloudCount = await run(pageA, async (key) => {
      try {
        const { data } = await _sb.from('easy_card_states')
          .select('card_id, history, seen, last_seen, updated_at')
          .eq('deck_key', key);
        return data ? data : [];
      } catch (e) { return []; }
    }, deckKey);
    pass('云端 easy_card_states 行 > 0', cloudCount.length > 0);
    pass('云端 history 含 1（A 答对的）',
      cloudCount.some(r => (r.history || []).includes(1)));
    pass('云端 seen ≥ 1', cloudCount.every(r => r.seen >= 1));

    // ════ PHASE 4: 设备 B 拉取 ════
    section('PHASE 4: 设备 B pull EasyState');
    await run(pageB, () => {
      localStorage.setItem('yihaiEasyPulledAt', '0');
      setSrsMode('easy');
    });
    await run(pageB, () => runSync({ modal: false, decks: false }));
    await waitSyncDone(pageB, 60000);
    await wait(pageB, 3000);

    const bStates = await run(pageB, (key) => getAllEasyStates(key), deckKey);
    pass('B 收到 EasyState 记录', bStates.length >= aLocalStates.length);
    pass('B history 含 1（A 答对的）',
      bStates.some(s => (s.history || []).includes(1)));
    pass('B last_warmup 仅本地 = 0（不跨设备）',
      bStates.every(s => (s.last_warmup || 0) === 0));
    pass('B seen 与云端一致 ≥ 1',
      bStates.every(s => (s.seen || 0) >= 1));

    // ════ PHASE 5: B 续练 → A 重 pull → 进度累加 ════
    section('PHASE 5: B 续练，A 重 pull 验证累加');
    await run(pageB, () => {
      SRS_CONFIG.easy_session_size = 7;
      SRS_CONFIG.easy_retry_on_wrong = true;
      Object.keys(localStorage).forEach(k => { if (k.startsWith('yh_fr_')) localStorage.removeItem(k); });
    });
    await run(pageB, (key) => { currentDeck = key; }, deckKey);
    await run(pageB, () => { _launchBusy = false; onFabTap(); });
    await wait(pageB, 1500);
    const ansB = await runEasySessionAllCorrect(pageB, SESSION_SIZE);
    pass(`B 续练完成 ≥${Math.min(5, SESSION_SIZE)} 张`, ansB >= 5);

    await run(pageB, () => goHome());
    await wait(pageB, 500);
    await run(pageB, () => runSync({ modal: false, decks: false }));
    await waitSyncDone(pageB, 60000);
    await wait(pageB, 3000);

    // A 清水位重新 pull
    await run(pageA, () => {
      localStorage.setItem('yihaiEasyPulledAt', '0');
    });
    await run(pageA, () => runSync({ modal: false, decks: false }));
    await waitSyncDone(pageA, 60000);
    await wait(pageA, 3000);

    const aAfterStates = await run(pageA, (key) => getAllEasyStates(key), deckKey);
    const maxSeen = Math.max(...aAfterStates.map(s => s.seen || 0));
    pass('A 重 pull 后看到 B 的累加（maxSeen ≥ 2）', maxSeen >= 2);

    // ════ PHASE 6: 清云端测试数据 ════
    section('PHASE 6: 清理');
    const cleanup2 = await run(pageA, async (key) => {
      try {
        await _sb.from('easy_card_states').delete().eq('deck_key', key);
        await _sb.from('sync_trials').delete().eq('deck_key', key).eq('session_mode', 'easy');
        return 'ok';
      } catch (e) { return e.message; }
    }, deckKey);
    pass('清云端测试数据', cleanup2 === 'ok');

  } catch (e) {
    console.error(`\n  [ERROR] ${e.message}`);
    console.error(e.stack);
  } finally {
    const counts = getCounts();
    console.log('\n' + '═'.repeat(60));
    console.log('  结果');
    console.log('═'.repeat(60));
    console.log(`  通过: ${counts.passed}  失败: ${counts.failed}`);
    await browser.close();
    process.exit(counts.failed > 0 ? 1 : 0);
  }
})();
