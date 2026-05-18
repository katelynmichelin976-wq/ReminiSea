/**
 * 忆海拾光 回归测试（无头 · 单机版 · 5 天 SRS 验证）
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_playwright_test.js
 *
 * SRS 算法逻辑由 srs_test.js 覆盖，本文件只验证：
 *   - .yhspack 导入 → 牌组出现
 *   - 5 天练习 → 卡片毕业、最大间隔生效、IDB 写入
 *   - 统计页 KPI 加载
 */
const { chromium } = require('playwright');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const { pass, check, section, wait, run, getCounts, getBaseUrl } = require('./_playwright_helper');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const YHPACK = path.join(__dirname, 'test_data', '蔬菜水果本地版.yhspack');

async function createTestYhspack() {
  const zip = new JSZip();
  zip.file('deck.json', JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    deck: {
      id: '__test_import__',
      name: '蔬菜水果本地版',
      cards: [
        { name:'苹果', image:'', audio:'' },
        { name:'香蕉', image:'', audio:'' },
        { name:'橘子', image:'', audio:'' },
        { name:'西瓜', image:'', audio:'' },
        { name:'草莓', image:'', audio:'' },
      ]
    }
  }));
  const buf = await zip.generateAsync({ type:'nodebuffer' });
  fs.writeFileSync(YHPACK, buf);
  console.log(`  已写入测试文件: ${YHPACK} (${buf.length} bytes)`);
}

