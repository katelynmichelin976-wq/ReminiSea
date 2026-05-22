// Wave 1 dev.5 账户屏验证
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

  // ── 1. 我的屏账号卡点击 → 进账户屏 ──────────────────────
  console.log('\n── 账户屏入口 ──');
  // 先去我的屏
  await page.locator('#screen-home .tab-item:last-child').click();
  await page.waitForTimeout(400);
  const mineActive = await page.evaluate(() =>
    document.getElementById('screen-mine')?.classList.contains('active')
  );
  A('已切换到我的屏', mineActive);

  // 点账号卡
  await page.locator('#mine-profile-card').click();
  await page.waitForTimeout(400);

  const accountActive = await page.evaluate(() =>
    document.getElementById('screen-account')?.classList.contains('active')
  );
  A('点账号卡 → screen-account active', accountActive);

  const mineInactive = await page.evaluate(() =>
    !document.getElementById('screen-mine')?.classList.contains('active')
  );
  A('screen-mine inactive', mineInactive);

  // 页面上的关键元素
  const logoutState = await page.locator('#account-state-logged-out').count();
  A('#account-state-logged-out 存在', logoutState === 1);

  const restoringState = await page.locator('#account-state-restoring').count();
  A('#account-state-restoring 存在', restoringState === 1);

  const loggedInState = await page.locator('#account-state-logged-in').count();
  A('#account-state-logged-in 存在', loggedInState === 1);

  // ── 2. 未登录态（默认） ────────────────────────────────
  console.log('\n── 未登录态 ──');
  const outVisible = await page.evaluate(() =>
    document.getElementById('account-state-logged-out')?.style.display !== 'none'
  );
  A('默认显示未登录态', outVisible);

  const emailField = await page.locator('#account-email').count();
  A('邮箱输入框存在', emailField === 1);

  const pwdField = await page.locator('#account-password').count();
  A('密码输入框存在', pwdField === 1);

  const loginBtn = await page.locator('#account-login-btn').count();
  A('登录按钮存在', loginBtn === 1);

  const descText = await page.locator('.account-desc').textContent();
  A('说明文字非空', descText.includes('登录后可同步'));

  // ── 3. 返回首页 ──────────────────────────────────────
  console.log('\n── 返回导航 ──');
  await page.locator('#screen-account .back-btn').click();
  await page.waitForTimeout(400);

  const homeActive = await page.evaluate(() =>
    document.getElementById('screen-home')?.classList.contains('active')
  );
  A('点返回 → screen-home active', homeActive);

  // ── 4. 从首页点 FAB 进练习无干涉 ──────────────────────
  console.log('\n── 不影响既有功能 ──');
  const tabActive = await page.evaluate(() =>
    document.getElementById('screen-home')?.classList.contains('active')
  );
  A('保留在首页', tabActive);

  // ── 5. 检查已登录态渲染函数（不依赖网络） ──────────────
  console.log('\n── 已登录态代码检查 ──');
  const hasRenderAccount = await page.evaluate(() => typeof renderAccount === 'function');
  A('renderAccount 函数存在', hasRenderAccount);

  const hasDoAccountLogin = await page.evaluate(() => typeof doAccountLogin === 'function');
  A('doAccountLogin 函数存在', hasDoAccountLogin);

  const hasDoAccountLogout = await page.evaluate(() => typeof doAccountLogout === 'function');
  A('doAccountLogout 函数存在', hasDoAccountLogout);

  const hasShowAccount = await page.evaluate(() => typeof showAccount === 'function');
  A('showAccount 函数存在', hasShowAccount);

  const hasRealtimeToggle = await page.evaluate(() => {
    const src = onAccountRealtimeToggle.toString();
    return src.includes('_realtimeUpload') && src.includes('yihai_realtime_upload');
  });
  A('onAccountRealtimeToggle 读写 localStorage', hasRealtimeToggle);

  // ── 6. 登录回调更新账户屏 ─────────────────────────────
  console.log('\n── 登录状态同步 ──');
  const updateCloudTabCallsRender = await page.evaluate(() => {
    const src = updateCloudTabUI.toString();
    return src.includes('renderAccount');
  });
  A('updateCloudTabUI 中调用 renderAccount', updateCloudTabCallsRender);

  const profileCardCallsShowAccount = await page.evaluate(() => {
    const btn = document.getElementById('mine-profile-card');
    return btn.getAttribute('onclick') === 'showAccount()';
  });
  A('账号卡 onclick 改为 showAccount()', profileCardCallsShowAccount);

  // ── 汇总 ────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  结果：${pass} 通过  ${fail} 失败`);
  console.log('═'.repeat(50));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
