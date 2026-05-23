// Wave 1 dev.4 浏览屏验证
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let pass = 0, fail = 0;
  const A = (label, cond) => {
    if (cond) { pass++; console.log('  ✓', label); }
    else       { fail++; console.error('  ✗', label); }
  };

  const URL = 'http://localhost:8080/yihai_v5.1.html';
  await page.goto(URL);
  await page.waitForTimeout(1000);
  // Force zh-CN locale for consistent i18n testing
  await page.evaluate(() => setLocale('zh-CN'));
  await page.waitForTimeout(500);


  // ── 1. screen-browse 存在 ──────────────────────────────────────
  console.log('\n── screen-browse DOM 结构 ──');
  const browseExists = await page.locator('#screen-browse').count();
  A('#screen-browse 存在', browseExists === 1);

  const progFill = await page.locator('#browse-prog-fill').count();
  A('#browse-prog-fill 存在', progFill === 1);

  const prevBtn = await page.locator('#browse-btn-prev').count();
  A('#browse-btn-prev 存在', prevBtn === 1);

  const nextBtn = await page.locator('#browse-btn-next').count();
  A('#browse-btn-next 存在', nextBtn === 1);

  // ── 2. 点牌组 → 走详情屏 → 浏览屏 ─────────────────────
  console.log('\n── 点牌组进浏览屏（经详情屏）──');
  const hasDeck = await page.evaluate(() => typeof DECKS_META !== 'undefined' && DECKS_META.length > 0);
  if (hasDeck) {
    // 先点牌组进详情屏
    await page.locator('.deck-card').first().click();
    await page.waitForTimeout(600);

    const detailActive = await page.evaluate(() =>
      document.getElementById('screen-deck-detail')?.classList.contains('active')
    );
    A('点牌组 → screen-deck-detail active', detailActive);

    // 在详情屏调用浏览
    await page.evaluate(() => startBrowse());
    await page.waitForTimeout(800);

    const browseActive = await page.evaluate(() =>
      document.getElementById('screen-browse')?.classList.contains('active')
    );
    A('点"浏览" → screen-browse active', browseActive);

    const homeInactive = await page.evaluate(() =>
      !document.getElementById('screen-home')?.classList.contains('active')
    );
    A('screen-home inactive', homeInactive);

    const quizInactive = await page.evaluate(() =>
      !document.getElementById('screen-quiz')?.classList.contains('active')
    );
    A('screen-quiz 不被激活（浏览走新屏）', quizInactive);

    // ── 3. 牌组名显示 ─────────────────────────────────────────
    console.log('\n── 浏览屏内容 ──');
    const deckName = await page.locator('#browse-deck-name').textContent();
    A('牌组名非空', deckName.trim().length > 0);

    const photoVisible = await page.locator('#browse-photo').isVisible();
    A('#browse-photo 可见', photoVisible);

    const cardName = await page.locator('#browse-name').textContent();
    A('卡片名非空', cardName.trim().length > 0);

    // ── 4. 进度条 > 0 ────────────────────────────────────────
    const progWidth = await page.evaluate(() => {
      const el = document.getElementById('browse-prog-fill');
      return parseFloat(el?.style.width || '0');
    });
    A('进度条宽度 > 0%', progWidth > 0);

    // ── 5. 第一张时 prev 按钮禁用 ───────────────────────────
    const prevDisabled = await page.evaluate(() =>
      document.getElementById('browse-btn-prev')?.disabled === true
    );
    A('第一张：上一张按钮禁用', prevDisabled);

    // ── 6. 下一张翻页 ────────────────────────────────────────
    console.log('\n── 下一张翻页 ──');
    const totalCards = await page.evaluate(() => _browseCards.length);
    if (totalCards > 1) {
      const nameBefore = await page.locator('#browse-name').textContent();
      await page.locator('#browse-btn-next').click();
      await page.waitForTimeout(600);

      const idx = await page.evaluate(() => _browseIdx);
      A('_browseIdx 变为 1', idx === 1);

      const prevEnabled = await page.evaluate(() =>
        document.getElementById('browse-btn-prev')?.disabled === false
      );
      A('第二张：上一张按钮可用', prevEnabled);
    } else {
      console.log('  (跳过：只有1张卡片)');
    }

    // ── 7. 返回详情屏 ──────────────────────────────────────────
    console.log('\n── 返回详情屏 ──');
    await page.locator('#screen-browse .back-btn').click();
    await page.waitForTimeout(600);

    const detailBack = await page.evaluate(() =>
      document.getElementById('screen-deck-detail')?.classList.contains('active')
    );
    A('点返回 → screen-deck-detail active', detailBack);

  } else {
    console.log('  (跳过牌组测试：无牌组数据)');
  }

  // ── 8. _launch browse 不再使用 screen-quiz ────────────────────
  console.log('\n── _launch 路由检查 ──');
  const callsEnterBrowse = await page.evaluate(() => {
    const src = _launch.toString();
    return src.includes('_enterBrowse');
  });
  A('_launch 调用 _enterBrowse（新浏览屏路由）', callsEnterBrowse);

  // ── 汇总 ──────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  结果：${pass} 通过  ${fail} 失败`);
  console.log('═'.repeat(50));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
