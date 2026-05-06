/**
 * 忆海拾光 v4.8 回归测试（可视化）
 * node _playwright_test.js
 */
const { chromium } = require('playwright');
const CFG = { url:'http://localhost:8080/yihai_v4.8.html', email:'zyhacl@gmail.com', password:'667788' };

let passed=0, failed=0, errors=[];
const pass=(l,v)=>{if(v){passed++;console.log(`  ✓ ${l}`)}else{failed++;errors.push(`✗ ${l}`);console.log(`  ✗ ${l}`)}};
const check=(l,a,e)=>pass(l,a===e);
const section=t=>console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const wait = (page, ms) => page.waitForTimeout(ms);

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    // ═══════════════════════ PHASE 1: Login ═══════════════════════
    section('PHASE 1: 登录');
    await page.goto(CFG.url, { waitUntil:'networkidle', timeout:30000 });
    await wait(page, 1500);

    await run(page, () => { const t=document.querySelectorAll('.sheet-tab'); for(const x of t) if(x.textContent.includes('云端')){x.click();return} });
    await wait(page, 500);

    // 如已登录则先退出（确保每次从头走界面登录流程）
    const isLoggedIn = await run(page, () => {
      const conn = document.getElementById('cloud-connected-section');
      return conn && conn.style.display !== 'none';
    });
    if (isLoggedIn) {
      console.log('  检测到已登录，先退出');
      await run(page, () => {
        const btns = document.querySelectorAll('#cloud-connected-section button');
        for (const b of btns) if (b.textContent.includes('退出')) { b.click(); return; }
      });
      await wait(page, 2000);
    }

    // 界面输入 → 点击登录（page.fill 模拟真实输入，click 触发表单的 onclick）
    await page.fill('#cloud-email', CFG.email);
    await page.fill('#cloud-password', CFG.password);
    await wait(page, 100);
    await run(page, () => document.getElementById('cloud-login-btn').click());
    await wait(page, 4000);

    const uid = await run(page, ()=>typeof _cloudUserId!=='undefined'?_cloudUserId:'');
    pass('登录成功', uid.length>0);
    check('登录邮箱', await run(page, ()=>_cloudUserEmail||''), CFG.email);

    if (uid) {
      // 点击「同步」按钮
      await run(page, () => {
        const btns = document.querySelectorAll('#cloud-connected-section button');
        for (const b of btns) if (b.textContent.includes('同步')) { b.click(); return; }
      });
      await wait(page, 3000);
    }

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

    async function finishCard() {
      for (let tries = 0; tries < 20; tries++) {
        const r = await page.evaluate(() => {
          const n = document.getElementById('nxtbtn');
          if (n && n.classList.contains('show') && !n.disabled) { n.click(); return 'ok'; }
          const f = document.getElementById('screen-finish');
          if (f && f.classList.contains('active')) return 'finish';
          return null;
        });
        if (r === 'ok') { await waitRender(); return; }
        if (r === 'finish') return;
        await wait(page, 100);
      }
    }

    if (inQ) {
      const strategies = ['good','hard','again','good','good','good'];
      for (let i = 0; i < strategies.length; i++) {
        for (let tries = 0; tries < 20; tries++) {
          const ready = await page.evaluate(() => {
            const opts = document.querySelectorAll('.opt').length;
            return opts > 0 && !revealed ? 'ready' : opts > 0 && revealed ? 'revealed' : 'noopts';
          });
          if (ready === 'ready') break;
          if (ready === 'revealed') { await wait(page, 100); continue; }
          await wait(page, 100);
        }
        await doCard(strategies[i]);
        await finishCard();
      }
    }

    // 验证 Day1 状态
    const d1st = await run(page, () => new Promise(res => {
      const r=indexedDB.open('yihai_srs',3);
      r.onsuccess=e=>{
        const db=e.target.result;
        const tx=db.transaction('card_states','readonly');
        const g=tx.objectStore('card_states').getAll();
        g.onsuccess=()=>{
          const st=(g.result||[]).filter(s=>s.deck_key==='__builtin_test__');
          const stages={}; st.forEach(s=>{stages[s.srs_stage]=(stages[s.srs_stage]||0)+1});
          const t2=db.transaction('trials','readonly');
          const g2=t2.objectStore('trials').getAll();
          g2.onsuccess=()=>{
            const tr=(g2.result||[]).filter(t=>t.deck_key==='__builtin_test__');
            const ratings={}; tr.forEach(t=>{if(t.rating)ratings[t.rating]=(ratings[t.rating]||0)+1});
            res({stages, trials:tr.length, ratings});
          };
        };
      };
    }));
    console.log(`  Day1 后: ${JSON.stringify(d1st)}`);
    pass('SRS 状态已变更', Object.keys(d1st.stages).some(k => k !== 'new'));

    // 回首页
    await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('返回首页')){x.click();return} });
    await wait(page, 500);

    // ── DAY 2 ──
    await run(page, () => { window.__fakeToday = '2026-05-06'; });
    await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('开始练习')){x.click();return} });
    await wait(page, 1500);

    const d2 = await run(page, () => document.getElementById('screen-quiz').classList.contains('active'));
    console.log(`  Day2 到期: ${d2}`);
    if (d2) {
      for (let i = 0; i < 15; i++) {
        const s = await run(page, () => document.getElementById('screen-quiz').classList.contains('active'));
        if (!s) break;
        let ready = false;
        for (let t = 0; t < 10; t++) {
          const r = await run(page, () => document.querySelectorAll('.opt').length > 0 && !revealed);
          if (r) { ready = true; break; }
          await wait(page, 100);
        }
        if (!ready) break;
        await clickByIdx(0);
        await wait(page, 50);
        await waitWrite();
        let nxt = false;
        for (let t = 0; t < 10; t++) {
          const r = await run(page, () => {
            const n = document.getElementById('nxtbtn');
            if (n && n.classList.contains('show') && !n.disabled) { n.click(); return true; }
            return false;
          });
          if (r) { nxt = true; break; }
          await wait(page, 100);
        }
        if (nxt) await waitRender(); else break;
      }
    }

    await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('返回首页')){x.click();return} });
    await wait(page, 300);

    // ═══════════════════ PHASE 4: 最终验证 ═══════════════════
    section('PHASE 4: 验证');

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
    pass('有 SRS 状态', finalSt.states > 0);
    pass('有答题记录', finalSt.trials > 0);
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
  process.exit(failed > 0 ? 1 : 0);
})();
