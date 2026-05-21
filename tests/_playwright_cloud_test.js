/**
 * å¿†æµ·æ‹¾å…‰ äº‘ç«¯åŒæ­¥å›žå½’æµ‹è¯•ï¼ˆç™»å½• â†’ ç»ƒä¹  â†’ é…ç½®åŒæ­¥ â†’ åˆ·æ–°æ¢å¤ â†’ é€€å‡ºï¼‰
 *
 * ä¾èµ–ï¼š
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node tests/_playwright_cloud_test.js
 *
 * è¦†ç›–ï¼šç™»å½• â†’ ä¸‹è½½ç‰Œç»„ â†’ ç»ƒä¹  â†’ é…ç½® â†’ åˆ·æ–°æ¢å¤ â†’ å¤šè®¾å¤‡ â†’ é€€å‡º
 * åˆå¹¶è‡ªï¼šåŽŸ _playwright_cloud_test.js + _playwright_session_restore_test.jsï¼ˆv4.10.1ï¼‰
 */
const { chromium } = require('playwright');
const helper = require('./_playwright_helper');
const { pass, check, section, wait, run, getBaseUrl } = helper;
// cloud_test & session_restore å…± 17+8=25 æ–­è¨€

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const TEST_DECK_NAME = 'è”¬èœæ°´æžœ';
const CLOUD_DECK_KEY = 'cloud_01edbdfd';
const CARD_COUNT = 33;

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: è¯·è®¾ç½® TEST_PASSWORD çŽ¯å¢ƒå˜é‡'); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', msg => { /* ignore */ });
  page.on('pageerror', err => console.log(`  [PAGE ERROR] ${err.message}`));

  try {
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 1: ç™»å½• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 1: ç™»å½•');
    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    pass('ç™»å½•æˆåŠŸï¼Œæ˜¾ç¤ºå·²è¿žæŽ¥ç•Œé¢', await helper.cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));

    pass('æ˜¾ç¤ºç™»å½•é‚®ç®±', (await run(page, () => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    })).includes(TEST_EMAIL));

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 2: ä¸‹è½½äº‘ç«¯ç‰Œç»„ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 2: ä¸‹è½½äº‘ç«¯ç‰Œç»„');
    await helper.closeSettings(page);

    await run(page, async (name) => {
      try {
        const { data: decks } = await _sb.from('server_decks').select('id,name').order('name');
        if (!decks) return;
        const sd = decks.find(d => d.name === name);
        if (sd) {
          if (DECKS_META.find(m => m.name === sd.name)) await syncDeckFromCloud(sd.id, sd.name);
          else await downloadDeckFromCloud(sd.id, sd.name);
        }
      } catch(e) { console.warn('[test] deck sync error:', e.message); }
    }, TEST_DECK_NAME);
    await wait(page, 10000);

    let deckFound = false;
    for (let i = 0; i < 30; i++) {
      deckFound = await run(page, (name) => {
        const cards = document.querySelectorAll('.deck-card');
        for (const c of cards) {
          const el = c.querySelector('.deck-name');
          if (el && el.textContent.includes(name)) return true;
        }
        return false;
      }, TEST_DECK_NAME);
      if (deckFound) break;
      await wait(page, 500);
    }
    pass('äº‘ç«¯ç‰Œç»„å‡ºçŽ°åœ¨é¦–é¡µåˆ—è¡¨', deckFound);

    const deckData = await run(page, (name) => {
      const meta = (DECKS_META || []).find(m => m.name === name);
      if (!meta) return null;
      return { key: meta.key, cardCount: (DECKS[meta.key] || []).length };
    }, TEST_DECK_NAME);
    pass('DECKS_META åŒ…å«ç‰Œç»„', deckData !== null);
    check(`${CARD_COUNT} å¼ å¡ç‰‡`, deckData && deckData.cardCount, CARD_COUNT);
    console.log(`  key: ${deckData ? deckData.key : 'N/A'}, å¡ç‰‡: ${deckData ? deckData.cardCount : 0}`);

    await run(page, (key) => {
      const c = document.querySelector(`.deck-card[data-deck="${key}"]`);
      if (c) c.click();
    }, CLOUD_DECK_KEY);
    await wait(page, 300);

    check('currentDeck ä¸ºäº‘ç«¯ç‰Œç»„', await run(page, () => currentDeck), CLOUD_DECK_KEY);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 3: ç»ƒä¹ å¹¶éªŒè¯åŒæ­¥ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 3: ç»ƒä¹ å¹¶éªŒè¯åŒæ­¥');

    const uid = await run(page, () => _cloudUserId);
    await run(page, async (u, dk) => {
      await _sb.from('sync_card_states').delete().eq('user_id', u).eq('deck_key', dk);
    }, uid, CLOUD_DECK_KEY);
    await run(page, (dk) => new Promise((res) => {
      const r = indexedDB.open('yihai_srs', 6);
      r.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction('card_states', 'readwrite');
        const req = tx.objectStore('card_states').getAll();
        req.onsuccess = () => {
          (req.result || []).filter(s => s.deck_key === dk).forEach(s => tx.objectStore('card_states').delete(s.state_key));
          res();
        };
      };
    }), CLOUD_DECK_KEY);
    await run(page, () => localStorage.removeItem('yihai_daily_progress'));
    console.log('  æ—§çŠ¶æ€+DP å·²æ¸…ç†');

    await run(page, () => {
      for (const b of document.querySelectorAll('button')) { if (b.textContent.includes('å¼€å§‹ç»ƒä¹ ')) { b.click(); return; } }
    });
    await wait(page, 5000);

    pass('è¿›å…¥ç»ƒä¹ å±', await run(page, () =>
      document.getElementById('screen-quiz').classList.contains('active')));

    let practiced = 0;
    for (let ci = 0; ci < 5; ci++) {
      if (!await run(page, () => document.getElementById('screen-quiz').classList.contains('active'))) break;

      let ready = false;
      for (let t = 0; t < 20; t++) {
        const r = await run(page, () => {
          if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
          return document.querySelectorAll('.opt').length > 0 ? 'ready' : null;
        });
        if (r === 'finish' || r === 'ready') { ready = true; break; }
        await wait(page, 100);
      }
      if (!ready) break;

      const strat = ci < 2 ? 'good' : 'hard';
      if (strat === 'good') {
        await run(page, () => {
          for (const b of document.querySelectorAll('.opt')) if (parseInt(b.dataset.idx) === 0) { onSel(new MouseEvent('mouseup',{bubbles:true}), 0, b); return; }
        });
        await wait(page, 50);
        await run(page, async () => { if (_lastSrsWrite) await _lastSrsWrite; });
      } else {
        const wrongs = await run(page, () => {
          const avail = [];
          for (const b of document.querySelectorAll('.opt')) { const idx = parseInt(b.dataset.idx); if (idx !== 0 && !b.style.pointerEvents) avail.push(idx); }
          return avail;
        });
        if (wrongs.length > 0) {
          await run(page, (idx) => { for (const b of document.querySelectorAll('.opt')) if (parseInt(b.dataset.idx) === idx) { onSel(new MouseEvent('mouseup',{bubbles:true}), idx, b); return; } }, wrongs[0]);
          await wait(page, 400);
        }
        await run(page, () => {
          for (const b of document.querySelectorAll('.opt')) if (parseInt(b.dataset.idx) === 0) { onSel(new MouseEvent('mouseup',{bubbles:true}), 0, b); return; }
        });
        await wait(page, 50);
        await run(page, async () => { if (_lastSrsWrite) await _lastSrsWrite; });
      }

      let done = false;
      for (let t = 0; t < 20; t++) {
        const r = await run(page, () => {
          const nxt = document.getElementById('nxtbtn');
          if (nxt && nxt.classList.contains('show') && !nxt.disabled) { nxt.click(); return 'ok'; }
          if (document.getElementById('screen-finish').classList.contains('active')) return 'finish';
          return null;
        });
        if (r === 'ok') { done = true; break; }
        if (r === 'finish') { practiced++; done = true; break; }
        await wait(page, 100);
      }
      if (!done) break;
      practiced++;
    }
    pass('ç»ƒä¹ äº†å¡ç‰‡', practiced >= 2);
    console.log(`  å®Œæˆ ${practiced} å¼ `);

    await run(page, () => {
      for (const b of document.querySelectorAll('button')) { if (b.textContent.includes('è¿”å›žé¦–é¡µ')) { b.click(); return; } }
    });
    await wait(page, 500);

    const localData = await run(page, (key) => new Promise(res => {
      const r = indexedDB.open('yihai_srs', 6);
      r.onsuccess = e => {
        const db = e.target.result;
        const g1 = db.transaction('card_states', 'readonly').objectStore('card_states').getAll();
        g1.onsuccess = () => {
          const states = (g1.result || []).filter(s => s.deck_key === key);
          const g2 = db.transaction('trials', 'readonly').objectStore('trials').getAll();
          g2.onsuccess = () => {
            const trials = (g2.result || []).filter(t => t.deck_key === key);
            res({ states: states.length, trials: trials.length });
          };
        };
      };
    }), CLOUD_DECK_KEY);
    pass('æœ¬åœ°æœ‰ CardState', localData.states > 0);
    pass('æœ¬åœ°æœ‰ TrialLog', localData.trials > 0);
    console.log(`  CardState: ${localData.states} æ¡, TrialLog: ${localData.trials} æ¡`);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 4: é…ç½®åŒæ­¥ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 4: å‚æ•°é…ç½®åŒæ­¥');
    await helper.openSettingsTab(page, 'SRS');

    const origNewPerDay = await run(page, () => SRS_CONFIG.new_cards_per_day);
    console.log(`  åŽŸ new_cards_per_day = ${origNewPerDay}`);
    const testNewVal = origNewPerDay === 5 ? 3 : 5;
    await run(page, ({ key, val }) => { saveSrsConfigKey(key, val); }, { key: 'new_cards_per_day', val: testNewVal });
    await wait(page, 1500);
    check('æœ¬åœ°é…ç½®å·²æ›´æ–°', await run(page, () => SRS_CONFIG.new_cards_per_day), testNewVal);
    await run(page, () => runSync({ deckKey: currentDeck, modal: false, decks: false, showToast: false }).catch(e => console.warn('[test] sync cfg:', e.message)));
    await wait(page, 4000);
    console.log(`  å·²æŽ¨é€é…ç½® (new_cards_per_day: ${testNewVal})`);
    await run(page, ({ key, val }) => { saveSrsConfigKey(key, val); }, { key: 'new_cards_per_day', val: origNewPerDay });
    await wait(page, 1500);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 5: åˆ·æ–°åŽç™»å½•æ¢å¤ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // åˆå¹¶è‡ª _playwright_session_restore_test.js â€” æ”¾åœ¨å¤šè®¾å¤‡ä¹‹å‰ï¼Œé¿å…å¤šè®¾å¤‡å¹²æ‰° session
    section('PHASE 5: åˆ·æ–°åŽç™»å½•æ¢å¤');
    console.log('  æ­£åœ¨ reload...');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1000);

    pass('åˆ·æ–°åŽ UI å·²æ¸²æŸ“', !!await run(page, () => {
      const v = document.querySelector('.home-version');
      return v ? v.textContent : null;
    }));

    // æ‰“å¼€è®¾ç½® â†’ äº‘ç«¯ Tab è§¦å‘ updateCloudTabUI()ï¼ˆsession restore ä»…åœ¨åˆ‡æ¢åˆ°äº‘ç«¯ Tab æ—¶æ›´æ–° UIï¼‰
    await run(page, () => {
      const b = document.querySelector('[aria-label="è®¾ç½®"]');
      if (b) b.click();
    });
    await wait(page, 500);
    await run(page, () => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('äº‘ç«¯')) { t.click(); return; } }
    });
    await wait(page, 500);

    let restored = false;
    for (let i = 0; i < 30; i++) {
      restored = await run(page, () => {
        const s = document.getElementById('cloud-connected-section');
        return s && window.getComputedStyle(s).display !== 'none';
      });
      if (restored) break;
      await wait(page, 500);
    }
    pass('åˆ·æ–°åŽè‡ªåŠ¨æ¢å¤ç™»å½•ï¼Œæ˜¾ç¤ºå·²è¿žæŽ¥ç•Œé¢', restored);

    pass('åˆ·æ–°åŽé‚®ç®±æ˜¾ç¤ºæ­£ç¡®', (await run(page, () => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    })).includes(TEST_EMAIL));

    pass('åˆ·æ–°åŽç‰Œç»„åˆ—è¡¨ä¸ä¸ºç©º', await run(page, () => document.querySelectorAll('.deck-card').length > 0));

    pass('åˆ·æ–°åŽä¸æ˜¾ç¤ºç©ºçŠ¶æ€å ä½', !await run(page, () => {
      const el = document.querySelector('.empty-state');
      return el && window.getComputedStyle(el).display !== 'none';
    }));

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 6: å¤šè®¾å¤‡ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 6: å¤šè®¾å¤‡åŒæ­¥ï¼ˆæ·±è‰²æ¨¡å¼ï¼‰');

    const deviceAThemeBefore = await run(page, () => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    console.log(`  Device A å½“å‰ä¸»é¢˜: ${deviceAThemeBefore}`);
    const targetTheme = deviceAThemeBefore === 'dark' ? 'light' : 'dark';

    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page2 = await ctx2.newPage();
    await page2.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page2, 2000);

    await helper.openSettingsTab(page2, 'äº‘ç«¯');
    const e2 = await page2.$('#cloud-email');
    if (e2) { await e2.fill(''); await e2.fill(TEST_EMAIL); }
    await page2.fill('#cloud-password', TEST_PASSWORD);
    await run(page2, () => { const b = document.getElementById('cloud-login-btn'); if (b) b.click(); });
    await wait(page2, 5000);
    let connected2 = false;
    for (let i = 0; i < 30; i++) {
      connected2 = await run(page2, () => {
        const sec = document.getElementById('cloud-connected-section');
        return sec && window.getComputedStyle(sec).display !== 'none';
      });
      if (connected2) break;
      await wait(page2, 500);
    }
    pass('Device B ç™»å½•æˆåŠŸ', connected2);
    await helper.waitSyncModal(page2, 40);

    console.log(`  Device B åˆå§‹ä¸»é¢˜: ${await run(page2, () => document.documentElement.classList.contains('dark') ? 'dark' : 'light')}`);

    await run(page, () => {
      const tog = document.getElementById('dark-toggle');
      if (tog) tog.checked = !tog.checked;
      toggleTheme(document.getElementById('dark-toggle'));
    });
    await wait(page, 1500);
    console.log(`  Device A åˆ‡æ¢ä¸º: ${targetTheme}`);

    pass('Device A é…ç½®æŽ¨é€æˆåŠŸ', await run(page, async () => { try { await cloudPushConfig(); return true; } catch(e) { return false; } }));
    await run(page2, () => cloudPullConfig().catch(e => console.warn('[test] B pull:', e.message)));
    await wait(page2, 2000);

    const deviceBTheme = await run(page2, () => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    pass(`Device B ä¸»é¢˜å·²åŒæ­¥ä¸º ${targetTheme}`, deviceBTheme === targetTheme);
    console.log(`  Device B ä¸»é¢˜: ${deviceBTheme}`);
    await page2.close();
    await ctx2.close();

    await run(page, () => {
      const tog = document.getElementById('dark-toggle');
      if (tog) tog.checked = !tog.checked;
      toggleTheme(document.getElementById('dark-toggle'));
    });
    await wait(page, 1000);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 7: é€€å‡º â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 7: é€€å‡ºç™»å½•');
    const { loggedOut, syncDisabled } = await helper.cloudLogout(page);
    pass('é€€å‡ºåŽæ˜¾ç¤ºç™»å½•è¡¨å•', loggedOut);
    pass('_syncEnabled ä¸º false', syncDisabled);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ç»“æžœ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('ç»“æžœ');
    const { passed, failed, errors } = helper.getCounts();
    console.log(`  é€šè¿‡: ${passed}  å¤±è´¥: ${failed}`);
    if (failed > 0) console.log(`  å¤±è´¥: ${errors.join(' | ')}`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
  }

  await page.close();
  await browser.close();
  const { failed } = helper.getCounts();
  process.exit(failed > 0 ? 1 : 0);
})();

