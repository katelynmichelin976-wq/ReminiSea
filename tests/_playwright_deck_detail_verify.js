// Wave 1 牌组详情屏 + 左滑操作验证
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

  const hasDeck = await page.evaluate(() => typeof DECKS_META !== 'undefined' && DECKS_META.length > 0);
  if (!hasDeck) { console.log('\n  (跳过：无牌组)'); await browser.close(); process.exit(0); }

  // ── 1. 详情屏入口 ─────────────────────────────────
  console.log('\n── 详情屏入口 ──');
  await page.locator('.deck-card').first().click();
  await page.waitForTimeout(600);

  const detailActive = await page.evaluate(() =>
    document.getElementById('screen-deck-detail')?.classList.contains('active')
  );
  A('点牌组 → screen-deck-detail active', detailActive);

  const deckName = await page.locator('#dd-deck-name').textContent();
  A('牌组名非空', deckName.trim().length > 0);

  // ── 2. deck-card-inner 结构 ───────────────────────
  console.log('\n── 卡片结构 ──');
  const hasInner = await page.evaluate(() =>
    document.querySelectorAll('.deck-card-inner').length > 0
  );
  A('.deck-card-inner 存在', hasInner);

  const hasActions = await page.evaluate(() =>
    document.querySelectorAll('.swipe-action-btn').length >= 1
  );
  A('左滑操作按钮 ≥1（重命名）', hasActions);

  const hasStopProp = await page.evaluate(() => {
    const src = renderDeckList.toString();
    return src.includes('stopPropagation');
  });
  A('模板含 stopPropagation', hasStopProp);

  // ── 3. 代码层验证 ────────────────────────────────
  console.log('\n── 代码层验证 ──');
  const hasShowDeckDetail = await page.evaluate(() => typeof showDeckDetail === 'function');
  A('showDeckDetail 函数存在', hasShowDeckDetail);

  const hasSwipeHandlers = await page.evaluate(() => typeof initDeckSwipe === 'function');
  A('initDeckSwipe 函数存在', hasSwipeHandlers);

  // ── 汇总 ──────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  结果：${pass} 通过  ${fail} 失败`);
  console.log('═'.repeat(50));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
