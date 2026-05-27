/**
 * 忆海拾光 版本更新后 session 恢复测试
 *
 * 场景：已登录 → 刷新页面（模拟版本更新后重新加载）→ 验证不需要重新登录
 *
 * 依赖：
 *   python -m http.server 8080 --directory C:/code
 *   TEST_PASSWORD=xxx node tests/_playwright_version_update_test.js
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, check, section, wait, run, getBaseUrl, cloudLogin, getCounts } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    // ══════════ PHASE 1: 登录 ══════════
    section('PHASE 1: 登录');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);

    const loggedIn = await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD);
    pass('PHASE 1 登录成功', loggedIn);

    const syncEnabled1 = await run(page, () => _syncEnabled);
    pass('登录后 _syncEnabled=true', syncEnabled1 === true);

    // ══════════ PHASE 2: 刷新（模拟版本更新后用户刷新页面）══════════
    section('PHASE 2: 刷新页面（模拟版本更新）');

    // 关闭设置面板再刷新
    await run(page, () => {
      const overlay = document.getElementById('settings-overlay');
      if (overlay) overlay.classList.remove('open');
    });
    await wait(page, 300);

    // 用 page.goto 模拟"版本更新后重新加载"（等同于用户刷新页面）
    const newUrl = getBaseUrl() + '?v=' + Date.now();
    await page.goto(newUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 3000);  // 等待 initCloud + session restore

    // ══════════ PHASE 3: 验证（不打开设置面板，直接检查状态）══════════
    section('PHASE 3: 验证刷新后自动恢复登录');

    const syncEnabled2 = await run(page, () => _syncEnabled);
    pass('刷新后 _syncEnabled 自动恢复为 true', syncEnabled2 === true);

    const sessionRestoring = await run(page, () => _sessionRestoring);
    pass('刷新后 _sessionRestoring=false（恢复完成，非卡住）', sessionRestoring === false);

    const email = await run(page, () => _cloudUserEmail);
    pass('刷新后 _cloudUserEmail 已恢复', email && email.includes(TEST_EMAIL.split('@')[0]));

    const userId = await run(page, () => _cloudUserId);
    pass('刷新后 _cloudUserId 已恢复', !!userId && userId.length > 8);

    // 不打开设置，检查首页是否正常（不应该显示"登录"界面）
    // 打开云端 tab 看登录状态
    await run(page, () => {
      const b = document.querySelector('[aria-label="设置"]');
      if (b) b.click();
    });
    await wait(page, 500);
    await run(page, (name) => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes(name)) { t.click(); return; } }
    }, '云端');
    await wait(page, 500);

    const connVisible = await run(page, () => {
      const s = document.getElementById('cloud-connected-section');
      return s && window.getComputedStyle(s).display !== 'none';
    });
    pass('刷新后云端 Tab 显示"已连接"而非登录表单', connVisible);

    const loginVisible = await run(page, () => {
      const s = document.getElementById('cloud-login-section');
      return s && window.getComputedStyle(s).display !== 'none';
    });
    pass('刷新后云端 Tab 不显示登录表单', !loginVisible);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  section('结果');
  const { passed, failed, errors } = getCounts();
  console.log(`  通过: ${passed}  失败: ${failed}`);
  if (errors.length) console.log('  失败详情:', errors.join(' | '));

  await page.close();
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
