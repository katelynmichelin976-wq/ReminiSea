/**
 * 忆海拾光 布局适配测试
 * 覆盖 6 种常用终端分辨率，验证图片区与选项区无遮挡、触控目标达标
 * 运行：python -m http.server 8080 --directory C:\code
 *       node tests/_playwright_layout_test.js
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080/yihai_v4.11.html';

let passed = 0, failed = 0;
const ok   = (l) => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${l}`); };
const fail = (l) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${l}`); };
const pass = (label, cond) => cond ? ok(label) : fail(label);
const sect = (t) => console.log(`\n${'═'.repeat(62)}\n  ${t}\n${'═'.repeat(62)}`);

// ── 设备列表 ──────────────────────────────────────────────────────
const DEVICES = [
  { name: 'iPhone SE (375×667)',         w: 375,  h: 667  },
  { name: 'iPhone 14 (390×844)',         w: 390,  h: 844  },
  { name: 'iPhone 14 Pro Max (430×932)', w: 430,  h: 932  },
  { name: 'iPad Mini (768×1024)',        w: 768,  h: 1024 },
  { name: 'iPad Air (820×1180)',         w: 820,  h: 1180 },
  { name: 'iPad Pro 11" (834×1194)',     w: 834,  h: 1194 },
];

// ── 注入牌组并进入练习 ─────────────────────────────────────────────
async function injectDeckAndStartTraining(page) {
  // 写入正确的 localStorage 格式
  await page.evaluate(() => {
    const KEY = '__layout_test__';
    const cards = [
      { id:'c1', name:'苹果' }, { id:'c2', name:'香蕉' },
      { id:'c3', name:'橘子' }, { id:'c4', name:'西瓜' },
      { id:'c5', name:'草莓' }, { id:'c6', name:'葡萄' },
      { id:'c7', name:'梨'   }, { id:'c8', name:'桃子' },
    ];
    localStorage.setItem('yihai_decks_index',
      JSON.stringify([{ key: KEY, name: '蔬菜水果本地版', source: 'local' }]));
    localStorage.setItem('yihai_deck_' + KEY, JSON.stringify(cards));
  });

  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // 选中牌组
  await page.evaluate(() => {
    const card = document.querySelector('.deck-card');
    if (card) card.click();
  });
  await page.waitForTimeout(300);

  // 点击"开始练习"
  await page.evaluate(() => {
    const btn = document.querySelector('.start-btn');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1500);

  // 确认训练界面已激活
  return page.evaluate(() => {
    const s = document.getElementById('screen-quiz');
    return s && s.classList.contains('active');
  });
}

// ── 测量布局几何 ───────────────────────────────────────────────────
function measureLayout(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.target-card');
    const opts = document.getElementById('opts-zone');
    const opt1 = document.querySelector('.opt');
    const bar  = document.querySelector('.bar');
    if (!card || !opts) return { error: '关键元素未找到' };

    const cr = card.getBoundingClientRect();
    const or = opts.getBoundingClientRect();
    const o1 = opt1 ? opt1.getBoundingClientRect() : null;
    const br = bar  ? bar.getBoundingClientRect()  : { height: 0 };
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      card: { top: cr.top, bottom: cr.bottom, h: cr.height, w: cr.width },
      opts: { top: or.top, bottom: or.bottom, h: or.height },
      opt1: o1 ? { h: o1.height, w: o1.width } : null,
      bar:  { h: br.height },
    };
  });
}

// ── 单设备断言 ─────────────────────────────────────────────────────
async function checkDevice(browser, device) {
  sect(device.name);
  const page = await browser.newPage({ viewport: { width: device.w, height: device.h } });

  try {
    await page.goto(BASE_URL + '?v=' + Date.now(), { waitUntil: 'networkidle', timeout: 20000 });

    const active = await injectDeckAndStartTraining(page);
    pass(`训练界面已激活`, active);
    if (!active) return;

    const L = await measureLayout(page);
    if (L.error) { fail(L.error); return; }

    const { vw, vh, card, opts, opt1 } = L;

    // 1. 图片底边不超出选项顶边（核心）
    pass(`图片底边 ≤ 选项顶边（无遮挡）  card.bottom=${Math.round(card.bottom)} opts.top=${Math.round(opts.top)}`,
         card.bottom <= opts.top + 2);

    // 2. 选项区完整在 viewport 内
    pass(`选项区底边在 viewport 内  opts.bottom=${Math.round(opts.bottom)} vh=${vh}`,
         opts.bottom <= vh + 2);

    // 3. 图片区高度 ≥ viewport 高度 28%
    pass(`图片高度 ≥ vh×28%  card.h=${Math.round(card.h)} min=${Math.round(vh*0.28)}`,
         card.h >= vh * 0.28);

    // 4. 触控目标 ≥ 44px
    if (opt1) pass(`按钮高度 ≥ 44px  (${Math.round(opt1.h)}px)`, opt1.h >= 44);

    // 5. 按钮宽度 ≥ vw×65%
    if (opt1) pass(`按钮宽度 ≥ vw×65%  (${Math.round(opt1.w)}px ≥ ${Math.round(vw*0.65)}px)`,
                   opt1.w >= vw * 0.65);

    // 尺寸摘要
    const gap = opts.top - card.bottom;
    console.log(`     vp=${vw}×${vh}  card=${Math.round(card.w)}×${Math.round(card.h)}`
      + `  gap=${Math.round(gap)}px`
      + (opt1 ? `  btn=${Math.round(opt1.w)}×${Math.round(opt1.h)}` : ''));

    // 截图
    const dir = path.join(__dirname, 'layout_screenshots');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    await page.screenshot({ path: path.join(dir, device.name.replace(/[^\w]/g,'_') + '.png') });

  } catch (e) {
    fail(`异常: ${e.message}`);
  } finally {
    await page.close();
  }
}

// ── 主流程 ────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({ headless: false });

  for (const device of DEVICES) {
    await checkDevice(browser, device);
  }

  await browser.close();

  console.log(`\n${'═'.repeat(62)}`);
  console.log(`  结果：${passed} 通过  ${failed} 失败`);
  console.log(`${'═'.repeat(62)}\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
