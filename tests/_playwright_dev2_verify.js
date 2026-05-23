// Wave 1 点牌组进详情屏验证（原 dev.2 更新）
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let pass = 0, fail = 0;
  const A = (label, cond) => {
    if (cond) { pass++; console.log('  ✓', label); }
    else       { fail++; console.error('  ✗', label); }
  };

  const URL = 'http://localhost:8080/.claude/worktrees/v5-stage0-i18n/yihai_v4.11.html';
  await page.goto(URL);
  await page.waitForTimeout(1500);
  // Force zh-CN locale for consistent i18n testing
  await page.evaluate(() => setLocale('zh-CN'));
  await page.waitForTimeout(500);


  // ── 1. 有牌组时：点牌组行进详情屏 ──────────────────────
  console.log('\n── 点牌组行进详情屏 ──');
  const hasDeck = await page.evaluate(() => typeof DECKS_META !== 'undefined' && DECKS_META.length > 0);
  if (hasDeck) {
    await page.locator('.deck-card').first().click();
    await page.waitForTimeout(600);
    const detailActive = await page.evaluate(() =>
      document.getElementById('screen-deck-detail')?.classList.contains('active')
    );
    A('点牌组行 → screen-deck-detail active', detailActive);

    const homeInactive = await page.evaluate(() =>
      !document.getElementById('screen-home')?.classList.contains('active')
    );
    A('screen-home 变 inactive', homeInactive);

    // 返回首页
    await page.evaluate(() => goHome());
    await page.waitForTimeout(600);
  } else {
    console.log('  (跳过：无牌组)');
  }

  // ── 2. _launchBusy 防重入 ──────────────────────────────
  console.log('\n── startBrowse _launchBusy 保护 ──');
  const hasBusy = await page.evaluate(() => {
    const src = startBrowse.toString();
    return src.includes('_launchBusy');
  });
  A('startBrowse 含 _launchBusy 检查', hasBusy);

  // ── 3. 滑动按钮含 stopPropagation ─────────────────────
  console.log('\n── 滑动按钮 stopPropagation ──');
  const delBtnSrc = await page.evaluate(() => {
    const src = renderDeckList.toString();
    return src.includes('stopPropagation');
  });
  A('renderDeckList 模板含 stopPropagation', delBtnSrc);

  // ── 4. selectDeck 调用 showDeckDetail ─────────────────
  console.log('\n── selectDeck 行为 ──');
  const selectDeckSrc = await page.evaluate(() => {
    const src = selectDeck.toString();
    return src.includes('showDeckDetail');
  });
  A('selectDeck 调用 showDeckDetail', selectDeckSrc);

  const noWarmup = await page.evaluate(() => {
    const src = selectDeck.toString();
    return !src.includes('warmupSpeech');
  });
  A('selectDeck 不再直接调 warmupSpeech', noWarmup);

  // ── 5. screen-deck-detail 存在 ────────────────────────
  console.log('\n── 详情屏 DOM ──');
  const detailExists = await page.locator('#screen-deck-detail').count();
  A('screen-deck-detail 存在', detailExists === 1);

  // ── 汇总 ──────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  结果：${pass} 通过  ${fail} 失败`);
  console.log('═'.repeat(50));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
