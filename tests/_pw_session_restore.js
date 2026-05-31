/**
 * 忆海拾光 会话恢复流程测试
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_session_restore.js
 *
 * 覆盖：SDK 加载失败时 UI 不应永久卡在「正在恢复登录」
 *
 * 注：本文件包含「预期失败」的测试（用于复现已知缺陷）。
 *     标注 [BUG] 的断言当前会失败——这是正确的，说明缺陷存在。
 *     修复实施后这些断言应当转为通过。
 */
const { chromium } = require('playwright');
const { pass, section, wait, getCounts, getBaseUrl } = require('./_playwright_helper');

const BASE_URL = getBaseUrl();

// 写入 localStorage 的最小有效 session_backup（触发「正在恢复」状态用）
const FAKE_BACKUP = JSON.stringify({
  user: { email: 'test@example.com', id: 'aaaaaaaa-0000-0000-0000-000000000000' },
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
});

// ── 工具：等待账号屏某个状态可见 ──────────────────────────────────
async function waitAccountState(page, stateId, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 3000);
  while (Date.now() < deadline) {
    const visible = await page.evaluate((id) => {
      const el = document.getElementById(id);
      return !!el && window.getComputedStyle(el).display !== 'none';
    }, stateId);
    if (visible) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

// ── 工具：当前账号屏显示哪个状态 ─────────────────────────────────
async function getAccountState(page) {
  return page.evaluate(() => {
    const states = ['account-state-logged-out', 'account-state-restoring', 'account-state-logged-in'];
    for (const id of states) {
      const el = document.getElementById(id);
      if (el && window.getComputedStyle(el).display !== 'none') return id;
    }
    return 'none-visible';
  });
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });

  try {
    // ════════════════════════════════════════════════════════
    // SUITE 1: SDK CDN 加载失败
    // ════════════════════════════════════════════════════════
    section('SUITE 1: SDK CDN 加载失败 → UI 不应卡死');

    const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 } });

    // 在 JS 执行前写入 localStorage，模拟「曾经登录过」的用户
    await ctx1.addInitScript((backup) => {
      localStorage.setItem('yihai_session_backup', backup);
    }, FAKE_BACKUP);

    const page1 = await ctx1.newPage();

    // 阻断 Supabase SDK CDN（模拟 CDN 不可达）
    await page1.route('**/@supabase/supabase-js**', route => route.abort());

    await page1.goto(BASE_URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 等待 _tryInitCloud 耗尽所有 50 次轮询（50 × 200ms + 初始 100ms ≈ 10.1s）
    // 留 2s buffer
    await page1.waitForTimeout(12500);

    // 打开账号页，触发 renderAccount()
    await page1.evaluate(() => {
      if (typeof showAccount === 'function') showAccount();
      else if (typeof showScreen === 'function') showScreen('screen-account');
    });
    await page1.waitForTimeout(500);

    const state1 = await getAccountState(page1);

    // SDK 从未加载 → _sessionRestoring 保持 false → 显示登录表单
    pass('SDK 失败后显示登录表单（非恢复中）',
      state1 === 'account-state-logged-out');

    // 确认 SDK 确实没有加载
    const sdkLoaded = await page1.evaluate(() => typeof supabase !== 'undefined');
    pass('SDK 确实未加载（路由拦截生效）', !sdkLoaded);

    await ctx1.close();

    // ════════════════════════════════════════════════════════
    // SUITE 2: 正向基准 — SDK 正常加载，无 backup → 显示登录表单
    // ════════════════════════════════════════════════════════
    section('SUITE 2: 正向基准 — 无 backup，SDK 正常加载');

    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page2 = await ctx2.newPage();

    await page2.goto(BASE_URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page2.waitForTimeout(2000);

    await page2.evaluate(() => {
      if (typeof showAccount === 'function') showAccount();
      else if (typeof showScreen === 'function') showScreen('screen-account');
    });
    await page2.waitForTimeout(500);

    const state2 = await getAccountState(page2);
    pass('无 backup 时显示登录表单', state2 === 'account-state-logged-out');

    const noBackup = await page2.evaluate(() => !localStorage.getItem('yihai_session_backup'));
    pass('确认 localStorage 无 backup', noBackup);

    await ctx2.close();

    // ════════════════════════════════════════════════════════
    // SUITE 3: 正向基准 — SDK 正常加载，有 backup → 最终退出「恢复中」状态
    // ════════════════════════════════════════════════════════
    section('SUITE 3: 正向基准 — 有 backup，SDK 正常加载（网络可能失败但状态应推进）');

    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });

    await ctx3.addInitScript((backup) => {
      localStorage.setItem('yihai_session_backup', backup);
    }, FAKE_BACKUP);

    const page3 = await ctx3.newPage();

    // SDK 正常加载，但 Supabase auth 端点返回 401（token 过期/无效）
    // 模拟 getSession() 走 path C（返回 null session）
    await page3.route('**/auth/v1/**', route => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_token', message: 'JWT expired' }),
    }));

    await page3.goto(BASE_URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 等待 SDK 加载 + restoreSession 走完（7s getSession 超时 + buffer）
    await page3.waitForTimeout(10000);

    await page3.evaluate(() => {
      if (typeof showAccount === 'function') showAccount();
      else if (typeof showScreen === 'function') showScreen('screen-account');
    });
    await page3.waitForTimeout(500);

    const state3 = await getAccountState(page3);
    // path C：getSession 超时/失败 → _syncEnabled=false, _cloudUserEmail 赋值为 backup email
    // → renderAccount 应显示登录表单（email 预填），不应卡在「恢复中」
    pass('SDK 正常但 token 失效时显示登录表单（非恢复中）',
      state3 === 'account-state-logged-out');

    await ctx3.close();

    // ════════════════════════════════════════════════════════
    // SUITE 4: 缺陷 2 — backup 损坏（path A）→ UI 卡住
    // ════════════════════════════════════════════════════════
    section('SUITE 4: backup 损坏 → path A → UI 不应卡死');

    const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 } });

    // 写入无法 JSON.parse 的 backup（触发 path A：return 不更新 UI）
    await ctx4.addInitScript(() => {
      localStorage.setItem('yihai_session_backup', 'corrupted{{{json');
    });

    const page4 = await ctx4.newPage();
    await page4.goto(BASE_URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 等 SDK 加载 + restoreSession 走完 path A（快速 return，无网络请求）
    await page4.waitForTimeout(4000);

    await page4.evaluate(() => {
      if (typeof showAccount === 'function') showAccount();
      else if (typeof showScreen === 'function') showScreen('screen-account');
    });
    await page4.waitForTimeout(500);

    const state4 = await getAccountState(page4);

    // 验证辅助信息
    const backupRaw = await page4.evaluate(() => localStorage.getItem('yihai_session_backup'));
    pass('backup 字符串仍存在（非 null）', !!backupRaw);

    const cloudEmail4 = await page4.evaluate(() => typeof _cloudUserEmail !== 'undefined' ? _cloudUserEmail : '');
    pass('path A 后 _cloudUserEmail 为空', cloudEmail4 === '');

    // path A 中 backup 解析失败 → finally 将 _sessionRestoring 置 false → 显示登录表单
    pass('backup 损坏时显示登录表单', state4 === 'account-state-logged-out');

    await ctx4.close();

    // ════════════════════════════════════════════════════════
    // SUITE 5: 缺陷 3 — state injection 模拟 path D 后状态
    //
    // path D（getSession 抛异常）：_cloudUserEmail 不赋值，
    // backup 仍在，updateCloudTabUI() 被调用但条件仍为 true。
    // 用状态注入直接复现该后置条件，不依赖 SDK 抛异常。
    // ════════════════════════════════════════════════════════
    section('SUITE 5: path D 后置条件 → renderAccount 应显示登录表单');

    const ctx5 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page5 = await ctx5.newPage();

    // 无 backup 启动 → path A（clean），SDK 正常加载，_cloudUserEmail = ''
    await page5.goto(BASE_URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page5.waitForTimeout(3000);

    // 注入 path D 后置条件：
    //   - 写入有效 backup（email 存在）
    //   - _cloudUserEmail 保持空（path D 不赋值）
    //   - _syncEnabled = false（path D 设置）
    //   - 调用 updateCloudTabUI（path D 会调，但 renderAccount 仍会卡住）
    await page5.evaluate((backup) => {
      localStorage.setItem('yihai_session_backup', backup);
      _cloudUserEmail = '';
      _syncEnabled    = false;
      if (typeof updateCloudTabUI === 'function') updateCloudTabUI();
    }, FAKE_BACKUP);
    await page5.waitForTimeout(300);

    // 主动打开账号页（用户操作触发 renderAccount）
    await page5.evaluate(() => {
      if (typeof showAccount === 'function') showAccount();
      else if (typeof showScreen === 'function') showScreen('screen-account');
    });
    await page5.waitForTimeout(500);

    const state5 = await getAccountState(page5);

    // _sessionRestoring=false（恢复已结束）→ 即使 backup 存在也显示登录表单
    pass('path D 后置条件下显示登录表单', state5 === 'account-state-logged-out');

    // 补充：path D 后 _cloudUserEmail 确实为空
    const email5 = await page5.evaluate(() => _cloudUserEmail);
    pass('path D 后 _cloudUserEmail 为空（复现 renderAccount 触发条件）', email5 === '');

    await ctx5.close();

    // ════════════════════════════════════════════════════════
    // SUITE 6: 登录请求挂起 → 15s 超时后按钮恢复可用
    //
    // 修复：doAccountLogin() 新增 Promise.race + 15s timeout
    // 触发条件：signInWithPassword() 网络请求永远不返回
    // 期望行为：15s 后按钮恢复可用，账号页仍显示登录表单
    // ════════════════════════════════════════════════════════
    section('SUITE 6: 登录请求挂起 → 15s 超时后按钮应恢复可用');

    const ctx6 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page6 = await ctx6.newPage();

    // 正常加载，无 backup，等 SDK 完成初始化
    await page6.goto(BASE_URL + '?v=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page6.waitForTimeout(2500);

    // 挂起所有 auth 请求（不调 fulfill/abort/continue → 请求永远 pending）
    await page6.route('**/auth/v1/**', _route => { /* intentionally hang */ });

    // 导航到账号页
    await page6.evaluate(() => {
      if (typeof showAccount === 'function') showAccount();
      else if (typeof showScreen === 'function') showScreen('screen-account');
    });
    await page6.waitForTimeout(500);

    // 填入邮箱和密码并点击登录
    await page6.evaluate(() => {
      const e = document.getElementById('account-email');
      const p = document.getElementById('account-password');
      if (e) e.value = 'test@example.com';
      if (p) p.value = 'wrongpassword';
      const b = document.getElementById('account-login-btn');
      if (b) b.click();
    });
    await page6.waitForTimeout(500);

    // 按钮应立即进入 disabled 状态（登录中…）
    const btnDisabledDuringLogin = await page6.evaluate(() => {
      const b = document.getElementById('account-login-btn');
      return !!b && b.disabled;
    });
    pass('登录中按钮应变为 disabled', btnDisabledDuringLogin);

    // 等待 15s 超时触发 + 2s buffer
    await page6.waitForTimeout(17000);

    // finally 块执行后按钮应恢复可用
    const btnRestoredAfterTimeout = await page6.evaluate(() => {
      const b = document.getElementById('account-login-btn');
      return !!b && !b.disabled;
    });
    pass('登录超时 15s 后按钮恢复可用', btnRestoredAfterTimeout);

    // 账号页应仍显示登录表单（没有卡在其他状态）
    const state6 = await getAccountState(page6);
    pass('登录超时后账号页显示登录表单', state6 === 'account-state-logged-out');

    await ctx6.close();

  } finally {
    await browser.close();
  }

  // ── 汇总 ──────────────────────────────────────────────────
  const { passed, failed, errors } = getCounts();
  console.log('\n' + '═'.repeat(60));
  console.log(`  结果：${passed} 通过 / ${failed} 失败`);
  if (errors.length) {
    console.log('\n  失败项：');
    errors.forEach(e => console.log('  ' + e));
  }
  console.log('═'.repeat(60));

  console.log('\n  注：所有断言应通过（缺陷 2/3/5 已通过 _sessionRestoring 标志修复）。');

  process.exit(failed > 0 ? 1 : 0);
})();
