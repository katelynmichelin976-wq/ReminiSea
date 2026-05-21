/**
 * 忆海拾光 v4.9+ 跨设备同步回归测试（性能优化版）
 *
 * 场景复现：
 *   设备 A 练习 3 张卡（new→review），云端状态正确为 'review'
 *   设备 B（新设备，IndexedDB 为空）登录 → 打开同一牌组 → 触发 buildSessionQueue
 *   → buildSessionQueue 为每张卡创建 new 状态并实时同步至云端（saveCardState→syncCardState）
 *   → 覆写设备 A 的 review 状态（bug）
 *
 * 依赖：
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node _playwright_cross_device_sync_test.js
 *
 * 测试账号：zyhacl@gmail.com
 */
const { chromium } = require('playwright');
const { getBaseUrl } = require('./_playwright_helper');

const BASE_URL = getBaseUrl();
function pageUrl() { return BASE_URL + '?v=' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const TEST_DECK_NAME = '__test_xdev__';
const CARD_COUNT = 3;
const TEST_DECK_ID = '56d301aa';
const CLOUD_DECK_KEY = 'cloud_56d301aa';
const OLD_DECK_KEY = 'cloud___test_xdev__';

let passed = 0, failed = 0, errors = [];
const pass = (l, v) => { if (v) { passed++; console.log(`  ✓ ${l}`); } else { failed++; errors.push(`✗ ${l}`); console.log(`  ✗ ${l}`); } };
const check = (l, a, e) => pass(l, a === e);
const section = t => console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const wait = (page, ms) => page.waitForTimeout(ms);
const waitWrite = (pg) => pg.evaluate(async () => { if (_lastSrsWrite) await _lastSrsWrite; });
const SETTINGS_SEL = '[aria-label="设置"]';
const ts = () => Date.now();

// ── 辅助：轮询等待条件 ──
async function poll(page, fn, arg, label, timeoutMs = 15000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await run(page, fn, arg)) return true;
    await wait(page, intervalMs);
  }
  console.log(`  ⚠ poll超时: ${label}`);
  return false;
}

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const tStart = ts();
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  let pageA, pageB, ctxB;

  try {
    // ═══════════════════ PHASE 0: 登录 + 清理 + 创建数据 ═══════════════════
    const p0 = ts();
    section('PHASE 0: 登录 + 清理 + 创建数据');

    const loginPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await loginPage.goto(pageUrl(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(loginPage, 1000);

    // 登录（合并操作减少 evaluate 次数）
    await loginPage.click(SETTINGS_SEL);
    await wait(loginPage, 200);
    await run(loginPage, () => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
    });
    await wait(loginPage, 200);
    await loginPage.fill('#cloud-email', TEST_EMAIL);
    await loginPage.fill('#cloud-password', TEST_PASSWORD);
    await run(loginPage, () => { document.getElementById('cloud-login-btn').click(); });

    const loggedIn = await poll(loginPage, () => {
      const sec = document.getElementById('cloud-connected-section');
      return sec && window.getComputedStyle(sec).display !== 'none';
    }, null, 'login', 15000, 200);
    pass('登录成功', loggedIn);

    // 清理 + 创建数据（单次 evaluate 批量完成）
    const setupResult = await run(loginPage, async ({ deckId, deckName, count, oldKey, cloudKey }) => {
      const log = [];
      // 获取 userId
      const uid = _cloudUserId;

      // 删除旧牌组
      const { data: oldDeck } = await _sb.from('server_decks').select('id').eq('name', deckName).maybeSingle();
      if (oldDeck) {
        await _sb.from('server_deck_cards').delete().eq('deck_id', oldDeck.id);
        await _sb.from('server_decks').delete().eq('id', oldDeck.id);
        log.push('oldDeckDeleted');
      }

      // 清理各 deck_key 的历史数据
      for (const dk of [cloudKey, oldKey]) {
        await _sb.from('sync_trials').delete().eq('user_id', uid).eq('deck_key', dk);
        await _sb.from('sync_card_states').delete().eq('user_id', uid).eq('deck_key', dk);
      }
      log.push('syncDataCleared');

      // 创建 3 张测试卡
      const cards = [
        { card_id: 'xdev_01', card_name: '苹果', deck_name: deckName, source_file: 'test.yhspack' },
        { card_id: 'xdev_02', card_name: '香蕉', deck_name: deckName, source_file: 'test.yhspack' },
        { card_id: 'xdev_03', card_name: '橘子', deck_name: deckName, source_file: 'test.yhspack' },
      ];
      for (const c of cards) {
        await _sb.from('cards_pool').upsert(c, { onConflict: 'card_id,deck_name,source_file' });
      }

      // 创建牌组
      await _sb.from('server_decks').upsert({ id: deckId, name: deckName, description: '跨设备同步回归测试', card_count: count }, { onConflict: 'id' });

      // 关联卡片
      for (let i = 0; i < cards.length; i++) {
        await _sb.from('server_deck_cards').upsert({ deck_id: deckId, card_id: cards[i].card_id, sort_order: i }, { onConflict: 'deck_id,card_id' });
      }
      log.push('testDataCreated');
      log.push('uid:' + uid.substring(0, 8));
      return log;
    }, { deckId: TEST_DECK_ID, deckName: TEST_DECK_NAME, count: CARD_COUNT, oldKey: OLD_DECK_KEY, cloudKey: CLOUD_DECK_KEY });

    console.log(`  setup: ${setupResult.join(' → ')}`);

    // 退出登录
    await run(loginPage, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.getAttribute('onclick') === 'doCloudLogout()') { b.click(); return; } }
    });
    await wait(loginPage, 1000);
    await run(loginPage, () => { const o = document.getElementById('settings-overlay'); if (o) o.classList.remove('open'); });
    await wait(loginPage, 200);
    await loginPage.close();

    console.log(`  Phase 0 耗时: ${((ts()-p0)/1000).toFixed(1)}s`);

    // ═══════════════════ PHASE 1: 设备 A — 练习 3 张卡 ═══════════════════
    const p1 = ts();
    section('PHASE 1: 设备 A — 练习 3 张卡 (new → review)');

    pageA = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await pageA.goto(pageUrl(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(pageA, 1000);

    // 登录
    await pageA.click(SETTINGS_SEL); await wait(pageA, 200);
    await run(pageA, () => { const t = document.querySelectorAll('.sheet-tab'); for (const x of t) { if (x.textContent.includes('云端')) { x.click(); return; } } });
    await wait(pageA, 200);
    await pageA.fill('#cloud-email', TEST_EMAIL);
    await pageA.fill('#cloud-password', TEST_PASSWORD);
    await run(pageA, () => { document.getElementById('cloud-login-btn').click(); });

    const connA = await poll(pageA, () => {
      const s = document.getElementById('cloud-connected-section');
      return s && window.getComputedStyle(s).display !== 'none';
    }, null, 'deviceA login', 15000, 200);
    pass('设备 A 登录成功', connA);

    // 手动触发同步（v4.10 不自动同步）
    await run(pageA, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('同步')) { b.click(); break; } }
    });
    for (let i = 0; i < 40; i++) {
      const done = await run(pageA, () => {
        const modal = document.getElementById('sync-modal');
        return modal && modal.style.display === 'none';
      });
      if (done) break;
      await wait(pageA, 500);
    }

    // 关闭设置
    await run(pageA, () => { const o = document.getElementById('settings-overlay'); if (o) o.classList.remove('open'); });
    await wait(pageA, 300);

    // 等待测试牌组出现
    const deckFoundA = await poll(pageA, (name) => {
      const cards = document.querySelectorAll('.deck-card');
      for (const c of cards) { if (c.querySelector('.deck-name')?.textContent.includes(name)) return true; }
      return false;
    }, TEST_DECK_NAME, 'deck appearance A', 20000, 200);
    pass('测试牌组出现在首页', deckFoundA);

    // 读取牌组信息
    const deckMetaA = await run(pageA, (name) => {
      const m = (DECKS_META || []).find(x => x.name === name);
      return m ? { key: m.key, cardCount: (DECKS[m.key] || []).length } : null;
    }, TEST_DECK_NAME);
    const deckKeyA = deckMetaA.key;
    check(`牌组 ${CARD_COUNT} 张卡`, deckMetaA.cardCount, CARD_COUNT);
    console.log(`  deck_key: ${deckKeyA}`);

    // 选中牌组 + 设置学习参数
    await run(pageA, (key) => {
      const c = document.querySelector(`.deck-card[data-deck="${key}"]`);
      if (c) c.click();
    }, deckKeyA);
    await wait(pageA, 200);

    await run(pageA, () => { saveSrsConfigKey('learning_steps', [0.1]); NDUR = 0; });
    await wait(pageA, 100);

    const dpBefore = await run(pageA, () => {
      const dp = getDailyProgress();
      return { r: dp.reviewed_today || 0, n: dp.daily_new_today || 0, d: dp.active_duration_sec || 0 };
    });
    console.log(`  DP前: r=${dpBefore.r} n=${dpBefore.n} d=${dpBefore.d}`);

    // 重置每日进度（避免 daily_new_today 已达上限导致 buildSessionQueue 返回空队列）
    await run(pageA, () => { localStorage.removeItem('yihai_daily_progress'); });

    // 进入练习
    await run(pageA, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('开始练习')) { b.click(); return; } }
    });
    await wait(pageA, 3000);

    const inQuiz = await run(pageA, () => document.getElementById('screen-quiz').classList.contains('active'));
    pass('进入练习屏', inQuiz);

    // 练习 3 张卡
    let answered = 0;
    for (let ci = 0; ci < CARD_COUNT; ci++) {
      // 等待卡片就绪（检测旧卡片 transition 完成 + 新 opt 出现）
      const cardReady = await poll(pageA, () => {
        if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
        // 同时检查 revealed=false（确保是新卡）和 opt 存在
        return !revealed && document.querySelectorAll('.opt').length > 0 ? 'ready' : null;
      }, null, `card ${ci+1} ready`, 15000, 150);
      if (cardReady === 'finish') { console.log(`  卡${ci+1}: finish early`); break; }
      if (!cardReady) { console.log(`  卡${ci+1}: 未就绪`); break; }

      await run(pageA, () => {
        const o = document.querySelector('.opt[data-idx="0"]');
        if (o && !revealed) onSel(new MouseEvent('mouseup', {bubbles: true}), 0, o);
      });
      await wait(pageA, 100);
      await waitWrite(pageA);
      answered++;

      // 点击下一张
      const nxtResult = await poll(pageA, () => {
        const nxt = document.getElementById('nxtbtn');
        if (nxt && nxt.classList.contains('show') && !nxt.disabled) { nxt.click(); return 'ok'; }
        const fin = document.getElementById('screen-finish');
        if (fin && fin.classList.contains('active')) return 'finish';
        return null;
      }, null, `card ${ci+1} next`, 10000, 100);

      if (nxtResult === 'finish') { console.log(`  卡${ci+1}: 完成界面`); break; }
      if (!nxtResult) { console.log(`  卡${ci+1}: 下一张超时`); break; }

      // 等待 render() 完成（onNext 的 200ms setTimeout）
      await wait(pageA, 400);
    }

    check(`已回答 ${CARD_COUNT} 张`, answered, CARD_COUNT);
    console.log(`  完成 ${answered} 张`);

    // 回到首页
    await run(pageA, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('返回首页')) { b.click(); return; } }
    });
    await wait(pageA, 500);

    // 手动同步（使用 UI 按钮 + 等待模态关闭）
    await pageA.click(SETTINGS_SEL); await wait(pageA, 200);
    await run(pageA, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('同步')) { b.click(); break; } }
    });
    for (let i = 0; i < 40; i++) {
      const done = await run(pageA, () => {
        const modal = document.getElementById('sync-modal');
        return modal && modal.style.display === 'none';
      });
      if (done) break;
      await wait(pageA, 500);
    }
    await run(pageA, () => { const o = document.getElementById('settings-overlay'); if (o) o.classList.remove('open'); });
    await wait(pageA, 200);

    // 验证首页统计
    const statsA = await run(pageA, (key) => getDeckStatsSrs(key), deckKeyA);
    console.log(`  首页: due=${statsA.due} new=${statsA.new} done=${statsA.done}`);
    pass('done > 0', statsA.done > 0);

    // 验证云端 CardState
    const statesA = await run(pageA, async ({ key }) => {
      const { data, error } = await _sb.from('sync_card_states')
        .select('card_id,srs_stage,interval,device_id').eq('deck_key', key);
      return { data: data || [], error };
    }, { key: CLOUD_DECK_KEY });
    const revA = (statesA.data || []).filter(s => s.srs_stage === 'review').length;
    const newA = (statesA.data || []).filter(s => s.srs_stage === 'new').length;
    console.log(`  云端: ${statesA.data.length}条 review=${revA} new=${newA}`);
    pass('1B: 云端全为 review', revA === CARD_COUNT && newA === 0);

    // 记录 DP
    const dpA = await run(pageA, () => {
      const dp = getDailyProgress();
      return { r: dp.reviewed_today || 0, n: dp.daily_new_today || 0, d: dp.active_duration_sec || 0 };
    });
    console.log(`  DP后: r=${dpA.r} n=${dpA.n} d=${dpA.d}`);
    pass('1C: daily_new_today >= 3', dpA.n >= CARD_COUNT);
    pass('1D: reviewed_today >= 3', dpA.r >= CARD_COUNT);
    pass('1E: active_duration_sec > 0', dpA.d > 0);

    // 诊断：检查 IndexedDB trials 和 cloud trials
    const diagA = await run(pageA, async ({ key }) => {
      // 本地 trials
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 6);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
      const localTrials = await new Promise((res, rej) => {
        const tx = db.transaction('trials', 'readonly');
        const g = tx.objectStore('trials').getAll();
        g.onsuccess = e => res((e.target.result || []).filter(t => t.deck_key === key));
        g.onerror = e => rej(e.target.error);
      });
      // 云端 trials
      const { data: cloudTrials } = await _sb.from('sync_trials')
        .select('card_id,trial_id').eq('user_id', _cloudUserId).eq('deck_key', key);
      return {
        localTrialCount: localTrials.length,
        localUnsaved: localTrials.filter(t => !t.synced_at).length,
        cloudTrialCount: (cloudTrials || []).length,
      };
    }, { key: deckKeyA });
    console.log(`  [诊断] A本地trials=${diagA.localTrialCount} 未上传=${diagA.localUnsaved} 云端trials=${diagA.cloudTrialCount}`);

    console.log(`  Phase 1 耗时: ${((ts()-p1)/1000).toFixed(1)}s`);

    // ═══════════════════ PHASE 2: 设备 B — 打开牌组但不答题 ═══════════════════
    const p2 = ts();
    section('PHASE 2: 设备 B — 新设备打开牌组但不答题');

    ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    pageB = await ctxB.newPage();

    await pageB.goto(pageUrl(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(pageB, 1000);

    // 设备 B 登录
    await pageB.click(SETTINGS_SEL); await wait(pageB, 200);
    await run(pageB, () => { const t = document.querySelectorAll('.sheet-tab'); for (const x of t) { if (x.textContent.includes('云端')) { x.click(); return; } } });
    await wait(pageB, 200);
    await pageB.fill('#cloud-email', TEST_EMAIL);
    await pageB.fill('#cloud-password', TEST_PASSWORD);
    await run(pageB, () => { document.getElementById('cloud-login-btn').click(); });

    const connB = await poll(pageB, () => {
      const s = document.getElementById('cloud-connected-section');
      return s && window.getComputedStyle(s).display !== 'none';
    }, null, 'deviceB login', 15000, 200);
    pass('设备 B 登录成功', connB);

    // 手动同步（v4.10 不再自动同步）
    await run(pageB, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('同步')) { b.click(); break; } }
    });
    for (let i = 0; i < 40; i++) {
      const done = await run(pageB, () => {
        const modal = document.getElementById('sync-modal');
        return modal && modal.style.display === 'none';
      });
      if (done) break;
      await wait(pageB, 500);
    }

    await run(pageB, () => { const o = document.getElementById('settings-overlay'); if (o) o.classList.remove('open'); });
    await wait(pageB, 300);

    // 诊断：检查 login syncAll 是否同步了 daily_progress 和 trials
    const diagBlogin = await run(pageB, async () => {
      const dp = getDailyProgress();
      // 检查 IndexedDB 是否有云端同步下来的 card states
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 6);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
      const allStates = await new Promise((res, rej) => {
        const tx = db.transaction('card_states', 'readonly');
        const g = tx.objectStore('card_states').getAll();
        g.onsuccess = e => res(e.target.result || []);
        g.onerror = e => rej(e.target.error);
      });
      return {
        dp_r: dp.reviewed_today || 0,
        dp_n: dp.daily_new_today || 0,
        dp_d: dp.active_duration_sec || 0,
        localStateCount: allStates.length,
      };
    });
    console.log(`  [诊断] B登录后 DP: r=${diagBlogin.dp_r} n=${diagBlogin.dp_n} d=${diagBlogin.dp_d} localStates=${diagBlogin.localStateCount}`);
    // v4.10: DP 不同步（仅本地计算），但 card states 应从云端拉回
    pass('登录同步后 card states > 0', diagBlogin.localStateCount > 0);

    // 等待测试牌组
    const deckFoundB = await poll(pageB, (name) => {
      const cards = document.querySelectorAll('.deck-card');
      for (const c of cards) { if (c.querySelector('.deck-name')?.textContent.includes(name)) return true; }
      return false;
    }, TEST_DECK_NAME, 'deck appearance B', 20000, 200);
    pass('设备 B 首页显示测试牌组', deckFoundB);

    const deckMetaB = await run(pageB, (name) => {
      const m = (DECKS_META || []).find(x => x.name === name);
      return m ? { key: m.key, cardCount: (DECKS[m.key] || []).length } : null;
    }, TEST_DECK_NAME);
    check(`设备 B 牌组 ${CARD_COUNT} 张卡`, deckMetaB.cardCount, CARD_COUNT);
    console.log(`  B deck_key: ${deckMetaB.key}`);

    // ★ 关键步骤：打开牌组 → 开始练习 → 触发 buildSessionQueue → 不答题
    await run(pageB, (key) => {
      const c = document.querySelector(`.deck-card[data-deck="${key}"]`);
      if (c) c.click();
    }, deckMetaB.key);
    await wait(pageB, 200);

    await run(pageB, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('开始练习')) { b.click(); return; } }
    });
    await wait(pageB, 2000);

    const enteredB = await run(pageB, () => document.getElementById('screen-quiz').classList.contains('active'));
    console.log(`  B进入练习屏: ${enteredB}`);

    // 不答题，直接返回首页
    await run(pageB, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('返回首页')) { b.click(); return; } }
    });
    await wait(pageB, 500);

    // 诊断：buildSessionQueue 后 B 的本地状态
    const diagBafterOpen = await run(pageB, async ({ key }) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 6);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
      const states = await new Promise((res, rej) => {
        const tx = db.transaction('card_states', 'readonly');
        const g = tx.objectStore('card_states').getAll();
        g.onsuccess = e => res((e.target.result || []).filter(s => s.deck_key === key));
        g.onerror = e => rej(e.target.error);
      });
      const stages = {};
      states.forEach(s => { stages[s.srs_stage] = (stages[s.srs_stage] || 0) + 1; });
      return { stateCount: states.length, stages, dirtyCount: states.filter(s => !s.synced_at).length };
    }, { key: deckMetaB.key });
    console.log(`  [诊断] B打开牌组后本地: ${diagBafterOpen.stateCount}条 ${JSON.stringify(diagBafterOpen.stages)} dirty=${diagBafterOpen.dirtyCount}`);

    // 设备 B 手动同步（使用 UI 按钮 + 等待模态关闭）
    await pageB.click(SETTINGS_SEL); await wait(pageB, 200);
    await run(pageB, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('同步')) { b.click(); break; } }
    });
    for (let i = 0; i < 40; i++) {
      const done = await run(pageB, () => {
        const modal = document.getElementById('sync-modal');
        return modal && modal.style.display === 'none';
      });
      if (done) break;
      await wait(pageB, 500);
    }
    await run(pageB, () => { const o = document.getElementById('settings-overlay'); if (o) o.classList.remove('open'); });
    await wait(pageB, 200);

    console.log(`  Phase 2 耗时: ${((ts()-p2)/1000).toFixed(1)}s`);

    // ═══════════════════ PHASE 3: 验证 ═══════════════════
    const p3 = ts();
    section('PHASE 3: 验证');

    // 核心验证：云端 CardState（应从 pageB 查询，pageB 的 _sb 已登录）
    const statesFinal = await run(pageB, async ({ key }) => {
      const { data, error } = await _sb.from('sync_card_states')
        .select('card_id,srs_stage,interval,device_id').eq('deck_key', key);
      return { data: data || [], error };
    }, { key: CLOUD_DECK_KEY });
    const fData = statesFinal.data;
    const revF = fData.filter(s => s.srs_stage === 'review').length;
    const newF = fData.filter(s => s.srs_stage === 'new').length;
    console.log(`  云端: ${fData.length}条 review=${revF} new=${newF}`);
    if (fData.length > 0) fData.forEach(s => console.log(`    ${s.card_id}: ${s.srs_stage} dev=${(s.device_id||'').substring(0,20)}`));

    // 核心断言
    pass('验证1: 所有卡仍为 review（未被覆写为 new）', revF === CARD_COUNT && newF === 0);

    // 验证 B 的本地 DP（v4.10: DP 不同步，仅本地累积，此处应为 0）
    const dpB = await run(pageB, () => {
      const dp = getDailyProgress();
      return { r: dp.reviewed_today || 0, n: dp.daily_new_today || 0, d: dp.active_duration_sec || 0 };
    });
    console.log(`  B最终DP: r=${dpB.r} n=${dpB.n} d=${dpB.d}`);

    // 云端 trials 验证
    const todayTrials = await run(pageB, async ({ uid, dk }) => {
      const today = new Date();
      const dt = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const { data, error } = await _sb.from('sync_trials')
        .select('card_id,srs_stage_before,active_gap_ms').eq('user_id', uid).eq('trial_date', dt);
      return { data: data || [], error, date: dt };
    }, { uid: await run(pageB, () => _cloudUserId), dk: CLOUD_DECK_KEY });
    const tData = todayTrials.data || [];
    const newCards = new Set(tData.filter(t => t.srs_stage_before === 'new').map(t => t.card_id));
    const dur = tData.reduce((s, t) => s + (t.active_gap_ms || 0), 0);
    console.log(`  云端trials(${todayTrials.date}): ${tData.length}条 新卡=${newCards.size} 时长=${dur}ms`);
    if (tData.length > 0) tData.forEach(t => console.log(`    ${t.card_id}: stage_before=${t.srs_stage_before} gap=${t.active_gap_ms}ms`));
    pass('验证3a: 新卡数 = 3', newCards.size >= CARD_COUNT);
    pass('验证3b: 总时长 > 0', dur > 0);

    console.log(`  Phase 3 耗时: ${((ts()-p3)/1000).toFixed(1)}s`);

    // ═══════════════════ 结果 ═══════════════════
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}  总耗时: ${((ts()-tStart)/1000).toFixed(1)}s`);
    if (failed > 0) console.log(`  失败: ${errors.join(' | ')}`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  // 清理测试数据（无论成功失败）
  try {
    const loginPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await loginPage.goto(pageUrl(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await loginPage.waitForTimeout(1000);
    await loginPage.click('[aria-label="设置"]');
    await loginPage.waitForTimeout(200);
    await loginPage.evaluate(() => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
    });
    await loginPage.waitForTimeout(200);
    await loginPage.fill('#cloud-email', TEST_EMAIL);
    await loginPage.fill('#cloud-password', TEST_PASSWORD);
    await loginPage.evaluate(() => { document.getElementById('cloud-login-btn').click(); });
    // 等登录
    for (let i = 0; i < 20; i++) {
      const ok = await loginPage.evaluate(() => {
        const s = document.getElementById('cloud-connected-section');
        return s && window.getComputedStyle(s).display !== 'none';
      });
      if (ok) break;
      await loginPage.waitForTimeout(500);
    }
    const uid = await loginPage.evaluate(() => _cloudUserId);
    if (uid) {
      await loginPage.evaluate(async ({ uid, dk, oldKey }) => {
        for (const d of [dk, oldKey]) {
          await _sb.from('sync_trials').delete().eq('user_id', uid).eq('deck_key', d);
          await _sb.from('sync_card_states').delete().eq('user_id', uid).eq('deck_key', d);
        }
        await _sb.from('server_deck_cards').delete().eq('deck_id', dk);
        await _sb.from('server_decks').delete().eq('id', dk);
        await _sb.from('cards_pool').delete().eq('deck_name', '__test_xdev__');
      }, { uid, dk: TEST_DECK_ID, oldKey: OLD_DECK_KEY });
      // 清理本地 localStorage（防止残留到同一 Profile 的下次运行）
      await loginPage.evaluate(({ dk, oldKey }) => {
        localStorage.removeItem('yihai_deck_cloud_' + dk);
        localStorage.removeItem('yihai_deck_' + oldKey);
        const idx = JSON.parse(localStorage.getItem('yihai_decks_index') || '[]');
        const filtered = idx.filter(m => m.key !== 'cloud_' + dk && m.key !== oldKey);
        localStorage.setItem('yihai_decks_index', JSON.stringify(filtered));
      }, { dk: TEST_DECK_ID, oldKey: OLD_DECK_KEY });
    }
    await loginPage.close();
    console.log('  测试数据已清理（云端 + 本地）');
  } catch(e) { console.warn('  清理出错:', e.message); }

  if (pageB) { await pageB.close(); }
  if (ctxB) { await ctxB.close(); }
  if (pageA) { await pageA.close(); }
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
