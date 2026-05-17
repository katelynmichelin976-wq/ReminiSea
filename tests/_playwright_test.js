/**
 * å¿†æµ·æ‹¾å…‰ v4.8 å›žå½’æµ‹è¯•ï¼ˆå¯è§†åŒ– Â· å•æœºç‰ˆ Â· 10 å¤© SRS éªŒè¯ï¼‰
 * ä¾èµ–ï¼špython -m http.server 8080 --directory /c/code
 * è¿è¡Œï¼šnode _playwright_test.js
 */
const { chromium } = require('playwright');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const { getBaseUrl } = require('./_playwright_helper');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const YHPACK = path.join(__dirname, 'test_data', 'è”¬èœæ°´æžœæœ¬åœ°ç‰ˆ.yhspack');

let passed=0, failed=0, errors=[];
const pass=(l,v)=>{if(v){passed++;console.log(`  âœ“ ${l}`)}else{failed++;errors.push(`âœ— ${l}`);console.log(`  âœ— ${l}`)}};
const check=(l,a,e)=>pass(l,a===e);
const section=t=>console.log(`\n${'â•'.repeat(60)}\n  ${t}\n${'â•'.repeat(60)}`);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const wait = (page, ms) => page.waitForTimeout(ms);

async function createTestYhspack() {
  const zip = new JSZip();
  zip.file('deck.json', JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    deck: {
      id: '__test_import__',
      name: 'è”¬èœæ°´æžœæœ¬åœ°ç‰ˆ',
      cards: [
        { name:'è‹¹æžœ', image:'', audio:'' },
        { name:'é¦™è•‰', image:'', audio:'' },
        { name:'æ©˜å­', image:'', audio:'' },
        { name:'è¥¿ç“œ', image:'', audio:'' },
        { name:'è‰èŽ“', image:'', audio:'' },
      ]
    }
  }));
  const buf = await zip.generateAsync({ type:'nodebuffer' });
  fs.writeFileSync(YHPACK, buf);
  console.log(`  å·²å†™å…¥æµ‹è¯•æ–‡ä»¶: ${YHPACK} (${buf.length} bytes)`);
}

