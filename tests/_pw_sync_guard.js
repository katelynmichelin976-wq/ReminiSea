/**
 * 忆海拾光 runSync 30s 守门狗回归测试
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_sync_guard.js
 *
 * 覆盖：runSync({modal:true}) 的 30s watchdog —
 *       当所有 REST 请求永久挂起时，modal 应在 30s 后自动关闭，
 *       _syncInFlight 应复位为 false。
 *
 * 无需登录凭证（状态注入方式触发 runSync）。
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const BASE_URL = getBaseUrl();

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });

  try {
    section('SUITE: runSync 30s watchdog — REST 挂起时 modal 应自动关闭');

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    await page.goto(BASE_URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(page, 2000);

    // 挂起所有 Supabase REST 请求（模拟网络死挂，不调 fulfill/abort/continue）
    await page.route('**/rest/v1/**', _route => { /* intentionally hang */ });

    // 注入已登录状态，直接调 runSync({modal:true})（fire and forget）
    const syncStarted = await run(page, () => {
      if (typeof runSync !== 'function') return false;
      _syncEnabled = true;
      _cloudUserId  = 'aaaaaaaa-0000-0000-0000-000000000000';
      runSync({ modal: true });
      return true;
    });
    pass('runSync 函数存在且调用成功', syncStarted);

    // 等 500ms，确认 modal 已显示（同步流程已启动）
    await wait(page, 500);

    const modalVisible = await run(page, () => {
      const m = document.getElementById('sync-modal');
      return !!m && m.style.display !== 'none';
    });
    pass('runSync 启动后 sync-modal 可见', modalVisible);

    const inFlightTrue = await run(page, () =>
      typeof _syncInFlight !== 'undefined' ? _syncInFlight === true : null
    );
    pass('runSync 启动后 _syncInFlight = true', inFlightTrue === true);

    // 等待 30s watchdog 触发 + 2s buffer（总共等约 32.5s）
    await wait(page, 32500);

    // watchdog 触发后：modal 应消失，_syncInFlight 应复位为 false
    const modalHidden = await run(page, () => {
      const m = document.getElementById('sync-modal');
      return !m || m.style.display === 'none';
    });
    pass('30s 后 sync-modal 应消失（watchdog 触发）', modalHidden);

    const inFlightFalse = await run(page, () =>
      typeof _syncInFlight !== 'undefined' ? _syncInFlight === false : null
    );
    pass('30s 后 _syncInFlight 应复位为 false', inFlightFalse === true);

    await ctx.close();

    // ════════════════════════════════════════════════════════
    // SUITE 2: IDB blocked → runSync({modal:true}) → 应显示错误 toast
    //
    // 修复：catch 块加 options.modal 条件，modal 同步失败时也弹 toast
    // 触发条件：openSrsDb() 被 IDB blocked 8s 后 reject
    // 期望行为：modal 消失 + 错误 toast 出现
    // ════════════════════════════════════════════════════════
    section('SUITE 2: IDB blocked → modal 同步失败 → 应显示错误 toast');

    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page2 = await ctx2.newPage();

    await page2.goto(BASE_URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(page2, 2000);

    // 拦截 showCloudToast 记录调用；覆盖 openSrsDb 模拟 IDB blocked reject
    await run(page2, () => {
      window._toastLog = [];
      const _origToast = window.showCloudToast;
      window.showCloudToast = (msg, isErr) => {
        window._toastLog.push({ msg, isErr: !!isErr });
        if (_origToast) _origToast(msg, isErr);
      };

      window.openSrsDb = () =>
        Promise.reject(new Error('IDB blocked: please close other tabs and refresh'));

      _syncEnabled = true;
      _cloudUserId  = 'aaaaaaaa-0000-0000-0000-000000000000';
      runSync({ modal: true });
    });

    // 等 reject 传播 + catch 块执行
    await wait(page2, 500);

    const suite2 = await run(page2, () => ({
      modalHidden: (() => {
        const m = document.getElementById('sync-modal');
        return !m || m.style.display === 'none';
      })(),
      errorToastShown: (window._toastLog || []).some(e => e.isErr),
    }));

    pass('IDB blocked: modal 应消失（catch 块关闭）', suite2.modalHidden);
    pass('IDB blocked: modal 同步失败应显示错误 toast', suite2.errorToastShown);

    await ctx2.close();

  } finally {
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log('\n' + '═'.repeat(60));
  console.log(`  结果：${passed} 通过 / ${failed} 失败`);
  if (errors.length) {
    console.log('\n  失败项：');
    errors.forEach(e => console.log('  ' + e));
  }
  console.log('═'.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
})();
