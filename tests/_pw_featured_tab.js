/**
 * 精选 tab + 同步按钮去耦合 测试 — v5.13.12
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_featured_tab.js
 *
 * 覆盖：精选 tab 列表渲染、登录占位、未登录占位、同步按钮不再下载 preset
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin, startCoverage, stopAndCollectCoverage } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();
const TEST_EMAIL = 'zyhaff@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD;

(async () => {
  if (!TEST_PASSWORD) {
    console.log('SKIP: TEST_PASSWORD not set');
    return;
  }
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await startCoverage(page);

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1000);

    // ════ PHASE 1: 未登录占位 ════
    section('PHASE 1: 未登录占位');
    await run(page, () => showScreen('screen-decks'));
    await wait(page, 400);
    await run(page, () => switchDecksTab('featured'));
    await wait(page, 500);
    let listText = await run(page, () => document.getElementById('featured-decks-list').textContent);
    pass('未登录显示"请先登录"占位', listText.includes('请先登录') || /log in|sign in|ログイン/i.test(listText));

    // ════ PHASE 2: 登录 ════
    section('PHASE 2: 登录 zyhaff');
    pass('登录成功', await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));

    // ════ PHASE 3: 切到精选 tab ════
    section('PHASE 3: 切到精选 tab');
    await run(page, () => showScreen('screen-decks'));
    await wait(page, 500);
    await run(page, () => switchDecksTab('featured'));
    await wait(page, 1500);

    const presetCount = await run(page, () =>
      document.querySelectorAll('#featured-decks-list > div[style*="border-bottom"]').length
    );
    pass(`精选 tab 列表渲染 (${presetCount} 个 preset 牌组)`, presetCount > 0);

    // ════ PHASE 4: 列表条目结构 ════
    section('PHASE 4: 列表条目结构');
    const firstRowHasButton = await run(page, () =>
      !!document.querySelector('#featured-decks-list > div[style*="border-bottom"] button')
    );
    pass('每条目含按钮（下载或同步）', firstRowHasButton);

    // ════ PHASE 5: tab 路由 ════
    section('PHASE 5: tab 路由');
    await run(page, () => switchDecksTab('cloud'));
    await wait(page, 500);
    const cloudTabActive = await run(page, () =>
      document.getElementById('decks-panel-cloud').classList.contains('active')
    );
    pass('切回云端 tab active', cloudTabActive);

    await run(page, () => switchDecksTab('featured'));
    await wait(page, 800);
    const featuredTabActive = await run(page, () =>
      document.getElementById('decks-panel-featured').classList.contains('active')
    );
    pass('再切回精选 tab active', featuredTabActive);

    // ════ PHASE 6: 同步按钮去耦合 ════
    section('PHASE 6: 同步按钮去耦合');
    await run(page, () => {
      window._lastSyncOpts = null;
      const orig = window.runSync;
      window.runSync = function(opts) {
        window._lastSyncOpts = opts;
        return orig.call(this, opts);
      };
    });
    await run(page, () => doAccountSync());
    await wait(page, 1500);
    const lastOpts = await run(page, () => window._lastSyncOpts);
    pass('doAccountSync 调用 runSync', !!lastOpts);
    pass('runSync(decks: false)', lastOpts && lastOpts.decks === false);
    pass('runSync(events: true)', lastOpts && lastOpts.events === true);
    pass('runSync(modal: true)', lastOpts && lastOpts.modal === true);

  } finally {
    await stopAndCollectCoverage(page, '_pw_featured_tab');
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
