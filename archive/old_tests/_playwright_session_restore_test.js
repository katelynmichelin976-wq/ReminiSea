/**
 * å¿†æµ·æ‹¾å…‰ â€” åˆ·æ–°é¡µé¢åŽç™»å½•çŠ¶æ€æ¢å¤æµ‹è¯•
 *
 * ä¾èµ–ï¼š
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node tests/_playwright_session_restore_test.js
 *
 * æµ‹è¯•è´¦å·ï¼šzyhacl@gmail.com
 * è¦†ç›–ï¼š
 *   1. é¦–æ¬¡ç™»å½•æˆåŠŸ
 *   2. åˆ·æ–°é¡µé¢ â†’ è‡ªåŠ¨æ¢å¤ç™»å½•çŠ¶æ€
 *   3. åˆ·æ–°åŽ deck åˆ—è¡¨æ­£å¸¸æ˜¾ç¤º
 */

const { chromium } = require('playwright');

const CFG = { url: getBaseUrl() + '?v=' + Date.now() };
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

let passed = 0, failed = 0, errors = [];
const pass = (label, ok) => {
  if (ok) { passed++; console.log(`  âœ“ ${label}`); }
  else    { failed++; errors.push(`âœ— ${label}`); console.log(`  âœ— ${label}`); }
};
const section = (t) => console.log(`\n${'â•'.repeat(56)}\n  ${t}\n${'â•'.repeat(56)}`);
const wait = (pg, ms) => pg.waitForTimeout(ms);

