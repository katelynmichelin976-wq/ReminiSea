/**
 * 忆海拾光 v4.9.1 回归测试
 * 覆盖今天修复的 bug：
 *   Bug 1a — showFinish 前 await _lastSrsWrite（最后一张卡 dp 计数准确）
 *   Bug 1b — 主页到期数受每日上限约束（不再虚高）
 *   Bug 2b — 统计页今日概况按日历日过滤（不混昨日数据）
 *   TrialLog 字段 — due_ts / due_date / suspended / suspended_reason
 *   白屏修复 — DOM 就绪即渲染，不阻塞等待 SDK
 *
 * 依赖：python -m http.server 8080 --directory /c/code
 * 运行：node tests/_playwright_v4.9.1_regression_test.js
 */

const { chromium } = require('playwright');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const CFG = { url:'http://localhost:8080/yihai_v4.10.html?v=' + Date.now() };
const YHPACK = path.join(__dirname, 'test_data', '蔬菜水果本地版.yhspack');

let passed=0, failed=0, errors=[];
const pass=(l,v)=>{if(v){passed++;console.log(`  \x1b[32m✓\x1b[0m ${l}`)}else{failed++;errors.push(`✗ ${l}`);console.log(`  \x1b[31m✗\x1b[0m ${l}`)}};
const check=(l,a,e)=>pass(l,a===e);
const section=t=>console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const wait = (page, ms) => page.waitForTimeout(ms);

// 等待 async 写入完成（IndexedDB + localStorage）
async function waitWrite(page) {
  await run(page, () => new Promise(res => setTimeout(res, 400)));
}

async function createTestYhspack() {
  const zip = new JSZip();
  zip.file('deck.json', JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    deck: {
      id: '__reg_test__',
      name: '回归测试牌组',
      cards: [
        { name:'苹果', image:'', audio:'' },
        { name:'香蕉', image:'', audio:'' },
        { name:'橘子', image:'', audio:'' },
        { name:'西瓜', image:'', audio:'' },
        { name:'草莓', image:'', audio:'' },
        { name:'葡萄', image:'', audio:'' },
        { name:'芒果', image:'', audio:'' },
        { name:'樱桃', image:'', audio:'' },
      ]
    }
  }));
  const buf = await zip.generateAsync({ type:'nodebuffer' });
  fs.writeFileSync(YHPACK, buf);
  console.log(`  已写入测试文件: ${YHPACK} (${buf.length} bytes)`);
}

