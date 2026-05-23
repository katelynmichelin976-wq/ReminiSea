// Wave 1 dev.6 设置屏验证（文字Tab移除 + 每日学习目标）
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


  // ── 1. 打开设置 ────────────────────────────────────────────
  console.log('\n── 设置打开 ──');
  await page.locator('#screen-home .tab-item:last-child').click();
  await page.waitForTimeout(300);
  await page.locator('#screen-mine .mine-menu-item').nth(1).click();
  await page.waitForTimeout(400);

  const settingsOpen = await page.evaluate(() =>
    document.getElementById('settings-overlay')?.classList.contains('open')
  );
  A('设置抽屉打开', settingsOpen);

  // ── 2. Tab 数量 ────────────────────────────────────────────
  console.log('\n── Tab 结构 ──');
  const tabCount = await page.locator('.sheet-tab').count();
  A('Tab 数量为 4（通用/语音/SRS/云端）', tabCount === 4);

  const tabTexts = await page.locator('.sheet-tab').allTextContents();
  A('Tab 0 = 通用', tabTexts[0].trim() === '通用');
  A('Tab 1 = 语音', tabTexts[1].trim() === '语音');
  A('Tab 2 = SRS',  tabTexts[2].trim() === 'SRS');
  A('Tab 3 = 云端', tabTexts[3].trim() === '云端');
  // 检查文字Tab不存在
  A('Tab 列表中不含"文字"', !tabTexts.some(t => t.trim() === '文字'));

  // ── 3. 通用 Tab 的每日学习目标 ─────────────────────────────
  console.log('\n── 通用 Tab 内容 ──');
  const dailyGoal = await page.locator('#general-daily-goal').count();
  A('#general-daily-goal 滑块存在', dailyGoal === 1);

  const goalVal = await page.locator('#general-daily-goal-val').textContent();
  A('每日学习目标显示数值（如 "50张"）', /^\d+张$/.test(goalVal.trim()));

  // ── 4. 切换到 SRS Tab ──────────────────────────────────────
  console.log('\n── Tab 切换 ──');
  await page.locator('.sheet-tab').nth(2).click();
  await page.waitForTimeout(200);

  const srsActive = await page.evaluate(() =>
    document.getElementById('tab-2')?.classList.contains('active')
  );
  A('点击 SRS Tab → tab-2 active', srsActive);

  // ── 5. 切换到 云端 Tab ─────────────────────────────────────
  await page.locator('.sheet-tab').nth(3).click();
  await page.waitForTimeout(200);

  const cloudActive = await page.evaluate(() =>
    document.getElementById('tab-3')?.classList.contains('active')
  );
  A('点击 云端 Tab → tab-3 active', cloudActive);

  // ── 6. 代码检查 ────────────────────────────────────────────
  console.log('\n── 代码检查 ──');
  const funcExists = await page.evaluate(() => typeof onDailyGoalChange === 'function');
  A('onDailyGoalChange 函数存在', funcExists);

  const funcLoad = await page.evaluate(() => typeof loadDailyGoalUI === 'function');
  A('loadDailyGoalUI 函数存在', funcLoad);

  const tabPanels = await page.evaluate(() =>
    document.querySelectorAll('.sheet-panel').length
  );
  A('sheet-panel 数量为 4（移除文字后）', tabPanels === 4);

  // ── 汇总 ──────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  结果：${pass} 通过  ${fail} 失败`);
  console.log('═'.repeat(50));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