(async () => {
  if (!TEST_PASSWORD) { console.error('FATAL: è¯·è®¾ç½® TEST_PASSWORD çŽ¯å¢ƒå˜é‡'); process.exit(1); }

  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // æ”¶é›†æŽ§åˆ¶å°æ—¥å¿—ä¾¿äºŽè¯Šæ–­
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[sync]') || text.includes('[cloud]') || text.includes('supabase') || msg.type() === 'error')
      logs.push(`[${msg.type()}] ${text}`);
  });

  try {
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 1: é¦–æ¬¡ç™»å½• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 1: é¦–æ¬¡ç™»å½•');

    await page.goto(CFG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    // æ‰“å¼€è®¾ç½® â†’ äº‘ç«¯ Tab
    await page.evaluate(() => {
      const b = document.querySelector('[aria-label="è®¾ç½®"]');
      if (b) b.click();
    });
    await wait(page, 500);

    await page.evaluate(() => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('äº‘ç«¯')) { t.click(); return; } }
    });
    await wait(page, 300);

    pass('ç™»å½•è¡¨å•å¯è§', await page.evaluate(() => {
      const s = document.getElementById('cloud-login-section');
      return s && window.getComputedStyle(s).display !== 'none';
    }));

    // å¡«å…¥ç™»å½•ä¿¡æ¯
    await page.fill('#cloud-email', TEST_EMAIL);
    await page.fill('#cloud-password', TEST_PASSWORD);
    await page.evaluate(() => { const b = document.getElementById('cloud-login-btn'); if (b) b.click(); });

    // ç­‰ç™»å½•å®Œæˆï¼ˆæœ€å¤š 15 ç§’ï¼‰
    let connected = false;
    for (let i = 0; i < 30; i++) {
      connected = await page.evaluate(() => {
        const s = document.getElementById('cloud-connected-section');
        return s && window.getComputedStyle(s).display !== 'none';
      });
      if (connected) break;
      await wait(page, 500);
    }
    pass('ç™»å½•æˆåŠŸï¼Œæ˜¾ç¤ºå·²è¿žæŽ¥ç•Œé¢', connected);

    const emailShown = await page.evaluate(() => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    });
    pass('æ˜¾ç¤ºç™»å½•é‚®ç®±', emailShown.includes(TEST_EMAIL));

    // å…³é—­è®¾ç½®é¢æ¿
    await page.evaluate(() => {
      const o = document.getElementById('settings-overlay');
      if (o) o.classList.remove('open');
    });
    await wait(page, 300);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 2: åˆ·æ–°åŽè‡ªåŠ¨æ¢å¤ç™»å½• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 2: åˆ·æ–°é¡µé¢åŽè‡ªåŠ¨æ¢å¤ç™»å½•');

    console.log('  æ­£åœ¨ reload...');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1000);

    // ç¡®è®¤ UI å·²æ¸²æŸ“ï¼ˆinitUI å®Œæˆï¼‰
    const uiRendered = await page.evaluate(() => {
      const v = document.querySelector('.home-version');
      return v ? v.textContent : null;
    });
    pass('åˆ·æ–°åŽ UI å·²æ¸²æŸ“', !!uiRendered);
    console.log('  UI ç‰ˆæœ¬: ' + uiRendered);

    // å…³é”®æ–­è¨€ï¼šç­‰å¾…äº‘ç«¯ session è‡ªåŠ¨æ¢å¤
    // æ‰“å¼€è®¾ç½®é¢æ¿æ£€æŸ¥äº‘ç«¯è¿žæŽ¥çŠ¶æ€
    await page.evaluate(() => {
      const b = document.querySelector('[aria-label="è®¾ç½®"]');
      if (b) b.click();
    });
    await wait(page, 500);

    await page.evaluate(() => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('äº‘ç«¯')) { t.click(); return; } }
    });
    await wait(page, 500);

    // ç­‰å¾…è‡ªåŠ¨æ¢å¤ï¼ˆæœ€å¤š 15 ç§’ï¼‰
    let restored = false;
    for (let i = 0; i < 30; i++) {
      restored = await page.evaluate(() => {
        const s = document.getElementById('cloud-connected-section');
        return s && window.getComputedStyle(s).display !== 'none';
      });
      if (restored) break;
      await wait(page, 500);
    }
    pass('åˆ·æ–°åŽè‡ªåŠ¨æ¢å¤ç™»å½•ï¼Œæ˜¾ç¤ºå·²è¿žæŽ¥ç•Œé¢', restored);

    const emailAfter = await page.evaluate(() => {
      const el = document.getElementById('cloud-user-email');
      return el ? el.textContent : '';
    });
    pass('åˆ·æ–°åŽé‚®ç®±æ˜¾ç¤ºæ­£ç¡®', emailAfter.includes(TEST_EMAIL));

    // å…³é—­è®¾ç½®
    await page.evaluate(() => {
      const o = document.getElementById('settings-overlay');
      if (o) o.classList.remove('open');
    });
    await wait(page, 300);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 3: åˆ·æ–°åŽ deck åˆ—è¡¨æ­£å¸¸ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 3: åˆ·æ–°åŽç‰Œç»„åˆ—è¡¨æ­£å¸¸');

    const hasDecks = await page.evaluate(() => {
      const cards = document.querySelectorAll('.deck-card');
      return cards.length > 0;
    });
    pass('ç‰Œç»„åˆ—è¡¨ä¸ä¸ºç©º', hasDecks);

    const emptyState = await page.evaluate(() => {
      const el = document.querySelector('.empty-state');
      return el && window.getComputedStyle(el).display !== 'none';
    });
    pass('ä¸æ˜¾ç¤ºç©ºçŠ¶æ€å ä½', !emptyState);

    // è¾“å‡ºæŽ§åˆ¶å°è¯Šæ–­ä¿¡æ¯
    const syncLogs = logs.filter(l => l.includes('[sync]') || l.includes('[cloud]'));
    if (syncLogs.length > 0) {
      console.log('\n  æŽ§åˆ¶å°åŒæ­¥æ—¥å¿—:');
      syncLogs.forEach(l => console.log('    ' + l));
    }

  } finally {
    await browser.close();
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ç»“æžœ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  console.log(`\n${'â•'.repeat(56)}`);
  console.log(`  ç»“æžœï¼š${passed} é€šè¿‡  ${failed} å¤±è´¥`);
  if (errors.length) {
    console.log(`\n  å¤±è´¥é¡¹ï¼š`);
    errors.forEach(e => console.log('    ' + e));
  }
  process.exit(failed > 0 ? 1 : 0);
})();
