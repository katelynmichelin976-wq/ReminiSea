/**
 * 同意 checkbox 测试 — v5.13.13
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_consent_checkbox.js
 *
 * 覆盖：登录/注册 form 加 consent checkbox，未勾选时 submit disabled；
 *       checkbox 链接 target/_blank + href 正确；i18n 切换；提交后 LS 落地。
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 800);

    section('PHASE 1: 登录 form checkbox 初始态');
    await run(page, () => showScreen('screen-account'));
    await wait(page, 400);

    const loginCbChecked = await run(page, () => document.getElementById('consent-login').checked);
    pass('登录 checkbox 默认未勾', loginCbChecked === false);

    const loginBtnDisabled = await run(page, () => document.getElementById('account-login-btn').disabled);
    pass('登录按钮默认 disabled', loginBtnDisabled === true);

    section('PHASE 2: 勾选后 enabled');
    await run(page, () => {
      const cb = document.getElementById('consent-login');
      cb.checked = true;
      cb.dispatchEvent(new Event('change'));
    });
    await wait(page, 100);
    const loginBtnEnabled = await run(page, () => document.getElementById('account-login-btn').disabled);
    pass('勾选后登录按钮 enabled', loginBtnEnabled === false);

    await run(page, () => {
      const cb = document.getElementById('consent-login');
      cb.checked = false;
      cb.dispatchEvent(new Event('change'));
    });
    await wait(page, 100);
    const loginBtnRedisabled = await run(page, () => document.getElementById('account-login-btn').disabled);
    pass('取消勾选后登录按钮 redisabled', loginBtnRedisabled === true);

    section('PHASE 3: 链接属性');
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 200);
    const privacyHref = await run(page, () => {
      const a = document.querySelector('label.account-consent-row a[data-i18n="consent_privacy"]');
      return a ? a.href : null;
    });
    pass('隐私政策链接 href 正确（zh-CN）', privacyHref && privacyHref.endsWith('/privacy.html'));

    const privacyTarget = await run(page, () => {
      const a = document.querySelector('label.account-consent-row a[data-i18n="consent_privacy"]');
      return a ? a.target : null;
    });
    pass('隐私政策链接 target=_blank', privacyTarget === '_blank');

    const termsHref = await run(page, () => {
      const a = document.querySelector('label.account-consent-row a[data-i18n="consent_terms"]');
      return a ? a.href : null;
    });
    pass('用户协议链接 href 正确（zh-CN）', termsHref && termsHref.endsWith('/terms.html'));

    section('PHASE 4: i18n 切换');
    await run(page, () => setLocale('en'));
    await wait(page, 400);
    const enLabel = await run(page, () =>
      document.querySelector('label.account-consent-row span[data-i18n="consent_label"]').textContent
    );
    pass('en 切换后含 "agree"', /agree/i.test(enLabel));

    await run(page, () => setLocale('ja'));
    await wait(page, 400);
    const jaLabel = await run(page, () =>
      document.querySelector('label.account-consent-row span[data-i18n="consent_label"]').textContent
    );
    pass('ja 切换后含「同意」', jaLabel.includes('同意'));

    await run(page, () => setLocale('zh-CN'));
    await wait(page, 400);

    section('PHASE 5: 注册 sheet checkbox');
    await run(page, () => openRegisterSheet());
    await wait(page, 400);
    const regCbChecked = await run(page, () => document.getElementById('consent-register').checked);
    pass('注册 checkbox 默认未勾', regCbChecked === false);
    const regBtnDisabled = await run(page, () => document.getElementById('reg-submit-btn').disabled);
    pass('注册按钮默认 disabled', regBtnDisabled === true);

    await run(page, () => {
      const cb = document.getElementById('consent-register');
      cb.checked = true;
      cb.dispatchEvent(new Event('change'));
    });
    await wait(page, 100);
    const regBtnEnabled = await run(page, () => document.getElementById('reg-submit-btn').disabled);
    pass('勾选后注册按钮 enabled', regBtnEnabled === false);

    section('PHASE 6: LS 写入');
    await run(page, () => {
      localStorage.removeItem('yh:v1:user:consentAt');
      localStorage.removeItem('yh:v1:user:consentVersion');
      _writeConsentLs();
    });
    const consentAt = await run(page, () => localStorage.getItem('yh:v1:user:consentAt'));
    const consentVer = await run(page, () => localStorage.getItem('yh:v1:user:consentVersion'));
    pass('LS yh:v1:user:consentAt 已写', consentAt && /^\d{4}-\d{2}-\d{2}T/.test(consentAt));
    pass('LS yh:v1:user:consentVersion == v1', consentVer === 'v1');

  } finally {
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
