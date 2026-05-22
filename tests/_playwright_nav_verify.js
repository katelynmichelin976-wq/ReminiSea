// Wave 1 dev.1 导航骨架验证
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
  await page.waitForTimeout(800);

  // ── 1. Tab Bar 存在 ──────────────────────────────────
  console.log('\n── Tab Bar 结构 ──');
  const tabbarCount = await page.locator('.home-tabbar').count();
  A('screen-home 内有 .home-tabbar', tabbarCount >= 1);

  const fabCount = await page.locator('.tab-fab').count();
  A('.tab-fab (FAB 圆按钮) 存在', fabCount >= 1);

  const activeTab = await page.locator('.tab-item.active').first().textContent();
  A('首页 Tab 初始激活', activeTab.includes('首 页'));

  // ── 2. 旧按钮已移除 ──────────────────────────────────
  console.log('\n── 旧按钮清理 ──');
  const browseBtnCount = await page.locator('.browse-btn').count();
  A('.browse-btn 已删除', browseBtnCount === 0);

  const startBtnCount = await page.locator('.start-btn').count();
  A('.start-btn 已删除', startBtnCount === 0);

  const homeGearCount = await page.locator('.home-gear-btn').count();
  A('.home-gear-btn (顶栏图标按钮) 已清除', homeGearCount === 0);

  // importFile input 仍存在（隐藏）
  const importInput = await page.locator('#importFile').count();
  A('#importFile 隐藏 input 保留', importInput === 1);

  // ── 3. 切换到我的屏 ──────────────────────────────────
  console.log('\n── 我的屏导航 ──');
  await page.locator('#screen-home .tab-item:last-child').click();
  await page.waitForTimeout(400);

  const mineActive = await page.evaluate(() =>
    document.getElementById('screen-mine')?.classList.contains('active')
  );
  A('点击我的 Tab → screen-mine 变 active', mineActive);

  const homeInactive = await page.evaluate(() =>
    !document.getElementById('screen-home')?.classList.contains('active')
  );
  A('screen-home 变 inactive', homeInactive);

  // 我的屏 Tab Bar 里「我的」应该是 active
  const mineTabActive = await page.evaluate(() => {
    const tabs = document.querySelectorAll('#screen-mine .tab-item');
    const last = tabs[tabs.length - 1];
    return last?.classList.contains('active');
  });
  A('我的屏底部 Tab Bar — 我的 Tab 激活', mineTabActive);

  // ── 4. 我的屏内容 ──────────────────────────────────
  console.log('\n── 我的屏内容 ──');
  const profileCard = await page.locator('#mine-profile-card').count();
  A('账号卡 #mine-profile-card 存在', profileCard === 1);

  const menuItems = await page.locator('#screen-mine .mine-menu-item').count();
  A('菜单项 ≥ 3（统计/设置/导入）', menuItems >= 3);

  // 检查菜单文字
  const menuTexts = await page.locator('#screen-mine .mine-menu-item span').allTextContents();
  A('统计菜单项存在', menuTexts.some(t => t.includes('统计')));
  A('设置菜单项存在', menuTexts.some(t => t.includes('设置')));
  A('导入文件菜单项存在', menuTexts.some(t => t.includes('导入')));

  // ── 5. 返回首页 ──────────────────────────────────
  console.log('\n── 返回首页 ──');
  await page.locator('#screen-mine .tab-item:first-child').click();
  await page.waitForTimeout(400);

  const homeBack = await page.evaluate(() =>
    document.getElementById('screen-home')?.classList.contains('active')
  );
  A('点首页 Tab → screen-home 重新 active', homeBack);

  // ── 6. 设置抽屉（从我的屏点设置） ──────────────────────
  console.log('\n── 设置抽屉 ──');
  await page.locator('#screen-home .tab-item:last-child').click();
  await page.waitForTimeout(300);
  await page.locator('#screen-mine .mine-menu-item').nth(1).click(); // 设置
  await page.waitForTimeout(400);
  const settingsOpen = await page.evaluate(() =>
    document.getElementById('settings-overlay')?.classList.contains('open')
  );
  A('我的屏点「设置」→ settings-overlay 打开', settingsOpen);

  // ── 汇总 ──────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  结果：${pass} 通过  ${fail} 失败`);
  console.log('═'.repeat(50));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
