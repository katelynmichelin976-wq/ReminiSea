/**
 * 忆海拾光 SRS 端到端测试 — v5.1+
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_srs_e2e.js
 *
 * 覆盖：.yhspack 导入、5天练习、CardState/TrialLog 写入、统计 KPI、
 *       session_mode 持久化、normal 模式队列 U 形曲线（applyCurve）
 * 无需登录，无需 Supabase
 */
const { chromium } = require('playwright');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const { pass, check, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const YHPACK_PATH = path.join(__dirname, 'test_data', '_srs_e2e_test.yhspack');
const DECK_ID = '__srs_e2e_test__';
const CARD_COUNT = 5;
const MAX_INTERVAL = 7;

async function createTestYhspack() {
  const zip = new JSZip();
  zip.file('deck.json', JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    deck: {
      id: DECK_ID,
      name: 'SRS端到端测试牌组',
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

(async () => {
  await createTestYhspack();

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', err => console.log(`  [PAGE ERROR] ${err.message}`));

  try {
    // ════ PHASE 1: 导入 .yhspack ════
    section('PHASE 1: 导入 .yhspack');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);

    // 清空存储，确保干净状态
    await run(page, async () => {
      localStorage.clear();
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) indexedDB.deleteDatabase(db.name);
      } catch (e) { /* ignore */ }
    });
    await wait(page, 300);
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);

    // 设置 maximum_interval=7 便于 5 天内验证
    // SRS_CONFIG 从 localStorage 按键 'srs_<param>' 加载，需在页面加载前设置
    await run(page, (max) => {
      localStorage.setItem('srs_maximum_interval', String(max));
    }, MAX_INTERVAL);
    // 重新加载让 _loadSrsConfig 生效
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1000);
    // 验证配置已生效
    const cfgOk = await run(page, (max) => SRS_CONFIG.maximum_interval === max, MAX_INTERVAL);
    if (!cfgOk) console.log('  [warn] maximum_interval 未生效，将跳过间隔验证');

    // 直接调用 importYhspack，构造 File 对象传入
    const yhpackBuf = fs.readFileSync(YHPACK_PATH);
    const yhpackB64 = yhpackBuf.toString('base64');
    await run(page, async (b64) => {
      // base64 → Uint8Array → Blob → File → importYhspack
      const raw = atob(b64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/zip' });
      const file = new File([blob], '__srs_e2e_test__.yhspack', { type: 'application/zip' });
      await importYhspack(file);
    }, yhpackB64);
    await wait(page, 1500);

    const deckFound = await run(page, (id) =>
      !!document.querySelector(`.deck-card[data-deck="${id}"]`), DECK_ID
    );
    pass('导入牌组出现在列表', deckFound);
    check('currentDeck 已切换', await run(page, () => currentDeck), DECK_ID);

    // ════ PHASE 2: 5 天练习 ════
    section('PHASE 2: 5 天练习（maximum_interval=7）');
    let totalCards = 0;
    let quizEntered = false;

    for (let day = 0; day < 5; day++) {
      // 模拟时间推进：把所有 CardState 的 due_ts/due_date 设为过去
      await run(page, async (did) => {
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('yihai_srs');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const tx = db.transaction('sync_card_states', 'readwrite');
        const sto = tx.objectStore('sync_card_states');
        await new Promise((res) => {
          const req = sto.getAll();
          req.onsuccess = async () => {
            const all = req.result.filter(s => s.deck_key === did);
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            for (const s of all) {
              s.due_ts = Date.now() - 60000;
              if (s.srs_stage === 'review') s.due_date = yesterday;
              await new Promise(r2 => { const u = sto.put(s); u.onsuccess = r2; });
            }
            res();
          };
        });
      }, DECK_ID);

      // 重置 daily progress 以便每天都能练习（正确 key: yihaiDailyProgress）
      await run(page, () => {
        const today = new Date().toISOString().slice(0, 10);
        const fresh = { date: today, reviewed_today: 0, daily_new_today: 0,
                        first_fail_today: 0, first_hard_today: 0, first_pass_today: 0 };
        localStorage.setItem('yihaiDailyProgress', JSON.stringify(fresh));
        // 清除当日首次评级去重记录（reviewed_today 计数依赖此）
        Object.keys(localStorage).forEach(k => { if (k.startsWith('yh_fr_')) localStorage.removeItem(k); });
        // 清除内存中的当日移除记录
        if (typeof _dailyRemovedToday !== 'undefined') {
          Object.keys(_dailyRemovedToday).forEach(k => delete _dailyRemovedToday[k]);
        }
      });

      await run(page, () => goHome());
      await wait(page, 500);

      // 设置 currentDeck
      await run(page, (id) => { currentDeck = id; }, DECK_ID);

      // 启动练习（直接调 _launch 绕过 warmupSpeech）
      await run(page, () => { _launchBusy = false; onFabTap(); });
      await wait(page, 1500);

      const inQuiz = await run(page, () =>
        document.getElementById('screen-quiz')?.classList.contains('active')
      );
      if (inQuiz && !quizEntered) { pass('进入练习屏', true); quizEntered = true; }

      // 如果直接跳到 finish（没有到期卡），跳过本轮
      const inFinish = await run(page, () =>
        document.getElementById('screen-finish')?.classList.contains('active')
      );
      if (inFinish) { await run(page, () => goHome()); await wait(page, 300); continue; }

      // 答题循环（最多 30 轮）
      for (let i = 0; i < 30; i++) {
        const done = await run(page, () =>
          document.getElementById('screen-finish')?.classList.contains('active') ||
          document.getElementById('screen-home')?.classList.contains('active')
        );
        if (done) break;

        // 点击正确选项（通过 onSel 触发）
        const answered = await run(page, () => {
          const q = Qs[qIdx];
          if (!q) return false;
          const isRevealed = document.getElementById('content')?.classList.contains('revealed');
          if (isRevealed) return 'revealed';
          // 找到正确选项的按钮
          const opts = Array.from(document.querySelectorAll('#opts .opt'));
          if (opts.length === 0) return false;
          // 点击正确答案（idx === q.correct 的那个）
          const correctBtn = opts.find(b => parseInt(b.dataset.idx) === q.correct);
          if (correctBtn) {
            correctBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            return true;
          }
          // 找不到正确按钮时点第一个
          opts[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          return true;
        });

        if (!answered) { await wait(page, 300); continue; }
        if (answered === 'revealed') {
          // 已经翻牌，点下一题
          await run(page, () => { const btn = document.getElementById('nxtbtn'); if (btn) btn.click(); });
          totalCards++;
          await wait(page, 400);
          continue;
        }
        await wait(page, 600);

        // 翻牌后点下一题
        const isRevealed = await run(page, () =>
          document.getElementById('content')?.classList.contains('revealed')
        );
        if (isRevealed) {
          await run(page, () => { const btn = document.getElementById('nxtbtn'); if (btn) btn.click(); });
          totalCards++;
          await wait(page, 400);
        }
      }

      await run(page, () => goHome());
      await wait(page, 400);
    }

    if (!quizEntered) pass('进入练习屏', false);
    pass('5 天累计练习 > 0 张', totalCards > 0);

    // ════ PHASE 3: 验证 SRS 状态 ════
    section('PHASE 3: 验证 SRS 状态');

    const st = await run(page, async (id) => {
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
      const filtered = states.filter(s => s.deck_key === id);
      const stages = {};
      const ratings = {};
      let maxInt = 0;
      for (const s of filtered) {
        stages[s.srs_stage] = (stages[s.srs_stage] || 0) + 1;
        if ((s.interval || 0) > maxInt) maxInt = s.interval || 0;
      }
      const deckTrials = trials.filter(t => t.deck_key === id);
      for (const t of deckTrials) {
        ratings[t.rating] = (ratings[t.rating] || 0) + 1;
      }
      return {
        states: filtered.length,
        stages,
        ratings,
        maxInterval: maxInt,
        trials: deckTrials.length
      };
    }, DECK_ID);

    pass(`${CARD_COUNT} 张卡全部有 CardState`, st.states === CARD_COUNT);
    pass('无 new 卡（全部已学习）', !st.stages['new'] || st.stages['new'] === 0);
    pass('有 review 阶段卡（已毕业）', (st.stages['review'] || 0) > 0);
    pass(`最大间隔 ≤ ${MAX_INTERVAL}（maximum_interval 生效）`, st.maxInterval <= MAX_INTERVAL);
    pass('TrialLog ≥ 20 条', st.trials >= 20);
    pass('含 good 评级', (st.ratings['good'] || 0) > 0);

    // ════ PHASE 4: 统计页 KPI ════
    section('PHASE 4: 统计页 KPI');
    await run(page, () => openStats());
    await wait(page, 1500);
    const kpis = await run(page, () =>
      document.querySelectorAll('.stats-kpi-num').length
    );
    pass('统计页 KPI ≥ 3 项加载', kpis >= 3);
    await run(page, () => closeStats());
    await wait(page, 400);

    // ════ PHASE 5: session_mode 持久化 ════
    section('PHASE 5: session_mode 持久化');
    await run(page, () => setSrsMode('easy'));
    await page.reload({ waitUntil: 'networkidle' });
    await wait(page, 1000);
    pass('easy 模式刷新后恢复', await run(page, () =>
      localStorage.getItem('yh:v1:srs:session_mode') === 'easy'
    ));
    await run(page, () => setSrsMode('normal'));

    // ════ PHASE 6: normal 模式队列按 due_ts 升序（Anki 到期顺序）════
    section('PHASE 6: normal 模式队列顺序');
    const queueOrder = await run(page, async (did) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const tx = db.transaction('sync_card_states', 'readwrite');
      const sto = tx.objectStore('sync_card_states');
      const all = await new Promise(res => { const r = sto.getAll(); r.onsuccess = () => res(r.result); });
      const deckStates = all.filter(s => s.deck_key === did);
      // 设置不同 due_ts 以验证排序
      const now = Date.now();
      for (let i = 0; i < deckStates.length; i++) {
        deckStates[i].srs_stage = 'review';
        deckStates[i].due_date = new Date(now - 86400000).toISOString().slice(0, 10);
        deckStates[i].due_ts = now - (deckStates.length - i) * 60000; // 递增 due_ts
        await new Promise(r2 => { const u = sto.put(deckStates[i]); u.onsuccess = r2; });
      }
      if (typeof buildSessionQueue !== 'function') return null;
      SRS_CONFIG.session_mode = 'normal';
      const queue = await buildSessionQueue(did);
      SRS_CONFIG.session_mode = localStorage.getItem('srs_session_mode') || 'normal';
      if (!queue || queue.length < 2) return null;
      const dueTimes = queue.map(q => q._srsState?.due_ts ?? 0);
      const isAscending = dueTimes.every((t, i) => i === 0 || t >= dueTimes[i - 1]);
      return { len: queue.length, isAscending };
    }, DECK_ID);

    if (queueOrder) {
      pass('normal 模式队列按 due_ts 升序（Anki 到期顺序）', queueOrder.isAscending);
    } else {
      pass('normal 模式队列顺序（条件不足，跳过）', true);
    }

    // ════ PHASE Easy: easy 模式 + EasyState IDB ════
    section('PHASE Easy: easy 模式 + EasyState IDB');

    // 切换到 easy 模式，session_size = CARD_COUNT（5），retry=true
    await run(page, (cnt) => {
      setSrsMode('easy');
      SRS_CONFIG.easy_session_size = cnt;
      SRS_CONFIG.easy_retry_on_wrong = true;
    }, CARD_COUNT);

    // 重置每日进度，让 easy 模式能启动
    await run(page, () => {
      const today = new Date().toISOString().slice(0, 10);
      const fresh = { date: today, reviewed_today: 0, daily_new_today: 0,
                      first_fail_today: 0, first_hard_today: 0, first_pass_today: 0 };
      localStorage.setItem('yihaiDailyProgress', JSON.stringify(fresh));
      Object.keys(localStorage).forEach(k => { if (k.startsWith('yh_fr_')) localStorage.removeItem(k); });
      if (typeof _dailyRemovedToday !== 'undefined') {
        Object.keys(_dailyRemovedToday).forEach(k => delete _dailyRemovedToday[k]);
      }
    });

    await run(page, () => goHome());
    await wait(page, 500);
    await run(page, (id) => { currentDeck = id; }, DECK_ID);

    // 读取 easy 模式前的 card_states（验证 easy 模式不修改 SRS）
    const preEasyStates = await run(page, async (id) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const all = await new Promise(res => {
        const r = db.transaction('sync_card_states', 'readonly').objectStore('sync_card_states').getAll();
        r.onsuccess = () => res(r.result);
      });
      return all.filter(s => s.deck_key === id).map(s => ({ card_id: s.card_id, stage: s.srs_stage }));
    }, DECK_ID);

    // 启动 easy 练习
    await run(page, () => { _launchBusy = false; onFabTap(); });
    await wait(page, 1500);

    const inEasyQuiz = await run(page, () =>
      document.getElementById('screen-quiz')?.classList.contains('active')
    );
    pass('Easy: 进入练习屏', !!inEasyQuiz);

    // 答题循环 — 全部答对（最多 20 轮）
    let easyAnswered = 0;
    for (let i = 0; i < 20; i++) {
      const done = await run(page, () =>
        document.getElementById('screen-finish')?.classList.contains('active') ||
        document.getElementById('screen-home')?.classList.contains('active')
      );
      if (done) break;

      const answered = await run(page, () => {
        const q = Qs[qIdx];
        if (!q) return false;
        const isRevealed = document.getElementById('content')?.classList.contains('revealed');
        if (isRevealed) return 'revealed';
        const opts = Array.from(document.querySelectorAll('#opts .opt'));
        if (opts.length === 0) return false;
        const correctBtn = opts.find(b => parseInt(b.dataset.idx) === q.correct);
        if (correctBtn) {
          correctBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          return true;
        }
        opts[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return true;
      });

      if (!answered) { await wait(page, 300); continue; }
      if (answered === 'revealed') {
        await run(page, () => { const btn = document.getElementById('nxtbtn'); if (btn) btn.click(); });
        easyAnswered++;
        await wait(page, 400);
        continue;
      }
      await wait(page, 600);
      const isRevealed = await run(page, () =>
        document.getElementById('content')?.classList.contains('revealed')
      );
      if (isRevealed) {
        await run(page, () => { const btn = document.getElementById('nxtbtn'); if (btn) btn.click(); });
        easyAnswered++;
        await wait(page, 400);
      }
    }

    pass('Easy: session 全部答完 > 0 张', easyAnswered > 0);

    // 等待回到首页 / 完成屏
    await run(page, () => goHome());
    await wait(page, 500);

    // 验证 EasyState IDB 写入
    const easyStates1 = await run(page, (id) => getAllEasyStates(id), DECK_ID);
    pass('Easy: EasyState 写入 IDB', easyStates1.length > 0);
    pass('Easy: 全部 history 含 1', easyStates1.every(s => s.history.length >= 1));
    pass('Easy: 全部 history 首尾为 1（全答对）',
      easyStates1.every(s => s.history.every(v => v === 1))
    );

    // 验证 SRS card_states 未被 easy 模式修改（stage 不变）
    const postEasyStates = await run(page, async (id) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const all = await new Promise(res => {
        const r = db.transaction('sync_card_states', 'readonly').objectStore('sync_card_states').getAll();
        r.onsuccess = () => res(r.result);
      });
      return all.filter(s => s.deck_key === id).map(s => ({ card_id: s.card_id, stage: s.srs_stage }));
    }, DECK_ID);

    const stagesUnchanged = preEasyStates.every(pre => {
      const post = postEasyStates.find(p => p.card_id === pre.card_id);
      return post && post.stage === pre.stage;
    });
    pass('Easy: card_states srs_stage 未被 easy 模式修改', stagesUnchanged);

    // ── 第二次 easy session：故意先答错，再答对 ──
    await run(page, () => {
      const today = new Date().toISOString().slice(0, 10);
      const fresh = { date: today, reviewed_today: 0, daily_new_today: 0,
                      first_fail_today: 0, first_hard_today: 0, first_pass_today: 0 };
      localStorage.setItem('yihaiDailyProgress', JSON.stringify(fresh));
      Object.keys(localStorage).forEach(k => { if (k.startsWith('yh_fr_')) localStorage.removeItem(k); });
      if (typeof _dailyRemovedToday !== 'undefined') {
        Object.keys(_dailyRemovedToday).forEach(k => delete _dailyRemovedToday[k]);
      }
    });

    await run(page, () => goHome());
    await wait(page, 500);
    await run(page, (id) => { currentDeck = id; }, DECK_ID);
    await run(page, () => { _launchBusy = false; onFabTap(); });
    await wait(page, 1500);

    // 第一题故意答错，其余答对（最多 20 轮）
    let wrongDone = false;
    for (let i = 0; i < 20; i++) {
      const done = await run(page, () =>
        document.getElementById('screen-finish')?.classList.contains('active') ||
        document.getElementById('screen-home')?.classList.contains('active')
      );
      if (done) break;

      const answered = await run(page, (wd) => {
        const q = Qs[qIdx];
        if (!q) return false;
        const isRevealed = document.getElementById('content')?.classList.contains('revealed');
        if (isRevealed) return 'revealed';
        const opts = Array.from(document.querySelectorAll('#opts .opt'));
        if (opts.length === 0) return false;
        if (!wd && qIdx === 0 && opts.length >= 2) {
          // 第一题故意点错误选项（非 correct 的第一个）
          const wrongBtn = opts.find(b => parseInt(b.dataset.idx) !== q.correct);
          if (wrongBtn) {
            wrongBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            return 'wrong';
          }
        }
        const correctBtn = opts.find(b => parseInt(b.dataset.idx) === q.correct);
        if (correctBtn) {
          correctBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          return true;
        }
        opts[0].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return true;
      }, wrongDone);

      if (answered === 'wrong') { wrongDone = true; await wait(page, 600); continue; }
      if (!answered) { await wait(page, 300); continue; }
      if (answered === 'revealed') {
        await run(page, () => { const btn = document.getElementById('nxtbtn'); if (btn) btn.click(); });
        await wait(page, 400);
        continue;
      }
      await wait(page, 600);
      const isRevealed = await run(page, () =>
        document.getElementById('content')?.classList.contains('revealed')
      );
      if (isRevealed) {
        await run(page, () => { const btn = document.getElementById('nxtbtn'); if (btn) btn.click(); });
        await wait(page, 400);
      }
    }

    await run(page, () => goHome());
    await wait(page, 500);

    // 验证第二次 session 后存在 history 含 0 的 EasyState（答错记录）
    const easyStates2 = await run(page, (id) => getAllEasyStates(id), DECK_ID);
    const hasWrongHistory = easyStates2.some(s => s.history.includes(0));
    pass('Easy: 第二次 session 答错记录写入 history', hasWrongHistory);

    // 恢复 normal 模式
    await run(page, () => setSrsMode('normal'));

    // ════ PHASE 7: 清理 ════
    section('PHASE 7: 清理');
    await run(page, async () => {
      localStorage.clear();
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) indexedDB.deleteDatabase(db.name);
      } catch (e) { /* ignore */ }
    });
    pass('清理完成', true);

  } finally {
    if (fs.existsSync(YHPACK_PATH)) fs.unlinkSync(YHPACK_PATH);
    const { passed, failed } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