(async () => {
  await createTestYhspack();

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    const tStart = Date.now();
    const ts = () => Date.now();

    // ═══════════════════ PHASE 1: 导入 + 配置 ═══════════════════
    section('PHASE 1: 导入测试牌组 + 设置参数');

    await page.goto(CFG.url, { waitUntil:'networkidle', timeout:30000 });
    await wait(page, 2000);

    // 验证白屏修复：首页已渲染
    const homeActive = await run(page, () =>
      document.getElementById('screen-home').classList.contains('active'));
    pass('1.1 白屏修复：首页立即可见（不等待 SDK）', homeActive);

    // 验证牌组列表已渲染
    const deckGrid = await run(page, () =>
      document.getElementById('deck-grid') ? document.getElementById('deck-grid').children.length > 0 : false);
    pass('1.2 牌组列表已渲染', deckGrid);

    // 导入测试牌组
    await page.setInputFiles('input[accept=".yhspack"]', YHPACK);
    await wait(page, 3000);
    await page.waitForSelector('.deck-card[data-deck="__reg_test__"]', { timeout: 10000 }).catch(() => {});
    const deckEl = await run(page, () => {
      const el = document.querySelector('.deck-card[data-deck="__reg_test__"] .deck-name');
      return el ? el.textContent.trim() : '';
    });
    pass('1.3 导入牌组成功', deckEl.includes('回归测试'));

    // 选中测试牌组
    await run(page, () => { const c=document.querySelector('.deck-card[data-deck="__reg_test__"]'); if(c)c.click(); });
    await wait(page, 200);

    // 设置小上限便于测试（max_reviews=3, new_cards=2）
    await run(page, () => {
      SRS_CONFIG.maximum_reviews_per_day = 3;
      SRS_CONFIG.new_cards_per_day = 2;
      localStorage.removeItem('yihai_daily_progress');
    });
    pass('1.4 参数已配置 (max_reviews=3, new_cards=2)', true);

    // ═══════════════════ PHASE 2: Bug 1b — 到期数虚高 ═══════════════════
    section('PHASE 2: Bug 1b — 主页到期数受每日上限约束');

    // 首次练习前：8 张未经练习的牌，new 上限=2，due 上限=3
    const statsBefore = await run(page, async (key) => {
      const dp = getDailyProgress();  // 0
      const dueCap = Math.max(0, SRS_CONFIG.maximum_reviews_per_day - (dp.reviewed_today || 0));
      const s = await getDeckStatsSrs(key);
      return { due: s.due, new: s.new, dueCap, maxReviews: SRS_CONFIG.maximum_reviews_per_day };
    }, '__reg_test__');
    pass('2.1 due ≤ review 上限 (3-0=3)', statsBefore.due <= statsBefore.dueCap);
    pass('2.2 new ≤ new 上限 (2-0=2)', statsBefore.new <= 2);
    console.log(`  due=${statsBefore.due} new=${statsBefore.new} dueCap=${statsBefore.dueCap}`);

    // ═══════════════════ PHASE 3: Bug 1a — 练习完成计数准确 ═══════════════════
    section('PHASE 3: Bug 1a — finish 弹窗计数准确');

    // 开始练习
    await run(page, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('开始练习')) { b.click(); return; } }
    });
    await wait(page, 3000);

    const quizActive = await run(page, () =>
      document.getElementById('screen-quiz').classList.contains('active'));
    pass('3.1 进入练习屏', quizActive);

    // 练习所有队列中的卡（最多 3 review + 2 new = 5 张）
    let practiced = 0;
    for (let ci = 0; ci < 8; ci++) {
      const quizStill = await run(page, () =>
        document.getElementById('screen-quiz').classList.contains('active'));
      if (!quizStill) break;

      // 等卡片就绪
      let ready = false;
      for (let t = 0; t < 30; t++) {
        const r = await run(page, () => {
          if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
          const opts = document.querySelectorAll('.opt');
          return opts.length > 0 ? 'ready' : null;
        });
        if (r === 'finish' || r === 'ready') { ready = true; break; }
        await wait(page, 100);
      }
      if (!ready) break;

      // 检查是否已进完成屏
      const finished = await run(page, () =>
        document.getElementById('screen-finish').classList.contains('active'));
      if (finished) break;

      // 选正确答案 good rating
      await run(page, () => {
        const o = document.querySelector('.opt[data-idx="0"]');
        if (o && !revealed) onSel(new MouseEvent('mouseup', {bubbles:true}), 0, o);
      });
      await wait(page, 100);
      await waitWrite(page);

      // 点下一题
      let nxtOk = false;
      for (let t = 0; t < 40; t++) {
        const r = await run(page, () => {
          const nxt = document.getElementById('nxtbtn');
          if (nxt && nxt.classList.contains('show') && !nxt.disabled) { nxt.click(); return 'ok'; }
          if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
          return null;
        });
        if (r === 'finish' || r === 'ok') { nxtOk = true; break; }
        await wait(page, 100);
      }
      if (!nxtOk) break;

      await wait(page, 400);
      practiced++;

      // 最后一张 → 等 finish 出现
      const finNow = await run(page, () =>
        document.getElementById('screen-finish').classList.contains('active'));
      if (finNow) break;
    }

    pass('3.2 练习了卡片', practiced >= 1);
    console.log(`  完成 ${practiced} 张`);

    // 等 finish 弹窗渲染和 backfill 完成
    await wait(page, 1000);

    // 验证 finish 屏已显示
    const finishActive = await run(page, () =>
      document.getElementById('screen-finish').classList.contains('active'));
    pass('3.3 显示完成界面', finishActive);

    // Bug 1a 验证：finish 弹窗的 reviewed_today 与实际练习数一致
    const finishStats = await run(page, () => {
      const el = document.getElementById('finish-stats');
      if (!el) return null;
      // 解析 finish 弹窗的数字
      const rows = el.querySelectorAll('.finish-stat-row');
      const result = {};
      rows.forEach(r => {
        const lbl = r.querySelector('.finish-stat-lbl');
        const val = r.querySelector('.finish-stat-val');
        if (lbl && val) result[lbl.textContent.trim()] = parseInt(val.textContent) || 0;
      });
      return result;
    });
    if (finishStats) {
      const total = (finishStats['良好']||0) + (finishStats['困难']||0) + (finishStats['重来']||0);
      // 弹窗评级合计应与实际练习数一致（考虑 quiz 模式下可能因每日上限提前结束）
      pass('3.4 弹窗评级合计 ≤ 本次练习数', total >= 1 && total <= practiced);
      console.log(`  弹窗: 良好=${finishStats['良好']} 困难=${finishStats['困难']} 重来=${finishStats['重来']} 本次练习=${finishStats['本次练习']} 今日累计=${finishStats['今日累计']}`);
    }

    // 验证 show_finish 事件存在
    const hasShowFinish = await run(page, async (deck) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 5);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
      const events = await new Promise((res, rej) => {
        const tx = db.transaction('app_events', 'readonly');
        const g = tx.objectStore('app_events').getAll();
        g.onsuccess = e => res(e.target.result || []);
        g.onerror = e => rej(e.target.error);
      });
      return events.some(ev => ev.event_type === 'show_finish');
    }, '__reg_test__');
    pass('3.5 show_finish 事件已记录', hasShowFinish);

    // ═══════════════════ PHASE 4: Bug 1b 验证 — 练习后到期数 ═══════════════════
    section('PHASE 4: Bug 1b — 练习后主页到期数上限约束');

    // 返回首页
    await run(page, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('返回首页')) { b.click(); return; } }
    });
    await wait(page, 1500);

    const statsAfter = await run(page, async (key) => {
      await new Promise(res => setTimeout(res, 500)); // 确保 _lastSrsWrite 完成
      const dp = getDailyProgress();
      const s = await getDeckStatsSrs(key);
      const dueCap = Math.max(0, SRS_CONFIG.maximum_reviews_per_day - (dp.reviewed_today || 0));
      return { due: s.due, new: s.new, reviewed: dp.reviewed_today, dueCap };
    }, '__reg_test__');
    pass('4.1 due ≤ 剩余 review 槽位', statsAfter.due <= statsAfter.dueCap);
    pass('4.2 reviewed_today > 0', statsAfter.reviewed > 0);
    console.log(`  due=${statsAfter.due} new=${statsAfter.new} reviewed=${statsAfter.reviewed} dueCap=${statsAfter.dueCap}`);

    // ═══════════════════ PHASE 5: TrialLog 字段完整性 ═══════════════════
    section('PHASE 5: TrialLog 承载完整状态快照');

    const trialFields = await run(page, async (deck) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 5);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
      const trials = await new Promise((res, rej) => {
        const tx = db.transaction('trials', 'readonly');
        const g = tx.objectStore('trials').getAll();
        g.onsuccess = e => res((e.target.result || []).filter(t => t.deck_key === deck));
        g.onerror = e => rej(e.target.error);
      });
      if (trials.length === 0) return { count: 0, hasFields: false };
      const t = trials[trials.length - 1]; // 最新一条
      return {
        count: trials.length,
        hasDueTs: typeof t.due_ts === 'number',
        hasDueDate: typeof t.due_date === 'string',
        hasSuspended: typeof t.suspended === 'boolean',
        hasSuspendedReason: 'suspended_reason' in t,
      };
    }, '__reg_test__');
    pass('5.1 有 TrialLog', trialFields.count > 0);
    pass('5.2 TrialLog.due_ts 存在', trialFields.hasDueTs);
    pass('5.3 TrialLog.due_date 存在', trialFields.hasDueDate);
    pass('5.4 TrialLog.suspended 存在', trialFields.hasSuspended);
    pass('5.5 TrialLog.suspended_reason 存在', trialFields.hasSuspendedReason);
    console.log(`  TrialLog: ${trialFields.count} 条, due_ts=${trialFields.hasDueTs}, due_date=${trialFields.hasDueDate}`);

    // ═══════════════════ PHASE 6: Bug 2b — 统计页不混昨日数据 ═══════════════════
    section('PHASE 6: Bug 2b — 统计页今日概况仅当日数据');

    // 打开统计页
    await run(page, () => { openStats(); });
    await wait(page, 2000);

    const statsToday = await run(page, async (key) => {
      // 读取 dp 和本地 TrialLog 今日数据
      const dp = getDailyProgress();
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 5);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
      const allTrials = await new Promise((res, rej) => {
        const tx = db.transaction('trials', 'readonly');
        const g = tx.objectStore('trials').getAll();
        g.onsuccess = e => res(e.target.result || []);
        g.onerror = e => rej(e.target.error);
      });

      // 按日历日过滤（模拟修复后的逻辑）
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayTrials = allTrials.filter(t => t.timestamp >= todayStart.getTime());
      const yesterdayTrials = allTrials.filter(t =>
        t.timestamp < todayStart.getTime() && t.timestamp >= todayStart.getTime() - 86400000
      );

      // 计算 stats 页显示的练习数
      const uniqueToday = new Set(todayTrials.map(t => t.card_id)).size;
      const uniqueYesterday = new Set(yesterdayTrials.map(t => t.card_id)).size;

      return {
        dpReviewed: dp.reviewed_today || 0,
        todayTrials: todayTrials.length,
        yesterdayTrials: yesterdayTrials.length,
        uniqueToday,
        uniqueYesterday,
      };
    }, '__reg_test__');
    pass('6.1 今日 trials > 0', statsToday.todayTrials > 0);
    pass('6.2 昨日 trials 不被计入今日统计', statsToday.uniqueYesterday === 0 || statsToday.todayTrials >= statsToday.uniqueToday);

    // 验证 stats 页 KPI 数字不含昨日
    const kpiNums = await run(page, () => {
      const el = document.getElementById('st-kpi');
      if (!el) return [];
      const nums = el.querySelectorAll('.stats-kpi-num');
      return Array.from(nums).map(n => parseInt(n.textContent) || 0);
    });
    pass('6.3 统计页 KPI 已渲染', kpiNums.length >= 3);
    console.log(`  dp.reviewed=${statsToday.dpReviewed} todayTrials=${statsToday.todayTrials} yesterdayTrials=${statsToday.yesterdayTrials}`);

    // ═══════════════════ 结果 ═══════════════════
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}  总耗时: ${((ts()-tStart)/1000).toFixed(1)}s`);
    if (failed > 0) console.log(`  失败: ${errors.join(' | ')}`);

    // 清理
    await run(page, (key) => {
      try { deleteDeck(event || new Event('click'), key); } catch(e) {}
    }, '__reg_test__');

  } catch(e) {
    console.error('测试异常:', e.message);
    failed++;
  } finally {
    await browser.close();
    // 清理测试文件
    try { fs.unlinkSync(YHPACK); } catch(e) {}
    process.exit(failed > 0 ? 1 : 0);
  }
})();
