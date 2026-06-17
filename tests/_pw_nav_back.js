/**
 * 二级页返回目标回归测试
 * 覆盖：theme/about/account/reset-password/create-card/deck-detail 的「返回」按钮
 *       应回到各自来源页，而非一律回首页。
 * deck-detail 多入口：从牌组管理进 → 返回牌组管理；从首页进 → 返回首页（来源追踪）。
 * 无需登录。
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, section, wait, run, getCounts, getBaseUrl } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const BK = '__builtin_test__';

async function activeScreen(page) {
  return run(page, () => document.querySelector('.screen.active')?.id);
}
async function clickBackIn(page, screenId) {
  await run(page, (id) => {
    const s = document.getElementById(id);
    const btn = s && s.querySelector('.back-btn');
    if (btn) btn.click();
  }, screenId);
  await wait(page, 400);
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await helper.startCoverage(page);
  page.on('pageerror', e => console.log('  [PAGE ERROR]', e.message));

  try {
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    section('PHASE 1: 主题页 返回 → 我的');
    await run(page, () => showTheme());
    await wait(page, 400);
    pass('已进入 screen-theme', (await activeScreen(page)) === 'screen-theme');
    await clickBackIn(page, 'screen-theme');
    pass('主题页返回 → screen-mine（非首页）', (await activeScreen(page)) === 'screen-mine');

    section('PHASE 2: 关于页 返回 → 我的');
    await run(page, () => showAbout());
    await wait(page, 400);
    pass('已进入 screen-about', (await activeScreen(page)) === 'screen-about');
    await clickBackIn(page, 'screen-about');
    pass('关于页返回 → screen-mine（非首页）', (await activeScreen(page)) === 'screen-mine');

    section('PHASE 3: 账户页 返回 → 我的');
    await run(page, () => showScreen('screen-account'));
    await wait(page, 400);
    pass('已进入 screen-account', (await activeScreen(page)) === 'screen-account');
    await clickBackIn(page, 'screen-account');
    pass('账户页返回 → screen-mine（非首页）', (await activeScreen(page)) === 'screen-mine');

    section('PHASE 4: 重置密码页 返回 → 账户');
    await run(page, () => showScreen('screen-reset-password'));
    await wait(page, 400);
    pass('已进入 screen-reset-password', (await activeScreen(page)) === 'screen-reset-password');
    await clickBackIn(page, 'screen-reset-password');
    pass('重置密码页返回 → screen-account（非首页）', (await activeScreen(page)) === 'screen-account');

    section('PHASE 5: 新建卡片页 返回 → 牌组详情');
    await run(page, (k) => { currentDeck = k; showCreateCard(k); }, BK);
    await wait(page, 500);
    pass('已进入 screen-create-card', (await activeScreen(page)) === 'screen-create-card');
    await clickBackIn(page, 'screen-create-card');
    pass('新建卡片页返回 → screen-deck-detail（非首页）', (await activeScreen(page)) === 'screen-deck-detail');

    section('PHASE 6: 牌组详情 从牌组管理进 → 返回牌组管理');
    await run(page, () => showDecks());
    await wait(page, 400);
    await run(page, (k) => showDeckDetailFor(k), BK);
    await wait(page, 500);
    pass('已进入 screen-deck-detail（来源=牌组管理）', (await activeScreen(page)) === 'screen-deck-detail');
    await clickBackIn(page, 'screen-deck-detail');
    pass('牌组详情返回 → screen-decks（来源追踪）', (await activeScreen(page)) === 'screen-decks');

    section('PHASE 7: 牌组详情 从首页进 → 返回首页');
    await run(page, () => goHome());
    await wait(page, 400);
    await run(page, (k) => { currentDeck = k; showDeckDetail(); }, BK);
    await wait(page, 500);
    pass('已进入 screen-deck-detail（来源=首页）', (await activeScreen(page)) === 'screen-deck-detail');
    await clickBackIn(page, 'screen-deck-detail');
    pass('牌组详情返回 → screen-home（来源追踪）', (await activeScreen(page)) === 'screen-home');

  } finally {
    const { passed, failed } = getCounts();
    section('结果');
    console.log('  通过: ' + passed + '  失败: ' + failed);
    await helper.stopAndCollectFromBrowser(browser, '_pw_nav_back');
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
