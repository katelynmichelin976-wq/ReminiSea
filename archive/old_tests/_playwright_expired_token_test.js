/**
 * 忆海拾光 — 过期 token 后 session 恢复测试
 *
 * 复现场景：上午登录 → 下午刷新页面（access_token 已过期）→ 验证不需要重新登录
 * 根因分析见：restoreCloudSession() Level 2 使用了错误的 localStorage key
 *   错误：'sb-juzkonrzfyvchqxzmlpr.supabase.co-auth-token'
 *   正确：'sb-juzkonrzfyvchqxzmlpr-auth-token'
 *
 * 依赖：
 *   python -m http.server 8080 --directory C:/code
 *   TEST_PASSWORD=xxx node tests/_playwright_expired_token_test.js
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, check, section, wait, run, getBaseUrl, cloudLogin, getCounts } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    // ══════════ PHASE 1: 登录 ══════════
    section('PHASE 1: 登录');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);

    const loggedIn = await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD);
    pass('PHASE 1 登录成功', loggedIn);

    const syncEnabled1 = await run(page, () => _syncEnabled);
    pass('登录后 _syncEnabled=true', syncEnabled1 === true);

    // ══════════ PHASE 2: 模拟 access_token 过期 ══════════
    section('PHASE 2: 篡改 localStorage 使 access_token 过期');

    // 找出 Supabase SDK 实际使用的 key（正确 key 形如 sb-{projectRef}-auth-token）
    const sbKeyInfo = await run(page, (supabaseUrl) => {
      // 方法1：遍历 localStorage 找 sb-*-auth-token
      const keys = Object.keys(localStorage);
      const sbKeys = keys.filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      // 方法2：用 code 计算的错误 key
      const wrongKey = 'sb-' + supabaseUrl.replace(/^https?:\/\//, '') + '-auth-token';
      // 方法3：正确 key（只取 projectRef）
      const correctKey = 'sb-' + new URL(supabaseUrl).hostname.split('.')[0] + '-auth-token';
      return {
        allSbKeys: sbKeys,
        wrongKey,
        correctKey,
        hasWrongKey: localStorage.getItem(wrongKey) !== null,
        hasCorrectKey: localStorage.getItem(correctKey) !== null,
      };
    }, 'https://juzkonrzfyvchqxzmlpr.supabase.co');

    console.log('  localStorage sb-* keys 情况:');
    console.log('    实际存在的 key:', sbKeyInfo.allSbKeys);
    console.log('    代码中计算的（错误）key:', sbKeyInfo.wrongKey);
    console.log('    正确 key:', sbKeyInfo.correctKey);
    console.log('    错误 key 是否存在:', sbKeyInfo.hasWrongKey);
    console.log('    正确 key 是否存在:', sbKeyInfo.hasCorrectKey);

    pass('Supabase 使用正确 key（非全域名形式）', sbKeyInfo.hasCorrectKey && !sbKeyInfo.hasWrongKey);

    // 篡改 token：将 expires_at 设为 1 小时前（模拟过期）
    const tampered = await run(page, (correctKey) => {
      const raw = localStorage.getItem(correctKey);
      if (!raw) return { ok: false, reason: 'no token found' };
      try {
        const obj = JSON.parse(raw);
        const origExpiry = obj.expires_at;
        // 将 access_token 的 expires_at 设为 1 小时前
        obj.expires_at = Math.floor(Date.now() / 1000) - 3600;
        localStorage.setItem(correctKey, JSON.stringify(obj));
        return { ok: true, origExpiry, newExpiry: obj.expires_at };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    }, sbKeyInfo.correctKey);

    console.log('  篡改结果:', tampered);
    pass('成功篡改 expires_at（模拟过期 token）', tampered.ok);

    // ══════════ PHASE 3: 刷新页面（模拟版本更新后重新加载）══════════
    section('PHASE 3: 刷新页面（access_token 已过期）');

    const newUrl = getBaseUrl() + '?v=' + Date.now();
    await page.goto(newUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 5000);  // 等待 initCloud + session restore（含网络刷新）

    // ══════════ PHASE 4: 验证 session 是否自动恢复 ══════════
    section('PHASE 4: 验证过期 token 后 session 自动恢复');

    const syncEnabled2 = await run(page, () => _syncEnabled);
    pass('过期 token 后 _syncEnabled 自动恢复为 true', syncEnabled2 === true);

    const sessionRestoring = await run(page, () => _sessionRestoring);
    pass('过期 token 后 _sessionRestoring=false（恢复完成）', sessionRestoring === false);

    const email = await run(page, () => _cloudUserEmail);
    pass('过期 token 后 _cloudUserEmail 已恢复', email && email.includes(TEST_EMAIL.split('@')[0]));

    // 检查 UI
    await run(page, () => {
      const b = document.querySelector('[aria-label="设置"]');
      if (b) b.click();
    });
    await wait(page, 500);
    await run(page, (name) => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes(name)) { t.click(); return; } }
    }, '云端');
    await wait(page, 500);

    const connVisible = await run(page, () => {
      const s = document.getElementById('cloud-connected-section');
      return s && window.getComputedStyle(s).display !== 'none';
    });
    pass('过期 token 后云端 Tab 显示"已连接"', connVisible);

    const emailInputValue = await run(page, () => {
      return document.getElementById('cloud-email')?.value || '';
    });
    console.log('  login form 邮箱预填值:', emailInputValue);
    // session 恢复成功时 login form 被隐藏，HTML 不再有硬编码 value，input 应为空
    pass('login form 邮箱不硬编码（应为空字符串）', emailInputValue === '');

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  section('结果');
  const { passed, failed, errors } = getCounts();
  console.log(`  通过: ${passed}  失败: ${failed}`);
  if (errors.length) console.log('  失败详情:', errors.join(' | '));

  await page.close();
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
