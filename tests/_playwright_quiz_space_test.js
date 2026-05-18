/**
 * 练习界面空间利用率测试
 * 测量主流分辨率下 .quiz-card 图像区域占屏幕可用空间的比例
 *
 * 前置：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_playwright_quiz_space_test.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:8080/yihai_design_v2.html';
const SHOT_DIR = path.join(__dirname, 'layout_screenshots');
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

/* ─── 测试分辨率 ─── */
const VIEWPORTS = [
  { name: 'iPhone SE',        width: 375, height: 667,  isMobile: true  },
  { name: 'iPhone 14',        width: 390, height: 844,  isMobile: true  },
  { name: 'iPhone 14 Pro Max',width: 430, height: 932,  isMobile: true  },
  { name: 'Galaxy S23',       width: 360, height: 800,  isMobile: true  },
  { name: 'iPad Mini',        width: 768, height: 1024, isMobile: false },
  { name: 'Desktop 720p',     width: 1280,height: 720,  isMobile: false },
];

/* ─── 阈值 ─── */
const THRESH = {
  cardHeightPct: 20,   // 卡片高度 ≥ 可用区 20%  → PASS
  cardHeightGood: 30,  // ≥ 30% → GOOD
  cardHeightExc:  40,  // ≥ 40% → EXCELLENT
  cardWidthPct:   40,  // 卡片宽度 ≥ 视口宽度 40%
  noOverflow: true,    // 选项区不超出屏幕底部
};

/* ─── 工具 ─── */
let passed = 0, warned = 0, failed = 0;
const results = [];
const pad = (s, n) => String(s).padEnd(n);

function grade(pct, thresh) {
  if (pct >= THRESH.cardHeightExc)  return '🌟 EXCELLENT';
  if (pct >= THRESH.cardHeightGood) return '✅ GOOD';
  if (pct >= thresh)                return '✓  PASS';
  return '❌ FAIL';
}

async function measureQuizSpace(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(BASE_URL + '?v=' + Date.now(), { waitUntil: 'networkidle' });

  /* 导航到练习屏 */
  await page.click('.d-btn:nth-child(3)');           // "练习" 按钮
  await page.waitForSelector('#screen-quiz.active'); // 等屏幕激活

  /* 测量关键元素 */
  const metrics = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const card     = document.getElementById('quiz-card');
    const header   = document.querySelector('.quiz-header');
    const demoNav  = document.getElementById('demo-nav');
    const quizBody = document.querySelector('.quiz-body');

    const rect  = r => r ? r.getBoundingClientRect() : null;
    const cRect = rect(card);
    const hRect = rect(header);
    const nRect = rect(demoNav);
    const bRect = rect(quizBody);

    const headerH  = hRect ? hRect.height : 0;
    const demoNavH = nRect ? nRect.height : 0;
    const availH   = vh - headerH - demoNavH;

    const cardH   = cRect ? cRect.height : 0;
    const cardW   = cRect ? cRect.width  : 0;
    const bodyW   = bRect ? bRect.width  : vw; /* quiz-body 实际宽度（受 max-width 约束） */

    /* 最后一个选项底部是否超出视口 */
    const opts = document.querySelectorAll('.opt');
    const lastOpt = opts[opts.length - 1];
    const lastOptBottom = lastOpt ? lastOpt.getBoundingClientRect().bottom : 0;
    const overflow = lastOptBottom > vh;

    return {
      vw, vh,
      headerH, demoNavH, availH,
      cardH, cardW, bodyW,
      cardHeightPct:    availH > 0 ? (cardH / availH * 100) : 0,
      cardViewportWPct: vw     > 0 ? (cardW / vw     * 100) : 0, /* 占整个视口宽 */
      cardBodyWPct:     bodyW  > 0 ? (cardW / bodyW  * 100) : 0, /* 占 body 容器宽（更有意义） */
      cardAspect: cardW > 0 ? (cardH / cardW) : 0,
      lastOptBottom, overflow,
    };
  });

  /* 截图 */
  const shotName = viewport.name.replace(/\s+/g, '_') + '_quiz.png';
  await page.screenshot({
    path: path.join(SHOT_DIR, shotName),
    fullPage: false,
  });

  return metrics;
}

