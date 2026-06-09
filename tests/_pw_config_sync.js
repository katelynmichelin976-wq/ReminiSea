/**
 * 忆海拾光 语音辅助参数云同步回归测试
 * 依赖：python -m http.server 8080 --directory C:\code
 *        $env:TEST_PASSWORD="xxx"
 * 运行：$env:TEST_PASSWORD="xxx"; node tests/_pw_config_sync.js
 *
 * 覆盖：语音文字参数 push→pull 一致性（全 13 key）
 *        废弃 snake_case key 清理
 *        跨设备语音参数传播
 *        语音录音 URL 同步（骨架，待实现）
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL    = 'zyhaff@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

// 全部 13 个语音参数测试值（pw-test- 前缀便于区分测试数据）
const VOICE_PARAMS = {
  phraseQuizPrompt:          'pw-test-问题提示',
  phraseQuizPromptRecognize: 'pw-test-认识吗',
  phraseWrong:               'pw-test-再想想',
  phraseOptHint:             'pw-test-选项提示',
  phraseCorrect:             'pw-test-答对了',
  ansReadDelay:              '3.5',
  optReadDelay:              '4.0',
  browseAnsDelay:            '2.0',
  ttsRate:                   '0.9',
  ttsPitch:                  '1.1',
  ttsVoiceName:              'pw-test-voice',
  voiceMuted:                '1',
  voiceAssistEnabled:        '1',
};

// cloudPushConfig 合并后必须删除的废弃 key
const DEPRECATED_KEYS = [
  'phrase_quiz_prompt', 'phrase_quiz_prompt_recognize',
  'phrase_opt_hint', 'phraseSelect',
];

async function waitSyncDone(page, maxMs) {
  const iters = Math.ceil((maxMs || 120000) / 500);
  for (let i = 0; i < iters; i++) {
    const done = await run(page, () =>
      typeof _syncInFlight === 'undefined' || !_syncInFlight
    );
    if (done) return true;
    await wait(page, 500);
  }
  return false;
}

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page    = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => console.log(`  [PAGE ERROR] ${e.message}`));

  let ctxB, pageB;

  try {
    // ════ PHASE 0: 初始化 + 登录 ════
    section('PHASE 0: 初始化 + 登录');
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
    pass('初始化登录成功', await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));
    pass('登录同步完成', await waitSyncDone(page));
    await run(page, () => goHome());
    await wait(page, 500);

    // ════ PHASE 1: 全量语音文字参数 push→pull 一致性 ════
    section('PHASE 1: 全量语音文字参数 push→pull 一致性');

    // 写入全部 13 个 voice 参数
    await run(page, (params) => {
      Object.entries(params).forEach(([k, v]) => localStorage.setItem(k, v));
    }, VOICE_PARAMS);

    // push 到云端
    const push1Ok = await run(page, async () => {
      try { await cloudPushConfig(); return true; } catch (e) { return false; }
    });
    pass('PHASE 1: cloudPushConfig 推送成功', push1Ok);
    await wait(page, 1000);

    // 直接读 Supabase sync_config.config_json.ui 核对（代表 5 个类型）
    const cloudUi1 = await run(page, async () => {
      const { data } = await _sb.from('sync_config').select('config_json').maybeSingle();
      return data?.config_json?.ui || null;
    });
    pass('云端 phraseQuizPrompt 写入正确', cloudUi1?.phraseQuizPrompt === 'pw-test-问题提示');
    pass('云端 phraseWrong 写入正确',     cloudUi1?.phraseWrong      === 'pw-test-再想想');
    pass('云端 ansReadDelay 写入正确',    cloudUi1?.ansReadDelay     === '3.5');
    pass('云端 voiceMuted 写入正确',      cloudUi1?.voiceMuted       === '1');
    pass('云端 ttsRate 写入正确',         cloudUi1?.ttsRate          === '0.9');

    // 清空本地全部 13 个 key
    await run(page, (params) => {
      Object.keys(params).forEach(k => localStorage.removeItem(k));
    }, VOICE_PARAMS);

    // pull 拉取云端配置
    await run(page, async () => { await cloudPullConfig(); });
    await wait(page, 500);

    // 本地值 == 云端值（全 13 个 key 整体比对）
    const localMatch1 = await run(page, (params) => {
      return Object.entries(params).every(([k, v]) => localStorage.getItem(k) === v);
    }, VOICE_PARAMS);
    pass('cloudPullConfig 后本地 13 个 key 全部还原（本地 == 云端）', localMatch1);

    // 运行时全局变量映射正确
    const globals1 = await run(page, () => ({
      phraseSelect: typeof PHRASE_SELECT   !== 'undefined' ? PHRASE_SELECT   : null,
      ansDelay:     typeof ANS_READ_DELAY  !== 'undefined' ? ANS_READ_DELAY  : null,
      voiceMuted:   typeof VOICE_MUTED     !== 'undefined' ? VOICE_MUTED     : null,
    }));
    pass('PHRASE_SELECT 全局变量映射正确',                globals1.phraseSelect === 'pw-test-问题提示');
    pass('ANS_READ_DELAY 全局变量映射正确（3.5s → 3500ms）', globals1.ansDelay   === 3500);
    pass('VOICE_MUTED 全局变量映射正确',                  globals1.voiceMuted   === true);

    // ════ PHASE 2: 废弃 snake_case key 清理 ════
    section('PHASE 2: 废弃 snake_case key 清理');

    // 向云端注入废弃 key（模拟旧版本残留）
    await run(page, async (deprecatedKeys) => {
      const { data } = await _sb.from('sync_config').select('config_json').maybeSingle();
      const cfg = data?.config_json || { srs: {}, ui: {} };
      deprecatedKeys.forEach(k => { cfg.ui[k] = 'stale-value'; });
      await _sb.from('sync_config').upsert({
        user_id:     _cloudUserId,
        config_json: cfg,
        updated_at:  Date.now(),
      }, { onConflict: 'user_id' });
    }, DEPRECATED_KEYS);
    await wait(page, 500);

    // cloudPushConfig 的 merge 逻辑会 delete 废弃 key
    const push2Ok = await run(page, async () => {
      try { await cloudPushConfig(); return true; } catch (e) { return false; }
    });
    pass('PHASE 2: cloudPushConfig 推送成功', push2Ok);
    await wait(page, 1000);

    // 直接读云端断言废弃 key 全部消失
    const cloudUi2 = await run(page, async () => {
      const { data } = await _sb.from('sync_config').select('config_json').maybeSingle();
      return data?.config_json?.ui || null;
    });
    pass('废弃 key 全部从云端 config_json 中删除',
      cloudUi2 !== null && DEPRECATED_KEYS.every(k => !(k in cloudUi2)));
    pass('合法 key phraseQuizPrompt 仍存在于云端',
      cloudUi2 !== null && 'phraseQuizPrompt' in cloudUi2);

    // ════ PHASE 3: 跨设备语音参数传播 ════
    section('PHASE 3: 跨设备语音参数传播');

    // 4 个参数值与 VOICE_PARAMS 有意不同，便于区分跨设备新写入
    const CROSS_PARAMS = {
      phraseWrong:               'cross-再试试',
      optReadDelay:              '6.5',
      voiceAssistEnabled:        '0',
      phraseQuizPromptRecognize: 'cross-认识吗',
    };

    // Device A（当前 page，已登录）写入参数并 push
    await run(page, (params) => {
      Object.entries(params).forEach(([k, v]) => localStorage.setItem(k, v));
    }, CROSS_PARAMS);
    const push3Ok = await run(page, async () => {
      try { await cloudPushConfig(); return true; } catch (e) { return false; }
    });
    pass('Device A cloudPushConfig 推送成功', push3Ok);
    await wait(page, 1000);

    // 直接读 Supabase 断言云端值正确（Device A 视角）
    const cloudUi3 = await run(page, async () => {
      const { data } = await _sb.from('sync_config').select('config_json').maybeSingle();
      return data?.config_json?.ui || null;
    });
    pass('Device A → 云端 phraseWrong 正确',
      cloudUi3?.phraseWrong === CROSS_PARAMS.phraseWrong);
    pass('Device A → 云端 optReadDelay 正确',
      cloudUi3?.optReadDelay === CROSS_PARAMS.optReadDelay);

    // Device B（新 BrowserContext，空白状态）登录 + 等待同步
    ctxB  = await browser.newContext({ viewport: { width: 390, height: 844 } });
    pageB = await ctxB.newPage();
    pageB.on('pageerror', e => console.log(`  [B PAGE ERROR] ${e.message}`));
    await pageB.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(pageB, 2000);

    pass('Device B 登录成功', await cloudLogin(pageB, TEST_EMAIL, TEST_PASSWORD));
    pass('Device B 同步完成', await waitSyncDone(pageB, 120000));
    await wait(pageB, 1000);

    // 断言 Device B 本地值 == 云端值（全 4 个 cross key）
    const bLocalMatch = await run(pageB, (params) => {
      return Object.entries(params).every(([k, v]) => localStorage.getItem(k) === v);
    }, CROSS_PARAMS);
    pass('Device B 本地值 == 云端值（全 4 个 cross key）', bLocalMatch);

    // 断言 Device B 运行时映射正确
    // phraseWrong 无全局变量映射（wrong_hint 在 playVoiceSlot 内直接读 localStorage），改断 localStorage 值
    const globalsB = await run(pageB, () => ({
      phraseWrongLs: localStorage.getItem('phraseWrong'),
      optDelay:      typeof OPT_READ_DELAY !== 'undefined' ? OPT_READ_DELAY : null,
    }));
    pass('Device B phraseWrong localStorage 映射正确',
      globalsB.phraseWrongLs === 'cross-再试试');
    pass('Device B OPT_READ_DELAY 全局变量映射正确（6.5s → 6500ms）',
      globalsB.optDelay === 6500);

    // ════ PHASE 4: 语音录音 URL 同步（骨架，待实现）════
    // 依赖：语音录音上传 Supabase Storage 功能（独立设计文档）
    // 待填充步骤：
    //   1. Device A 录制语音槽 → 上传 Supabase Storage → 存储 path/URL → cloudPushConfig
    //   2. 读 Storage 断言文件存在（createSignedUrl 可访问）
    //   3. Device B 登录 → pull → 下载录音写入 IDB
    //   4. 断言 Device B IDB voiceSlots blob 有效（URL.createObjectURL 可生成）
    section('PHASE 4: 语音录音 URL 同步（骨架，待实现）');
    console.log('  [SKIP] 依赖语音录音云端存储功能，实现后填充');

  } finally {
    if (ctxB) await ctxB.close().catch(() => {});
    const { passed, failed } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
