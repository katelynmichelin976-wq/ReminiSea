/**
 * 忆海拾光 UI 冒烟测试 — v5.1+
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_ui_smoke.js
 *
 * 覆盖：导航骨架、账户屏三态 DOM、设置入口、i18n 切换、核心函数存在性、语言选择器
 * 无需登录，无需 Supabase
 * 68 断言
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl, startCoverage, stopAndCollectCoverage } = require('./_playwright_helper');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await startCoverage(page);

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
    pass('renderCloudDecksTab 函数存在', await run(page, () => typeof renderCloudDecksTab === 'function'));
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
    // 界面语言已从设置移至「我的」顶层菜单（v5.4.20）
    pass('mine 菜单有「语言」入口', await run(page, () =>
      !!document.querySelector('#screen-mine .mine-menu-item[onclick="openLangPicker()"]')
    ));
    pass('locale 已设为 zh-CN', await run(page, () => getLocale() === 'zh-CN'));

    // ════ PHASE 9: 语音设置 Tab 新结构 ════
    section('PHASE 9: 语音设置 Tab 新结构');
    await run(page, () => openSettingsWithSrs());
    await wait(page, 300);
    // Click the voice tab (tab index 1)
    const voiceTabs = await page.$$('.sheet-tab');
    if (voiceTabs[1]) await voiceTabs[1].click();
    await wait(page, 200);
    // 全局静音开关应存在
    const muteToggle = await page.$('#voice-muted-toggle');
    pass('全局静音开关应存在 (#voice-muted-toggle)', !!muteToggle);
    // 答案朗读延迟行应存在
    const ansDelay = await page.$('#ans-read-delay-row');
    pass('答案朗读延迟行应存在 (#ans-read-delay-row)', !!ansDelay);
    // 语音辅助入口应存在
    const vaEntry = await page.$('#voice-assist-entry');
    pass('语音辅助入口行应存在 (#voice-assist-entry)', !!vaEntry);
    // 旧 toggle 行不应存在
    const oldToggle = await page.$('#quiz-prompt-toggle');
    pass('旧答题提示 toggle 行不应存在', oldToggle === null);
    await run(page, () => document.getElementById('settings-overlay').classList.remove('open'));
    await wait(page, 200);

    // ── Task 6: 录制覆层存在性检查 ──
    const recOverlay = await page.$('#recording-overlay');
    pass('录制覆层元素应存在 (#recording-overlay)', !!recOverlay);
    const recOverlayVisible = await page.evaluate(() => {
      const el = document.getElementById('recording-overlay');
      return el && !el.classList.contains('hidden');
    });
    pass('录制覆层初始应为隐藏', recOverlayVisible === false);

    // ── Task 7: 语音辅助页 ──
    // Note: openVoiceAssist() is still a stub, so navigate directly via showScreen
    await page.evaluate(() => { if (typeof showScreen === 'function') showScreen('screen-voice-assist'); });
    await page.waitForTimeout(300);
    pass('语音辅助页元素应存在 (#screen-voice-assist)', !!(await page.$('#screen-voice-assist')));
    pass('语音辅助页标题元素应存在', !!(await page.$('[data-i18n="voice_assist_page_title"]')));
    pass('情绪触发分组标题应存在（固定节点已并入）', !!(await page.$('[data-i18n="voice_group_emotion"]')));
    pass('功能提示分组标题应存在', !!(await page.$('[data-i18n="voice_group_functional"]')));
    pass('启用开关应存在 (#va-enable-toggle)', !!(await page.$('#va-enable-toggle')));
    // Navigate back
    await page.evaluate(() => { if (typeof showScreen === 'function') showScreen('screen-home'); });

    // ── openSrsDb() 返回 Promise 回归（修复 return _srsDbPromise 缺失）──
    section('PHASE 10: openSrsDb() 首次调用返回 Promise');
    const openSrsDbIsPromise = await run(page, async () => {
      _srsDb = null;
      _srsDbPromise = null;
      const result = openSrsDb();
      const ok = result instanceof Promise;
      // 等待 DB 实际打开，避免悬空 pending promise 干扰后续测试
      try { await result; } catch (_e) { /* ignore */ }
      return ok;
    });
    pass('openSrsDb() 首次调用返回 Promise（非 undefined）', openSrsDbIsPromise);

    // ════ PHASE 11: zh-Hant 繁體中文支援 ════
    section('PHASE 11: zh-Hant 繁體中文支援');
    pass('[data-lang="zh-Hant"] 存在', await run(page, () =>
      !!document.querySelector('[data-lang="zh-Hant"]')
    ));
    pass('screen-lang 無 .lang-flag 元素', await run(page, () =>
      document.querySelectorAll('#screen-lang .lang-flag').length === 0
    ));
    await run(page, () => setLocale('zh-Hant'));
    await wait(page, 300);
    pass('setLocale(zh-Hant) → getLocale() 返回 zh-Hant', await run(page, () => getLocale() === 'zh-Hant'));
    pass('zh-Hant → 首頁 Tab 顯示含「頁」的文字', (await run(page, () =>
      document.querySelector('#screen-home .tab-item:not(.action) span')?.textContent?.trim() || ''
    )).includes('頁'));
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 200);

    // ════ PHASE 12: 日本語（ja）サポート ════
    section('PHASE 12: 日本語（ja）サポート');
    pass('[data-lang="ja"] 存在', await run(page, () =>
      !!document.querySelector('[data-lang="ja"]')
    ));
    await run(page, () => setLocale('ja'));
    await wait(page, 300);
    pass('setLocale(ja) → getLocale() 返回 ja', await run(page, () => getLocale() === 'ja'));
    pass('ja → ホーム Tab が日本語テキストを表示', (await run(page, () =>
      document.querySelector('#screen-home .tab-item:not(.action) span')?.textContent?.trim() || ''
    )).includes('ホーム'));
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 200);

    // ════ PHASE 13: 练习模式 UI（普通 + 轻松，无困难/生存）════
    section('PHASE 13: 练习模式 UI');
    await run(page, () => openSettingsWithSrs());
    await wait(page, 300);
    pass('mode-check-normal 存在', !!(await page.$('#mode-check-normal')));
    pass('mode-check-easy 存在',   !!(await page.$('#mode-check-easy')));
    pass('mode-check-hard 已删除',     (await page.$('#mode-check-hard'))     === null);
    pass('mode-check-survival 已删除', (await page.$('#mode-check-survival')) === null);
    await run(page, () => document.getElementById('settings-overlay').classList.remove('open'));
    await wait(page, 200);

    // ════ PHASE 14: Auth UI 用户管理入口 ════
    section('PHASE 14: Auth UI 用户管理入口');
    await run(page, () => showAccount());
    await wait(page, 300);
    pass('账户屏「注册新账号」链接存在', await run(page, () =>
      !!Array.from(document.querySelectorAll('.account-link')).find(a => a.dataset.i18n === 'account_link_register')
    ));
    pass('账户屏「忘记密码?」链接存在', await run(page, () =>
      !!Array.from(document.querySelectorAll('.account-link')).find(a => a.dataset.i18n === 'account_link_forgot')
    ));
    pass('注册 overlay DOM 已注入', await run(page, () => !!document.getElementById('register-overlay')));

  } finally {
    const { passed, failed } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    await stopAndCollectCoverage(page, '_pw_ui_smoke');
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
