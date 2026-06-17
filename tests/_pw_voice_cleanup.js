/**
 * 语音/参数清理回归测试
 * 覆盖：浏览引导(idle_browse)已删除、答对鼓励默认="回答正确"、读出选项默认新文案、
 *       每日学习目标 UI 已删除、废弃 SRS 参数已移除。
 * 无需登录。
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, section, wait, run, getCounts, getBaseUrl } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await helper.startCoverage(page);
  let jsErrors = 0;
  page.on('pageerror', e => { jsErrors++; console.log('  [PAGE ERROR]', e.message); });

  try {
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 300);

    section('PHASE 1: 浏览引导 idle_browse 已删除');
    pass('VOICE_SLOTS 无 idle_browse 槽', await run(page, () =>
      !Object.values(VOICE_SLOTS).flat().some(s => s.name === 'idle_browse')));
    pass('startIdleBrowseTimer 函数已移除', await run(page, () => typeof startIdleBrowseTimer === 'undefined'));
    pass('clearIdleTimers 函数已移除', await run(page, () => typeof clearIdleTimers === 'undefined'));
    pass('i18n voice_slot_idle_browse 已删除（回退为 key 本身）', await run(page, () => t('voice_slot_idle_browse') === 'voice_slot_idle_browse'));

    section('PHASE 2: 默认文案');
    pass('答对鼓励默认 = 回答正确', await run(page, () => t('voice_default_correct_hint') === '回答正确'));
    pass('读出选项默认 = 含「符合图片上的东西」', await run(page, () =>
      t('default_opt_hint') === '请在{A}.{B}.{C}中选择一个符合图片上的东西'));

    section('PHASE 3: 每日学习目标 UI 已删除');
    pass('#general-daily-goal 元素不存在', await run(page, () => document.getElementById('general-daily-goal') === null));
    pass('onDailyGoalChange 函数已移除', await run(page, () => typeof onDailyGoalChange === 'undefined'));
    pass('settings_daily_goal i18n 已删除', await run(page, () => t('settings_daily_goal') === 'settings_daily_goal'));

    section('PHASE 4: 废弃 SRS 参数已移除');
    pass('SRS_CONFIG 无 hard_step_multiplier', await run(page, () => !('hard_step_multiplier' in SRS_CONFIG)));
    pass('SRS_CONFIG 无 t1_review_before_mix', await run(page, () => !('t1_review_before_mix' in SRS_CONFIG)));
    pass('SRS_CONFIG 无 t1_mix_before_t7', await run(page, () => !('t1_mix_before_t7' in SRS_CONFIG)));

    section('PHASE 5: 设置面板正常打开（无 JS 异常）');
    await run(page, () => { if (typeof openSettingsWithSrs === 'function') openSettingsWithSrs(); else openSettings(); });
    await wait(page, 500);
    pass('设置面板已打开', await run(page, () => document.getElementById('settings-overlay').classList.contains('open')));
    pass('全程无 JS 异常', jsErrors === 0);

  } finally {
    const { passed, failed } = getCounts();
    section('结果');
    console.log('  通过: ' + passed + '  失败: ' + failed + '  JS错误: ' + jsErrors);
    await helper.stopAndCollectFromBrowser(browser, '_pw_voice_cleanup');
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
