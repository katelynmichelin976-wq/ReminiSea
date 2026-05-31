/**
 * 忆海拾光 — 意见反馈模块测试
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_feedback.js
 *
 * 覆盖：函数存在性、入口菜单项、sheet 开/关、空提交校验
 * 无需登录，无需 Supabase
 * 10 断言
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    section('PHASE 1: 页面加载');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1000);
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 300);

    section('PHASE 2: 函数存在性');
    pass('collectDiagnostics 函数存在',  await run(page, () => typeof collectDiagnostics  === 'function'));
    pass('formatFeedbackText 函数存在',  await run(page, () => typeof formatFeedbackText  === 'function'));
    pass('submitFeedback 函数存在',      await run(page, () => typeof submitFeedback      === 'function'));
    pass('openFeedbackSheet 函数存在',   await run(page, () => typeof openFeedbackSheet   === 'function'));
    pass('closeFeedbackSheet 函数存在',  await run(page, () => typeof closeFeedbackSheet  === 'function'));

    section('PHASE 3: 入口菜单项');
    await run(page, () => showScreen('screen-mine'));
    await wait(page, 400);
    const feedbackItem = await run(page, () => {
      const items = Array.from(document.querySelectorAll('#screen-mine .mine-menu-item'));
      const found = items.find(el => el.textContent.includes('意见反馈'));
      return found ? found.textContent.trim() : null;
    });
    pass('#screen-mine 存在「意见反馈」菜单项', feedbackItem !== null);

    section('PHASE 4: Sheet 开关');
    await run(page, () => openFeedbackSheet());
    await wait(page, 300);
    pass('#feedback-overlay 打开后可见', await run(page, () => {
      const el = document.getElementById('feedback-overlay');
      return el && el.style.display !== 'none';
    }));
    pass('#feedback-textarea placeholder 正确', await run(page, () => {
      const ta = document.getElementById('feedback-textarea');
      return ta && ta.placeholder.includes('请填写问题描述');
    }));

    section('PHASE 5: 表单校验');
    await run(page, () => {
      const ta = document.getElementById('feedback-textarea');
      if (ta) ta.value = '';
    });
    await run(page, () => handleFeedbackSend());
    await wait(page, 200);
    pass('空提交后 textarea 显示红色边框', await run(page, () => {
      const ta = document.getElementById('feedback-textarea');
      return ta && ta.style.borderColor === 'rgb(239, 68, 68)';
    }));

    await run(page, () => {
      const ta = document.getElementById('feedback-textarea');
      if (ta) { ta.value = '测试'; ta.dispatchEvent(new Event('input')); }
    });
    await wait(page, 100);
    pass('输入后红框消失', await run(page, () => {
      const ta = document.getElementById('feedback-textarea');
      return ta && !ta.style.borderColor;
    }));

    await run(page, () => closeFeedbackSheet());
    await wait(page, 200);
    pass('closeFeedbackSheet() 后 overlay 隐藏', await run(page, () => {
      const el = document.getElementById('feedback-overlay');
      return el && el.style.display === 'none';
    }));

  } catch(e) {
    console.error('测试异常:', e);
    process.exit(1);
  } finally {
    const { total, passed, failed } = getCounts();
    console.log(`\n结果：${passed}/${total} 通过，${failed} 失败`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
