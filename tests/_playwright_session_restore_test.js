/**
 * 忆海拾光 — 刷新页面后登录状态恢复测试
 *
 * 依赖：
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node tests/_playwright_session_restore_test.js
 *
 * 测试账号：zyhacl@gmail.com
 * 覆盖：
 *   1. 首次登录成功
 *   2. 刷新页面 → 自动恢复登录状态
 *   3. 刷新后 deck 列表正常显示
 */

const { chromium } = require('playwright');

const CFG = { url: 'http://localhost:8080/yihai_v4.9.html?v=' + Date.now() };
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

let passed = 0, failed = 0, errors = [];
const pass = (label, ok) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else    { failed++; errors.push(`✗ ${label}`); console.log(`  ✗ ${label}`); }
};
const section = (t) => console.log(`\n${'═'.repeat(56)}\n  ${t}\n${'═'.repeat(56)}`);
const wait = (pg, ms) => pg.waitForTimeout(ms);

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: 请设置 TEST_PASSWORD 环境变量'); process.exit(1); }

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 收集控制台日志便于诊断
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[sync]') || text.includes('[cloud]') || text.includes('supabase') || msg.type() === 'error')
      logs.push(`[${msg.type()}] ${text}`);
  });

  try {
    // ═══════════════════════ PHASE 1: 首次登录 ═══════════════════════
    section('PHASE 1: 首次登录');

    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    // 打开设置 → 云端 Tab
    await page.evaluate(() => {
      const b = document.querySelector('[aria-label="设置"]');
      if (b) b.click();
    });
    await wait(page, 500);

    await page.evaluate(() => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
    });
    await wait(page, 300);

    pass('登录表单可见', await page.evaluate(() => {
      const s = document.getElementById('cloud-login-section');
      return s && window.getComputedStyle(s).display !== 'none';
    }));

    // 填入登录信息
    await page.fill('#cloud-email', TEST_EMAIL);
    await page.fill('#cloud-password', TEST_PASSWORD);
    await page.evaluate(() => { const b = document.getElementById('cloud-login-btn'); if (b) b.click(); });

    // 等登录完成（最多 15 秒）
    let connected = false;
    for (let i = 0; i < 30; i++) {
      connected = await page.evaluate(() => {
        const s = document.getElementById('cloud-connected-section');
        return s && window.getComputedStyle(s).display !== 'none';
      });
      if (connected) break;
      await wait(page, 500);
    }
    pass('登录成功，显示已连接界面', connected);

    const emailShown = await page.evaluate(() => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    });
    pass('显示登录邮箱', emailShown.includes(TEST_EMAIL));

    // 关闭设置面板
    await page.evaluate(() => {
      const o = document.getElementById('settings-overlay');
      if (o) o.classList.remove('open');
    });
    await wait(page, 300);

    // ═══════════════════════ PHASE 2: 刷新后自动恢复登录 ═══════════════════════
    section('PHASE 2: 刷新页面后自动恢复登录');

    console.log('  正在 reload...');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1000);

    // 确认 UI 已渲染（initUI 完成）
    const uiRendered = await page.evaluate(() => {
      const v = document.querySelector('.home-version');
      return v ? v.textContent : null;
    });
    pass('刷新后 UI 已渲染', !!uiRendered);
    console.log('  UI 版本: ' + uiRendered);

    // 关键断言：等待云端 session 自动恢复
    // 打开设置面板检查云端连接状态
    await page.evaluate(() => {
      const b = document.querySelector('[aria-label="设置"]');
      if (b) b.click();
    });
    await wait(page, 500);

    await page.evaluate(() => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
    });
    await wait(page, 500);

    // 等待自动恢复（最多 15 秒）
    let restored = false;
    for (let i = 0; i < 30; i++) {
      restored = await page.evaluate(() => {
        const s = document.getElementById('cloud-connected-section');
        return s && window.getComputedStyle(s).display !== 'none';
      });
      if (restored) break;
      await wait(page, 500);
    }
    pass('刷新后自动恢复登录，显示已连接界面', restored);

    const emailAfter = await page.evaluate(() => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    });
    pass('刷新后邮箱显示正确', emailAfter.includes(TEST_EMAIL));

    // 关闭设置
    await page.evaluate(() => {
      const o = document.getElementById('settings-overlay');
      if (o) o.classList.remove('open');
    });
    await wait(page, 300);

    // ═══════════════════════ PHASE 3: 刷新后 deck 列表正常 ═══════════════════════
    section('PHASE 3: 刷新后牌组列表正常');

    const hasDecks = await page.evaluate(() => {
      const cards = document.querySelectorAll('.deck-card');
      return cards.length > 0;
    });
    pass('牌组列表不为空', hasDecks);

    const emptyState = await page.evaluate(() => {
      const el = document.querySelector('.empty-state');
      return el && window.getComputedStyle(el).display !== 'none';
    });
    pass('不显示空状态占位', !emptyState);

    // 输出控制台诊断信息
    const syncLogs = logs.filter(l => l.includes('[sync]') || l.includes('[cloud]'));
    if (syncLogs.length > 0) {
      console.log('\n  控制台同步日志:');
      syncLogs.forEach(l => console.log('    ' + l));
    }

  } finally {
    await browser.close();
  }

  // ═══════════════════════ 结果 ═══════════════════════
  console.log(`\n${'═'.repeat(56)}`);
  console.log(`  结果：${passed} 通过  ${failed} 失败`);
  if (errors.length) {
    console.log(`\n  失败项：`);
    errors.forEach(e => console.log('    ' + e));
  }
  process.exit(failed > 0 ? 1 : 0);
})();
