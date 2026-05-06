/**
 * 忆海拾光 v4.8 回归测试（可视化 · 单机版）
 * 依赖：python -m http.server 8080 --directory /c/code
 * 运行：node _playwright_test.js
 */
const { chromium } = require('playwright');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const CFG = { url:'http://localhost:8080/yihai_v4.8.html' };
const YHPACK = path.join(__dirname, 'test_data', '蔬菜水果本地版.yhspack');

let passed=0, failed=0, errors=[];
const pass=(l,v)=>{if(v){passed++;console.log(`  ✓ ${l}`)}else{failed++;errors.push(`✗ ${l}`);console.log(`  ✗ ${l}`)}};
const check=(l,a,e)=>pass(l,a===e);
const section=t=>console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const wait = (page, ms) => page.waitForTimeout(ms);

async function createTestYhspack() {
  const zip = new JSZip();
  // 保持与原文件一致的格式（version + exportedAt + deck）
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

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    // ═══════════════════ PHASE 1: 导入 .yhspack ═══════════════════
    section('PHASE 1: 导入 .yhspack');
    await page.goto(CFG.url, { waitUntil:'networkidle', timeout:30000 });
    await wait(page, 1500);

    // 上传 .yhspack
    await page.setInputFiles('input[accept=".yhspack"]', YHPACK);
    await wait(page, 2000); // 等 JSZip 加载 + 导入完成

    // 验证牌组出现在列表中
    const deckName = await run(page, () => {
      const cards = document.querySelectorAll('.deck-card');
      for (const c of cards) {
        const nameEl = c.querySelector('.deck-name');
        if (nameEl && nameEl.textContent.includes('蔬菜水果本地版')) return nameEl.textContent.trim();
      }
      return '';
    });
    check('导入牌组出现在列表', deckName, '蔬菜水果本地版');

    // 选中导入牌组验证 currentDeck
    await run(page, () => { const c=document.querySelector('.deck-card[data-deck="__test_import__"]'); if(c)c.click(); });
    await wait(page, 300);
    check('currentDeck 已切换', await run(page, () => currentDeck), '__test_import__');

    // 切回内置牌组用于后续练习
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

    // ═══════════════════ PHASE 3: 多日 UI 练习 ═══════════════════
    section('PHASE 3: 多日练习');

    await run(page, () => {
      window.__fakeToday = '2026-05-05';
      window.__origToday = todayStr;
      todayStr = function() { return window.__fakeToday; };
    });
    await run(page, () => { const t=document.querySelectorAll('.sheet-tab'); for(const x of t) if(x.textContent.includes('今日')){x.click();return} });
    await wait(page, 300);

    await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('开始练习')){x.click();return} });
    await wait(page, 1500);
    const inQ = await run(page, () => document.getElementById('screen-quiz').classList.contains('active'));
    pass('进入练习屏', inQ);

    const waitWrite = () => page.evaluate(async () => { if (_lastSrsWrite) await _lastSrsWrite; });
    const waitRender = () => wait(page, 300);

    // 按 dataset.idx 查找并点击选项按钮（onSel 监听 mouseup/touchend，非 click）
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

    // ── 7 天练习循环 ──
    // 内置牌组 20 张，new_cards_per_day=5 → Day1-4 各进 5 张新卡，Day5-7 纯复习
    const DAYS = ['2026-05-05','2026-05-06','2026-05-07','2026-05-08','2026-05-09','2026-05-10','2026-05-11'];
    const DAY_LABELS = ['一','二','三','四','五','六','日'];
    let totalCards = 0;

    for (let di = 0; di < DAYS.length; di++) {
      const day = DAYS[di];
      // 设置日期，切今日 tab
      await run(page, d => { window.__fakeToday = d; }, day);
      if (di === 0) {
        // Day1 已在今日 tab
        await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('开始练习')){x.click();return} });
      } else {
        await run(page, () => { const t=document.querySelectorAll('.sheet-tab'); for(const x of t) if(x.textContent.includes('今日')){x.click();return} });
        await wait(page, 200);
        await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('开始练习')){x.click();return} });
      }
      await wait(page, 1500);

      const hasCards = await run(page, () => document.getElementById('screen-quiz').classList.contains('active'));
      if (!hasCards) {
        console.log(`  Day${di+1} (${DAY_LABELS[di]}): 无到期卡片`);
        continue;
      }

      // Day1 前 3 张混合策略（good/hard/again 各一），其余全部 good
      const day1Mix = ['good','hard','again','good','good','good'];
      let dayCards = 0;

      for (let ci = 0; ci < 30; ci++) {
        // 检查是否仍在答题屏
        const quizActive = await run(page, () => document.getElementById('screen-quiz').classList.contains('active'));
        if (!quizActive) break;

        // 等卡片就绪
        let ready = false;
        for (let t = 0; t < 20; t++) {
          const r = await run(page, () => {
            if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
            return document.querySelectorAll('.opt').length > 0 && !revealed ? 'ready' : null;
          });
          if (r === 'finish') { ready = true; break; }
          if (r === 'ready') { ready = true; break; }
          await wait(page, 100);
        }
        if (!ready) break;

        // 选策略
        let strat;
        if (di === 0 && ci < day1Mix.length) strat = day1Mix[ci];
        else strat = 'good';

        await doCard(strat);
        const ret = await finishCardOrFinish();
        if (ret === 'finish') break;
        dayCards++;
      }

      console.log(`  Day${di+1} (${DAY_LABELS[di]}): 完成 ${dayCards} 张`);
      totalCards += dayCards;

      // 返回首页
      await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('返回首页')){x.click();return} });
      await wait(page, 300);
    }

    pass('7 天累计练习', totalCards > 0);
    console.log(`  7 天共练习: ${totalCards} 张次`);

    // ═══════════════════ PHASE 4: 最终验证 ═══════════════════
    section('PHASE 4: 7 天后验证');

    const finalSt = await run(page, () => new Promise(res => {
      const r=indexedDB.open('yihai_srs',3);
      r.onsuccess=e=>{
        const db=e.target.result;
        const t1=db.transaction('card_states','readonly');
        const g1=t1.objectStore('card_states').getAll();
        g1.onsuccess=()=>{
          const st=(g1.result||[]).filter(s=>s.deck_key==='__builtin_test__');
          const stages={}; st.forEach(s=>{stages[s.srs_stage]=(stages[s.srs_stage]||0)+1});
          const t2=db.transaction('trials','readonly');
          const g2=t2.objectStore('trials').getAll();
          g2.onsuccess=()=>{
            const tr=(g2.result||[]).filter(t=>t.deck_key==='__builtin_test__');
            const ratings={}; tr.forEach(t=>{if(t.rating)ratings[t.rating]=(ratings[t.rating]||0)+1});
            res({states:st.length, stages, trials:tr.length, ratings});
          };
        };
      };
    }));
    console.log(`  最终: ${JSON.stringify(finalSt)}`);
    pass('20 张卡全部有 SRS 状态', finalSt.states === 20);
    pass('无 new 卡（全部已学习）', !finalSt.stages['new'] || finalSt.stages['new'] === 0);
    pass('有 review 阶段卡（已毕业）', (finalSt.stages['review']||0) > 0);
    pass('答题记录充足', finalSt.trials > 20);
    if (finalSt.ratings && Object.keys(finalSt.ratings).length > 0) {
      pass('含 good', (finalSt.ratings['good']||0)>0);
      pass('含 hard', (finalSt.ratings['hard']||0)>0);
      pass('含 again', (finalSt.ratings['again']||0)>0);
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

    section('结果');
    console.log(`  通过: ${passed}  失败: ${failed}`);
    if (failed > 0) console.log(`  失败: ${errors.join(' | ')}`);
    console.log(`  SRS: ${JSON.stringify(finalSt.stages)}, 答题: ${finalSt.trials}, 评级: ${JSON.stringify(finalSt.ratings)}`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  await page.close();
  await browser.close();

  console.log(`  测试文件保留: ${YHPACK}`);

  process.exit(failed > 0 ? 1 : 0);
})();
