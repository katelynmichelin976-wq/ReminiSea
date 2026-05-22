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

  const totalCards = await page.locator('#dd-total').textContent();
  A('总卡片数 > 0', parseInt(totalCards) > 0);

  // ── 2. 操作按钮 ──────────────────────────────────
  console.log('\n── 操作按钮 ──');
  const btnCount = await page.locator('#dd-actions .dd-btn').count();
  A('操作按钮存在', btnCount >= 4);

  const browseBtn = await page.locator('#dd-actions .dd-btn.primary').first();
  const browseText = await browseBtn.textContent();
  A('第一个 primary 按钮为"浏览"', browseText.trim().includes('浏览'));

  // 点"浏览"进浏览屏
  await browseBtn.click();
  await page.waitForTimeout(600);

  const browseActive = await page.evaluate(() =>
    document.getElementById('screen-browse')?.classList.contains('active')
  );
  A('点"浏览" → screen-browse active', browseActive);

  // 返回首页
  await page.evaluate(() => goHome());
  await page.waitForTimeout(600);

  // ── 3. 再进详情屏 → 练习按钮 ──────────────────────
  console.log('\n── 练习按钮 ──');
  await page.locator('.deck-card').first().click();
  await page.waitForTimeout(600);

  // 点"练习"（第二个 primary 按钮）
  const btns = await page.locator('#dd-actions .dd-btn.primary');
  const btnCount2 = await btns.count();
  if (btnCount2 >= 2) {
    await btns.nth(1).click();
    await page.waitForTimeout(600);
    const quizActive = await page.evaluate(() =>
      document.getElementById('screen-quiz')?.classList.contains('active')
    );
    const finishActive = await page.evaluate(() =>
      document.getElementById('screen-finish')?.classList.contains('active')
    );
    A('点"练习" → screen-quiz 或 screen-finish', quizActive || finishActive);
    await page.evaluate(() => goHome());
    await page.waitForTimeout(600);
  } else {
    console.log('  (跳过：无练习按钮)');
    await page.evaluate(() => goHome());
    await page.waitForTimeout(600);
  }

  // ── 4. 详情屏删除按钮（仅非内置牌组） ────────────
  console.log('\n── 删除按钮 ──');
  await page.locator('.deck-card').first().click();
  await page.waitForTimeout(600);

  const delBtnExists = await page.locator('#dd-actions .dd-btn.danger').count();
  const isBuiltin = await page.evaluate(() => {
    const m = DECKS_META.find(m => m.key === currentDeck);
    return m ? m.builtin : false;
  });
  if (isBuiltin) {
    A('内置牌组无删除按钮', delBtnExists === 0);
  } else {
    A('非内置牌组有删除按钮', delBtnExists === 1);
  }

  await page.evaluate(() => goHome());
  await page.waitForTimeout(600);

  // ── 5. deck-card-inner 结构 ───────────────────────
  console.log('\n── 卡片结构 ──');
  const hasInner = await page.evaluate(() =>
    document.querySelectorAll('.deck-card-inner').length > 0
  );
  A('.deck-card-inner 存在', hasInner);

  const hasActions = await page.evaluate(() =>
    document.querySelectorAll('.swipe-action-btn').length >= 2
  );
  A('左滑操作按钮 ≥2（导出/共享）', hasActions);

  const hasStopProp = await page.evaluate(() => {
    const src = renderDeckList.toString();
    return src.includes('stopPropagation');
  });
  A('模板含 stopPropagation', hasStopProp);

  // ── 6. 代码层验证 ────────────────────────────────
  console.log('\n── 代码层验证 ──');
  const hasShowDeckDetail = await page.evaluate(() => typeof showDeckDetail === 'function');
  A('showDeckDetail 函数存在', hasShowDeckDetail);

  const hasUpdateDeckDetailStats = await page.evaluate(() => typeof updateDeckDetailStats === 'function');
  A('updateDeckDetailStats 函数存在', hasUpdateDeckDetailStats);

  const hasSwipeHandlers = await page.evaluate(() => typeof initDeckSwipe === 'function');
  A('initDeckSwipe 函数存在', hasSwipeHandlers);

  // ── 汇总 ──────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  结果：${pass} 通过  ${fail} 失败`);
  console.log('═'.repeat(50));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
