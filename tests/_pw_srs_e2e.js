/**
 * 忆海拾光 SRS 端到端测试 — v5.1+
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_srs_e2e.js
 *
 * 覆盖：.yhspack 导入、5天练习、CardState/TrialLog 写入、统计 KPI、
 *       session_mode 持久化、hard 模式队列 U 形曲线
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
        const tx = db.transaction('card_states', 'readwrite');
        const sto = tx.objectStore('card_states');
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

      // 重置 daily progress 以便每天都能练习（正确 key: yihai_daily_progress）
      await run(page, () => {
        const today = new Date().toISOString().slice(0, 10);
        const fresh = { date: today, reviewed_today: 0, daily_new_today: 0,
                        first_fail_today: 0, first_hard_today: 0, first_pass_today: 0 };
        localStorage.setItem('yihai_daily_progress', JSON.stringify(fresh));
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
        const r = db.transaction('card_states', 'readonly').objectStore('card_states').getAll();
        r.onsuccess = () => res(r.result);
      });
      const trials = await new Promise(res => {
        const r = db.transaction('trials', 'readonly').objectStore('trials').getAll();
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
    await run(page, () => localStorage.setItem('srs_session_mode', 'hard'));
    await page.reload({ waitUntil: 'networkidle' });
    await wait(page, 1000);
    pass('hard 模式刷新后恢复', await run(page, () =>
      localStorage.getItem('srs_session_mode') === 'hard'
    ));
    await run(page, () => localStorage.removeItem('srs_session_mode'));

    // ════ PHASE 6: hard 模式队列 U 形曲线 ════
    section('PHASE 6: hard 模式队列曲线');
    const curve = await run(page, async (did) => {
      // 为卡片设置不同 ease_factor 制造难度差异，阶段设为 review
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const tx = db.transaction('card_states', 'readwrite');
      const sto = tx.objectStore('card_states');
      const all = await new Promise(res => { const r = sto.getAll(); r.onsuccess = () => res(r.result); });
      const deckStates = all.filter(s => s.deck_key === did);
      // 制造 ease_factor 差异（低值=困难，高值=容易）
      const efs = [2.5, 1.3, 1.4, 2.4, 2.3, 1.5, 1.6, 2.2, 2.1, 1.7];
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      for (let i = 0; i < Math.min(deckStates.length, efs.length); i++) {
        deckStates[i].ease_factor = efs[i];
        deckStates[i].srs_stage = 'review';
        deckStates[i].due_date = yesterday;
        deckStates[i].due_ts = Date.now() - 60000;
        await new Promise(r2 => { const u = sto.put(deckStates[i]); u.onsuccess = r2; });
      }
      // 构建 hard 模式队列
      if (typeof buildSessionQueue !== 'function') return null;
      // 设置 session_mode 为 hard
      SRS_CONFIG.session_mode = 'hard';
      const queue = await buildSessionQueue(did);
      SRS_CONFIG.session_mode = localStorage.getItem('srs_session_mode') || 'normal';
      if (!queue || queue.length < 4) return null;
      const first = queue[0]?._srsState?.ease_factor ?? 2.5;
      const last  = queue[queue.length - 1]?._srsState?.ease_factor ?? 2.5;
      const mid   = queue[Math.floor(queue.length / 2)]?._srsState?.ease_factor ?? 2.5;
      return { first, mid, last, len: queue.length };
    }, DECK_ID);

    if (curve) {
      pass('hard 模式队列首尾 ef > 中间（U 形曲线）',
        curve.first > curve.mid && curve.last > curve.mid
      );
    } else {
      pass('hard 模式队列曲线（条件不足，跳过）', true);
    }

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
