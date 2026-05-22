// Wave 1 dev.2 点牌组直接进浏览验证
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
  await page.waitForTimeout(1000);

  // ── 1. 有牌组时：点牌组行进浏览屏 ──────────────────────
  console.log('\n── 点牌组行进浏览 ──');
  const hasDeck = await page.evaluate(() => typeof DECKS_META !== 'undefined' && DECKS_META.length > 0);
  if (hasDeck) {
    await page.locator('.deck-card').first().click();
    await page.waitForTimeout(600);
    const browseActive = await page.evaluate(() =>
      document.getElementById('screen-browse')?.classList.contains('active')
    );
    A('点牌组行 → screen-browse (浏览屏) active', browseActive);

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

  // ── 3. 删除按钮含 stopPropagation ─────────────────────
  console.log('\n── 删除按钮 stopPropagation ──');
  const delBtnSrc = await page.evaluate(() => {
    const src = renderDeckList.toString();
    return src.includes('stopPropagation');
  });
  A('renderDeckList 模板含 stopPropagation', delBtnSrc);

  // ── 4. selectDeck 调用 startBrowse ────────────────────
  console.log('\n── selectDeck 行为 ──');
  const selectDeckSrc = await page.evaluate(() => {
    const src = selectDeck.toString();
    return src.includes('startBrowse');
  });
  A('selectDeck 调用 startBrowse', selectDeckSrc);

  const noWarmup = await page.evaluate(() => {
    const src = selectDeck.toString();
    return !src.includes('warmupSpeech');
  });
  A('selectDeck 不再直接调 warmupSpeech（已移入 startBrowse）', noWarmup);

  // ── 汇总 ──────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  结果：${pass} 通过  ${fail} 失败`);
  console.log('═'.repeat(50));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
