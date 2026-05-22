const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let pass = 0, fail = 0;
  const A = (label, cond) => { if (cond) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗', label); } };

  await page.goto('http://localhost:8080/.claude/worktrees/v5-stage0-i18n/yihai_v4.11.html');
  await page.waitForFunction(() => typeof getLocale === 'function');

  // 默认检测（无 localStorage）
  const def = await page.evaluate(() => { localStorage.removeItem('yihai_ui_locale'); _uiLocale = null; return getLocale(); });
  A('getLocale 返回受支持的 locale', ['en','zh-CN','es'].includes(def));

  // setLocale 持久化
  await page.evaluate(() => setLocale('es'));
  const after = await page.evaluate(() => localStorage.getItem('yihai_ui_locale'));
  A('setLocale 写入 localStorage = es', after === 'es');

  // 非法值被拒绝
  await page.evaluate(() => setLocale('zz'));
  const still = await page.evaluate(() => localStorage.getItem('yihai_ui_locale'));
  A('setLocale 拒绝非法值', still === 'es');

  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
