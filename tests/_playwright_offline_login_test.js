/**
 * 离线练习后登录，CardState 进度保留测试（#26）
 *
 * 依赖：
 *   python -m http.server 8080 --directory C:\code
 *   TEST_PASSWORD=xxx node tests/_playwright_offline_login_test.js
 *
 * 场景：
 *   1. 离线直接写一条 user_id=deviceId 的 CardState（模拟离线练习）
 *   2. 登录云端账号
 *   3. 等待迁移+同步完成
 *   4. 断言：getAllCardStates 仍能读到该卡，且 srs_stage 不是 'new'
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, check, section, wait, run, getBaseUrl } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL    = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const FAKE_DECK_KEY = '__offline_test__';
const FAKE_CARD_ID  = 'card_offline_001';

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', err => console.log(`  [PAGE ERROR] ${err.message}`));

  try {
    // ═══════════════════ PHASE 1: 写离线 CardState ═══════════════════
    section('PHASE 1: 离线写 CardState（user_id=deviceId）');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    // 获取当前 deviceId（未登录时 getCurrentUserId() 返回 deviceId）
    const deviceId = await run(page, () => getCurrentUserId());
    pass('获取 deviceId 非空', !!deviceId && deviceId.length > 0);
    console.log(`    deviceId = ${deviceId}`);

    // 直接写一条 srs_stage='learning' 的 CardState，user_id=deviceId
    const stateKey = FAKE_DECK_KEY + '::' + FAKE_CARD_ID;
    const written = await run(page, async ([deckKey, cardId, sk, uid]) => {
      const db = await openSrsDb();
      const state = {
        state_key: sk, card_id: cardId, deck_key: deckKey,
        user_id: uid,
        srs_stage: 'learning', interval: 0, ease_factor: 2.5,
        due_date: '', due_ts: Date.now() + 600000,
        step_index: 1, review_mode: 'T1', review_mode_count: 0,
        lapses_streak: 0, lapses_total: 0, suspended: false, suspended_reason: '',
        updated_at: new Date().toISOString(), synced_at: null,
      };
      return new Promise((res, rej) => {
        const tx = db.transaction('card_states', 'readwrite');
        tx.objectStore('card_states').put(state);
        tx.oncomplete = () => res(true);
        tx.onerror = e => rej(e.target.error);
      });
    }, [FAKE_DECK_KEY, FAKE_CARD_ID, stateKey, deviceId]);
    pass('离线 CardState 写入 IDB 成功', written === true);

    // 验证写入前可以读到（user_id 还是 deviceId，getCurrentUserId 也返回 deviceId）
    const beforeLogin = await run(page, async (sk) => {
      const states = await getAllCardStates(null);
      return states.find(s => s.state_key === sk) || null;
    }, stateKey);
    pass('登录前可读到离线 CardState', !!beforeLogin);
    check('登录前 srs_stage=learning', beforeLogin && beforeLogin.srs_stage, 'learning');

    // ═══════════════════ PHASE 2: 登录 ═══════════════════
    section('PHASE 2: 登录云端账号');
    const loginOk = await helper.cloudLogin(page, TEST_EMAIL, TEST_PASSWORD);
    pass('登录成功', loginOk);

    // 等待同步模态消失（或超时）
    await helper.waitSyncModal(page, 60);
    await wait(page, 3000);

    // ═══════════════════ PHASE 3: 验证迁移结果 ═══════════════════
    section('PHASE 3: 验证登录后离线进度保留');

    // 检查 IDB 中该记录的 user_id 是否已迁移为 cloudUserId
    const cloudUserId = await run(page, () => _cloudUserId);
    pass('cloudUserId 已获取', !!cloudUserId);
    console.log(`    cloudUserId = ${cloudUserId}`);

    const rawState = await run(page, async (sk) => {
      const db = await openSrsDb();
      return new Promise((res, rej) => {
        const req = db.transaction('card_states', 'readonly').objectStore('card_states').get(sk);
        req.onsuccess = e => res(e.target.result || null);
        req.onerror = e => rej(e.target.error);
      });
    }, stateKey);
    pass('IDB 中记录仍存在', !!rawState);
    check('IDB user_id 已迁移为 cloudUserId', rawState && rawState.user_id, cloudUserId);

    // getAllCardStates 按当前用户过滤后应能读到
    const afterLogin = await run(page, async (sk) => {
      const states = await getAllCardStates(null);
      return states.find(s => s.state_key === sk) || null;
    }, stateKey);
    pass('登录后 getAllCardStates 仍能读到离线 CardState', !!afterLogin);
    check('登录后 srs_stage 保持 learning（未被重置为 new）', afterLogin && afterLogin.srs_stage, 'learning');

  } finally {
    const { passed, failed, errors } = helper.getCounts();
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  结果：${passed} 通过  ${failed} 失败`);
    if (errors.length) { console.log('\n  失败详情：'); errors.forEach(e => console.log('  ' + e)); }
    console.log('═'.repeat(60));
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
