/**
 * 忆海拾光 — 退出登录清除本地数据测试
 *
 * 依赖：
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node tests/_playwright_user_switch_test.js
 *
 * 覆盖：退出后 _cloudUserId 清空、云牌组清除、重新登录数据干净拉回
 */

const { chromium } = require('playwright');

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
  page.on('console', msg => {
    if (msg.text().includes('[sync') || msg.text().includes('[cloud') || msg.type() === 'error')
      console.log(`  [${msg.type()}] ${msg.text()}`);
  });

  async function openCloudTab() {
    await page.click('[aria-label="设置"]');
    await wait(page, 300);
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('云端')) { t.click(); return; } }
    });
    await wait(page, 300);
  }

  async function login() {
    await openCloudTab();
    await page.fill('#cloud-email', TEST_EMAIL);
    await page.fill('#cloud-password', TEST_PASSWORD);
    await page.evaluate(() => { document.getElementById('cloud-login-btn').click(); });
    for (let i = 0; i < 30; i++) {
      if (await page.evaluate(() => {
        const s = document.getElementById('cloud-connected-section');
        return s && window.getComputedStyle(s).display !== 'none';
      })) return true;
      await wait(page, 500);
    }
    return false;
  }

  async function closeSettings() {
    await page.evaluate(() => {
      const o = document.getElementById('settings-overlay');
      if (o) o.classList.remove('open');
    });
    await wait(page, 300);
  }

  async function logout() {
    await openCloudTab();
    // 点击退出按钮
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.includes('退出') || b.getAttribute('onclick') === 'doCloudLogout()') {
          b.click(); return;
        }
      }
    });
    await wait(page, 1500);
    await closeSettings();
  }

  try {
    // ═══════════════════════ PHASE 1: 登录同步 ═══════════════════════
    section('PHASE 1: 登录同步');
    await page.goto('http://localhost:8080/yihai_v4.10.html?v=' + Date.now(),
      { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    pass('登录成功', await login());
    await closeSettings();

    // 等 syncAll 完成（最多 30 秒）
    let firstCount = 0;
    for (let i = 0; i < 60; i++) {
      firstCount = await page.evaluate(() =>
        DECKS_META.filter(m => m.source === 'cloud').length
      );
      if (firstCount > 0) break;
      await wait(page, 500);
    }
    console.log(`  登录后云牌组: ${firstCount}`);
    pass('登录后有云牌组', firstCount > 0);

    // ═══════════════════════ PHASE 2: 退出验证 ═══════════════════════
    section('PHASE 2: 退出并验证数据清除');
    await logout();

    pass('退出后 _syncEnabled=false', await page.evaluate(() => !_syncEnabled));
    pass('退出后 _cloudUserId 已清空', await page.evaluate(() => !_cloudUserId));

    const cloudDecks = await page.evaluate(() =>
      DECKS_META.filter(m => m.source === 'cloud').length
    );
    console.log(`  退出后云牌组: ${cloudDecks}`);
    pass('退出后云牌组保留（离线可用）', cloudDecks > 0);

    // ═══════════════════════ PHASE 3: 重新登录 ═══════════════════════
    section('PHASE 3: 重新登录验证数据从云端拉回');
    pass('重新登录成功', await login());
    await closeSettings();

    let secondCount = 0;
    for (let i = 0; i < 60; i++) {
      secondCount = await page.evaluate(() =>
        DECKS_META.filter(m => m.source === 'cloud').length
      );
      if (secondCount > 0) break;
      await wait(page, 500);
    }
    console.log(`  重新登录云牌组: ${secondCount}`);
    pass('重新登录后有云牌组', secondCount > 0);
    pass('两次牌组数量一致', firstCount === secondCount);

  } finally {
    await browser.close();
  }

  console.log(`\n${'═'.repeat(56)}`);
  console.log(`  结果：${passed} 通过  ${failed} 失败`);
  if (errors.length) { console.log(`\n  失败项：`); errors.forEach(e => console.log('    ' + e)); }
  process.exit(failed > 0 ? 1 : 0);
})();
