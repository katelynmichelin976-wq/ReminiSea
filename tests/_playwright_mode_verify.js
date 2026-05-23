// Wave 1 advanced mode verification
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
  await page.waitForTimeout(1500);
  // Force zh-CN locale for consistent i18n testing
  await page.evaluate(() => setLocale('zh-CN'));
  await page.waitForTimeout(500);


  // Clear any residual advanced mode
  await page.evaluate(() => localStorage.removeItem('yihai_app_mode'));
  await page.reload();
  await page.waitForTimeout(1500);

  // ── 1. Default standard mode ────────────────────────────
  console.log('\n── default standard mode ──');
  const modeInit = await page.evaluate(() => localStorage.getItem('yihai_app_mode'));
  A('localStorage has no mode (default standard)', modeInit === null || modeInit === 'standard');

  const fabText = await page.locator('.home-tabbar .tab-item.action span').first().textContent();
  A('FAB shows "开始练习"', fabText.trim() === '开始练习');

  const plusHidden = await page.evaluate(() => {
    const btn = document.querySelector('.btn-new-deck');
    return !btn || btn.offsetParent === null;
  });
  A('+ button hidden', plusHidden);

  // ── 2. Mine screen → mode toggle ────────────────────────
  console.log('\n── mine screen mode toggle ──');
  await page.locator('#screen-home .tab-item:last-child').click();
  await page.waitForTimeout(400);

  const toggleExists = await page.locator('#app-mode-toggle').count();
  A('mode toggle exists', toggleExists === 1);

  const toggleOff = await page.evaluate(() => !document.getElementById('app-mode-toggle').checked);
  A('default off (standard mode)', toggleOff);

  const titleText = await page.locator('#mine-mode-title').textContent();
  A('title shows "高级模式"', titleText.trim() === '高级模式');

  const subText = await page.locator('#mine-mode-sub').textContent();
  A('subtitle shows "已关闭"', subText.includes('已关闭'));

  // ── 3. Switch to advanced mode ─────────────────────────
  console.log('\n── switching to advanced mode ──');
  await page.evaluate(() => {
    const el = document.getElementById('app-mode-toggle');
    el.checked = true;
    el.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(300);

  const modeSet = await page.evaluate(() => localStorage.getItem('yihai_app_mode'));
  A('localStorage set to advanced', modeSet === 'advanced');

  const toggleOn = await page.evaluate(() => document.getElementById('app-mode-toggle').checked);
  A('toggle is on', toggleOn);

  const subOn = await page.locator('#mine-mode-sub').textContent();
  A('subtitle shows "已开启"', subOn.trim() === '已开启');

  // ── 4. Back to home → verify FAB change ────────────────
  console.log('\n── home FAB change ──');
  await page.locator('#screen-mine .tab-item:first-child').click();
  await page.waitForTimeout(400);

  const fabText2 = await page.locator('.home-tabbar .tab-item.action span').first().textContent();
  A('FAB shows "开始制卡"', fabText2.trim() === '开始制卡');

  const plusVisible = await page.evaluate(() => {
    const btn = document.querySelector('.btn-new-deck');
    return btn && btn.offsetParent !== null;
  });
  A('+ button visible', plusVisible);

  // ── 5. Click + → Action Sheet ──────────────────────────
  console.log('\n── Action Sheet ──');
  await page.locator('.btn-new-deck').click();
  await page.waitForTimeout(300);

  const sheetOpen = await page.evaluate(() =>
    document.getElementById('action-sheet')?.classList.contains('open')
  );
  A('Action sheet opens', sheetOpen);

  const btnCount = await page.locator('.action-sheet-btn').count();
  A('5 action buttons', btnCount === 5);

  // Click cancel to close
  await page.locator('.action-sheet-cancel').click();
  await page.waitForTimeout(300);

  const sheetClosed = await page.evaluate(() =>
    !document.getElementById('action-sheet')?.classList.contains('open')
  );
  A('cancel → closed', sheetClosed);

  // ── 6. Switch back to standard mode ────────────────────
  console.log('\n── switching back to standard mode ──');
  await page.locator('#screen-home .tab-item:last-child').click();
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const el = document.getElementById('app-mode-toggle');
    el.checked = false;
    el.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(300);

  const modeFinal = await page.evaluate(() => localStorage.getItem('yihai_app_mode'));
  A('localStorage reverted to standard', modeFinal === 'standard');

  // ── 7. Mode persist after reload ──────────────────────
  console.log('\n── persistence ──');
  // Switch to advanced first
  await page.evaluate(() => {
    const el = document.getElementById('app-mode-toggle');
    el.checked = true;
    el.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(300);

  await page.reload();
  await page.waitForTimeout(1500);

  const modePersist = await page.evaluate(() => localStorage.getItem('yihai_app_mode'));
  A('mode persists as advanced after reload', modePersist === 'advanced');

  const fabAfterReload = await page.locator('.home-tabbar .tab-item.action span').first().textContent();
  A('FAB shows "开始制卡" after reload', fabAfterReload.trim() === '开始制卡');

  const plusAfterReload = await page.evaluate(() => {
    const btn = document.querySelector('.btn-new-deck');
    return btn && btn.offsetParent !== null;
  });
  A('+ button visible after reload', plusAfterReload);

  // ── 8. Cleanup: restore standard ─────────────────────
  await page.evaluate(() => localStorage.setItem('yihai_app_mode', 'standard'));

  // ── Summary ─────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Result: ${pass} passed  ${fail} failed`);
  console.log('═'.repeat(50));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
