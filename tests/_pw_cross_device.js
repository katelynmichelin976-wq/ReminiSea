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
        const dp = JSON.parse(localStorage.getItem('yh:v1:daily:progress') || '{}');
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
        const r = db.transaction('sync_card_states', 'readonly').objectStore('sync_card_states').getAll();
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
        const dp = JSON.parse(localStorage.getItem('yh:v1:daily:progress') || '{}');
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
    section('PHASE 6: 水位迁移 — yihaiSyncAt → deckSync.pushedAt/pulledAt（v5.13.4 Phase 3 yh:v1: 路径）');
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
      removeDeckSync(key);
      // Phase 3 后 yihaiSyncAt: 已被 keyRenames 重命名为 yh:v1:deck:_:syncAt；migrateSyncWatermarks 扫新前缀
      localStorage.setItem('yh:v1:deck:' + key + ':syncAt', iso);
    }, { key: migDeckKey, iso: oldIso });

    const beforeMig = await run(pageA, (key) => {
      const s = getDeckSync(key);
      return { pushedAt: s.pushedAt, pulledAt: s.pulledAt };
    }, migDeckKey);
    pass('迁移: 前置条件 pushedAt/pulledAt 为空', !beforeMig.pushedAt && !beforeMig.pulledAt);

    await run(pageA, () => migrateSyncWatermarks());

    const afterMig = await run(pageA, ({ key, ts }) => {
      const s = getDeckSync(key);
      return { pushedAt: s.pushedAt, pulledAt: s.pulledAt };
    }, { key: migDeckKey, ts: oldTs });
    pass('迁移: deckSync pushedAt 已生成', afterMig.pushedAt === oldTs);
    pass('迁移: deckSync pulledAt 已生成', afterMig.pulledAt === oldTs);

    const diff = await run(pageA, (key) => {
      const cards = DECKS[key] || [];
      const deleted = getDeletedCards(key);
      const { pushedAt, pulledAt } = getDeckSync(key);
      const d = computeDeckDiff(cards, deleted, [], pushedAt, pulledAt);
      return { toPush: d.toPush.length, toPull: d.toPull.length, toDelete: d.toDelete.length };
    }, migDeckKey);
    pass('迁移: 迁移后 toPush 为空（水位已对齐）', diff.toPush === 0);

    // ════ PHASE 7: pull 保留本地媒体 blob（Fix 1 回归）════
    section('PHASE 7: pull 保留本地媒体 — mod=0 触发 toPull 不应清掉 img/audioUrl');
    const mediaDeckKey = 'pwMediaDeck' + Date.now();
    await run(pageA, async (key) => {
      const imgBlob = new Blob([new Uint8Array([0x89,0x50,0x4E,0x47])], { type: 'image/png' });
      const audBlob = new Blob([new Uint8Array([0xFF,0xFB])], { type: 'audio/mpeg' });
      await saveMedia(`${key}_mc1_img`, imgBlob);
      await saveMedia(`${key}_mc1_aud`, audBlob);
      const imgPath = `personal/${_cloudUserId}/${key}/mc1_img.png`;
      const audPath = `personal/${_cloudUserId}/${key}/mc1_aud.mp3`;
      await _sb.storage.from('ReminiSea').upload(imgPath, imgBlob, { upsert: true });
      await _sb.storage.from('ReminiSea').upload(audPath, audBlob, { upsert: true });
      const card = {
        id: 'mc1', name: 'media-test', nameLang: 'zh-CN',
        img: URL.createObjectURL(imgBlob), audioUrl: URL.createObjectURL(audBlob),
        _imgUrl: imgPath, _audUrl: audPath,
        details: [], cardType: 'choice', ext: {}, mod: nextMod()
      };
      DECKS[key] = [card];
      DECKS_META.push({ key, name: 'pwMedia', deck_type: 'personal', nameLang: 'zh-CN', mod: nextMod() });
      saveDeckIndex();
      saveDeckCards(key, DECKS[key]);
      await syncDeck(key);
    }, mediaDeckKey);

    const beforePullState = await run(pageA, (key) => {
      const c = DECKS[key][0];
      return { imgIsBlob: c.img?.startsWith('blob:'), audIsBlob: c.audioUrl?.startsWith('blob:') };
    }, mediaDeckKey);
    pass('Fix1: pull 前 img/audioUrl 都是 blob URL',
      beforePullState.imgIsBlob && beforePullState.audIsBlob);

    await run(pageA, async (key) => {
      // 触发真正的 pull：清水位 + 把 meta.mod/card.mod 设为 0
      // （避免 upsertDeckRow 在 Phase 1 把 pulledAt 推到 now 反而跳过 toPull）
      const meta = DECKS_META.find(m => m.key === key);
      meta.mod = 0;
      DECKS[key][0].mod = 0;
      saveDeckIndex();
      saveDeckCards(key, DECKS[key]);
      localStorage.setItem('yihaiPulledAt:' + key, '0');
      await syncDeck(key);
    }, mediaDeckKey);

    const afterPullState = await run(pageA, (key) => {
      const c = DECKS[key][0];
      return {
        imgIsBlob: c.img?.startsWith('blob:'),
        audIsBlob: c.audioUrl?.startsWith('blob:'),
        imgUrl: c._imgUrl, audUrl: c._audUrl
      };
    }, mediaDeckKey);
    pass('Fix1: pull 后 img 仍是 blob URL（_imgUrl 相同保留）', afterPullState.imgIsBlob);
    pass('Fix1: pull 后 audioUrl 仍是 blob URL（_audUrl 相同保留）', afterPullState.audIsBlob);
    pass('Fix1: pull 后 _imgUrl 不丢', !!afterPullState.imgUrl);

    // ════ PHASE 8: 同步动作不应造成 remoteAhead 假象（v5.8.1 Fix 2 回归，v5.9 适配）════
    // 原意：cloud.decks.updated_at 因同步动作 bump 时，本地 pulledAt 必须同步推进，
    //       否则牌组管理页常驻「待下载」/ 首页常驻黄点。
    // v5.9 媒体路径已改 media slot，但水位推进逻辑仍由 upsertDeckRow / runCardsPhase 末尾负责，
    // 用「卡片改动 → syncDeck → cloud updated_at 推进」覆盖即可，无需依赖已废弃的 uploadPersonalDeckMedia
    section('PHASE 8: 同步后 state 仍为 clean — pulledAt 跟随 cloud.updated_at');
    const stateBeforeReupload = await run(pageA, (key) => computeDeckSyncState(key), mediaDeckKey);
    pass('Fix2: 同步前 state=clean', stateBeforeReupload.status === 'clean');

    await run(pageA, async (key) => {
      const card = DECKS[key][0];
      card.mod = Date.now();
      saveDeckCards(key, DECKS[key]);
      await syncDeck(key);
    }, mediaDeckKey);

    const stateAfterReupload = await run(pageA, (key) => computeDeckSyncState(key), mediaDeckKey);
    pass('Fix2: 卡片改动同步后 state 仍为 clean（pulledAt 已推进）',
      stateAfterReupload.status === 'clean');

    // ════ PHASE 9: 老设备升级后首次同步不卡「双向 +N」(Fix 3 回归) ════
    section('PHASE 9: 老设备升级 — pull 后 pushedAt 跟进 + meta._remoteUpdatedAt 刷新');
    await run(pageA, async (key) => {
      const meta = DECKS_META.find(m => m.key === key);
      for (const c of DECKS[key]) c.mod = 0;
      meta.mod = 0;
      saveDeckIndex(); saveDeckCards(key, DECKS[key]);
      const oldEpoch = Date.parse('2026-06-05T05:57:02.584Z');
      setDeckSync(key, { pushedAt: oldEpoch, pulledAt: oldEpoch });
    }, mediaDeckKey);

    await run(pageA, async (key) => { await syncDeck(key); }, mediaDeckKey);

    const stateAfterUpgrade = await run(pageA, (key) => computeDeckSyncState(key), mediaDeckKey);
    pass('Fix3: 老设备升级后 sync → state=clean（不是 bothChanged +N）',
      stateAfterUpgrade.status === 'clean');

    const wm = await run(pageA, (key) => {
      const s = getDeckSync(key);
      return { pushed: s.pushedAt, pulled: s.pulledAt };
    }, mediaDeckKey);
    pass('Fix3: pushedAt 已推进到 pulledAt（不再卡老 ISO 时间）',
      wm.pushed === wm.pulled && wm.pushed > 0);

    // ════ PHASE 10: mediaIncomplete 状态验证 ════
    section('PHASE 10: computeDeckSyncState mediaIncomplete 分支');

    const phase10Key = 'pwPhase10_' + Date.now();
    await run(pageA, (key) => {
      // 注入一张有 url 但无 _blob 的卡片（模拟已上传但本地未缓存）
      DECKS[key] = [{ id: 'p10c1', name: 'test', nameLang: 'zh-CN',
        cardType: 'choice', ext: {}, mod: 1000,
        media: { img: { url: 'personal/uid/deck/p10c1_img.jpg', v: 0, _blob: '' } } }];
      DECKS_META.push({ key, name: 'pwPhase10', deck_type: 'personal', nameLang: 'zh-CN', mod: 500 });
      saveDeckIndex();
      saveDeckCards(key, DECKS[key]);
      // 设置水位：pushedAt/pulledAt > mod，使 localChanged=false、remoteAhead=false
      setDeckSync(key, { pushedAt: 2000, pulledAt: 2000 });
    }, phase10Key);

    const stateMediaMissing = await run(pageA, (key) => {
      const s = computeDeckSyncState(key);
      return { status: s.status, mediaIncomplete: !!s.mediaIncomplete };
    }, phase10Key);
    pass('PHASE 10: url 有值 _blob 为空 → mediaIncomplete=true', stateMediaMissing.mediaIncomplete === true);
    pass('PHASE 10: url 有值 _blob 为空时 status=clean（mediaIncomplete 是独立 flag）', stateMediaMissing.status === 'clean');

    // 补上 _blob → mediaIncomplete 应变为 false
    await run(pageA, (key) => {
      DECKS[key][0].media.img._blob = 'blob:fake';
    }, phase10Key);
    const stateMediaLoaded = await run(pageA, (key) => {
      const s = computeDeckSyncState(key);
      return { status: s.status, mediaIncomplete: !!s.mediaIncomplete };
    }, phase10Key);
    pass('PHASE 10: _blob 补全后 → mediaIncomplete=false', stateMediaLoaded.mediaIncomplete === false);
    pass('PHASE 10: _blob 补全后 status=clean', stateMediaLoaded.status === 'clean');

    // 清理本地注入的 deck
    await run(pageA, (key) => {
      const idx = DECKS_META.findIndex(m => m.key === key);
      if (idx >= 0) DECKS_META.splice(idx, 1);
      delete DECKS[key];
      saveDeckIndex();
    }, phase10Key);

    // ════ PHASE 11: runMediaPhase await — syncDeck 完成后 deckMediaComplete ════
    section('PHASE 11: SyncJob.run() await runMediaPhase — 完成后 deckMediaComplete=true');

    await run(pageA, async (key) => {
      if (typeof syncDeck === 'function' && _syncEnabled) {
        try { await syncDeck(key); } catch(e) {}
      }
    }, mediaDeckKey);

    const mediaComplete = await run(pageA, (key) => {
      const cards = DECKS[key] || [];
      return cards.every(c => Object.keys(c.media || {}).every(slot => {
        const s = c.media[slot];
        return !s.url || !!s._blob;
      }));
    }, mediaDeckKey);
    pass('PHASE 11: syncDeck() 完成后 deckMediaComplete=true', mediaComplete === true);

    // Easy 模式跨设备同步独立到 tests/_pw_easy_sync.js（不依赖此处脆弱的 PHASE 8/9/10/11）

    // ════ 清理 ════
    section('清理云端测试数据');
    await run(pageA, async (keys) => {
      for (const k of keys) {
        try { await _sb.from('deck_cards').delete().eq('deck_id', k); } catch(e) {}
        try { await _sb.from('decks').delete().eq('id', k); } catch(e) {}
      }
    }, [incDeckKey, pauseDeckKey, migDeckKey, mediaDeckKey]);
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
