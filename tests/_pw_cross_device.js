/**
 * 忆海拾光 跨设备同步测试 — v5.1+
 * 依赖：python -m http.server 8080 --directory C:\code
 *        $env:TEST_PASSWORD="xxx"
 * 运行：$env:TEST_PASSWORD="xxx"; node tests/_pw_cross_device.js
 *
 * 覆盖：设备 A 练习→同步，设备 B 接收 CardState，review 不被覆写为 new，DP 不跨设备同步
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin, cloudLogout } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const TEST_DECK_NAME = '蔬菜水果';
const PRACTICE_COUNT = 3;

async function waitSyncDone(page, maxWait) {
  const iterations = Math.ceil((maxWait || 120000) / 500);
  for (let i = 0; i < iterations; i++) {
    const done = await run(page, () => typeof _syncInFlight === 'undefined' || !_syncInFlight);
    if (done) return true;
    await wait(page, 500);
  }
  return false;
}

const ts = () => Date.now();
let tStart;

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }
  tStart = ts();

  const browser = await chromium.launch({ headless: !process.env.HEADED });

  // 设备 A（独立 BrowserContext）
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await ctxA.newPage();
  pageA.on('pageerror', e => console.log(`  [A PAGE ERROR] ${e.message}`));

  // 设备 B（独立 BrowserContext）
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageB = await ctxB.newPage();
  pageB.on('pageerror', e => console.log(`  [B PAGE ERROR] ${e.message}`));

  try {
    // ════ PHASE 0: 设备 A 登录 + 清理 ════
    section('PHASE 0: 设备 A 登录 + 清理');
    await pageA.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(pageA, 2000);
    await run(pageA, async () => {
      localStorage.clear();
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) indexedDB.deleteDatabase(db.name);
      } catch (e) { /* ignore */ }
    });
    await pageA.reload({ waitUntil: 'networkidle' });
    await wait(pageA, 2000);

    pass('设备 A 登录成功', await cloudLogin(pageA, TEST_EMAIL, TEST_PASSWORD));
    await waitSyncDone(pageA, 120000);

    await run(pageA, () => goHome());
    await wait(pageA, 500);

    const deckKeyA = await run(pageA, (name) => {
      const m = DECKS_META.find(d => d.name && d.name.includes(name));
      return m ? m.key : null;
    }, TEST_DECK_NAME);
    pass('设备 A 测试牌组出现', !!deckKeyA);
    if (!deckKeyA) throw new Error('设备 A 找不到测试牌组，终止');

    // ════ PHASE 1: 设备 A 练习 ════
    section(`PHASE 1: 设备 A 练习 ${PRACTICE_COUNT} 张`);
    await run(pageA, (key) => { currentDeck = key; }, deckKeyA);
    await wait(pageA, 300);
    await run(pageA, () => { _launchBusy = false; onFabTap(); });
    await wait(pageA, 1500);

    pass('设备 A 进入练习屏', await run(pageA, () =>
      document.getElementById('screen-quiz')?.classList.contains('active')
    ));

    let practicedA = 0;
    for (let i = 0; i < 20; i++) {
      const done = await run(pageA, () =>
        document.getElementById('screen-finish')?.classList.contains('active') ||
        document.getElementById('screen-home')?.classList.contains('active')
      );
      if (done || practicedA >= PRACTICE_COUNT) break;

      const answered = await run(pageA, () => {
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
      if (answered === true) { practicedA++; await wait(pageA, 500); }
      else if (answered === 'next') { await wait(pageA, 300); continue; }
      else { await wait(pageA, 300); continue; }
      // 翻牌后下一题
      await run(pageA, () => { const btn = document.getElementById('nxtbtn'); if (btn) btn.click(); });
      await wait(pageA, 400);
    }

    pass(`设备 A 练习了 ≥ ${PRACTICE_COUNT} 张`, practicedA >= PRACTICE_COUNT);
    await run(pageA, () => goHome());
    await wait(pageA, 500);

    // 等待 TrialLog 上传（触发 DB trigger 更新 sync_card_states）
    await waitSyncDone(pageA, 60000);
    await wait(pageA, 3000);

    // ════ PHASE 1B: 验证设备 A 云端状态 ════
    section('PHASE 1B: 验证设备 A 云端 CardState');
    const cloudStateA = await run(pageA, async () => {
      try {
        const { data } = await _sb.from('sync_card_states')
          .select('srs_stage')
          .eq('user_id', _cloudUserId)
          .limit(200);
        const review = data ? data.filter(s => s.srs_stage === 'review').length : 0;
        return { review, total: data ? data.length : 0 };
      } catch (e) { return { review: 0, total: 0, error: e.message }; }
    });
    pass('设备 A 云端有 review 卡', cloudStateA.review > 0);

    const dpA = await run(pageA, () => {
      try {
        const dp = JSON.parse(localStorage.getItem('yihai_daily_progress') || '{}');
        return {
          n: dp.daily_new_today || 0,
          r: dp.reviewed_today || 0
        };
      } catch (e) { return { n: 0, r: 0 }; }
    });
    // daily_new_today 只对 new→learning 首次学习的卡递增；若该账号已学过这批卡（重新登录场景），
    // 云端 CardState 下载后 srs_stage 为 review，不会触发新卡计数，此处只验证 reviewed_today
    pass(`设备 A reviewed_today ≥ ${PRACTICE_COUNT}`, dpA.r >= PRACTICE_COUNT);

    // ════ PHASE 2: 设备 B 新设备登录 ════
    section('PHASE 2: 设备 B 新设备登录');
    await pageB.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(pageB, 2000);

    pass('设备 B 登录成功', await cloudLogin(pageB, TEST_EMAIL, TEST_PASSWORD));
    await waitSyncDone(pageB, 120000);
    await wait(pageB, 2000);

    await run(pageB, () => goHome());
    await wait(pageB, 500);

    pass('设备 B 首页显示测试牌组', await run(pageB, (name) => {
      const cards = Array.from(document.querySelectorAll('.deck-card'));
      return cards.some(c => {
        const nm = c.querySelector('.deck-name');
        return nm && nm.textContent.includes(name);
      });
    }, TEST_DECK_NAME));

    // ════ PHASE 3: 跨设备验证 ════
    section('PHASE 3: 跨设备验证');

    const localStateB = await run(pageB, async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const states = await new Promise(res => {
        const r = db.transaction('card_states', 'readonly').objectStore('card_states').getAll();
        r.onsuccess = () => res(r.result);
      });
      return {
        total: states.length,
        review: states.filter(s => s.srs_stage === 'review').length,
        newC: states.filter(s => s.srs_stage === 'new').length
      };
    });

    pass('设备 B 本地有 CardState（从云端同步）', localStateB.total > 0);
    pass('设备 B review 卡不为 new（未被覆写）',
      localStateB.review > 0 && localStateB.newC < localStateB.total
    );

    const dpB = await run(pageB, () => {
      try {
        const dp = JSON.parse(localStorage.getItem('yihai_daily_progress') || '{}');
        return dp.reviewed_today || 0;
      } catch (e) { return 0; }
    });
    pass('DP 不跨设备同步（设备 B reviewed_today=0）', dpB === 0);

    console.log(`\n  总耗时: ${((ts() - tStart) / 1000).toFixed(1)}s`);

  } finally {
    const { passed, failed } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
