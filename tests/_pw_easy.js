/**
 * 忆海拾光 Easy 模式综合测试 — v5.11+
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_easy.js
 *
 * 覆盖：设置 UI（chip/toggle/持久化）/ 单局 / retry=off 流 / 多局 confident 池 / 诊断面板存在性
 * 无需登录，无需 Supabase
 */
const { chromium } = require('playwright');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const { pass, section, wait, run, getCounts, getBaseUrl, startCoverage, stopAndCollectCoverage } = require('./_playwright_helper');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const YHPACK_PATH = path.join(__dirname, 'test_data', '_easy_test.yhspack');
const DECK_ID = '__easy_test__';
const CARD_COUNT = 30;       // 足够走完整 T=19 结构 (3 + 4×4 = 19)

async function createTestYhspack() {
  const zip = new JSZip();
  zip.file('deck.json', JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    deck: {
      id: DECK_ID,
      name: 'Easy 模式测试牌组',
      cards: Array.from({ length: CARD_COUNT }, (_, i) => ({
        id: String(i),
        name: `测试卡${i + 1}`,
        image: '',
        audio: ''
      }))
    }
  }));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.mkdirSync(path.dirname(YHPACK_PATH), { recursive: true });
  fs.writeFileSync(YHPACK_PATH, buf);
}

// 答完整个 easy session（全对）
async function runEasySessionAllCorrect(page, expectedSize) {
  let answered = 0;
  for (let i = 0; i < expectedSize + 8; i++) {
    const finished = await run(page, () =>
      document.getElementById('screen-finish')?.classList.contains('active') ||
      document.getElementById('screen-home')?.classList.contains('active')
    );
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
    const rev = await run(page, () => document.getElementById('content')?.classList.contains('revealed'));
    if (rev) {
      await run(page, () => { const b = document.getElementById('nxtbtn'); if (b) b.click(); });
      answered++; await wait(page, 350);
    }
  }
  return answered;
}

// 答第一张错（剩余答对）
async function runEasySessionFirstWrong(page, expectedSize) {
  let answered = 0;
  let wrongDone = false;
  for (let i = 0; i < expectedSize + 8; i++) {
    const finished = await run(page, () =>
      document.getElementById('screen-finish')?.classList.contains('active') ||
      document.getElementById('screen-home')?.classList.contains('active')
    );
    if (finished) break;

    const state = await run(page, (forceWrong) => {
      if (typeof Qs === 'undefined' || qIdx >= Qs.length) return 'noq';
      const isRevealed = document.getElementById('content')?.classList.contains('revealed');
      if (isRevealed) return 'revealed';
      const q = Qs[qIdx];
      const opts = Array.from(document.querySelectorAll('#opts .opt'));
      if (!opts.length) return 'noopts';
      const correctIdx = q.correct;
      let btn;
      if (forceWrong) {
        btn = opts.find(b => parseInt(b.dataset.idx) !== correctIdx);
      } else {
        btn = opts.find(b => parseInt(b.dataset.idx) === correctIdx);
      }
      (btn || opts[0]).dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return 'answered';
    }, !wrongDone);

    if (state === 'noq' || state === 'noopts') { await wait(page, 250); continue; }
    if (state === 'revealed') {
      await run(page, () => { const b = document.getElementById('nxtbtn'); if (b) b.click(); });
      answered++; wrongDone = true; await wait(page, 350); continue;
    }
    await wait(page, 550);
    const rev = await run(page, () => document.getElementById('content')?.classList.contains('revealed'));
    if (rev) {
      await run(page, () => { const b = document.getElementById('nxtbtn'); if (b) b.click(); });
      answered++; wrongDone = true; await wait(page, 350);
    }
  }
  return answered;
}

