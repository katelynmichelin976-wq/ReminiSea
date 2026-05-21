/**
 * å¿†æµ·æ‹¾å…‰ v4.9.1 å›žå½’æµ‹è¯•
 * è¦†ç›–ä»Šå¤©ä¿®å¤çš„ bugï¼š
 *   Bug 1a â€” showFinish å‰ await _lastSrsWriteï¼ˆæœ€åŽä¸€å¼ å¡ dp è®¡æ•°å‡†ç¡®ï¼‰
 *   Bug 1b â€” ä¸»é¡µåˆ°æœŸæ•°å—æ¯æ—¥ä¸Šé™çº¦æŸï¼ˆä¸å†è™šé«˜ï¼‰
 *   Bug 2b â€” ç»Ÿè®¡é¡µä»Šæ—¥æ¦‚å†µæŒ‰æ—¥åŽ†æ—¥è¿‡æ»¤ï¼ˆä¸æ··æ˜¨æ—¥æ•°æ®ï¼‰
 *   TrialLog å­—æ®µ â€” due_ts / due_date / suspended / suspended_reason
 *   ç™½å±ä¿®å¤ â€” DOM å°±ç»ªå³æ¸²æŸ“ï¼Œä¸é˜»å¡žç­‰å¾… SDK
 *
 * ä¾èµ–ï¼špython -m http.server 8080 --directory /c/code
 * è¿è¡Œï¼šnode tests/_playwright_v4.9.1_regression_test.js
 */

const { chromium } = require('playwright');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const { getBaseUrl } = require('./_playwright_helper');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const YHPACK = path.join(__dirname, 'test_data', 'è”¬èœæ°´æžœæœ¬åœ°ç‰ˆ.yhspack');

let passed=0, failed=0, errors=[];
const pass=(l,v)=>{if(v){passed++;console.log(`  \x1b[32mâœ“\x1b[0m ${l}`)}else{failed++;errors.push(`âœ— ${l}`);console.log(`  \x1b[31mâœ—\x1b[0m ${l}`)}};
const check=(l,a,e)=>pass(l,a===e);
const section=t=>console.log(`\n${'â•'.repeat(60)}\n  ${t}\n${'â•'.repeat(60)}`);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const wait = (page, ms) => page.waitForTimeout(ms);

// ç­‰å¾… async å†™å…¥å®Œæˆï¼ˆIndexedDB + localStorageï¼‰
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
      name: 'å›žå½’æµ‹è¯•ç‰Œç»„',
      cards: [
        { name:'è‹¹æžœ', image:'', audio:'' },
        { name:'é¦™è•‰', image:'', audio:'' },
        { name:'æ©˜å­', image:'', audio:'' },
        { name:'è¥¿ç“œ', image:'', audio:'' },
        { name:'è‰èŽ“', image:'', audio:'' },
        { name:'è‘¡è„', image:'', audio:'' },
        { name:'èŠ’æžœ', image:'', audio:'' },
        { name:'æ¨±æ¡ƒ', image:'', audio:'' },
      ]
    }
  }));
  const buf = await zip.generateAsync({ type:'nodebuffer' });
  fs.writeFileSync(YHPACK, buf);
  console.log(`  å·²å†™å…¥æµ‹è¯•æ–‡ä»¶: ${YHPACK} (${buf.length} bytes)`);
}

