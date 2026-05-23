// Stage 1 i18n — 浏览器端验证
// 验证 setLocale 后关键标签变化、插值 Toast、非法 locale 拒绝
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let pass = 0, fail = 0;
  const A = (label, cond) => {
    if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m', label); }
    else       { fail++; console.error('  \x1b[31m✗\x1b[0m', label); }
  };

  const URL = 'http://localhost:8080/yihai_v5.1.html';
  await page.goto(URL);
  await page.waitForTimeout(1500);

  // ── 1. 默认 zh-CN 检测（系统语言 zh → zh-CN）──
  console.log('\n── 默认 locale ──');
  const initLocale = await page.evaluate(() => getLocale());
  A('默认 locale 为 zh-CN（或从 localStorage 恢复）', initLocale === 'zh-CN' || initLocale === 'en');

  // Force zh-CN for consistency
  await page.evaluate(() => setLocale('zh-CN'));
  await page.waitForTimeout(500);

  // ── 2. zh-CN 标签验证 ──
  console.log('\n── zh-CN 标签 ──');
  const homeTitle = await page.locator('.home-title').textContent();
  A('首页标题 = 忆海拾光', homeTitle.trim() === '忆海拾光');

  const fabText = await page.locator('.home-tabbar .tab-item.action span').first().textContent();
  A('FAB = 开始练习', fabText.trim() === '开始练习');

  const tabHome = await page.locator('#screen-home .tab-item:first-child span').first().textContent();
  A('Tab 首页 = 首 页', tabHome.trim() === '首 页');

  // Navigate to Mine screen
  await page.locator('#screen-home .tab-item:last-child').click();
  await page.waitForTimeout(400);

  const mineStats = await page.locator('#screen-mine .mine-menu-item:first-child span').first().textContent();
  A('我的屏菜单第一项 = 统计', mineStats.trim() === '统计');

  // ── 3. 切换到 en ──
  console.log('\n── en 标签 ──');
  await page.evaluate(() => setLocale('en'));
  await page.waitForTimeout(600);

  const homeTitleEn = await page.locator('.home-title').textContent();
  A('首页标题 = Memory Glimmers', homeTitleEn.trim() === 'Memory Glimmers');

  const tabHomeEn = await page.locator('#screen-home .tab-item:first-child span').first().textContent();
  A('Tab 首页 = Home', tabHomeEn.trim() === 'Home');

  const mineStatsEn = await page.locator('#screen-mine .mine-menu-item:first-child span').first().textContent();
  A('我的屏菜单第一项 = Statistics', mineStatsEn.trim() === 'Statistics');

  // ── 4. 切换到 es ──
  console.log('\n── es 标签 ──');
  await page.evaluate(() => setLocale('es'));
  await page.waitForTimeout(600);

  const tabHomeEs = await page.locator('#screen-home .tab-item:first-child span').first().textContent();
  A('Tab 首页 = Inicio', tabHomeEs.trim() === 'Inicio');

  const mineStatsEs = await page.locator('#screen-mine .mine-menu-item:first-child span').first().textContent();
  A('我的屏菜单第一项 = Estadisticas', mineStatsEs.trim() === 'Estadisticas');

  // ── 5. 插值验证 ──
  console.log('\n── 插值 ──');
  const interpolatedEn = await page.evaluate(() => t('account_login_fail', { msg: 'TEST123' }));
  A('en 插值: 包含 TEST123', interpolatedEn.includes('TEST123'));

  const interpolatedZh = await page.evaluate(() => { setLocale('zh-CN'); return t('account_login_fail', { msg: '测试错误' }); });
  A('zh-CN 插值: 包含 测试错误', interpolatedZh.includes('测试错误'));

  // ── 6. 非法 locale 拒绝 ──
  console.log('\n── 非法 locale ──');
  await page.evaluate(() => setLocale('fr'));
  await page.waitForTimeout(300);
  const afterBadLocale = await page.evaluate(() => getLocale());
  A('非法 locale "fr" 回退到 zh-CN', afterBadLocale === 'zh-CN');

  // Also test that 'fr' was NOT stored
  const storedAfterBad = await page.evaluate(() => localStorage.getItem('yihai_ui_locale'));
  A('非法 locale 未写入 localStorage', storedAfterBad !== 'fr');

  // ── 7. setLocale('en') 后 verify 应用了 data-i18n ──
  console.log('\n── data-i18n 属性 ──');
  await page.evaluate(() => setLocale('en'));
  await page.waitForTimeout(500);

  // Go back to home
  await page.locator('#screen-mine .tab-item:first-child').click();
  await page.waitForTimeout(400);

  const browseBtn = await page.locator('#browse-btn-prev').textContent();
  A('浏览屏 prev 按钮 = Previous', browseBtn.trim() === 'Previous');

  // Navigate to settings to check a data-i18n label
  await page.locator('#screen-home .tab-item:last-child').click();
  await page.waitForTimeout(300);
  await page.locator('#screen-mine .mine-menu-item').nth(1).click();
  await page.waitForTimeout(500);

  const tabGeneral = await page.locator('#settings-overlay .sheet-tab:first-child').textContent();
  A('设置 Tab1 = General', tabGeneral.trim() === 'General');

  // ── 8. 持久化验证 ──
  console.log('\n── 持久化 ──');
  await page.reload();
  await page.waitForTimeout(1500);
  const persistLocale = await page.evaluate(() => getLocale());
  A('重载后 locale 仍为 en', persistLocale === 'en');

  // Cleanup: reset to zh-CN
  await page.evaluate(() => setLocale('zh-CN'));

  // ── 汇总 ──
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  结果：${pass} 通过  ${fail} 失败`);
  console.log('═'.repeat(50));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
