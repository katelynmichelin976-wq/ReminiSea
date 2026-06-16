/**
 * 牌组管理页冒烟测试
 * 覆盖：Tab Bar 5项/跳转到牌组页/段选切换/本地牌组列表/函数存在性
 * 无需登录
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
  page.on('pageerror', e => console.log('  [PAGE ERROR]', e.message));

  try {
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    // ════ PHASE 1: Tab Bar 结构验证 ════
    section('PHASE 1: Tab Bar 5 项存在');

    const tabCount = await run(page, () =>
      document.querySelectorAll('#screen-home .home-tabbar .tab-item').length
    );
    pass('首页 Tab Bar 有 5 个 tab-item', tabCount === 5);

    const hasDeckTab = await run(page, () =>
      !!Array.from(document.querySelectorAll('#screen-home .home-tabbar .tab-item'))
        .find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes('showDecks'))
    );
    pass('首页 Tab Bar 包含牌组入口（onclick showDecks）', hasDeckTab);

    const hasStatsTab = await run(page, () =>
      !!Array.from(document.querySelectorAll('#screen-home .home-tabbar .tab-item'))
        .find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes('openStats'))
    );
    pass('首页 Tab Bar 包含统计入口（onclick openStats）', hasStatsTab);

    // ════ PHASE 2: 导航到牌组页 ════
    section('PHASE 2: 导航到 screen-decks');

    await run(page, () => showDecks());
    await wait(page, 500);

    const onDecks = await run(page, () =>
      document.getElementById('screen-decks').classList.contains('active')
    );
    pass('showDecks() 激活 screen-decks', onDecks);

    const segCount = await run(page, () =>
      document.querySelectorAll('.decks-seg-btn').length
    );
    pass('段选择器有 3 个按钮', segCount === 3);

    const localActive = await run(page, () => {
      var btn = document.querySelector('.decks-seg-btn.active');
      return btn ? btn.textContent.includes('本地') || btn.getAttribute('onclick').includes('local') : false;
    });
    pass('默认激活本地 Tab', localActive);

    // ════ PHASE 3: 本地 Tab 内容 ════
    section('PHASE 3: 本地 Tab 列表');

    const localGridExists = await run(page, () =>
      !!document.getElementById('decks-local-grid')
    );
    pass('decks-local-grid 元素存在', localGridExists);

    const localPanelActive = await run(page, () =>
      document.getElementById('decks-panel-local').classList.contains('active')
    );
    pass('decks-panel-local 面板激活', localPanelActive);

    // ════ PHASE 4: 切换到云端 Tab ════
    section('PHASE 4: 切换到云端 Tab');

    await run(page, () => switchDecksTab('cloud'));
    await wait(page, 500);

    const cloudPanelActive = await run(page, () =>
      document.getElementById('decks-panel-cloud').classList.contains('active')
    );
    pass('decks-panel-cloud 面板激活', cloudPanelActive);

    const localPanelHidden = await run(page, () =>
      !document.getElementById('decks-panel-local').classList.contains('active')
    );
    pass('切换后 local 面板不再激活', localPanelHidden);

    const cloudListExists = await run(page, () =>
      !!document.getElementById('decks-cloud-list')
    );
    pass('decks-cloud-list 元素存在', cloudListExists);

    // ════ PHASE 5: 函数存在性 ════
    section('PHASE 5: 函数存在性');

    const fns = ['showDecks', 'switchDecksTab', 'renderLocalDecksTab', 'renderCloudDecksTab'];
    for (const fn of fns) {
      pass(fn + ' 函数存在', await run(page, (f) => typeof window[f] === 'function', fn));
    }

  } finally {
    const { passed, failed } = getCounts();
    section('结果');
    console.log('  通过: ' + passed + '  失败: ' + failed);
    await helper.stopAndCollectFromBrowser(browser, '_pw_deck_mgmt');
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
