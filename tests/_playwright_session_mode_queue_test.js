// session_mode 队列顺序验证：导入牌组 → 注入已知 ease_factor → 验证 easy-hard-easy 曲线
const { chromium } = require('playwright');
const path = require('path');

const BASE      = 'http://localhost:8080/yihai_v5.1.html';
const PACK_PATH = path.resolve(__dirname, 'test_data/蔬菜水果本地版.yhspack');
let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { console.log('  ✓', msg); passed++; }
  else       { console.error('  ✗', msg); failed++; }
}

function avgEf(arr) { return arr.reduce((a,b)=>a+b,0)/arr.length; }

async function checkCurve(queue, label) {
  if (queue.length < 4) {
    console.log(`    ${label}: 队列 ${queue.length} 张，太少跳过曲线验证`);
    return;
  }
  const n    = queue.length;
  const efs  = queue.map(c => c.ef);
  console.log(`    ${label} ef序列: ${efs.join(', ')}`);
  const headAvg = avgEf(efs.slice(0, 2));
  const midAvg  = avgEf(efs.slice(Math.floor(n/3), Math.ceil(2*n/3)));
  const tailAvg = avgEf(efs.slice(-2));
  console.log(`    首2均=${headAvg.toFixed(2)} 中段均=${midAvg.toFixed(2)} 尾2均=${tailAvg.toFixed(2)}`);
  assert(headAvg > midAvg, `${label} 首段比中段容易`);
  assert(tailAvg > midAvg, `${label} 尾段比中段容易`);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  // Force zh-CN locale for consistent i18n testing
  await page.evaluate(() => setLocale('zh-CN'));
  await page.waitForTimeout(500);


  console.log('\n── PHASE 1: 导入牌组 ──');

  // 直接调 importYhspack，绕过已删除的 input[accept=".yhspack"] UI 入口
  const { readFileSync } = require('fs');
  const yhpackBytes = Array.from(readFileSync(PACK_PATH));
  await page.evaluate(async (bytes) => {
    const arr = new Uint8Array(bytes);
    const file = new File([arr.buffer], '蔬菜水果本地版.yhspack', { type: 'application/zip' });
    await importYhspack(file);
  }, yhpackBytes);
  await page.waitForTimeout(3000);  // 等待导入（含图片处理）

  const deckKeys = await page.evaluate(() => Object.keys(DECKS || {}));
  assert(deckKeys.length > 0, `牌组导入成功 (${deckKeys.length} 个)`);
  const deckKey = deckKeys[0];
  console.log(`    使用牌组: ${deckKey}`);

  const cardCount = await page.evaluate(dk => (DECKS[dk] || []).length, deckKey);
  assert(cardCount >= 6, `卡片数量足够 (${cardCount} 张)`);

  console.log('\n── PHASE 2: 注入已知难度 CardState ──');

  // 注入 8 张卡，ef 交替高低：[2.5, 1.3, 2.4, 1.4, 2.3, 1.5, 2.2, 1.6]
  // 期望曲线：首尾 ef 高，中间 ef 低
  const today = new Date().toISOString().slice(0, 10);
  const injected = await page.evaluate(async ({ dk, td }) => {
    const cards   = DECKS[dk].slice(0, 8);
    const efList  = [2.5, 1.3, 2.4, 1.4, 2.3, 1.5, 2.2, 1.6];
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const s = {
        card_id: c.id, deck_key: dk, state_key: `${dk}:${c.id}`,
        srs_stage: 'review', interval: 3, ease_factor: efList[i],
        due_date: td, due_ts: 0, step_index: 0,
        review_mode: 'normal', lapses_streak: 0, lapses_total: 0,
        suspended: false, updated_at: Date.now(), app_version: '4.11',
      };
      await saveCardStateLocal(s);
    }
    return cards.length;
  }, { dk: deckKey, td: today });
  assert(injected === 8, `注入 8 张 CardState (got ${injected})`);

  console.log('\n── PHASE 3: 普通模式 (20张, hard≤35%) ──');

  await page.evaluate(() => setSrsMode('normal'));
  const normalQ = await page.evaluate(async dk => {
    const q = await buildSessionQueue(dk);
    return q.map(c => ({ ef: +(c._srsState?.ease_factor ?? 2.5).toFixed(2) }));
  }, deckKey);
  assert(normalQ.length > 0,  `普通模式队列非空 (${normalQ.length} 张)`);
  assert(normalQ.length <= 20, `普通模式≤20张 (${normalQ.length} 张)`);
  await checkCurve(normalQ, '普通');

  console.log('\n── PHASE 4: 困难模式 (≤30张) ──');

  await page.evaluate(() => setSrsMode('hard'));
  const hardQ = await page.evaluate(async dk => {
    const q = await buildSessionQueue(dk);
    return q.map(c => ({ ef: +(c._srsState?.ease_factor ?? 2.5).toFixed(2) }));
  }, deckKey);
  assert(hardQ.length > 0,  `困难模式队列非空 (${hardQ.length} 张)`);
  assert(hardQ.length <= 30, `困难模式≤30张 (${hardQ.length} 张)`);
  await checkCurve(hardQ, '困难');

  console.log('\n── PHASE 5: 生存模式 (全量) ──');

  await page.evaluate(() => setSrsMode('survival'));
  const survQ = await page.evaluate(async dk => {
    const q = await buildSessionQueue(dk);
    return q.map(c => ({ ef: +(c._srsState?.ease_factor ?? 2.5).toFixed(2) }));
  }, deckKey);
  assert(survQ.length > 0, `生存模式队列非空 (${survQ.length} 张)`);
  await checkCurve(survQ, '生存');

  // 恢复默认
  await page.evaluate(() => setSrsMode('normal'));
  await browser.close();

  console.log(`\n════════════════════════════════════`);
  console.log(`  结果：${passed} 通过  ${failed} 失败`);
  console.log(`════════════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
})();
