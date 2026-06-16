/**
 * 用户管理 — 注册/找回密码/改密 UI + 流转
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_user_mgmt.js
 * 不发真实邮件：mock _sb.auth.* 调用
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl, startCoverage, stopAndCollectCoverage } = require('./_playwright_helper');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };

async function installAuthMock(page, scen) {
  await page.evaluate((s) => {
    const mockAuth = {
      signUp: async () => s.signUp || { error: null },
      signInWithPassword: async () => s.signIn || { data: { user: { email: 't@x.com', id: 'u1' }, session: {} }, error: null },
      resetPasswordForEmail: async () => s.reset || { error: null },
      updateUser: async () => s.update || { error: null },
      getSession: async () => s.session || { data: { session: { user: { email: 't@x.com' } } } },
      resend: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { email: 't@x.com' } } }),
      signOut: async () => ({}),
      stopAutoRefresh: () => {},
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    };
    const mockSb = { auth: mockAuth };
    _sb = mockSb;
    _createSupabaseClient = () => mockSb;
    if (typeof supabase !== 'undefined') supabase.createClient = () => mockSb;
  }, scen);
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await startCoverage(page);
  page.on('pageerror', err => console.log(`  [PAGE ERROR] ${err.message}`));

  try {
    section('PHASE 1: 账户屏入口');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1500);
    await run(page, () => showAccount());
    await wait(page, 400);
    pass('账户屏「注册新账号」链接存在', await run(page, () =>
      !!Array.from(document.querySelectorAll('.account-link')).find(a => a.dataset.i18n === 'account_link_register')));
    pass('账户屏「忘记密码?」链接存在', await run(page, () =>
      !!Array.from(document.querySelectorAll('.account-link')).find(a => a.dataset.i18n === 'account_link_forgot')));
    pass('注册 overlay 元素存在', await run(page, () => !!document.getElementById('register-overlay')));
    pass('找回密码 overlay 元素存在', await run(page, () => !!document.getElementById('reset-request-overlay')));
    pass('改密 overlay 元素存在', await run(page, () => !!document.getElementById('change-password-overlay')));
    pass('reset-password screen 元素存在', await run(page, () => !!document.getElementById('screen-reset-password')));

    section('PHASE 2: 注册 sheet 表单校验');
    await installAuthMock(page, { signUp: { error: null } });
    await run(page, () => openRegisterSheet());
    await wait(page, 300);
    pass('注册 overlay 打开', await run(page, () => {
      const el = document.getElementById('register-overlay');
      return el && el.style.display !== 'none';
    }));

    await run(page, () => { document.getElementById('reg-email').value = ''; document.getElementById('reg-pwd').value = '123456'; document.getElementById('reg-pwd2').value = '123456'; return doRegister(); });
    await wait(page, 300);
    pass('注册：空邮箱报错', await run(page, () => document.getElementById('reg-msg').textContent.length > 0));

    await run(page, () => { document.getElementById('reg-email').value = 'a@b.com'; document.getElementById('reg-pwd').value = '12345'; document.getElementById('reg-pwd2').value = '12345'; return doRegister(); });
    await wait(page, 300);
    pass('注册：密码 < 6 位报错', await run(page, () => /6/.test(document.getElementById('reg-msg').textContent)));

    await run(page, () => { document.getElementById('reg-email').value = 'a@b.com'; document.getElementById('reg-pwd').value = '123456'; document.getElementById('reg-pwd2').value = '654321'; return doRegister(); });
    await wait(page, 300);
    pass('注册：两次密码不一致报错', await run(page, () => /不一致|match|coincid|一致/.test(document.getElementById('reg-msg').textContent)));

    await run(page, () => { document.getElementById('reg-email').value = 'a@b.com'; document.getElementById('reg-pwd').value = '123456'; document.getElementById('reg-pwd2').value = '123456'; return doRegister(); });
    await wait(page, 500);
    pass('注册：成功后进入等待验证块', await run(page, () => document.getElementById('reg-pending-block').style.display !== 'none'));

    await installAuthMock(page, { signUp: { error: { message: 'User already registered' } } });
    await run(page, () => openRegisterSheet());
    await wait(page, 300);
    await run(page, () => { document.getElementById('reg-email').value = 'a@b.com'; document.getElementById('reg-pwd').value = '123456'; document.getElementById('reg-pwd2').value = '123456'; return doRegister(); });
    await wait(page, 500);
    pass('注册：已注册显示对应文案', await run(page, () => /已注册|already/i.test(document.getElementById('reg-msg').textContent)));

    section('PHASE 3: 找回密码 sheet');
    await installAuthMock(page, { reset: { error: null } });
    await run(page, () => openResetRequestSheet());
    await wait(page, 300);
    pass('找回密码 overlay 打开', await run(page, () => {
      const el = document.getElementById('reset-request-overlay');
      return el && el.style.display !== 'none';
    }));

    await run(page, () => { document.getElementById('reset-req-email').value = 'invalid'; return doRequestReset(); });
    await wait(page, 300);
    pass('找回密码：邮箱格式校验', await run(page, () => document.getElementById('reset-req-msg').textContent.length > 0));

    await run(page, () => { document.getElementById('reset-req-email').value = 'a@b.com'; return doRequestReset(); });
    await wait(page, 500);
    pass('找回密码：成功显示已发送', await run(page, () => /已发送|sent|enviado|送信/.test(document.getElementById('reset-req-msg').textContent)));

    section('PHASE 4: 改密 sheet（含老密验证）');
    await installAuthMock(page, { signIn: { data: { user: { email: 'a@b.com' }, session: {} }, error: null }, update: { error: null } });
    await run(page, () => { _cloudUserEmail = 'a@b.com'; openChangePasswordSheet(); });
    await wait(page, 300);
    pass('改密 overlay 打开', await run(page, () => {
      const el = document.getElementById('change-password-overlay');
      return el && el.style.display !== 'none';
    }));

    await installAuthMock(page, { signIn: { error: { message: 'Invalid' } } });
    await run(page, () => { _cloudUserEmail = 'a@b.com'; document.getElementById('cp-old').value='wrong'; document.getElementById('cp-new').value='newpwd1'; document.getElementById('cp-new2').value='newpwd1'; return doChangePassword(); });
    await wait(page, 500);
    pass('改密：老密错显示对应错误', await run(page, () => /不正确|incorrect|incorrecta|違い/.test(document.getElementById('cp-msg').textContent)));

    await run(page, () => { document.getElementById('cp-old').value='old'; document.getElementById('cp-new').value='12345'; document.getElementById('cp-new2').value='12345'; return doChangePassword(); });
    await wait(page, 300);
    pass('改密：新密码 < 6 位报错', await run(page, () => /6/.test(document.getElementById('cp-msg').textContent)));

    await installAuthMock(page, { signIn: { data: { user: { email: 'a@b.com' }, session: {} }, error: null }, update: { error: null } });
    await run(page, () => { _cloudUserEmail = 'a@b.com'; openChangePasswordSheet(); document.getElementById('cp-old').value='old'; document.getElementById('cp-new').value='newpwd1'; document.getElementById('cp-new2').value='newpwd1'; return doChangePassword(); });
    await wait(page, 500);
    pass('改密：成功关闭 sheet', await run(page, () => {
      const el = document.getElementById('change-password-overlay');
      return !el || el.style.display === 'none';
    }));

    section('PHASE 5: Hash 路由');
    await installAuthMock(page, { session: { data: { session: { user: { email: 'a@b.com' } } } } });
    await run(page, () => { location.hash = '#/email-confirmed'; handleAuthHashRoute(); });
    await wait(page, 400);
    pass('hash #/email-confirmed 触发后 hash 已清', await run(page, () => !location.hash.includes('email-confirmed')));

    await run(page, () => { location.hash = '#/reset-password'; handleAuthHashRoute(); });
    await wait(page, 400);
    pass('hash #/reset-password 进入 reset 屏', await run(page, () =>
      document.getElementById('screen-reset-password').classList.contains('active')));

    await installAuthMock(page, { session: { data: { session: null } } });
    await run(page, () => { document.getElementById('rp-new').value='newpwd1'; document.getElementById('rp-new2').value='newpwd1'; return doApplyResetPassword(); });
    await wait(page, 500);
    pass('reset 屏：无 recovery session 显示链接过期', await run(page, () => /过期|expired|caducado|期限/.test(document.getElementById('rp-msg').textContent)));

  } catch(e) {
    console.error('  [ERROR]', e.message); console.error(e.stack);
  } finally {
    const counts = getCounts();
    console.log('\n' + '═'.repeat(60));
    console.log('  结果');
    console.log('═'.repeat(60));
    console.log(`  通过: ${counts.passed}  失败: ${counts.failed}`);
    await stopAndCollectCoverage(page, '_pw_user_mgmt');
    await browser.close();
    process.exit(counts.failed > 0 ? 1 : 0);
  }
})();
