/**
 * Consent 云同步 + 版本升级测试 — v5.13.13 P2 #1+#2+#3
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：$env:TEST_PASSWORD="xxx"; node tests/_pw_consent_sync.js
 *
 * 覆盖：A 设备 push consent → B 设备 pull 验证传播；
 *       LS 注入旧 version → 启动 / pull 后弹升级框；
 *       接受/拒绝分流（已登录 → signOut + 切屏；未登录 → toast）。
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin, cloudLogout } = require('./_playwright_helper');

if (!process.env.TEST_PASSWORD) {
  console.error('[consent_sync] 需要 TEST_PASSWORD 环境变量');
  process.exit(2);
}
const PWD = process.env.TEST_PASSWORD;
const TEST_EMAIL = 'zyhaff@gmail.com';
const URL = getBaseUrl() + '?v=' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });

  try {
    section('PHASE 1: 未登录 同版本 → 无弹窗');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await run(page, () => {
        localStorage.setItem('yh:v1:user:consentVersion', 'v1');
        localStorage.setItem('yh:v1:user:consentAt', new Date().toISOString());
      });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(page, 1500);
      const maskCount = await run(page, () => document.querySelectorAll('.yh-dialog-mask').length);
      pass('未登录同版本：无升级弹窗', maskCount === 0);
      await page.close();
    }

    section('PHASE 2: 未登录 旧版本 → 拒绝 toast 不切屏');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await run(page, () => {
        localStorage.setItem('yh:v1:user:consentVersion', 'v0');
        localStorage.setItem('yh:v1:user:consentAt', '2026-01-01T00:00:00.000Z');
      });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(page, 1500);
      const hasDialog = await run(page, () => !!document.querySelector('.yh-dialog-mask'));
      pass('未登录旧版本：升级框弹出', hasDialog === true);

      await run(page, () => document.querySelector('#yh-dlg-no').click());
      await wait(page, 500);
      const screenAfter = await run(page, () => document.querySelector('.screen.active')?.id);
      pass('未登录拒绝：仍在 screen-home', screenAfter === 'screen-home');
      const lsVerAfter = await run(page, () => localStorage.getItem('yh:v1:user:consentVersion'));
      pass('未登录拒绝：LS 未升级', lsVerAfter === 'v0');
      await page.close();
    }

    section('PHASE 3: 登录 push consent 到云');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await run(page, () => {
        localStorage.removeItem('yh:v1:user:consentVersion');
        localStorage.removeItem('yh:v1:user:consentAt');
      });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(page, 1000);
      await cloudLogin(page, TEST_EMAIL, PWD);
      await wait(page, 4000);

      const consentVer = await run(page, () => localStorage.getItem('yh:v1:user:consentVersion'));
      const consentAt = await run(page, () => localStorage.getItem('yh:v1:user:consentAt'));
      pass('登录后 LS consentVersion=v1', consentVer === 'v1');
      pass('登录后 LS consentAt 已写', !!consentAt && /^\d{4}-\d{2}-\d{2}T/.test(consentAt));

      await cloudLogout(page);
      await page.close();
    }

    section('PHASE 4: 跨设备 pull consent');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await run(page, () => { localStorage.clear(); });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(page, 1000);
      await cloudLogin(page, TEST_EMAIL, PWD);
      await wait(page, 5000);

      const pulledVer = await run(page, () => localStorage.getItem('yh:v1:user:consentVersion'));
      const pulledAt = await run(page, () => localStorage.getItem('yh:v1:user:consentAt'));
      pass('云 → LS consentVersion 恢复', pulledVer === 'v1');
      pass('云 → LS consentAt 恢复', !!pulledAt);

      await cloudLogout(page);
      await page.close();
    }

    section('PHASE 5: 已登录 旧版本 → 接受 → LS 升级');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await cloudLogin(page, TEST_EMAIL, PWD);
      await wait(page, 4000);

      await run(page, () => {
        localStorage.setItem('yh:v1:user:consentVersion', 'v0');
        _consentUpgradeInFlight = false;
        checkConsentUpgrade();
      });
      await wait(page, 1500);

      const hasDialog = await run(page, () => !!document.querySelector('.yh-dialog-mask'));
      pass('已登录旧版本：升级框弹出', hasDialog === true);

      await run(page, () => document.querySelector('#yh-dlg-yes').click());
      await wait(page, 1500);
      const verAfter = await run(page, () => localStorage.getItem('yh:v1:user:consentVersion'));
      pass('已登录接受：LS 升级到 v1', verAfter === 'v1');

      await cloudLogout(page);
      await page.close();
    }

    section('PHASE 6: 已登录 旧版本 → 拒绝 → signOut');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await cloudLogin(page, TEST_EMAIL, PWD);
      await wait(page, 4000);

      await run(page, () => {
        localStorage.setItem('yh:v1:user:consentVersion', 'v0');
        _consentUpgradeInFlight = false;
        checkConsentUpgrade();
      });
      await wait(page, 1500);

      const hasDialog = await run(page, () => !!document.querySelector('.yh-dialog-mask'));
      pass('已登录旧版本：升级框弹出', hasDialog === true);

      await run(page, () => document.querySelector('#yh-dlg-no').click());
      await wait(page, 2500);
      const syncEnabledAfter = await run(page, () => _syncEnabled);
      pass('已登录拒绝：signOut 后 _syncEnabled=false', syncEnabledAfter === false);
      const screenAfter = await run(page, () => document.querySelector('.screen.active')?.id);
      pass('已登录拒绝：切到 screen-account', screenAfter === 'screen-account');

      await page.close();
    }

  } finally {
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