(async () => {
  await createTestYhspack();

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await startCoverage(page);
  page.on('pageerror', err => console.log(`  [PAGE ERROR] ${err.message}`));

  try {
    // ════ PHASE 1: 准备 — 清状态 + 导入测试牌组 ════
    section('PHASE 1: 准备 — 清状态 + 导入测试牌组');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);
    await run(page, async () => {
      localStorage.clear();
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) indexedDB.deleteDatabase(db.name);
      } catch (e) {}
    });
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);

    const yhpackBuf = fs.readFileSync(YHPACK_PATH);
    await page.evaluate(async (data) => {
      const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' });
      const file = new File([blob], '_easy_test.yhspack');
      await importYhspack(file);
    }, Array.from(yhpackBuf));
    await wait(page, 2000);

    const deckOk = await run(page, (key) => (DECKS[key] || []).length, DECK_ID);
    pass(`导入 ${CARD_COUNT} 张测试卡`, deckOk === CARD_COUNT);

    // ════ PHASE 2: 设置 UI — chip / toggle / 持久化 ════
    section('PHASE 2: 设置 UI — chip/toggle/持久化');

    await run(page, () => openSettingsWithSrs());
    await wait(page, 500);

    // 默认 normal → easySizeRow 不可见
    const normalHidden = await run(page, () => {
      const row = document.getElementById('easySizeRow');
      return row && row.style.display === 'none';
    });
    pass('设置 UI: normal 模式下 chip 行隐藏', normalHidden);

    const retryHiddenNormal = await run(page, () => {
      const row = document.getElementById('easyRetryRow');
      return row && row.style.display === 'none';
    });
    pass('设置 UI: normal 模式下 retry 行隐藏', retryHiddenNormal);

    // 切到 easy → 两行同时出现
    await run(page, () => setSrsMode('easy'));
    await wait(page, 400);

    const easyShown = await run(page, () => {
      const sz = document.getElementById('easySizeRow');
      const rt = document.getElementById('easyRetryRow');
      return sz && rt && sz.style.display !== 'none' && rt.style.display !== 'none';
    });
    pass('设置 UI: easy 模式下两行同时出现', easyShown);

    // 默认 19 active
    const default19 = await run(page, () => {
      const btn = document.querySelector('[data-easy-size] .chip[data-size="19"]');
      return btn && btn.classList.contains('active');
    });
    pass('设置 UI: 默认 19 chip active', default19);

    // 点 15
    await run(page, () => {
      document.querySelector('[data-easy-size] .chip[data-size="15"]').click();
    });
    await wait(page, 200);
    const got15 = await run(page, () => SRS_CONFIG.easy_session_size === 15 &&
      localStorage.getItem('yh:v1:srs:easySessionSize') === '15' &&
      document.querySelector('[data-easy-size] .chip[data-size="15"]').classList.contains('active'));
    pass('设置 UI: 点 15 后 chip active + localStorage + SRS_CONFIG 一致', got15);

    // 点 23
    await run(page, () => {
      document.querySelector('[data-easy-size] .chip[data-size="23"]').click();
    });
    await wait(page, 200);
    const got23 = await run(page, () => SRS_CONFIG.easy_session_size === 23 &&
      localStorage.getItem('yh:v1:srs:easySessionSize') === '23');
    pass('设置 UI: 点 23 后切换正常', got23);

    // 回到 19
    await run(page, () => {
      document.querySelector('[data-easy-size] .chip[data-size="19"]').click();
    });
    await wait(page, 200);

    // 关闭 retry
    await run(page, () => {
      const tog = document.getElementById('easyRetryToggle');
      tog.checked = false;
      tog.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await wait(page, 200);
    const retryOff = await run(page, () => SRS_CONFIG.easy_retry_on_wrong === false &&
      localStorage.getItem('yh:v1:srs:easyRetryOnWrong') === '0');
    pass('设置 UI: 关闭 retry 后状态正确', retryOff);

    // 刷新页面 → 持久化检查
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);
    const persisted = await run(page, () =>
      SRS_CONFIG.easy_session_size === 19 &&
      SRS_CONFIG.easy_retry_on_wrong === false &&
      SRS_CONFIG.session_mode === 'easy');
    pass('设置 UI: 刷新后 19/retry off/easy 模式全部持久化', persisted);

    // ════ PHASE 3: Easy session 基本流（T=19，全对，retry=on） ════
    section('PHASE 3: Easy session 基本流（T=19，全对）');

    // 重新开启 retry
    await run(page, () => {
      SRS_CONFIG.easy_retry_on_wrong = true;
      localStorage.setItem('yh:v1:srs:easyRetryOnWrong', '1');
    });

    // 进入练习
    await run(page, (key) => { currentDeck = key; }, DECK_ID);
    await run(page, () => onFabTap());
    await wait(page, 1500);

    pass('Phase3: 进入练习屏', await run(page, () =>
      document.getElementById('screen-quiz')?.classList.contains('active')));

    const queueSize = await run(page, () => Qs ? Qs.length : 0);
    pass('Phase3: 队列长度 = 19（T=19，30 张牌组走结构路径）', queueSize === 19);

    // 队列 _easyRole 标签校验
    const roles = await run(page, () => Qs.map(q => q._easyRole || 'none'));
    pass('Phase3: 前 3 张标 warmup', roles.slice(0, 3).every(r => r === 'warmup'));
    pass('Phase3: 后 16 张标 core（k=4, r=0）', roles.slice(3).every(r => r === 'core'));

    const answered = await runEasySessionAllCorrect(page, 19);
    pass('Phase3: session 全部答完 19 张', answered >= 19);

    await wait(page, 500);
    const states = await run(page, (key) => getAllEasyStates(key), DECK_ID);
    pass('Phase3: EasyState 写入 IDB（≥19 条）', states.length >= 19);
    pass('Phase3: 全部 history.length ≥ 1', states.every(s => (s.history || []).length >= 1));
    pass('Phase3: 全部 history 末位 = 1（全答对）',
      states.every(s => (s.history || []).slice(-1)[0] === 1));

    // sync_card_states 未被 easy 改动（仅本地新建为 new，srs_stage 未推进到 review 等）
    const csCount = await run(page, async (key) => {
      const all = await getAllCardStates(key);
      return all.filter(s => s.srs_stage !== 'new').length;
    }, DECK_ID);
    pass('Phase3: easy 不写 sync_card_states（srs_stage 未推进）', csCount === 0);

    // ════ PHASE 4: easy_retry_on_wrong=false 流 ════
    section('PHASE 4: easy_retry_on_wrong=false 流');

    await run(page, () => goHome());
    await wait(page, 600);
    await run(page, () => {
      SRS_CONFIG.easy_retry_on_wrong = false;
      localStorage.setItem('yh:v1:srs:easyRetryOnWrong', '0');
      // 清除 daily 限制让 easy 模式能再次启动
      Object.keys(localStorage).forEach(k => { if (k.startsWith('yh_fr_')) localStorage.removeItem(k); });
    });

    await run(page, (key) => { currentDeck = key; }, DECK_ID);
    await run(page, () => onFabTap());
    await wait(page, 1500);

    // 故意首选错，验证直接 revealed（不去除选项）
    const firstWrongState = await run(page, () => {
      const q = Qs[qIdx];
      const opts = Array.from(document.querySelectorAll('#opts .opt'));
      const wrong = opts.find(b => parseInt(b.dataset.idx) !== q.correct);
      const beforeCount = opts.length;
      wrong.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return { beforeCount };
    });
    await wait(page, 700);
    const revealedImmediately = await run(page, () =>
      document.getElementById('content')?.classList.contains('revealed'));
    pass('Phase4: retry=off 时首错直接 revealed（不重试）', revealedImmediately === true);

    const optsStillAll = await run(page, () => document.querySelectorAll('#opts .opt').length);
    pass('Phase4: retry=off 时选项未被移除', optsStillAll === firstWrongState.beforeCount);

    // history 末位应该是 0
    await run(page, () => { const b = document.getElementById('nxtbtn'); if (b) b.click(); });
    await wait(page, 400);
    await run(page, () => goHome());
    await wait(page, 500);

    const statesAfterWrong = await run(page, (key) => getAllEasyStates(key), DECK_ID);
    const hasZero = statesAfterWrong.some(s => (s.history || []).includes(0));
    pass('Phase4: 首错记 0（EasyState history 含 0）', hasZero);

    // ════ PHASE 5: 多局后 confident 池形成 ════
    section('PHASE 5: 多局后 confident 池形成');

    // 重置：删 EasyState，回到 retry=on，跑 3 局全对
    await run(page, async (key) => {
      const all = await getAllEasyStates(key);
      const db = await openSrsDb();
      await new Promise(res => {
        const tx = db.transaction(EASY_STORE, 'readwrite');
        const store = tx.objectStore(EASY_STORE);
        for (const s of all) store.delete([s.deck_key, s.card_id]);
        tx.oncomplete = () => res();
      });
      SRS_CONFIG.easy_retry_on_wrong = true;
      localStorage.setItem('yh:v1:srs:easyRetryOnWrong', '1');
      SRS_CONFIG.easy_session_size = 15;  // 缩短以加速
      localStorage.setItem('yh:v1:srs:easySessionSize', '15');
    }, DECK_ID);

    for (let session = 1; session <= 3; session++) {
      await run(page, () => {
        Object.keys(localStorage).forEach(k => { if (k.startsWith('yh_fr_')) localStorage.removeItem(k); });
      });
      await run(page, (key) => { currentDeck = key; }, DECK_ID);
      await run(page, () => onFabTap());
      await wait(page, 1200);
      const ans = await runEasySessionAllCorrect(page, 15);
      pass(`Phase5: 第 ${session} 局完成 ≥15 张`, ans >= 15);
      await run(page, () => goHome());
      await wait(page, 500);
    }

    const finalStates = await run(page, (key) => getAllEasyStates(key), DECK_ID);
    const confidentCount = finalStates.filter(s => {
      const h = s.history || [];
      return h.length === 3 && h.every(x => x === 1);
    }).length;
    pass('Phase5: 3 局后 confident 池 > 0', confidentCount > 0);

    // ════ PHASE 6: 诊断面板字段存在性 ════
    section('PHASE 6: 诊断面板字段存在性');

    // yh_diag.js Tab 0 包含「轻松模式统计」段，仅检查 IDB store 存在和数据可读
    const easyStoreExists = await run(page, async () => {
      const db = await openSrsDb();
      return db.objectStoreNames.contains('easy_card_states');
    });
    pass('Phase6: IDB 含 easy_card_states store', easyStoreExists);

    const idbVer = await run(page, async () => {
      const db = await openSrsDb();
      return db.version;
    });
    pass('Phase6: IDB version 已升至 8', idbVer >= 8);

    const sampleRecord = finalStates[0];
    pass('Phase6: EasyState 字段完整（seen/history/last_seen）',
      sampleRecord && typeof sampleRecord.seen === 'number' &&
      Array.isArray(sampleRecord.history) &&
      typeof sampleRecord.last_seen === 'number');

  } catch (e) {
    console.error(`\n  [ERROR] ${e.message}`);
    console.error(e.stack);
  } finally {
    const counts = getCounts();
    console.log('\n' + '═'.repeat(60));
    console.log('  结果');
    console.log('═'.repeat(60));
    console.log(`  通过: ${counts.passed}  失败: ${counts.failed}`);
    await stopAndCollectCoverage(page, '_pw_easy');
    await browser.close();
    process.exit(counts.failed > 0 ? 1 : 0);
  }
})();