(async () => {
  await createTestYhspack();

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    // ═══════════════════ PHASE 1: 导入 .yhspack ═══════════════════
    section('PHASE 1: 导入 .yhspack');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 500);

    await page.setInputFiles('input[accept=".yhspack"]', YHPACK);
    await page.waitForSelector('.deck-card[data-deck="__test_import__"]', { timeout: 10000 }).catch(() => {});
    const deckName = await run(page, () => {
      const el = document.querySelector('.deck-card[data-deck="__test_import__"] .deck-name');
      return el ? el.textContent.trim() : '';
    });
    pass('导入牌组出现在列表', deckName.includes('蔬菜水果本地版'));

    await run(page, () => { const c = document.querySelector('.deck-card[data-deck="__test_import__"]'); if (c) c.click(); });
    await wait(page, 100);
    check('currentDeck 已切换', await run(page, () => currentDeck), '__test_import__');

    // 切回内置测试牌组
    await run(page, () => { const c = document.querySelector('.deck-card[data-deck="__builtin_test__"]'); if (c) c.click(); });
    await wait(page, 100);

    // ═══════════════════ PHASE 2: 5 天练习 ═══════════════════
    section('PHASE 2: 5 天练习（maximum_interval=7）');

    await run(page, () => {
      SRS_CONFIG.maximum_interval = 7;
      SRS_CONFIG.new_cards_per_day = 20;  // 确保 20 张卡首日全部出现
      window.__fakeToday = '2026-05-05';
      window.__origToday = todayStr;
      todayStr = function() { return window.__fakeToday; };
    });

    const waitWrite = () => page.evaluate(async () => { if (_lastSrsWrite) await _lastSrsWrite; });

    const clickByIdx = (origIdx) => page.evaluate(i => {
      const btns = document.querySelectorAll('.opt');
      for (const b of btns) if (parseInt(b.dataset.idx) === i) { onSel(new MouseEvent('mouseup', { bubbles: true }), i, b); return; }
    }, origIdx);

    // 全部答 good（正确选项 idx=0），无需等待错误选项
    async function doGood() {
      await clickByIdx(0);
      await wait(page, 30);
      await waitWrite();
    }

    async function finishCardOrFinish() {
      for (let t = 0; t < 30; t++) {
        const r = await page.evaluate(() => {
          const n = document.getElementById('nxtbtn');
          if (n && n.classList.contains('show') && !n.disabled) { n.click(); return 'ok'; }
          if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
          return null;
        });
        if (r === 'ok' || r === 'finish') return r;
        await wait(page, 80);
      }
      return null;
    }

    const DAYS = ['2026-05-05','2026-05-06','2026-05-07','2026-05-08','2026-05-09'];
    let totalCards = 0;
    let quizEnteredOnce = false;

    for (let di = 0; di < DAYS.length; di++) {
      await run(page, d => { window.__fakeToday = d; }, DAYS[di]);

      await run(page, () => { for (const t of document.querySelectorAll('.sheet-tab')) if (t.textContent.includes('今日')) { t.click(); return; } });
      await wait(page, 100);
      await run(page, () => { for (const b of document.querySelectorAll('button')) if (b.textContent.includes('开始练习')) { b.click(); return; } });

      // 等练习屏激活（最多 3s）
      await page.waitForFunction(
        () => document.getElementById('screen-quiz').classList.contains('active') ||
              document.getElementById('screen-finish').classList.contains('active'),
        { timeout: 3000 }
      ).catch(() => {});

      const hasCards = await run(page, () => document.getElementById('screen-quiz').classList.contains('active'));
      if (!hasCards) { console.log(`  Day${di+1}: 无到期卡片`); continue; }
      if (!quizEnteredOnce) { pass('进入练习屏', true); quizEnteredOnce = true; }

      let dayCards = 0;
      for (let ci = 0; ci < 60; ci++) {
        const r = await page.evaluate(() => {
          if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
          if (!document.getElementById('screen-quiz').classList.contains('active')) return 'finish';
          return document.querySelectorAll('.opt').length > 0 && !revealed ? 'ready' : 'wait';
        });
        if (r === 'finish') break;
        if (r === 'wait') { await wait(page, 80); ci--; continue; }

        await doGood();
        const ret = await finishCardOrFinish();
        if (ret === 'finish') break;
        dayCards++;
      }

      console.log(`  Day${di+1}: ${dayCards} 张`);
      totalCards += dayCards;

      await run(page, () => { for (const b of document.querySelectorAll('button')) if (b.textContent.includes('返回首页')) { b.click(); return; } });
      await wait(page, 100);
    }

    if (!quizEnteredOnce) pass('进入练习屏', false);
    pass('5 天累计练习 >0', totalCards > 0);
    console.log(`  5 天共练习: ${totalCards} 张次`);

    // ═══════════════════ PHASE 3: 验证 ═══════════════════
    section('PHASE 3: 验证 SRS 状态');

    const finalSt = await run(page, () => new Promise(res => {
      const r = indexedDB.open('yihai_srs', 5);
      r.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction('card_states', 'readonly');
        const g = tx.objectStore('card_states').getAll();
        g.onsuccess = () => {
          const st = (g.result || []).filter(s => s.deck_key === '__builtin_test__');
          const stages = {}, intervals = [];
          st.forEach(s => {
            stages[s.srs_stage] = (stages[s.srs_stage] || 0) + 1;
            if (s.srs_stage === 'review') intervals.push(s.interval);
          });
          const maxInterval = intervals.length ? Math.max(...intervals) : 0;
          const avgInterval = intervals.length ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : 0;
          const tx2 = db.transaction('trials', 'readonly');
          const g2 = tx2.objectStore('trials').getAll();
          g2.onsuccess = () => {
            const tr = (g2.result || []).filter(t => t.deck_key === '__builtin_test__');
            const ratings = {};
            tr.forEach(t => { if (t.rating) ratings[t.rating] = (ratings[t.rating] || 0) + 1; });
            res({ states: st.length, stages, maxInterval, avgInterval, trials: tr.length, ratings });
          };
        };
      };
    }));
    console.log(`  最终: ${JSON.stringify(finalSt)}`);

    pass('20 张卡全部有 SRS 状态', finalSt.states === 20);
    pass('无 new 卡（全部已学习）', !finalSt.stages['new'] || finalSt.stages['new'] === 0);
    pass('有 review 阶段卡（已毕业）', (finalSt.stages['review'] || 0) > 0);
    pass('最大间隔 ≤ 7（maximum_interval 生效）', finalSt.maxInterval <= 7);
    pass('review 平均间隔合理（≥2）', finalSt.avgInterval >= 2);
    pass('答题记录充足（≥20）', finalSt.trials >= 20);
    pass('含 good 评级', (finalSt.ratings['good'] || 0) > 0);

    // 统计页
    await run(page, () => { document.querySelector('.home-gear-btn').click(); });
    await wait(page, 500);
    const kpis = await run(page, () => {
      const n = document.querySelectorAll('.stats-kpi-num');
      const l = document.querySelectorAll('.stats-kpi-lbl');
      const d = {};
      l.forEach((x, i) => { if (n[i]) d[x.textContent.trim()] = n[i].textContent.trim(); });
      return d;
    });
    console.log(`  KPI: ${JSON.stringify(kpis)}`);
    pass('KPI 已加载', Object.keys(kpis).length >= 3);

    // ═══════════════════ PHASE 4: 清理 ═══════════════════
    section('PHASE 4: 清理');
    await run(page, () => {
      if (window.__origToday) todayStr = window.__origToday;
      delete window.__fakeToday; delete window.__origToday;
      localStorage.removeItem('yihai_deck___test_import__');
      const idx = JSON.parse(localStorage.getItem('yihai_decks_index') || '[]');
      localStorage.setItem('yihai_decks_index', JSON.stringify(idx.filter(m => m.key !== '__test_import__')));
    }).catch(() => {});

    const { passed, failed, errors } = getCounts();
    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    if (failed > 0) console.log(`  失败详情: ${errors.join(' | ')}`);
    console.log(`  SRS: ${JSON.stringify(finalSt.stages)}, 最大间隔: ${finalSt.maxInterval}, 平均: ${finalSt.avgInterval}`);
    console.log(`  答题: ${finalSt.trials}, 评级: ${JSON.stringify(finalSt.ratings)}`);

  } catch (err) {
    console.error('\nFATAL:', err.message, err.stack);
  }

  await page.close();
  await browser.close();
  const { failed } = getCounts();
  process.exit(failed > 0 ? 1 : 0);
})();