async function run() {
  console.log('\n' + '═'.repeat(72));
  console.log('  练习界面图像空间利用率测试');
  console.log('  URL:', BASE_URL);
  console.log('═'.repeat(72));

  const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 80 : 0 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  for (const vp of VIEWPORTS) {
    let m;
    try {
      m = await measureQuizSpace(page, vp);
    } catch (e) {
      console.log(`\n  ⚠ ${vp.name}: 测量失败 — ${e.message}`);
      failed++;
      results.push({ vp, error: e.message });
      continue;
    }

    const hGrade  = grade(m.cardHeightPct, THRESH.cardHeightPct);
    /* 宽屏（≥600px）用 body 容器宽比；手机用 viewport 宽比 */
    const wPct  = vp.width >= 600 ? m.cardBodyWPct : m.cardViewportWPct;
    const wThresh = vp.width >= 600 ? 30 : THRESH.cardWidthPct;
    const wPass   = wPct >= wThresh;
    const ovPass  = !m.overflow;
    const rowPass = m.cardHeightPct >= THRESH.cardHeightPct && wPass && ovPass;

    if (rowPass) passed++; else failed++;
    if (!ovPass) warned++;

    results.push({ vp, m, hGrade, wPass, ovPass });

    console.log(`\n  ┌─ ${vp.name} (${vp.width}×${vp.height})`);
    console.log(`  │  视口           ${m.vw} × ${m.vh} px`);
    console.log(`  │  顶部 header    ${m.headerH.toFixed(0)} px`);
    console.log(`  │  底部 demo-nav  ${m.demoNavH.toFixed(0)} px`);
    console.log(`  │  可用高度       ${m.availH.toFixed(0)} px`);
    console.log(`  │  卡片尺寸       ${m.cardW.toFixed(0)} × ${m.cardH.toFixed(0)} px  (长宽比 ${m.cardAspect.toFixed(2)})`);
    console.log(`  │  卡片高度占比   ${m.cardHeightPct.toFixed(1)}%  ${hGrade}`);
    console.log(`  │  卡片/视口宽    ${m.cardViewportWPct.toFixed(1)}%`);
    console.log(`  │  卡片/容器宽    ${m.cardBodyWPct.toFixed(1)}%  ${wPass ? '✓' : '❌ < ' + wThresh + '%'}  (body ${m.bodyW.toFixed(0)}px)`);
    console.log(`  │  选项区溢出     ${m.overflow ? '❌ 超出底部 ' + (m.lastOptBottom - m.vh).toFixed(0) + 'px' : '✓ 无溢出'}`);
    console.log(`  └─ 截图 → ${path.basename(SHOT_DIR)}/${vp.name.replace(/\s+/g,'_')}_quiz.png`);
  }

  await browser.close();

  /* ─── 汇总 ─── */
  console.log('\n' + '═'.repeat(72));
  console.log('  汇总');
  console.log('─'.repeat(72));
  console.log(`  ${pad('分辨率', 20)} ${pad('卡片高%', 9)} ${pad('/容器宽%', 10)} ${pad('/视口宽%', 10)} 溢出  总评`);
  console.log('─'.repeat(80));
  for (const r of results) {
    if (r.error) {
      console.log(`  ${pad(r.vp.name, 20)} ERROR: ${r.error}`);
      continue;
    }
    const { m, hGrade, wPass, ovPass } = r;
    const wPct = r.vp.width >= 600 ? m.cardBodyWPct : m.cardViewportWPct;
    console.log(
      `  ${pad(r.vp.name, 20)}` +
      ` ${pad(m.cardHeightPct.toFixed(1)+'%', 9)}` +
      ` ${pad(m.cardBodyWPct.toFixed(1)+'%', 10)}` +
      ` ${pad(m.cardViewportWPct.toFixed(1)+'%', 10)}` +
      ` ${ovPass ? '✓    ' : '❌   '}` +
      ` ${hGrade}`
    );
  }
  console.log('─'.repeat(72));
  console.log(`  通过 ${passed} / ${VIEWPORTS.length}   警告 ${warned}   失败 ${failed}`);
  console.log(`  截图目录: ${SHOT_DIR}`);
  console.log('═'.repeat(72) + '\n');

  /* ─── 改进建议 ─── */
  const failedVps   = results.filter(r => !r.error && r.m.cardHeightPct < THRESH.cardHeightPct);
  const overflowVps = results.filter(r => !r.error && r.m.overflow);
  const lowWidthVps = results.filter(r => !r.error && !r.wPass);

  if (failedVps.length || overflowVps.length || lowWidthVps.length) {
    console.log('  ── 改进建议 ──');
    failedVps.forEach(r =>
      console.log(`  ⬆  ${r.vp.name}: 卡片高度 ${r.m.cardHeightPct.toFixed(1)}% 偏小，建议增大 clamp() 最小值`)
    );
    overflowVps.forEach(r =>
      console.log(`  📏 ${r.vp.name}: 选项区底部超出视口 ${(r.m.lastOptBottom - r.m.vh).toFixed(0)}px，需压缩 opt padding 或增大 clamp 下限`)
    );
    lowWidthVps.forEach(r =>
      console.log(`  ↔  ${r.vp.name}: 卡片宽度 ${r.m.cardWidthPct.toFixed(1)}% 偏窄，检查 max-width 或 align-self`)
    );
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
