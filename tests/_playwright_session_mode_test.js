// 练习模式（session_mode）UI + 持久化测试
const { chromium } = require('playwright');

const BASE = 'http://localhost:8080/yihai_v4.11.html';
let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { console.log('  ✓', msg); passed++; }
  else       { console.error('  ✗', msg); failed++; }
}

async function getCheckText(page, mode) {
  return page.evaluate(m => {
    const el = document.getElementById('mode-check-' + m);
    return el ? el.textContent : null;
  }, mode);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 清空并重载，等 home 就绪
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home-gear-btn', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(600);

  console.log('\n── PHASE 1: 设置面板默认状态 ──');

  // 直接调 JS 打开设置（避免 Playwright click 位置问题）
  await page.evaluate(() => openSettingsWithSrs());
  await page.waitForTimeout(400);

  // 确认练习模式 section 渲染
  const sectionVisible = await page.locator('text=练习模式').first().isVisible();
  assert(sectionVisible, '练习模式 section 可见');

  // 默认普通模式应有勾
  const normalDefault = await getCheckText(page, 'normal');
  assert(normalDefault === '✓', `默认选中普通 (got: "${normalDefault}")`);

  const hardDefault = await getCheckText(page, 'hard');
  assert(hardDefault === '', `困难默认无勾 (got: "${hardDefault}")`);

  const survivalDefault = await getCheckText(page, 'survival');
  assert(survivalDefault === '', `生存默认无勾 (got: "${survivalDefault}")`);

  console.log('\n── PHASE 2: 切换到困难模式 ──');

  // 直接调 setSrsMode（绕过 click 可见性问题）
  await page.evaluate(() => setSrsMode('hard'));
  await page.waitForTimeout(200);

  const hardAfter = await getCheckText(page, 'hard');
  assert(hardAfter === '✓', `切换后困难有勾 (got: "${hardAfter}")`);

  const normalAfter = await getCheckText(page, 'normal');
  assert(normalAfter === '', `切换后普通无勾 (got: "${normalAfter}")`);

  const stored = await page.evaluate(() => localStorage.getItem('srs_session_mode'));
  assert(stored === 'hard', `localStorage 写入 'hard' (got: "${stored}")`);

  console.log('\n── PHASE 3: 刷新后持久化 ──');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home-gear-btn', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => openSettingsWithSrs());
  await page.waitForTimeout(400);

  const hardReload = await getCheckText(page, 'hard');
  assert(hardReload === '✓', `刷新后困难仍有勾 (got: "${hardReload}")`);

  const normalReload = await getCheckText(page, 'normal');
  assert(normalReload === '', `刷新后普通无勾 (got: "${normalReload}")`);

  console.log('\n── PHASE 4: 切换到生存，再切回普通 ──');

  await page.evaluate(() => setSrsMode('survival'));
  await page.waitForTimeout(200);

  const survivalAfter = await getCheckText(page, 'survival');
  assert(survivalAfter === '✓', `切换到生存有勾 (got: "${survivalAfter}")`);

  const storedSurvival = await page.evaluate(() => localStorage.getItem('srs_session_mode'));
  assert(storedSurvival === 'survival', `localStorage 写入 'survival' (got: "${storedSurvival}")`);

  await page.evaluate(() => setSrsMode('normal'));
  await page.waitForTimeout(200);

  const normalFinal = await getCheckText(page, 'normal');
  assert(normalFinal === '✓', `切回普通有勾 (got: "${normalFinal}")`);

  const storedFinal = await page.evaluate(() => localStorage.getItem('srs_session_mode'));
  assert(storedFinal === 'normal', `localStorage 写入 'normal' (got: "${storedFinal}")`);

  await browser.close();

  console.log(`\n════════════════════════════════════`);
  console.log(`  结果：${passed} 通过  ${failed} 失败`);
  console.log(`════════════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
})();
