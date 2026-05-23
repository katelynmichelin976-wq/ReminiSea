// Wave 1 照护者模式验证
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


  // 清除可能残留的 caregiver 模式
  await page.evaluate(() => localStorage.removeItem('yihai_app_mode'));
  await page.reload();
  await page.waitForTimeout(1500);

  // ── 1. 默认为患者模式 ─────────────────────────────────
  console.log('\n── 默认患者模式 ──');
  const modeInit = await page.evaluate(() => localStorage.getItem('yihai_app_mode'));
  A('localStorage 无 mode（默认 patient）', modeInit === null || modeInit === 'patient');

  const fabText = await page.locator('.home-tabbar .tab-item.action span').first().textContent();
  A('FAB 显示"开始练习"', fabText.trim() === '开始练习');

  const plusHidden = await page.evaluate(() => {
    const btn = document.querySelector('.btn-new-deck');
    return !btn || btn.offsetParent === null;
  });
  A('＋ 按钮隐藏', plusHidden);

  // ── 2. 我的屏 → 模式切换开关 ───────────────────────────
  console.log('\n── 我的屏模式切换 ──');
  await page.locator('#screen-home .tab-item:last-child').click();
  await page.waitForTimeout(400);

  const toggleExists = await page.locator('#app-mode-toggle').count();
  A('模式开关存在', toggleExists === 1);

  const toggleOff = await page.evaluate(() => !document.getElementById('app-mode-toggle').checked);
  A('默认关闭（患者模式）', toggleOff);

  const titleText = await page.locator('#mine-mode-title').textContent();
  A('标题显示"照护者模式"', titleText.trim() === '照护者模式');

  const subText = await page.locator('#mine-mode-sub').textContent();
  A('副标题显示"已关闭"', subText.includes('已关闭'));

  // ── 3. 切换到照护者模式 ──────────────────────────────
  console.log('\n── 切换为照护者模式 ──');
  await page.evaluate(() => {
    const el = document.getElementById('app-mode-toggle');
    el.checked = true;
    el.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(300);

  const modeSet = await page.evaluate(() => localStorage.getItem('yihai_app_mode'));
  A('localStorage 已设 caregiver', modeSet === 'caregiver');

  const toggleOn = await page.evaluate(() => document.getElementById('app-mode-toggle').checked);
  A('开关已打开', toggleOn);

  const subOn = await page.locator('#mine-mode-sub').textContent();
  A('副标题显示"已开启"', subOn.trim() === '已开启');

  // ── 4. 切回首页验证 FAB 变化 ─────────────────────────
  console.log('\n── 首页 FAB 变化 ──');
  await page.locator('#screen-mine .tab-item:first-child').click();
  await page.waitForTimeout(400);

  const fabText2 = await page.locator('.home-tabbar .tab-item.action span').first().textContent();
  A('FAB 显示"开始制卡"', fabText2.trim() === '开始制卡');

  const plusVisible = await page.evaluate(() => {
    const btn = document.querySelector('.btn-new-deck');
    return btn && btn.offsetParent !== null;
  });
  A('＋ 按钮可见', plusVisible);

  // ── 5. 点 ＋ 按钮 → Action Sheet ─────────────────────
  console.log('\n── Action Sheet ──');
  await page.locator('.btn-new-deck').click();
  await page.waitForTimeout(300);

  const sheetOpen = await page.evaluate(() =>
    document.getElementById('action-sheet')?.classList.contains('open')
  );
  A('Action sheet 打开', sheetOpen);

  const btnCount = await page.locator('.action-sheet-btn').count();
  A('有 5 个操作按钮', btnCount === 5);

  // 点取消关闭
  await page.locator('.action-sheet-cancel').click();
  await page.waitForTimeout(300);

  const sheetClosed = await page.evaluate(() =>
    !document.getElementById('action-sheet')?.classList.contains('open')
  );
  A('点取消 → 关闭', sheetClosed);

  // ── 6. 切回患者模式 ─────────────────────────────────
  console.log('\n── 切回患者模式 ──');
  await page.locator('#screen-home .tab-item:last-child').click();
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const el = document.getElementById('app-mode-toggle');
    el.checked = false;
    el.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(300);

  const modeFinal = await page.evaluate(() => localStorage.getItem('yihai_app_mode'));
  A('localStorage 已切回 patient', modeFinal === 'patient');

  // ── 7. 模式重载后持久化 ─────────────────────────────
  console.log('\n── 持久化 ──');
  // 先切回 caregiver
  await page.evaluate(() => {
    const el = document.getElementById('app-mode-toggle');
    el.checked = true;
    el.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(300);

  await page.reload();
  await page.waitForTimeout(1500);

  const modePersist = await page.evaluate(() => localStorage.getItem('yihai_app_mode'));
  A('重载后 mode 仍是 caregiver', modePersist === 'caregiver');

  const fabAfterReload = await page.locator('.home-tabbar .tab-item.action span').first().textContent();
  A('重载后 FAB 显示"开始制卡"', fabAfterReload.trim() === '开始制卡');

  const plusAfterReload = await page.evaluate(() => {
    const btn = document.querySelector('.btn-new-deck');
    return btn && btn.offsetParent !== null;
  });
  A('重载后 ＋ 按钮可见', plusAfterReload);

  // ── 8. 清理：恢复 patient ──────────────────────────
  await page.evaluate(() => localStorage.setItem('yihai_app_mode', 'patient'));

  // ── 汇总 ──────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  结果：${pass} 通过  ${fail} 失败`);
  console.log('═'.repeat(50));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