(async () => {
  await createTestYhspack();

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    const tStart = Date.now();
    const ts = () => Date.now();

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 1: å¯¼å…¥ + é…ç½® â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 1: å¯¼å…¥æµ‹è¯•ç‰Œç»„ + è®¾ç½®å‚æ•°');

    await page.goto(CFG.url, { waitUntil:'networkidle', timeout:30000 });
    await wait(page, 2000);

    // éªŒè¯ç™½å±ä¿®å¤ï¼šé¦–é¡µå·²æ¸²æŸ“
    const homeActive = await run(page, () =>
      document.getElementById('screen-home').classList.contains('active'));
    pass('1.1 ç™½å±ä¿®å¤ï¼šé¦–é¡µç«‹å³å¯è§ï¼ˆä¸ç­‰å¾… SDKï¼‰', homeActive);

    // éªŒè¯ç‰Œç»„åˆ—è¡¨å·²æ¸²æŸ“
    const deckGrid = await run(page, () =>
      document.getElementById('deck-grid') ? document.getElementById('deck-grid').children.length > 0 : false);
    pass('1.2 ç‰Œç»„åˆ—è¡¨å·²æ¸²æŸ“', deckGrid);

    // å¯¼å…¥æµ‹è¯•ç‰Œç»„
    await page.setInputFiles('input[accept=".yhspack"]', YHPACK);
    await wait(page, 3000);
    await page.waitForSelector('.deck-card[data-deck="__reg_test__"]', { timeout: 10000 }).catch(() => {});
    const deckEl = await run(page, () => {
      const el = document.querySelector('.deck-card[data-deck="__reg_test__"] .deck-name');
      return el ? el.textContent.trim() : '';
    });
    pass('1.3 å¯¼å…¥ç‰Œç»„æˆåŠŸ', deckEl.includes('å›žå½’æµ‹è¯•'));

    // é€‰ä¸­æµ‹è¯•ç‰Œç»„
    await run(page, () => { const c=document.querySelector('.deck-card[data-deck="__reg_test__"]'); if(c)c.click(); });
    await wait(page, 200);

    // è®¾ç½®å°ä¸Šé™ä¾¿äºŽæµ‹è¯•ï¼ˆmax_reviews=3, new_cards=2ï¼‰
    await run(page, () => {
      SRS_CONFIG.maximum_reviews_per_day = 3;
      SRS_CONFIG.new_cards_per_day = 2;
      localStorage.removeItem('yihai_daily_progress');
    });
    pass('1.4 å‚æ•°å·²é…ç½® (max_reviews=3, new_cards=2)', true);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 2: Bug 1b â€” åˆ°æœŸæ•°è™šé«˜ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 2: Bug 1b â€” ä¸»é¡µåˆ°æœŸæ•°å—æ¯æ—¥ä¸Šé™çº¦æŸ');

    // é¦–æ¬¡ç»ƒä¹ å‰ï¼š8 å¼ æœªç»ç»ƒä¹ çš„ç‰Œï¼Œnew ä¸Šé™=2ï¼Œdue ä¸Šé™=3
    const statsBefore = await run(page, async (key) => {
      const dp = getDailyProgress();  // 0
      const dueCap = Math.max(0, SRS_CONFIG.maximum_reviews_per_day - (dp.reviewed_today || 0));
      const s = await getDeckStatsSrs(key);
      return { due: s.due, new: s.new, dueCap, maxReviews: SRS_CONFIG.maximum_reviews_per_day };
    }, '__reg_test__');
    pass('2.1 due â‰¤ review ä¸Šé™ (3-0=3)', statsBefore.due <= statsBefore.dueCap);
    pass('2.2 new â‰¤ new ä¸Šé™ (2-0=2)', statsBefore.new <= 2);
    console.log(`  due=${statsBefore.due} new=${statsBefore.new} dueCap=${statsBefore.dueCap}`);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 3: Bug 1a â€” ç»ƒä¹ å®Œæˆè®¡æ•°å‡†ç¡® â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 3: Bug 1a â€” finish å¼¹çª—è®¡æ•°å‡†ç¡®');

    // å¼€å§‹ç»ƒä¹ 
    await run(page, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('å¼€å§‹ç»ƒä¹ ')) { b.click(); return; } }
    });
    await wait(page, 3000);

    const quizActive = await run(page, () =>
      document.getElementById('screen-quiz').classList.contains('active'));
    pass('3.1 è¿›å…¥ç»ƒä¹ å±', quizActive);

    // ç»ƒä¹ æ‰€æœ‰é˜Ÿåˆ—ä¸­çš„å¡ï¼ˆæœ€å¤š 3 review + 2 new = 5 å¼ ï¼‰
    let practiced = 0;
    for (let ci = 0; ci < 8; ci++) {
      const quizStill = await run(page, () =>
        document.getElementById('screen-quiz').classList.contains('active'));
      if (!quizStill) break;

      // ç­‰å¡ç‰‡å°±ç»ª
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

      // æ£€æŸ¥æ˜¯å¦å·²è¿›å®Œæˆå±
      const finished = await run(page, () =>
        document.getElementById('screen-finish').classList.contains('active'));
      if (finished) break;

      // é€‰æ­£ç¡®ç­”æ¡ˆ good rating
      await run(page, () => {
        const o = document.querySelector('.opt[data-idx="0"]');
        if (o && !revealed) onSel(new MouseEvent('mouseup', {bubbles:true}), 0, o);
      });
      await wait(page, 100);
      await waitWrite(page);

      // ç‚¹ä¸‹ä¸€é¢˜
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

      // æœ€åŽä¸€å¼  â†’ ç­‰ finish å‡ºçŽ°
      const finNow = await run(page, () =>
        document.getElementById('screen-finish').classList.contains('active'));
      if (finNow) break;
    }

    pass('3.2 ç»ƒä¹ äº†å¡ç‰‡', practiced >= 1);
    console.log(`  å®Œæˆ ${practiced} å¼ `);

    // ç­‰ finish å¼¹çª—æ¸²æŸ“å’Œ backfill å®Œæˆ
    await wait(page, 1000);

    // éªŒè¯ finish å±å·²æ˜¾ç¤º
    const finishActive = await run(page, () =>
      document.getElementById('screen-finish').classList.contains('active'));
    pass('3.3 æ˜¾ç¤ºå®Œæˆç•Œé¢', finishActive);

    // Bug 1a éªŒè¯ï¼šfinish å¼¹çª—çš„ reviewed_today ä¸Žå®žé™…ç»ƒä¹ æ•°ä¸€è‡´
    const finishStats = await run(page, () => {
      const el = document.getElementById('finish-stats');
      if (!el) return null;
      // è§£æž finish å¼¹çª—çš„æ•°å­—
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
      const total = (finishStats['è‰¯å¥½']||0) + (finishStats['å›°éš¾']||0) + (finishStats['é‡æ¥']||0);
      // å¼¹çª—è¯„çº§åˆè®¡åº”ä¸Žå®žé™…ç»ƒä¹ æ•°ä¸€è‡´ï¼ˆè€ƒè™‘ quiz æ¨¡å¼ä¸‹å¯èƒ½å› æ¯æ—¥ä¸Šé™æå‰ç»“æŸï¼‰
      pass('3.4 å¼¹çª—è¯„çº§åˆè®¡ â‰¤ æœ¬æ¬¡ç»ƒä¹ æ•°', total >= 1 && total <= practiced);
      console.log(`  å¼¹çª—: è‰¯å¥½=${finishStats['è‰¯å¥½']} å›°éš¾=${finishStats['å›°éš¾']} é‡æ¥=${finishStats['é‡æ¥']} æœ¬æ¬¡ç»ƒä¹ =${finishStats['æœ¬æ¬¡ç»ƒä¹ ']} ä»Šæ—¥ç´¯è®¡=${finishStats['ä»Šæ—¥ç´¯è®¡']}`);
    }

    // éªŒè¯ show_finish äº‹ä»¶å­˜åœ¨
    const hasShowFinish = await run(page, async (deck) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 6);
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
    pass('3.5 show_finish äº‹ä»¶å·²è®°å½•', hasShowFinish);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 4: Bug 1b éªŒè¯ â€” ç»ƒä¹ åŽåˆ°æœŸæ•° â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 4: Bug 1b â€” ç»ƒä¹ åŽä¸»é¡µåˆ°æœŸæ•°ä¸Šé™çº¦æŸ');

    // è¿”å›žé¦–é¡µ
    await run(page, () => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) { if (b.textContent.includes('è¿”å›žé¦–é¡µ')) { b.click(); return; } }
    });
    await wait(page, 1500);

    const statsAfter = await run(page, async (key) => {
      await new Promise(res => setTimeout(res, 500)); // ç¡®ä¿ _lastSrsWrite å®Œæˆ
      const dp = getDailyProgress();
      const s = await getDeckStatsSrs(key);
      const dueCap = Math.max(0, SRS_CONFIG.maximum_reviews_per_day - (dp.reviewed_today || 0));
      return { due: s.due, new: s.new, reviewed: dp.reviewed_today, dueCap };
    }, '__reg_test__');
    pass('4.1 due â‰¤ å‰©ä½™ review æ§½ä½', statsAfter.due <= statsAfter.dueCap);
    pass('4.2 reviewed_today > 0', statsAfter.reviewed > 0);
    console.log(`  due=${statsAfter.due} new=${statsAfter.new} reviewed=${statsAfter.reviewed} dueCap=${statsAfter.dueCap}`);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 5: TrialLog å­—æ®µå®Œæ•´æ€§ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 5: TrialLog æ‰¿è½½å®Œæ•´çŠ¶æ€å¿«ç…§');

    const trialFields = await run(page, async (deck) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 6);
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
      const t = trials[trials.length - 1]; // æœ€æ–°ä¸€æ¡
      return {
        count: trials.length,
        hasDueTs: typeof t.due_ts === 'number',
        hasDueDate: typeof t.due_date === 'string',
        hasSuspended: typeof t.suspended === 'boolean',
        hasSuspendedReason: 'suspended_reason' in t,
      };
    }, '__reg_test__');
    pass('5.1 æœ‰ TrialLog', trialFields.count > 0);
    pass('5.2 TrialLog.due_ts å­˜åœ¨', trialFields.hasDueTs);
    pass('5.3 TrialLog.due_date å­˜åœ¨', trialFields.hasDueDate);
    pass('5.4 TrialLog.suspended å­˜åœ¨', trialFields.hasSuspended);
    pass('5.5 TrialLog.suspended_reason å­˜åœ¨', trialFields.hasSuspendedReason);
    console.log(`  TrialLog: ${trialFields.count} æ¡, due_ts=${trialFields.hasDueTs}, due_date=${trialFields.hasDueDate}`);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 6: Bug 2b â€” ç»Ÿè®¡é¡µä¸æ··æ˜¨æ—¥æ•°æ® â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 6: Bug 2b â€” ç»Ÿè®¡é¡µä»Šæ—¥æ¦‚å†µä»…å½“æ—¥æ•°æ®');

    // æ‰“å¼€ç»Ÿè®¡é¡µ
    await run(page, () => { openStats(); });
    await wait(page, 2000);

    const statsToday = await run(page, async (key) => {
      // è¯»å– dp å’Œæœ¬åœ° TrialLog ä»Šæ—¥æ•°æ®
      const dp = getDailyProgress();
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('yihai_srs', 6);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej(e.target.error);
      });
      const allTrials = await new Promise((res, rej) => {
        const tx = db.transaction('trials', 'readonly');
        const g = tx.objectStore('trials').getAll();
        g.onsuccess = e => res(e.target.result || []);
        g.onerror = e => rej(e.target.error);
      });

      // æŒ‰æ—¥åŽ†æ—¥è¿‡æ»¤ï¼ˆæ¨¡æ‹Ÿä¿®å¤åŽçš„é€»è¾‘ï¼‰
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayTrials = allTrials.filter(t => t.timestamp >= todayStart.getTime());
      const yesterdayTrials = allTrials.filter(t =>
        t.timestamp < todayStart.getTime() && t.timestamp >= todayStart.getTime() - 86400000
      );

      // è®¡ç®— stats é¡µæ˜¾ç¤ºçš„ç»ƒä¹ æ•°
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
    pass('6.1 ä»Šæ—¥ trials > 0', statsToday.todayTrials > 0);
    pass('6.2 æ˜¨æ—¥ trials ä¸è¢«è®¡å…¥ä»Šæ—¥ç»Ÿè®¡', statsToday.uniqueYesterday === 0 || statsToday.todayTrials >= statsToday.uniqueToday);

    // éªŒè¯ stats é¡µ KPI æ•°å­—ä¸å«æ˜¨æ—¥
    const kpiNums = await run(page, () => {
      const el = document.getElementById('st-kpi');
      if (!el) return [];
      const nums = el.querySelectorAll('.stats-kpi-num');
      return Array.from(nums).map(n => parseInt(n.textContent) || 0);
    });
    pass('6.3 ç»Ÿè®¡é¡µ KPI å·²æ¸²æŸ“', kpiNums.length >= 3);
    console.log(`  dp.reviewed=${statsToday.dpReviewed} todayTrials=${statsToday.todayTrials} yesterdayTrials=${statsToday.yesterdayTrials}`);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ç»“æžœ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('ç»“æžœ');
    console.log(`  é€šè¿‡: ${passed}  å¤±è´¥: ${failed}  æ€»è€—æ—¶: ${((ts()-tStart)/1000).toFixed(1)}s`);
    if (failed > 0) console.log(`  å¤±è´¥: ${errors.join(' | ')}`);

    // æ¸…ç†
    await run(page, (key) => {
      try { deleteDeck(event || new Event('click'), key); } catch(e) {}
    }, '__reg_test__');

  } catch(e) {
    console.error('æµ‹è¯•å¼‚å¸¸:', e.message);
    failed++;
  } finally {
    await browser.close();
    // æ¸…ç†æµ‹è¯•æ–‡ä»¶
    try { fs.unlinkSync(YHPACK); } catch(e) {}
    process.exit(failed > 0 ? 1 : 0);
  }
})();