// åŠ æƒéšæœºè¯„çº§ï¼š70% good, 20% hard, 10% again
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
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 1: å¯¼å…¥ .yhspack â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 1: å¯¼å…¥ .yhspack');
    await page.goto(CFG.url, { waitUntil:'networkidle', timeout:30000 });
    await wait(page, 1500);

    await page.setInputFiles('input[accept=".yhspack"]', YHPACK);
    // ç­‰å¾…å¯¼å…¥å®Œæˆï¼šJSZip CDN åŠ è½½ + importYhspack å¼‚æ­¥æ‰§è¡Œ
    await wait(page, 3000);
    // ç­‰å¾…ç‰Œç»„å¡ç‰‡æ¸²æŸ“
    await page.waitForSelector('.deck-card[data-deck="__test_import__"]', { timeout: 10000 }).catch(() => {});
    const deckName = await run(page, () => {
      const el = document.querySelector('.deck-card[data-deck="__test_import__"] .deck-name');
      return el ? el.textContent.trim() : '';
    });
    pass('å¯¼å…¥ç‰Œç»„å‡ºçŽ°åœ¨åˆ—è¡¨', deckName.includes('è”¬èœæ°´æžœæœ¬åœ°ç‰ˆ'));

    await run(page, () => { const c=document.querySelector('.deck-card[data-deck="__test_import__"]'); if(c)c.click(); });
    await wait(page, 300);
    check('currentDeck å·²åˆ‡æ¢', await run(page, () => currentDeck), '__test_import__');

    await run(page, () => { const c=document.querySelector('.deck-card[data-deck="__builtin_test__"]'); if(c)c.click(); });
    await wait(page, 300);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 2: SRS processAnswer â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 2: SRS ç®—æ³•éªŒè¯');
    const T = '2026-05-05';
    check('2.1 new+good â†’ learning',
      (await run(page, d => { const st={srs_stage:'new',interval:0,ease_factor:2.5,due_date:d,due_ts:0,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2a',card_id:'t2a',deck_key:'__test__'}; return processAnswer(st,'good',d); }, T)).srs_stage, 'learning');
    check('2.2 againâ†’step=0',
      (await run(page, d => { const st={srs_stage:'new',interval:0,ease_factor:2.5,due_date:d,due_ts:0,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2b',card_id:'t2b',deck_key:'__test__'}; return processAnswer(st,'again',d); }, T)).step_index, 0);
    check('2.3 learning+goodâ†’review',
      (await run(page, d => { const st={srs_stage:'learning',interval:0,ease_factor:2.5,due_date:d,due_ts:0,step_index:1,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2c',card_id:'t2c',deck_key:'__test__'}; return processAnswer(st,'good',d); }, T)).srs_stage, 'review');
    check('2.4 review+againâ†’relearning',
      (await run(page, a => { const st={srs_stage:'review',interval:10,ease_factor:2.5,due_date:a.fd,due_ts:Date.now()+864000000,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2d',card_id:'t2d',deck_key:'__test__'}; return processAnswer(st,'again',a.d); }, {d:T,fd:'2026-05-15'})).srs_stage, 'relearning');
    check('2.5 review+goodâ‰¥25d',
      (await run(page, d => { const st={srs_stage:'review',interval:10,ease_factor:2.5,due_date:d,due_ts:1000,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2e',card_id:'t2e',deck_key:'__test__'}; return processAnswer(st,'good',d); }, T)).interval >= 25, true);
    check('2.6 review+easy ease=2.65',
      (await run(page, d => { const st={srs_stage:'review',interval:10,ease_factor:2.5,due_date:d,due_ts:1000,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2f',card_id:'t2f',deck_key:'__test__'}; return processAnswer(st,'easy',d); }, T)).ease_factor, 2.65);
    check('2.7 review+hard ease=2.35',
      (await run(page, d => { const st={srs_stage:'review',interval:10,ease_factor:2.5,due_date:d,due_ts:1000,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:0,suspended:false,state_key:'t2g',card_id:'t2g',deck_key:'__test__'}; return processAnswer(st,'hard',d); }, T)).ease_factor, 2.35);
    check('2.8 relearning+goodâ†’review',
      (await run(page, d => { const st={srs_stage:'relearning',interval:0,ease_factor:2.5,due_date:'',due_ts:0,step_index:0,review_mode:'T1',lapses_streak:0,lapses_total:1,suspended:false,state_key:'t2h',card_id:'t2h',deck_key:'__test__'}; return processAnswer(st,'good',d); }, T)).srs_stage, 'review');

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 3: 10 å¤© UI ç»ƒä¹  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 3: 10 å¤©ç»ƒä¹ ï¼ˆmaximum_interval=7ï¼‰');

    // è®¾ç½® AD å‹å¥½å‚æ•°ï¼šæœ€å¤§é—´éš” 7 å¤©
    await run(page, () => { SRS_CONFIG.maximum_interval = 7; });

    await run(page, () => {
      window.__fakeToday = '2026-05-05';
      window.__origToday = todayStr;
      todayStr = function() { return window.__fakeToday; };
    });
    await run(page, () => { const t=document.querySelectorAll('.sheet-tab'); for(const x of t) if(x.textContent.includes('ä»Šæ—¥')){x.click();return} });
    await wait(page, 300);

    await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('å¼€å§‹ç»ƒä¹ ')){x.click();return} });
    await wait(page, 1500);
    pass('è¿›å…¥ç»ƒä¹ å±',
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

    // â”€â”€ 10 å¤©ç»ƒä¹ å¾ªçŽ¯ â”€â”€
    const DAYS = ['2026-05-05','2026-05-06','2026-05-07','2026-05-08','2026-05-09',
                  '2026-05-10','2026-05-11','2026-05-12','2026-05-13','2026-05-14'];
    const DAY_LABELS = ['ä¸€','äºŒ','ä¸‰','å››','äº”','å…­','æ—¥','ä¸€','äºŒ','ä¸‰'];
    let totalCards = 0;

    for (let di = 0; di < DAYS.length; di++) {
      const day = DAYS[di];
      await run(page, d => { window.__fakeToday = d; }, day);
      if (di === 0) {
        // Day1 å·²åœ¨ä»Šæ—¥ tabï¼Œåªéœ€ç‚¹å¼€å§‹ç»ƒä¹ 
        // ï¼ˆä»Ž Phase 2 çš„ä»Šæ—¥ tab åˆ‡è¿‡æ¥çš„çŠ¶æ€ï¼‰
      } else {
        await run(page, () => { const t=document.querySelectorAll('.sheet-tab'); for(const x of t) if(x.textContent.includes('ä»Šæ—¥')){x.click();return} });
        await wait(page, 200);
      }
      await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('å¼€å§‹ç»ƒä¹ ')){x.click();return} });
      await wait(page, 1500);

      const hasCards = await run(page, () => document.getElementById('screen-quiz').classList.contains('active'));
      if (!hasCards) {
        console.log(`  Day${di+1} (${DAY_LABELS[di]}): æ— åˆ°æœŸå¡ç‰‡`);
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

        // åŠ æƒéšæœºè¯„çº§ï¼ˆä½† always ç•™è‡³å°‘ä¸€æ¬¡ good ç¡®ä¿æ¯•ä¸šè·¯å¾„ï¼‰
        const strat = di === 0 && ci < 3
          ? ['good','hard','again'][ci]  // Day1 å‰ 3 å¼ ç¡®å®šæ€§æ··åˆ
          : randRating();
        await doCard(strat);
        const ret = await finishCardOrFinish();
        if (ret === 'finish') break;
        dayCards++;
      }

      console.log(`  Day${di+1} (${DAY_LABELS[di]}): ${dayCards} å¼ `);
      totalCards += dayCards;

      await run(page, () => { const b=document.querySelectorAll('button'); for(const x of b) if(x.textContent.includes('è¿”å›žé¦–é¡µ')){x.click();return} });
      await wait(page, 200);
    }

    pass('10 å¤©ç´¯è®¡ç»ƒä¹  >0', totalCards > 0);
    console.log(`  10 å¤©å…±ç»ƒä¹ : ${totalCards} å¼ æ¬¡`);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 4: 10 å¤©åŽéªŒè¯ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 4: 10 å¤©åŽéªŒè¯');

    const finalSt = await run(page, () => new Promise(res => {
      const r=indexedDB.open('yihai_srs',5);
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
    console.log(`  æœ€ç»ˆ: ${JSON.stringify(finalSt)}`);

    pass('20 å¼ å¡å…¨éƒ¨æœ‰ SRS çŠ¶æ€', finalSt.states === 20);
    pass('æ—  new å¡ï¼ˆå…¨éƒ¨å·²å­¦ä¹ ï¼‰', !finalSt.stages['new'] || finalSt.stages['new'] === 0);
    pass('æœ‰ review é˜¶æ®µå¡ï¼ˆå·²æ¯•ä¸šï¼‰', (finalSt.stages['review']||0) > 0);

    // maximum_interval=7 éªŒè¯
    pass('æœ€å¤§é—´éš” â‰¤ 7ï¼ˆmaximum_interval ç”Ÿæ•ˆï¼‰', finalSt.maxInterval <= 7);
    pass('review å¹³å‡é—´éš”åˆç†ï¼ˆâ‰¥2ï¼‰', finalSt.avgInterval >= 2);

    pass('ç­”é¢˜è®°å½•å……è¶³ï¼ˆâ‰¥60ï¼‰', finalSt.trials >= 60);
    if (finalSt.ratings && Object.keys(finalSt.ratings).length > 0) {
      pass('å« good è¯„çº§', (finalSt.ratings['good']||0)>0);
      pass('å« hard è¯„çº§', (finalSt.ratings['hard']||0)>0);
      pass('å« again è¯„çº§', (finalSt.ratings['again']||0)>0);
    }

    // ç»Ÿè®¡é¡µ
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
    pass('KPI å·²åŠ è½½', Object.keys(kpis).length >= 3);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 5: æ¸…ç† â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 5: æ¸…ç†');
    await run(page, () => { if(window.__origToday)todayStr=window.__origToday; delete window.__fakeToday; delete window.__origToday; }).catch(() => {});
    // æ¸…ç†æœ¬åœ° localStorage æ®‹ç•™
    await run(page, () => {
      localStorage.removeItem('yihai_deck___test_import__');
      const idx = JSON.parse(localStorage.getItem('yihai_decks_index') || '[]');
      const filtered = idx.filter(m => m.key !== '__test_import__');
      localStorage.setItem('yihai_decks_index', JSON.stringify(filtered));
    }).catch(() => {});

    section('ç»“æžœ');
    console.log(`  é€šè¿‡: ${passed}  å¤±è´¥: ${failed}`);
    if (failed > 0) console.log(`  å¤±è´¥: ${errors.join(' | ')}`);
    console.log(`  SRS: ${JSON.stringify(finalSt.stages)}, æœ€å¤§é—´éš”: ${finalSt.maxInterval}, å¹³å‡é—´éš”: ${finalSt.avgInterval}`);
    console.log(`  ç­”é¢˜: ${finalSt.trials}, è¯„çº§: ${JSON.stringify(finalSt.ratings)}`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  await page.close();
  await browser.close();
  console.log(`  æµ‹è¯•æ–‡ä»¶ä¿ç•™: ${YHPACK}`);
  process.exit(failed > 0 ? 1 : 0);
})();
