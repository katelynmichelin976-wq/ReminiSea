/**
 * 忆海拾光 v4.8 回归测试（可视化 · 单机版 · 10 天 SRS 验证）
 * 依赖：python -m http.server 8080 --directory /c/code
 * 运行：node _playwright_test.js
 */
const { chromium } = require('playwright');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const CFG = { url:'http://localhost:8080/yihai_v4.10.html?v=' + Date.now() };
const YHPACK = path.join(__dirname, 'test_data', '蔬菜水果本地版.yhspack');

let passed=0, failed=0, errors=[];
const pass=(l,v)=>{if(v){passed++;console.log(`  ✓ ${l}`)}else{failed++;errors.push(`✗ ${l}`);console.log(`  ✗ ${l}`)}};
const check=(l,a,e)=>pass(l,a===e);
const section=t=>console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const wait = (page, ms) => page.waitForTimeout(ms);

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

// 加权随机评级：70% good, 20% hard, 10% again
function randRating() {
  const r = Math.random();
  if (r < 0.10) return 'again';
  if (r < 0.30) return 'hard';
  return 'good';
}

(async () => {
  await createTestYhspack();

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    // ═══════════════════ PHASE 1: 导入 .yhspack ═══════════════════
    section('PHASE 1: 导入 .yhspack');
    await page.goto(CFG.url, { waitUntil:'networkidle', timeout:30000 });
    await wait(page, 1500);

    await page.setInputFiles('input[accept=".yhspack"]', YHPACK);
    // 等待导入完成：JSZip CDN 加载 + importYhspack 异步执行
    await wait(page, 3000);
    // 等待牌组卡片渲染
    await page.waitForSelector('.deck-card[data-deck="__test_import__"]', { timeout: 10000 }).catch(() => {});
    const deckName = await run(page, () => {
      const el = document.querySelector('.deck-card[data-deck="__test_import__"] .deck-name');
      return el ? el.textContent.trim() : '';
    });
    pass('导入牌组出现在列表', deckName.includes('蔬菜水果本地版'));

    await run(page, () => { const c=document.querySelector('.deck-card[data-deck="__test_import__"]'); if(c)c.click(); });
    await wait(page, 300);
    check('currentDeck 已切换', await run(page, () => currentDeck), '__test_import__');

    await run(page, () => { const c=document.querySelector('.deck-card[data-deck="__builtin_test__"]'); if(c)c.click(); });
    await wait(page, 300);

    // ═══════════════════ PHASE 2: SRS processAnswer ═══════════════════
    section('PHASE 2: SRS 算法验证');
    const T = '2026-05-05';
    check('2.1 new+good → learning',
      (await run(page, d => { const st={srs_stage:'new',interval:0,ease_factor:2.5,due_date:d,due_ts:0,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2a',card_id:'t2a',deck_key:'__test__'}; return processAnswer(st,'good',d); }, T)).srs_stage, 'learning');
    check('2.2 again→step=0',
      (await run(page, d => { const st={srs_stage:'new',interval:0,ease_factor:2.5,due_date:d,due_ts:0,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2b',card_id:'t2b',deck_key:'__test__'}; return processAnswer(st,'again',d); }, T)).step_index, 0);
    check('2.3 learning+good→review',
      (await run(page, d => { const st={srs_stage:'learning',interval:0,ease_factor:2.5,due_date:d,due_ts:0,step_index:1,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2c',card_id:'t2c',deck_key:'__test__'}; return processAnswer(st,'good',d); }, T)).srs_stage, 'review');
    check('2.4 review+again→relearning',
      (await run(page, a => { const st={srs_stage:'review',interval:10,ease_factor:2.5,due_date:a.fd,due_ts:Date.now()+864000000,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2d',card_id:'t2d',deck_key:'__test__'}; return processAnswer(st,'again',a.d); }, {d:T,fd:'2026-05-15'})).srs_stage, 'relearning');
    check('2.5 review+good≥25d',
      (await run(page, d => { const st={srs_stage:'review',interval:10,ease_factor:2.5,due_date:d,due_ts:1000,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2e',card_id:'t2e',deck_key:'__test__'}; return processAnswer(st,'good',d); }, T)).interval >= 25, true);
    check('2.6 review+easy ease=2.65',
      (await run(page, d => { const st={srs_stage:'review',interval:10,ease_factor:2.5,due_date:d,due_ts:1000,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2f',card_id:'t2f',deck_key:'__test__'}; return processAnswer(st,'easy',d); }, T)).ease_factor, 2.65);
    check('2.7 review+hard ease=2.35',
      (await run(page, d => { const st={srs_stage:'review',interval:10,ease_factor:2.5,due_date:d,due_ts:1000,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2g',card_id:'t2g',deck_key:'__test__'}; return processAnswer(st,'hard',d); }, T)).ease_factor, 2.35);
    check('2.8 relearning+good→review',
      (await run(page, d => { const st={srs_stage:'relearning',interval:0,ease_factor:2.5,due_date:'',due_ts:0,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:1,suspended:false,state_key:'t2h',card_id:'t2h',deck_key:'__test__'}; return processAnswer(st,'good',d); }, T)).srs_stage, 'review');

    // ═══════════════════ PHASE 3: 10 天 UI 练习 ═══════════════════
    section('PHASE 3: 10 天练习（maximum_interval=7）');

    // 设置 AD 友好参数：最大间隔 7 天
    await run(page, () => { SRS_CONFIG.maximum_interval = 7; });

    await run(page, () => {
      window.__fakeToday = '2026-05-05';
      window.__origToday = todayStr;
      todayStr = function() { return window.__fakeToday; };
    });
    await run(page, () => { const t=document.querySelectorAll('.sheet-tab'); for(const x of t) if(x.textContent.includes('今日')){x.click();return} });
    await wait(page, 300);

    await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('开始练习')){x.click();return} });
    await wait(page, 1500);
    pass('进入练习屏',
      await run(page, () => document.getElementById('screen-quiz').classList.contains('active')));

    const waitWrite = () => page.evaluate(async () => { if (_lastSrsWrite) await _lastSrsWrite; });
    const waitRender = () => wait(page, 300);

    const clickByIdx = (origIdx) => page.evaluate(i => {
      const btns = document.querySelectorAll('.opt');
      for (const b of btns) if (parseInt(b.dataset.idx) === i) { onSel(new MouseEvent('mouseup',{bubbles:true}), i, b); return; }
    }, origIdx);
    const getWrongIdxs = () => page.evaluate(() => {
      const btns = document.querySelectorAll('.opt');
      const avail = [];
      for (const b of btns) {
        const idx = parseInt(b.dataset.idx);
        if (idx !== 0 && !b.style.pointerEvents) avail.push(idx);
      }
      return avail;
    });

    async function doCard(strategy) {
      if (strategy === 'good') {
        await clickByIdx(0);
        await wait(page, 50);
        await waitWrite();
      }
      if (strategy === 'hard') {
        const wrongs = await getWrongIdxs();
        if (wrongs.length > 0) await clickByIdx(wrongs[0]);
        await wait(page, 400);
        await clickByIdx(0);
        await wait(page, 50);
        await waitWrite();
      }
      if (strategy === 'again') {
        const wrongs = await getWrongIdxs();
        if (wrongs.length > 0) await clickByIdx(wrongs[0]);
        await wait(page, 400);
        const wrongs2 = await getWrongIdxs();
        if (wrongs2.length > 0) await clickByIdx(wrongs2[0]);
        await wait(page, 50);
        await waitWrite();
      }
    }

    async function finishCardOrFinish() {
      for (let tries = 0; tries < 30; tries++) {
        const r = await page.evaluate(() => {
          const n = document.getElementById('nxtbtn');
          if (n && n.classList.contains('show') && !n.disabled) { n.click(); return 'ok'; }
          const f = document.getElementById('screen-finish');
          if (f && f.classList.contains('active')) return 'finish';
          return null;
        });
        if (r === 'ok') { await waitRender(); return 'ok'; }
        if (r === 'finish') return 'finish';
        await wait(page, 100);
      }
      return null;
    }

    // ── 10 天练习循环 ──
    const DAYS = ['2026-05-05','2026-05-06','2026-05-07','2026-05-08','2026-05-09',
                  '2026-05-10','2026-05-11','2026-05-12','2026-05-13','2026-05-14'];
    const DAY_LABELS = ['一','二','三','四','五','六','日','一','二','三'];
    let totalCards = 0;

    for (let di = 0; di < DAYS.length; di++) {
      const day = DAYS[di];
      await run(page, d => { window.__fakeToday = d; }, day);
      if (di === 0) {
        // Day1 已在今日 tab，只需点开始练习
        // （从 Phase 2 的今日 tab 切过来的状态）
      } else {
        await run(page, () => { const t=document.querySelectorAll('.sheet-tab'); for(const x of t) if(x.textContent.includes('今日')){x.click();return} });
        await wait(page, 200);
      }
      await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('开始练习')){x.click();return} });
      await wait(page, 1500);

      const hasCards = await run(page, () => document.getElementById('screen-quiz').classList.contains('active'));
      if (!hasCards) {
        console.log(`  Day${di+1} (${DAY_LABELS[di]}): 无到期卡片`);
        continue;
      }

      let dayCards = 0;
      for (let ci = 0; ci < 40; ci++) {
        const quizActive = await run(page, () => document.getElementById('screen-quiz').classList.contains('active'));
        if (!quizActive) break;

        let ready = false;
        for (let t = 0; t < 15; t++) {
          const r = await run(page, () => {
            if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
            return document.querySelectorAll('.opt').length > 0 && !revealed ? 'ready' : null;
          });
          if (r === 'finish') { ready = true; break; }
          if (r === 'ready') { ready = true; break; }
          await wait(page, 100);
        }
        if (!ready) break;

        // 加权随机评级（但 always 留至少一次 good 确保毕业路径）
        const strat = di === 0 && ci < 3
          ? ['good','hard','again'][ci]  // Day1 前 3 张确定性混合
          : randRating();
        await doCard(strat);
        const ret = await finishCardOrFinish();
        if (ret === 'finish') break;
        dayCards++;
      }

      console.log(`  Day${di+1} (${DAY_LABELS[di]}): ${dayCards} 张`);
      totalCards += dayCards;

      await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('返回首页')){x.click();return} });
      await wait(page, 200);
    }

    pass('10 天累计练习 >0', totalCards > 0);
    console.log(`  10 天共练习: ${totalCards} 张次`);

    // ═══════════════════ PHASE 4: 10 天后验证 ═══════════════════
    section('PHASE 4: 10 天后验证');

    const finalSt = await run(page, () => new Promise(res => {
      const r=indexedDB.open('yihai_srs',4);
      r.onsuccess=e=>{
        const db=e.target.result;
        const tx=db.transaction('card_states','readonly');
        const g=tx.objectStore('card_states').getAll();
        g.onsuccess=()=>{
          const st=(g.result||[]).filter(s=>s.deck_key==='__builtin_test__');
          const stages={}; const intervals=[];
          st.forEach(s=>{
            stages[s.srs_stage]=(stages[s.srs_stage]||0)+1;
            if (s.srs_stage==='review') intervals.push(s.interval);
          });
          const maxInterval = intervals.length ? Math.max(...intervals) : 0;
          const avgInterval = intervals.length ? Math.round(intervals.reduce((a,b)=>a+b,0)/intervals.length) : 0;
          const tx2=db.transaction('trials','readonly');
          const g2=tx2.objectStore('trials').getAll();
          g2.onsuccess=()=>{
            const tr=(g2.result||[]).filter(t=>t.deck_key==='__builtin_test__');
            const ratings={}; tr.forEach(t=>{if(t.rating)ratings[t.rating]=(ratings[t.rating]||0)+1});
            res({states:st.length, stages, maxInterval, avgInterval, trials:tr.length, ratings});
          };
        };
      };
    }));
    console.log(`  最终: ${JSON.stringify(finalSt)}`);

    pass('20 张卡全部有 SRS 状态', finalSt.states === 20);
    pass('无 new 卡（全部已学习）', !finalSt.stages['new'] || finalSt.stages['new'] === 0);
    pass('有 review 阶段卡（已毕业）', (finalSt.stages['review']||0) > 0);

    // maximum_interval=7 验证
    pass('最大间隔 ≤ 7（maximum_interval 生效）', finalSt.maxInterval <= 7);
    pass('review 平均间隔合理（≥2）', finalSt.avgInterval >= 2);

    pass('答题记录充足（≥60）', finalSt.trials >= 60);
    if (finalSt.ratings && Object.keys(finalSt.ratings).length > 0) {
      pass('含 good 评级', (finalSt.ratings['good']||0)>0);
      pass('含 hard 评级', (finalSt.ratings['hard']||0)>0);
      pass('含 again 评级', (finalSt.ratings['again']||0)>0);
    }

    // 统计页
    await run(page, () => { document.querySelector('.home-gear-btn').click(); });
    const kpis = await run(page, () => new Promise(res => {
      let tries = 0;
      const poll = () => {
        const n=document.querySelectorAll('.stats-kpi-num'); const l=document.querySelectorAll('.stats-kpi-lbl');
        if (n.length > 0 || tries++ > 30) {
          const d={}; l.forEach((x,i)=>{if(n[i])d[x.textContent.trim()]=n[i].textContent.trim()}); res(d);
        } else { setTimeout(poll, 100); }
      };
      poll();
    }));
    console.log(`  KPI: ${JSON.stringify(kpis)}`);
    pass('KPI 已加载', Object.keys(kpis).length >= 3);

    // ═══════════════════ PHASE 5: 清理 ═══════════════════
    section('PHASE 5: 清理');
    await run(page, () => { if(window.__origToday)todayStr=window.__origToday; delete window.__fakeToday; delete window.__origToday; }).catch(() => {});
    // 清理本地 localStorage 残留
    await run(page, () => {
      localStorage.removeItem('yihai_deck___test_import__');
      const idx = JSON.parse(localStorage.getItem('yihai_decks_index') || '[]');
      const filtered = idx.filter(m => m.key !== '__test_import__');
      localStorage.setItem('yihai_decks_index', JSON.stringify(filtered));
    }).catch(() => {});

    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    if (failed > 0) console.log(`  失败: ${errors.join(' | ')}`);
    console.log(`  SRS: ${JSON.stringify(finalSt.stages)}, 最大间隔: ${finalSt.maxInterval}, 平均间隔: ${finalSt.avgInterval}`);
    console.log(`  答题: ${finalSt.trials}, 评级: ${JSON.stringify(finalSt.ratings)}`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  await page.close();
  await browser.close();
  console.log(`  测试文件保留: ${YHPACK}`);
  process.exit(failed > 0 ? 1 : 0);
})();
