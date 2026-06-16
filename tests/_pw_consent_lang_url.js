/**
 * PP/ToS 链接 i18n 路由测试 — v5.13.17 P2 #4
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_consent_lang_url.js
 *
 * 覆盖：setLocale 切换后登录/注册 form consent 链接 href 切换；
 *       es/ja 回落到英文版；showConsentUpgradeDialog 内链接随 locale。
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();

async function getLoginPrivacyHref(page) {
  return run(page, () => {
    const a = document.getElementById('consent-login-privacy-a');
    return a ? a.href : null;
  });
}
async function getLoginTermsHref(page) {
  return run(page, () => {
    const a = document.getElementById('consent-login-terms-a');
    return a ? a.href : null;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await run(page, () => { showScreen('screen-account'); });
    await wait(page, 600);

    section('PHASE 1: zh-CN 默认 → privacy.html / terms.html');
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 400);
    let p = await getLoginPrivacyHref(page);
    let t = await getLoginTermsHref(page);
    pass('zh-CN privacy 指向 privacy.html', p && p.endsWith('/privacy.html'));
    pass('zh-CN terms 指向 terms.html', t && t.endsWith('/terms.html'));

    section('PHASE 2: en → privacy_en.html');
    await run(page, () => setLocale('en'));
    await wait(page, 400);
    p = await getLoginPrivacyHref(page);
    t = await getLoginTermsHref(page);
    pass('en privacy 指向 privacy_en.html', p && p.endsWith('/privacy_en.html'));
    pass('en terms 指向 terms_en.html', t && t.endsWith('/terms_en.html'));

    section('PHASE 3: zh-Hant → _zh-Hant.html');
    await run(page, () => setLocale('zh-Hant'));
    await wait(page, 400);
    p = await getLoginPrivacyHref(page);
    t = await getLoginTermsHref(page);
    pass('zh-Hant privacy 指向 privacy_zh-Hant.html', p && p.endsWith('/privacy_zh-Hant.html'));
    pass('zh-Hant terms 指向 terms_zh-Hant.html', t && t.endsWith('/terms_zh-Hant.html'));

    section('PHASE 4: es fallback → _en.html');
    await run(page, () => setLocale('es'));
    await wait(page, 400);
    p = await getLoginPrivacyHref(page);
    t = await getLoginTermsHref(page);
    pass('es privacy fallback 到 privacy_en.html', p && p.endsWith('/privacy_en.html'));
    pass('es terms fallback 到 terms_en.html', t && t.endsWith('/terms_en.html'));

    section('PHASE 5: ja fallback → _en.html');
    await run(page, () => setLocale('ja'));
    await wait(page, 400);
    p = await getLoginPrivacyHref(page);
    t = await getLoginTermsHref(page);
    pass('ja privacy fallback 到 privacy_en.html', p && p.endsWith('/privacy_en.html'));
    pass('ja terms fallback 到 terms_en.html', t && t.endsWith('/terms_en.html'));

    section('PHASE 6: 还原 zh-CN');
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 400);
    p = await getLoginPrivacyHref(page);
    pass('恢复 zh-CN privacy.html', p && p.endsWith('/privacy.html'));

    section('PHASE 7: showConsentUpgradeDialog 链接随 locale');
    await run(page, () => setLocale('en'));
    await wait(page, 400);
    await run(page, () => {
      localStorage.setItem('yh:v1:user:consentVersion', 'v0');
      _consentUpgradeInFlight = false;
      checkConsentUpgrade();
    });
    await wait(page, 1500);
    const dlgLinks = await run(page, () => {
      const links = Array.from(document.querySelectorAll('.yh-dialog a'));
      return links.map(a => a.href);
    });
    pass('dialog 含 privacy_en.html 链接', dlgLinks.some(h => h.endsWith('/privacy_en.html')));
    pass('dialog 含 terms_en.html 链接', dlgLinks.some(h => h.endsWith('/terms_en.html')));

    await run(page, () => document.querySelector('#yh-dlg-no')?.click());
    await wait(page, 300);

  } finally {
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
