/**
 * P1 设置面板参数 onChange 覆盖率测试
 * 覆盖：通用 tab 滑块/开关/模式、语音 tab 滑块/下拉、SRS tab 预设/步长输入/滑块、
 *       主题切换、app 模式切换。目标 ~25 个此前 0% 覆盖的 onChange 函数。
 * 无需登录。
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, section, wait, run, getCounts, getBaseUrl, openSettingsTab, closeSettings, navigateTo } = helper;

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await helper.startCoverage(page);
  let jsErrors = 0;
  page.on('pageerror', e => { jsErrors++; console.log('  [PAGE ERROR]', e.message); });

  try {
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 300);

    // ════ PHASE 1: 通用 Tab 滑块 + confetti + 练习模式 ════
    section('PHASE 1: General tab — sliders / confetti / mode');
    await openSettingsTab(page);

    const optCountVal = await run(page, () => {
      const s = document.getElementById('opt-count'); if (!s) return 'missing';
      s.value = 4; s.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('opt-count-val').textContent;
    });
    pass('opt-count 4', optCountVal === '4');

    const touchDelayVal = await run(page, () => {
      const s = document.getElementById('opt-touch-delay'); if (!s) return 'missing';
      s.value = 200; s.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('opt-touch-delay-val').textContent;
    });
    pass('opt-touch-delay 200', touchDelayVal && touchDelayVal.includes('200'));

    const ndurVal = await run(page, () => {
      const s = document.getElementById('dbg-ndur'); if (!s) return 'missing';
      s.value = 3; s.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('dbg-ndur-val').textContent;
    });
    pass('ndur 3', ndurVal === '3s');

    const bdurVal = await run(page, () => {
      const s = document.getElementById('dbg-bdur'); if (!s) return 'missing';
      s.value = 8; s.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('dbg-bdur-val').textContent;
    });
    pass('bdur 8', bdurVal === '8s');

    const browseAnsVal = await run(page, () => {
      const s = document.getElementById('dbg-browse-ans-delay'); if (!s) return 'missing';
      s.value = 5; s.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('dbg-browse-ans-delay-val').textContent;
    });
    pass('browse-ans-delay 5', browseAnsVal && browseAnsVal.includes('5'));

    const confettiOff = await run(page, () => {
      const cb = document.getElementById('confetti-toggle'); if (!cb) return 'missing';
      cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
      return cb.checked;
    });
    pass('confetti toggle off', confettiOff === false);

    const modeVal = await run(page, () => {
      const row = document.querySelector('[onclick="setSrsMode(\'easy\')"]');
      if (row) row.click();
      return SRS_CONFIG.session_mode;
    });
    pass('setSrsMode easy', modeVal === 'easy');

    const easyRowsVisible = await run(page, () => {
      const r1 = document.getElementById('easySizeRow');
      const r2 = document.getElementById('easyRetryRow');
      return (r1 ? r1.style.display : 'none') !== 'none' && (r2 ? r2.style.display : 'none') !== 'none';
    });
    pass('easy rows visible', easyRowsVisible);

    // ════ PHASE 2: 语音 Tab ════
    section('PHASE 2: Voice tab');
    await run(page, () => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (/语音|Voice/.test(t.textContent)) { t.click(); return; } }
    });
    await wait(page, 300);

    const mutedOn = await run(page, () => {
      const cb = document.getElementById('voice-muted-toggle'); if (!cb) return 'missing';
      cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
      return getVoiceField('voiceMuted');
    });
    pass('voice-muted on', mutedOn === '1');

    const ttsRateVal = await run(page, () => {
      const s = document.getElementById('tts-rate'); if (!s) return 'missing';
      s.value = 1.5; s.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('tts-rate-val').textContent;
    });
    pass('tts-rate 1.5', ttsRateVal === '1.50');

    const ttsPitchVal = await run(page, () => {
      const s = document.getElementById('tts-pitch'); if (!s) return 'missing';
      s.value = 1.8; s.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('tts-pitch-val').textContent;
    });
    pass('tts-pitch 1.8', ttsPitchVal === '1.8');

    const voiceVal = await run(page, () => {
      const sel = document.getElementById('tts-voice'); if (!sel) return 'missing';
      if (sel.options.length >= 2) { sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      return getVoiceField('ttsVoiceName');
    });
    pass('tts-voice written', voiceVal && voiceVal !== '');

    const ansDelayVal = await run(page, () => {
      const s = document.getElementById('ans-read-delay'); if (!s) return 'missing';
      s.value = 3; s.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('ans-read-delay-val').textContent;
    });
    pass('ans-read-delay 3', ansDelayVal === '3.0s');

    // ════ PHASE 3: SRS Tab ════
    section('PHASE 3: SRS tab');
    await run(page, () => {
      const tabs = document.querySelectorAll('.sheet-tab');
      switchTab(2);
    });
    await wait(page, 300);

    const presetApplied = await run(page, () => {
      const btns = document.querySelectorAll('.srs-preset-btn');
      for (const b of btns) { if (/default|Anki|默认/.test(b.textContent)) { b.click(); break; } }
      return SRS_CONFIG.learning_steps.join(',') === '1,10';
    });
    pass('applySrsPreset default', presetApplied);

    const stepsInputVal = await run(page, () => {
      const inp = document.getElementById('srs-learning-steps'); if (!inp) return 'missing';
      inp.value = '2, 15'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      return SRS_CONFIG.learning_steps.join(',');
    });
    pass('onSrsStepsInput 2,15', stepsInputVal === '2,15');

    const learnAheadVal = await run(page, () => {
      const inp = document.getElementById('srs-learn-ahead'); if (!inp) return 'missing';
      inp.value = '0.5'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      return SRS_CONFIG.learn_ahead_limit;
    });
    pass('learnAhead 0.5m=30s', learnAheadVal === 30);

    const gradIntervalVal = await run(page, () => {
      const s = document.getElementById('srs-graduating-interval'); if (!s) return 'missing';
      s.value = 3; s.dispatchEvent(new Event('input', { bubbles: true }));
      return SRS_CONFIG.graduating_interval;
    });
    pass('graduating_interval 3', gradIntervalVal === 3);

    const maxReviewVal = await run(page, () => {
      const s = document.getElementById('srs-max-reviews'); if (!s) return 'missing';
      s.value = 30; s.dispatchEvent(new Event('input', { bubbles: true }));
      return SRS_CONFIG.maximum_reviews_per_day;
    });
    pass('maximum_reviews_per_day 30', maxReviewVal === 30);

    closeSettings(page);

    // ════ PHASE 4: 主题切换 ════
    section('PHASE 4: Theme switching');
    const themes = ['jade', 'amber', 'cinnabar', 'dark', 'default'];
    let themeOk = 0;
    for (const theme of themes) {
      const applied = await run(page, (t) => {
        setThemeValue(t);
        const attr = document.documentElement.getAttribute('data-theme');
        const expected = t === 'default' ? '' : t;
        return (attr || 'default') === (expected || 'default');
      }, theme);
      if (applied) themeOk++;
    }
    pass('5 themes (' + themeOk + '/5)', themeOk === 5);

    // ════ PHASE 5: app mode 切换 ════
    section('PHASE 5: App mode toggle');
    await navigateTo(page, 'screen-mine');

    const advMode = await run(page, () => {
      const cb = document.getElementById('app-mode-toggle'); if (!cb) return 'missing';
      cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
      return document.documentElement.getAttribute('data-mode');
    });
    pass('app-mode on', advMode === 'advanced');

    const stdMode = await run(page, () => {
      const cb = document.getElementById('app-mode-toggle'); if (!cb) return 'missing';
      cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
      return document.documentElement.getAttribute('data-mode');
    });
    pass('app-mode off', stdMode !== 'advanced');

    pass('no JS errors', jsErrors === 0);

  } finally {
    const { passed, failed } = getCounts();
    section('result');
    console.log('  passed: ' + passed + '  failed: ' + failed + '  jsErrors: ' + jsErrors);
    await helper.stopAndCollectFromBrowser(browser, '_pw_settings');
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
