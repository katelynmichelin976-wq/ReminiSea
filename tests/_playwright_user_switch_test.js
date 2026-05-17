/**
 * å¿†æµ·æ‹¾å…‰ â€” é€€å‡ºç™»å½•æ¸…é™¤æœ¬åœ°æ•°æ®æµ‹è¯•
 *
 * ä¾èµ–ï¼š
 *   python -m http.server 8080 --directory /c/code
 *   TEST_PASSWORD=xxx node tests/_playwright_user_switch_test.js
 *
 * è¦†ç›–ï¼šé€€å‡ºåŽ _cloudUserId æ¸…ç©ºã€äº‘ç‰Œç»„æ¸…é™¤ã€é‡æ–°ç™»å½•æ•°æ®å¹²å‡€æ‹‰å›ž
 */

const { chromium } = require('playwright');
const { getBaseUrl } = require('./_playwright_helper');

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

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', msg => {
    if (msg.text().includes('[sync') || msg.text().includes('[cloud') || msg.type() === 'error')
      console.log(`  [${msg.type()}] ${msg.text()}`);
  });

  async function openCloudTab() {
    await page.click('[aria-label="è®¾ç½®"]');
    await wait(page, 300);
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes('äº‘ç«¯')) { t.click(); return; } }
    });
    await wait(page, 300);
  }

  async function login() {
    await openCloudTab();
    await page.fill('#cloud-email', TEST_EMAIL);
    await page.fill('#cloud-password', TEST_PASSWORD);
    await page.evaluate(() => { document.getElementById('cloud-login-btn').click(); });
    for (let i = 0; i < 30; i++) {
      if (await page.evaluate(() => {
        const s = document.getElementById('cloud-connected-section');
        return s && window.getComputedStyle(s).display !== 'none';
      })) return true;
      await wait(page, 500);
    }
    return false;
  }

  async function closeSettings() {
    await page.evaluate(() => {
      const o = document.getElementById('settings-overlay');
      if (o) o.classList.remove('open');
    });
    await wait(page, 300);
  }

  async function logout() {
    await openCloudTab();
    // ç‚¹å‡»é€€å‡ºæŒ‰é’®
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.includes('é€€å‡º') || b.getAttribute('onclick') === 'doCloudLogout()') {
          b.click(); return;
        }
      }
    });
    await wait(page, 1500);
    await closeSettings();
  }

  try {
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 1: ç™»å½•åŒæ­¥ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 1: ç™»å½•åŒæ­¥');
    await page.goto(getBaseUrl() + '?v=' + Date.now(),
      { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 2000);

    pass('ç™»å½•æˆåŠŸ', await login());
    await closeSettings();

    // ç­‰ syncAll å®Œæˆï¼ˆæœ€å¤š 30 ç§’ï¼‰
    let firstCount = 0;
    for (let i = 0; i < 60; i++) {
      firstCount = await page.evaluate(() =>
        DECKS_META.filter(m => m.source === 'cloud').length
      );
      if (firstCount > 0) break;
      await wait(page, 500);
    }
    console.log(`  ç™»å½•åŽäº‘ç‰Œç»„: ${firstCount}`);
    pass('ç™»å½•åŽæœ‰äº‘ç‰Œç»„', firstCount > 0);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 2: é€€å‡ºéªŒè¯ â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 2: é€€å‡ºå¹¶éªŒè¯æ•°æ®æ¸…é™¤');
    await logout();

    pass('é€€å‡ºåŽ _syncEnabled=false', await page.evaluate(() => !_syncEnabled));
    // v4.10: ç™»å‡ºåŽ _cloudUserId ä¿ç•™ï¼ˆç¦»çº¿æ•°æ®å½’å±žæ­£ç¡®ï¼‰ï¼Œä»… _syncEnabled=false
    pass('é€€å‡ºåŽ _cloudUserId ä¿ç•™ï¼ˆç¦»çº¿æ•°æ®å½’å±žï¼‰', await page.evaluate(() => !!_cloudUserId));

    const cloudDecks = await page.evaluate(() =>
      DECKS_META.filter(m => m.source === 'cloud').length
    );
    console.log(`  é€€å‡ºåŽäº‘ç‰Œç»„: ${cloudDecks}`);
    pass('é€€å‡ºåŽäº‘ç‰Œç»„ä¿ç•™ï¼ˆç¦»çº¿å¯ç”¨ï¼‰', cloudDecks > 0);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PHASE 3: é‡æ–°ç™»å½• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    section('PHASE 3: é‡æ–°ç™»å½•éªŒè¯æ•°æ®ä»Žäº‘ç«¯æ‹‰å›ž');
    pass('é‡æ–°ç™»å½•æˆåŠŸ', await login());
    await closeSettings();

    let secondCount = 0;
    for (let i = 0; i < 60; i++) {
      secondCount = await page.evaluate(() =>
        DECKS_META.filter(m => m.source === 'cloud').length
      );
      if (secondCount > 0) break;
      await wait(page, 500);
    }
    console.log(`  é‡æ–°ç™»å½•äº‘ç‰Œç»„: ${secondCount}`);
    pass('é‡æ–°ç™»å½•åŽæœ‰äº‘ç‰Œç»„', secondCount > 0);
    console.log(`  ç‰Œç»„æ•°: ${firstCount} â†’ ${secondCount}`);
    pass('é‡æ–°ç™»å½•ç‰Œç»„â‰¥é¦–æ¬¡', secondCount >= firstCount);

  } finally {
    await browser.close();
  }

  console.log(`\n${'â•'.repeat(56)}`);
  console.log(`  ç»“æžœï¼š${passed} é€šè¿‡  ${failed} å¤±è´¥`);
  if (errors.length) { console.log(`\n  å¤±è´¥é¡¹ï¼š`); errors.forEach(e => console.log('    ' + e)); }
  process.exit(failed > 0 ? 1 : 0);
})();
