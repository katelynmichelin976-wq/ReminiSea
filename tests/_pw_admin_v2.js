/**
 * 忆海拾光 — 管理看板 v2 冒烟测试
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：$env:TEST_PASSWORD="667788"; node tests/_pw_admin_v2.js
 *
 * 覆盖：
 *   ① admin 登录 → #screen-main 可见
 *   ② 四象限各渲染 4 个 KPI 单元
 *   ③ 时间窗按钮切换 active 状态 + URL hash 更新
 *   ④ 抽屉展开 / 关闭
 *   ⑤ 非 admin 账号被拦截（不进入 #screen-main）
 * ~16 断言，需登录
 */
const { chromium } = require('playwright');
const { pass, section, wait, getCounts } = require('./_playwright_helper');

const ADMIN_URL = 'http://localhost:8080/yihai_admin_v2.html';
const ADMIN_EMAIL = 'zyhacl@gmail.com';
const NON_ADMIN_EMAIL = 'zyhaff@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || '';

if (!PASSWORD) {
  console.error('TEST_PASSWORD 未设置');
  process.exit(1);
}

async function run(page, fn, arg) { return page.evaluate(fn, arg); }

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    section('PHASE 1: 页面加载');
    await page.goto(ADMIN_URL + '?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1000);

    const hasLogin = await run(page, () => !!document.getElementById('screen-login'));
    pass('#screen-login 存在', hasLogin);
    const hasMain = await run(page, () => !!document.getElementById('screen-main'));
    pass('#screen-main 存在', hasMain);

    section('PHASE 2: Admin 登录');
    await run(page, () => {
      document.getElementById('login-email').value = '';
      document.getElementById('login-pwd').value = '';
    });
    await page.fill('#login-email', ADMIN_EMAIL);
    await page.fill('#login-pwd', PASSWORD);
    await page.click('#login-btn');

    let mainVisible = false;
    for (let i = 0; i < 40; i++) {
      mainVisible = await run(page, () => {
        const el = document.getElementById('screen-main');
        return el && el.classList.contains('active');
      });
      if (mainVisible) break;
      await wait(page, 500);
    }
    pass('Admin 登录后 #screen-main 可见', mainVisible);

    const adminName = await run(page, () => {
      const el = document.getElementById('admin-name');
      return el ? el.textContent.trim() : '';
    });
    pass('#admin-name 显示 admin 邮箱', adminName.includes('zyhacl'));

    section('PHASE 3: 四象限 KPI 渲染');
    await wait(page, 3000);

    for (const q of ['growth', 'health', 'feedback', 'content']) {
      const kpiCount = await run(page, (quadrant) => {
        const card = document.querySelector(`[data-quadrant="${quadrant}"]`);
        if (!card) return -1;
        return card.querySelectorAll('.kpi-cell').length;
      }, q);
      pass(`[data-quadrant="${q}"] 包含 4 个 .kpi-cell`, kpiCount === 4);
    }

    section('PHASE 4: 时间窗切换');
    const has7dBtn = await run(page, () => !!document.querySelector('.tw-selector button[data-tw="7d"]'));
    pass('.tw-selector 存在 [data-tw="7d"] 按钮', has7dBtn);

    await page.click('.tw-selector button[data-tw="30d"]');
    await wait(page, 500);

    const tw30Active = await run(page, () => {
      const btn = document.querySelector('.tw-selector button[data-tw="30d"]');
      return btn && btn.classList.contains('active');
    });
    pass('[data-tw="30d"] 点击后获得 active 类', tw30Active);

    const hashOk = await run(page, () => location.hash === '#tw=30d');
    pass('URL hash 更新为 #tw=30d', hashOk);

    await page.click('.tw-selector button[data-tw="24h"]');
    await wait(page, 500);
    const tw24Active = await run(page, () => {
      const btn = document.querySelector('.tw-selector button[data-tw="24h"]');
      return btn && btn.classList.contains('active');
    });
    pass('[data-tw="24h"] 切换后 active', tw24Active);

    section('PHASE 5: 抽屉展开 / 关闭');
    const expandBtn = await run(page, () => !!document.querySelector('.quadrant-expand'));
    pass('.quadrant-expand 按钮存在', expandBtn);

    await page.click('[data-quadrant="growth"] .quadrant-expand');
    await wait(page, 1000);

    const drawerOpen = await run(page, () => {
      const d = document.querySelector('.drawer');
      return d && d.classList.contains('active');
    });
    pass('.drawer 展开后有 .active 类', drawerOpen);

    const overlayOpen = await run(page, () => {
      const o = document.querySelector('.drawer-overlay');
      return o && o.classList.contains('active');
    });
    pass('.drawer-overlay 同时获得 .active 类', overlayOpen);

    await page.click('.drawer-close');
    await wait(page, 400);

    const drawerClosed = await run(page, () => {
      const d = document.querySelector('.drawer');
      return d && !d.classList.contains('active');
    });
    pass('.drawer-close 点击后抽屉关闭', drawerClosed);

    section('PHASE 6: 非 admin 账号被拦截');
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const p2Errors = [];
    page2.on('pageerror', e => p2Errors.push(e.message));
    await page2.goto(ADMIN_URL + '?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page2, 1000);

    await page2.fill('#login-email', NON_ADMIN_EMAIL);
    await page2.fill('#login-pwd', PASSWORD);
    await page2.click('#login-btn');

    await wait(page2, 5000);

    const nonAdminMain = await page2.evaluate(() => {
      const el = document.getElementById('screen-main');
      return el && el.classList.contains('active');
    });
    pass('非 admin 账号登录后 #screen-main 不可见', !nonAdminMain);

    const loginStillVisible = await page2.evaluate(() => {
      const el = document.getElementById('screen-login');
      return el && el.classList.contains('active');
    });
    pass('非 admin 登录失败后 #screen-login 仍然可见', loginStillVisible);

    await page2.close();

    pass('测试过程无 JS 页面错误', pageErrors.length === 0);
    if (pageErrors.length) console.log('  页面错误:', pageErrors.slice(0, 3));

  } catch (e) {
    console.error('测试异常:', e);
    process.exit(1);
  } finally {
    const { passed, failed, errors } = getCounts();
    console.log(`\n结果：${passed}/${passed + failed} 通过，${failed} 失败`);
    if (errors.length) errors.forEach(e => console.log(' ', e));
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
