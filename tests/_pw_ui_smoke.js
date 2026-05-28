/**
 * 忆海拾光 UI 冒烟测试 — v5.1+
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_ui_smoke.js
 *
 * 覆盖：导航骨架、账户屏三态 DOM、设置入口、i18n 切换、核心函数存在性、语言选择器
 * 无需登录，无需 Supabase
 * 40 断言
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    // ════ PHASE 1: 页面加载 ════
    section('PHASE 1: 页面加载');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1000);
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 300);
    pass('.home-version 存在', await run(page, () => !!document.querySelector('.home-version')));

    // ════ PHASE 2: Tab Bar 骨架 ════
    section('PHASE 2: Tab Bar 骨架');
    pass('.home-tabbar 存在', await run(page, () => document.querySelectorAll('.home-tabbar').length >= 1));
    pass('.tab-fab 存在', await run(page, () => document.querySelectorAll('.tab-fab').length >= 1));
    pass('首页 Tab 初始激活', await run(page, () =>
      Array.from(document.querySelectorAll('#screen-home .tab-item')).some(t => t.classList.contains('active'))
    ));
    pass('FAB 显示「开始练习」', (await run(page, () =>
      document.querySelector('#screen-home .tab-item.action span')?.textContent?.trim() || ''
    )).includes('开始练习'));

    // ════ PHASE 3: 导航切换 ════
    section('PHASE 3: 导航切换');
    await run(page, () => showScreen('screen-mine'));
    await wait(page, 400);
    pass('screen-mine active', await run(page, () => document.getElementById('screen-mine')?.classList.contains('active')));
    pass('screen-home inactive', await run(page, () => !document.getElementById('screen-home')?.classList.contains('active')));
    pass('#mine-profile-card 存在', await run(page, () => !!document.getElementById('mine-profile-card')));
    pass('我的屏菜单项 ≥ 3', await run(page, () =>
      document.querySelectorAll('#screen-mine .mine-menu-item').length >= 3
    ));

    // ════ PHASE 4: 账户屏 ════
    section('PHASE 4: 账户屏');
    await run(page, () => showAccount());
    await wait(page, 400);
    pass('screen-account active', await run(page, () => document.getElementById('screen-account')?.classList.contains('active')));
    pass('#account-state-logged-out 存在', await run(page, () => !!document.getElementById('account-state-logged-out')));
    pass('#account-state-restoring 存在', await run(page, () => !!document.getElementById('account-state-restoring')));
    pass('#account-state-logged-in 存在', await run(page, () => !!document.getElementById('account-state-logged-in')));
    pass('默认显示未登录态', await run(page, () => {
      const el = document.getElementById('account-state-logged-out');
      return el && getComputedStyle(el).display !== 'none';
    }));
    pass('#account-email 存在', await run(page, () => !!document.getElementById('account-email')));
    pass('#account-password 存在', await run(page, () => !!document.getElementById('account-password')));
    pass('#account-login-btn 存在', await run(page, () => !!document.getElementById('account-login-btn')));

    // ════ PHASE 5: 返回与设置 ════
    section('PHASE 5: 返回与设置');
    await run(page, () => goHome());
    await wait(page, 400);
    pass('goHome() → screen-home active', await run(page, () =>
      document.getElementById('screen-home')?.classList.contains('active')
    ));
    await run(page, () => openSettingsWithSrs());
    await wait(page, 400);
    pass('settings-overlay 打开', await run(page, () =>
      document.getElementById('settings-overlay')?.classList.contains('open')
    ));
    await run(page, () => document.getElementById('settings-overlay').classList.remove('open'));
    await wait(page, 200);
    pass('settings-overlay 关闭', await run(page, () =>
      !document.getElementById('settings-overlay')?.classList.contains('open')
    ));

    // ════ PHASE 6: i18n 切换 ════
    section('PHASE 6: i18n 切换');
    await run(page, () => setLocale('en'));
    await wait(page, 300);
    const fabEn = await run(page, () =>
      document.querySelector('#screen-home .tab-item.action span')?.textContent?.trim() || ''
    );
    pass('setLocale(en) → FAB 变英文', fabEn.length > 0 && fabEn !== '开始练习');
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 300);
    pass('setLocale(zh-CN) → FAB 恢复「开始练习」', (await run(page, () =>
      document.querySelector('#screen-home .tab-item.action span')?.textContent?.trim() || ''
    )) === '开始练习');

    // ════ PHASE 7: 核心函数存在性 ════
    section('PHASE 7: 核心函数存在性');
    pass('processAnswer 函数存在', await run(page, () => typeof processAnswer === 'function'));
    pass('buildSessionQueue 函数存在', await run(page, () => typeof buildSessionQueue === 'function'));
    pass('runSync 函数存在', await run(page, () => typeof runSync === 'function'));
    pass('旧元素 .browse-btn 已删除', await run(page, () =>
      document.querySelectorAll('.browse-btn').length === 0
    ));

    // ════ PHASE 8: 语言选择器 ════
    section('PHASE 8: 语言选择器');

    // 函数与元素存在性
    pass('screen-lang 元素存在', await run(page, () => !!document.getElementById('screen-lang')));
    pass('openLangPicker 函数存在', await run(page, () => typeof openLangPicker === 'function'));
    pass('selectLang 函数存在', await run(page, () => typeof selectLang === 'function'));
    pass('confirmLang 函数存在', await run(page, () => typeof confirmLang === 'function'));
    pass('cancelLang 函数存在', await run(page, () => typeof cancelLang === 'function'));

    // 打开语言页
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 200);
    await run(page, () => showScreen('screen-mine'));
    await wait(page, 300);
    await run(page, () => openLangPicker());
    await wait(page, 400);
    pass('openLangPicker → screen-lang active', await run(page, () =>
      document.getElementById('screen-lang')?.classList.contains('active')
    ));
    pass('当前语言行有 selected 样式', await run(page, () =>
      document.querySelector('.lang-row.selected') !== null
    ));
    pass('zh-CN 行初始选中', await run(page, () =>
      document.querySelector('.lang-row.selected')?.dataset.lang === 'zh-CN'
    ));

    // 选择 English，确定
    await run(page, () => selectLang('en'));
    await wait(page, 200);
    pass('selectLang(en) → en 行高亮', await run(page, () =>
      document.querySelector('.lang-row.selected')?.dataset.lang === 'en'
    ));
    await run(page, () => confirmLang());
    await wait(page, 400);
    pass('confirmLang → screen-mine active', await run(page, () =>
      document.getElementById('screen-mine')?.classList.contains('active')
    ));
    pass('confirmLang → setLocale(en) 生效', await run(page, () => getLocale() === 'en'));

    // 取消不保存
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 200);
    await run(page, () => openLangPicker());
    await wait(page, 300);
    await run(page, () => selectLang('es'));
    await wait(page, 100);
    await run(page, () => cancelLang());
    await wait(page, 300);
    pass('cancelLang → screen-mine active', await run(page, () =>
      document.getElementById('screen-mine')?.classList.contains('active')
    ));
    pass('cancelLang → locale 未变（仍 zh-CN）', await run(page, () => getLocale() === 'zh-CN'));

    // 设置行显示当前语言
    await run(page, () => openSettingsWithSrs());
    await wait(page, 300);
    pass('settings-lang-val 显示「中文」', await run(page, () => {
      const el = document.getElementById('settings-lang-val');
      return el && el.textContent.trim() === '中文';
    }));
    pass('settings 中有「界面语言」入口行', await run(page, () =>
      !!document.getElementById('settings-lang-val')
    ));
    await run(page, () => document.getElementById('settings-overlay').classList.remove('open'));
    await wait(page, 200);

  } finally {
    const { passed, failed } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
