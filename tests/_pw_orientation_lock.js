/**
 * 忆海拾光 横屏锁定 overlay 测试 — v5.13.9+
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_orientation_lock.js
 *
 * 覆盖：
 *   - 桌面端横屏不触发 overlay
 *   - 触屏设备竖屏不触发 overlay
 *   - 触屏设备横屏触发 overlay
 *   - i18n 文案（zh-CN / en / ja）
 *   - 横屏切换不破坏 home/quiz 状态
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl, startCoverage, stopAndCollectCoverage, stopAndCollectFromBrowser } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();

async function isOverlayVisible(page) {
  return run(page, () => {
    const el = document.getElementById('rotate-prompt');
    if (!el) return false;
    return window.getComputedStyle(el).display !== 'none';
  });
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });

  try {
    // ════ PHASE 1: 桌面浏览器横屏不触发 ════
    section('PHASE 1: 桌面浏览器横屏（无触屏）');
    let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
    let page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 800);
    pass('#rotate-prompt 元素存在', await run(page, () => !!document.getElementById('rotate-prompt')));
    pass('桌面横屏 overlay 隐藏', !(await isOverlayVisible(page)));
    await ctx.close();

    // ════ PHASE 2: 触屏设备竖屏不触发 ════
    section('PHASE 2: 触屏设备竖屏（iPad portrait）');
    ctx = await browser.newContext({ viewport: { width: 810, height: 1080 }, hasTouch: true, isMobile: false });
    page = await ctx.newPage();
    await startCoverage(page);
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 800);
    pass('触屏竖屏 overlay 隐藏', !(await isOverlayVisible(page)));
    await ctx.close();

    // ════ PHASE 3: 触屏设备横屏触发 ════
    section('PHASE 3: 触屏设备横屏（iPad landscape）');
    ctx = await browser.newContext({ viewport: { width: 1080, height: 810 }, hasTouch: true, isMobile: false });
    page = await ctx.newPage();
    await startCoverage(page);
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 800);
    pass('触屏横屏 overlay 显示', await isOverlayVisible(page));
    pass('overlay z-index 高于其它', await run(page, () => {
      const el = document.getElementById('rotate-prompt');
      const z = parseInt(window.getComputedStyle(el).zIndex || '0');
      return z >= 1000;
    }));
    pass('overlay 文案非空', await run(page, () => {
      const el = document.querySelector('#rotate-prompt .rotate-text');
      return el && el.textContent.trim().length > 0;
    }));

    // ════ PHASE 4: i18n 文案 ════
    section('PHASE 4: i18n 文案');
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 300);
    const zhText = await run(page, () => document.querySelector('#rotate-prompt .rotate-text').textContent.trim());
    pass(`zh-CN 文案含「竖」: "${zhText}"`, zhText.includes('竖'));

    await run(page, () => setLocale('en'));
    await wait(page, 300);
    const enText = await run(page, () => document.querySelector('#rotate-prompt .rotate-text').textContent.trim());
    pass(`en 文案含 Portrait: "${enText}"`, /portrait/i.test(enText));

    await run(page, () => setLocale('ja'));
    await wait(page, 300);
    const jaText = await run(page, () => document.querySelector('#rotate-prompt .rotate-text').textContent.trim());
    pass(`ja 文案含「縦」: "${jaText}"`, jaText.includes('縦'));

    await run(page, () => setLocale('zh-CN'));
    await wait(page, 300);
    await ctx.close();

    // ════ PHASE 5: 旋转回竖屏 overlay 消失 + 状态保留 ════
    section('PHASE 5: 横竖屏切换不破坏状态');
    ctx = await browser.newContext({ viewport: { width: 810, height: 1080 }, hasTouch: true, isMobile: false });
    page = await ctx.newPage();
    await startCoverage(page);
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 800);
    // 修改首页一个 DOM 标记
    await run(page, () => {
      const m = document.querySelector('.home-version');
      if (m) m.setAttribute('data-test-marker', 'before-rotate');
    });
    // 切到横屏
    await page.setViewportSize({ width: 1080, height: 810 });
    await wait(page, 500);
    pass('切横屏后 overlay 显示', await isOverlayVisible(page));
    pass('切横屏后首页 DOM 标记仍在', await run(page, () => {
      const m = document.querySelector('.home-version');
      return m && m.getAttribute('data-test-marker') === 'before-rotate';
    }));
    // 切回竖屏
    await page.setViewportSize({ width: 810, height: 1080 });
    await wait(page, 500);
    pass('切回竖屏 overlay 隐藏', !(await isOverlayVisible(page)));
    pass('切回竖屏后首页 DOM 标记仍在', await run(page, () => {
      const m = document.querySelector('.home-version');
      return m && m.getAttribute('data-test-marker') === 'before-rotate';
    }));
    await ctx.close();

  } finally {
    await stopAndCollectFromBrowser(browser, '_pw_orientation_lock');
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
