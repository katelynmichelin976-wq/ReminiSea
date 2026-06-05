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
const TEST_EMAIL = 'zyhaff@gmail.com';
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
        const dp = JSON.parse(localStorage.getItem('yihaiDailyProgress') || '{}');
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
        const dp = JSON.parse(localStorage.getItem('yihaiDailyProgress') || '{}');
        return dp.reviewed_today || 0;
      } catch (e) { return 0; }
    });
    pass('DP 不跨设备同步（设备 B reviewed_today=0）', dpB === 0);

    // ════ PHASE 4: 增量上传 ════
    section('PHASE 4: 增量上传 — 编辑单张卡只更新该行');
    const incDeckKey = 'pwIncDeck' + Date.now();
    await run(pageA, (key) => {
      DECKS[key] = [
        { id: 'c1', name: 'card-1', nameLang: 'zh-CN', img: '', audioUrl: '', details: [], cardType: 'choice', ext: {}, mod: nextMod() },
        { id: 'c2', name: 'card-2', nameLang: 'zh-CN', img: '', audioUrl: '', details: [], cardType: 'choice', ext: {}, mod: nextMod() },
        { id: 'c3', name: 'card-3', nameLang: 'zh-CN', img: '', audioUrl: '', details: [], cardType: 'choice', ext: {}, mod: nextMod() },
      ];
      DECKS_META.push({ key, name: 'pwInc', deck_type: 'personal', nameLang: 'zh-CN', mod: nextMod() });
      saveDeckIndex();
      saveDeckCards(key, DECKS[key]);
    }, incDeckKey);

    const firstSyncErr = await run(pageA, async (key) => {
      try { await syncDeck(key); return null; } catch(e) { return e.message; }
    }, incDeckKey);
    pass('增量: 首次同步成功', firstSyncErr === null);

    const remote1 = await run(pageA, async (key) => {
      const { data } = await _sb.from('deck_cards')
        .select('card_id,updated_at').eq('deck_id', key).order('card_id');
      return data || [];
    }, incDeckKey);
    pass('增量: 云端有 3 张卡', remote1.length === 3);
    const c2OldUpdated = (remote1.find(r => r.card_id === 'c2') || {}).updated_at || '';
    const c1OldUpdated = (remote1.find(r => r.card_id === 'c1') || {}).updated_at || '';

    await wait(pageA, 1100);

    const editErr = await run(pageA, async (key) => {
      const card = DECKS[key].find(c => c.id === 'c2');
      card.name = 'card-2-edited';
      card.mod = nextMod();
      saveDeckCards(key, DECKS[key]);
      try { await syncDeck(key); return null; } catch(e) { return e.message; }
    }, incDeckKey);
    pass('增量: 第二次 syncDeck 成功', editErr === null);

    const remote2 = await run(pageA, async (key) => {
      const { data } = await _sb.from('deck_cards')
        .select('card_id,name,updated_at').eq('deck_id', key).order('card_id');
      return data || [];
    }, incDeckKey);
    const c2New = remote2.find(r => r.card_id === 'c2') || {};
    const c1New = remote2.find(r => r.card_id === 'c1') || {};
    pass('增量: c2 内容已更新', c2New.name === 'card-2-edited');
    pass('增量: c2 updated_at 改变', c2New.updated_at !== c2OldUpdated);
    pass('增量: c1 updated_at 未变（未重传）', c1New.updated_at === c1OldUpdated);

    // ════ PHASE 5: 暂停续传 ════
    section('PHASE 5: 暂停续传 — pause/resume API');
    const pauseDeckKey = 'pwPauseDeck' + Date.now();
    await run(pageA, (key) => {
      const cards = [];
      for (let i = 0; i < 250; i++) {
        cards.push({ id: 'pc' + i, name: 'pause-card-' + i, nameLang: 'zh-CN', img: '', audioUrl: '', details: [], cardType: 'choice', ext: {}, mod: nextMod() });
      }
      DECKS[key] = cards;
      DECKS_META.push({ key, name: 'pwPause', deck_type: 'personal', nameLang: 'zh-CN', mod: nextMod() });
      saveDeckIndex();
      saveDeckCards(key, cards);
    }, pauseDeckKey);

    await run(pageA, (key) => {
      window._pwJob = new SyncJob(key);
      window._pwJobPromise = window._pwJob.run();
      window._pwJobPromise.catch(() => {});
    }, pauseDeckKey);

    let pausedSnapshot = null;
    for (let i = 0; i < 50; i++) {
      await wait(pageA, 100);
      const phase = await run(pageA, () => window._pwJob && window._pwJob.phase);
      if (phase === 'cards') {
        const done = await run(pageA, () => window._pwJob.progress.done);
        if (done >= 100) {
          await run(pageA, () => window._pwJob.pause());
          pausedSnapshot = await run(pageA, () => ({
            done: window._pwJob.progress.done,
            paused: window._pwJob._paused,
            phase: window._pwJob.phase
          }));
          break;
        }
      }
      if (phase === 'done' || phase === 'error') break;
    }
    pass('暂停: 进入 cards 阶段且 ≥100 张已传后暂停', !!pausedSnapshot && pausedSnapshot.done >= 100 && pausedSnapshot.paused);

    if (pausedSnapshot) {
      await wait(pageA, 1500);
      const settledDone = await run(pageA, () => window._pwJob.progress.done);
      await wait(pageA, 2000);
      const stillPaused = await run(pageA, () => ({
        done: window._pwJob.progress.done,
        phase: window._pwJob.phase
      }));
      pass('暂停: 暂停后进度不再推进', stillPaused.done === settledDone && stillPaused.phase !== 'done');

      await run(pageA, () => window._pwJob.resume());

      let finished = false;
      for (let i = 0; i < 120; i++) {
        await wait(pageA, 500);
        const phase = await run(pageA, () => window._pwJob.phase);
        if (phase === 'done' || phase === 'error') { finished = phase === 'done'; break; }
      }
      pass('续传: resume 后完成', finished);

      const cloudCount = await run(pageA, async (key) => {
        const { count } = await _sb.from('deck_cards')
          .select('card_id', { count: 'exact', head: true }).eq('deck_id', key);
        return count;
      }, pauseDeckKey);
      pass('续传: 云端最终有 250 张卡', cloudCount === 250);
    } else {
      pass('暂停: 进入 cards 阶段且 ≥100 张已传后暂停（无法捕获暂停点）', false);
      pass('暂停: 暂停后进度不再推进（跳过）', false);
      pass('续传: resume 后完成（跳过）', false);
      pass('续传: 云端最终有 250 张卡（跳过）', false);
    }

    // ════ PHASE 6: 水位迁移 ════
    section('PHASE 6: 水位迁移 — yihaiSyncAt → yihaiPushedAt/yihaiPulledAt');
    const migDeckKey = 'pwMigDeck' + Date.now();
    const oldTs = Date.now() + 60 * 60 * 1000;
    const oldIso = new Date(oldTs).toISOString();

    await run(pageA, ({ key, iso }) => {
      DECKS[key] = [
        { id: 'mc1', name: 'mig-1', nameLang: 'zh-CN', img: '', audioUrl: '', details: [], cardType: 'choice', ext: {}, mod: 1000 },
      ];
      DECKS_META.push({ key, name: 'pwMig', deck_type: 'personal', nameLang: 'zh-CN', mod: 1000 });
      saveDeckIndex();
      saveDeckCards(key, DECKS[key]);
      localStorage.removeItem('yihaiPushedAt:' + key);
      localStorage.removeItem('yihaiPulledAt:' + key);
      localStorage.setItem('yihaiSyncAt:' + key, iso);
    }, { key: migDeckKey, iso: oldIso });

    const beforeMig = await run(pageA, (key) => ({
      pushed: localStorage.getItem('yihaiPushedAt:' + key),
      pulled: localStorage.getItem('yihaiPulledAt:' + key)
    }), migDeckKey);
    pass('迁移: 前置条件 pushedAt/pulledAt 为空', !beforeMig.pushed && !beforeMig.pulled);

    await run(pageA, () => migrateSyncWatermarks());

    const afterMig = await run(pageA, (key) => ({
      pushed: localStorage.getItem('yihaiPushedAt:' + key),
      pulled: localStorage.getItem('yihaiPulledAt:' + key)
    }), migDeckKey);
    pass('迁移: yihaiPushedAt 已生成', afterMig.pushed === oldIso);
    pass('迁移: yihaiPulledAt 已生成', afterMig.pulled === oldIso);

    const diff = await run(pageA, (key) => {
      const cards = DECKS[key] || [];
      const deleted = getDeletedCards(key);
      const pushedAt = parseWatermark(localStorage.getItem('yihaiPushedAt:' + key));
      const pulledAt = parseWatermark(localStorage.getItem('yihaiPulledAt:' + key));
      const d = computeDeckDiff(cards, deleted, [], pushedAt, pulledAt);
      return { toPush: d.toPush.length, toPull: d.toPull.length, toDelete: d.toDelete.length };
    }, migDeckKey);
    pass('迁移: 迁移后 toPush 为空（水位已对齐）', diff.toPush === 0);

    // ════ 清理 ════
    section('清理云端测试数据');
    await run(pageA, async (keys) => {
      for (const k of keys) {
        try { await _sb.from('deck_cards').delete().eq('deck_id', k); } catch(e) {}
        try { await _sb.from('decks').delete().eq('id', k); } catch(e) {}
      }
    }, [incDeckKey, pauseDeckKey, migDeckKey]);
    pass('清理: 完成', true);

    console.log(`\n  总耗时: ${((ts() - tStart) / 1000).toFixed(1)}s`);

  } finally {
    const { passed, failed } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
