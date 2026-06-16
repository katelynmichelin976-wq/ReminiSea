/**
 * JS 异常自动上报 测试 — v5.13.11
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_js_error_report.js
 *
 * 覆盖：window.error / unhandledrejection 自动写入 appEvents 表 + session 级去重
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl, startCoverage, stopAndCollectCoverage } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();

async function getJsErrorEvents(page) {
  return run(page, async () => {
    const evts = await idbGetAll('appEvents').catch(() => []);
    return evts.filter(e => e.event_type === 'js_error');
  });
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await startCoverage(page);

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 800);

    // ════ PHASE 1: 触发同步 error → 写入 appEvents ════
    section('PHASE 1: window.error 上报');
    await run(page, () => {
      setTimeout(() => { throw new Error('TEST_SYNC_ERR_1'); }, 0);
    });
    await wait(page, 300);

    let evts = await getJsErrorEvents(page);
    pass('appEvents 含 1 条 js_error', evts.length === 1);
    pass('payload.type === "error"', evts[0] && evts[0].payload && evts[0].payload.type === 'error');
    pass('payload.message 含 TEST_SYNC_ERR_1', evts[0] && evts[0].payload && (evts[0].payload.message || '').includes('TEST_SYNC_ERR_1'));

    // ════ PHASE 2: 重复同 message → 去重 ════
    section('PHASE 2: 同 message session 内去重');
    await run(page, () => {
      setTimeout(() => { throw new Error('TEST_SYNC_ERR_1'); }, 0);
    });
    await wait(page, 300);
    evts = await getJsErrorEvents(page);
    pass('仍只有 1 条（去重）', evts.length === 1);

    // ════ PHASE 3: 触发 unhandledrejection ════
    section('PHASE 3: unhandledrejection 上报');
    await run(page, () => {
      Promise.reject(new Error('TEST_REJECT_1'));
    });
    await wait(page, 300);
    evts = await getJsErrorEvents(page);
    pass('增加到 2 条', evts.length === 2);
    const rejEvt = evts.find(e => e.payload && e.payload.type === 'unhandledrejection');
    pass('含 unhandledrejection 类型', !!rejEvt);
    pass('rejection payload 含 TEST_REJECT_1', rejEvt && (rejEvt.payload.message || '').includes('TEST_REJECT_1'));

    // ════ PHASE 4: 不同 message → 不去重 ════
    section('PHASE 4: 不同 message 各自上报');
    await run(page, () => {
      setTimeout(() => { throw new Error('TEST_SYNC_ERR_2'); }, 0);
    });
    await wait(page, 300);
    evts = await getJsErrorEvents(page);
    pass('增加到 3 条', evts.length === 3);

    // ════ PHASE 5: payload 字段完整 ════
    section('PHASE 5: payload 字段完整');
    const syncEvt = evts.find(e => e.payload && (e.payload.message || '').includes('TEST_SYNC_ERR_2'));
    pass('含 stack 字段', syncEvt && typeof syncEvt.payload.stack === 'string');
    pass('含 screen 字段', syncEvt && typeof syncEvt.payload.screen === 'string');

    // Cleanup
    await run(page, async () => {
      const evts = await idbGetAll('appEvents').catch(() => []);
      for (const e of evts) {
        if (e.event_type === 'js_error') await idbDelete('appEvents', e.event_id).catch(() => {});
      }
    });

  } finally {
    await stopAndCollectCoverage(page, '_pw_js_error_report');
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
