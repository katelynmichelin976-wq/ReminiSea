const { chromium } = require('playwright');
const TEST_EMAIL = 'zyhacl@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '667788';
const BASE = 'http://localhost:8080/yihai_v5.1.html';

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  let passed = 0, failed = 0;
  function check(label, ok) {
    if (ok) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + label); }
    else { failed++; console.log('  \x1b[31m✗\x1b[0m ' + label); }
  }

  // 1. Login
  console.log('\n=== STEP 1: Login ===');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { showScreen('screen-account'); });
  await page.waitForTimeout(500);
  await page.evaluate(({ em, pw }) => {
    document.getElementById('account-email').value = em;
    document.getElementById('account-password').value = pw;
    document.getElementById('account-login-btn').click();
  }, { em: TEST_EMAIL, pw: TEST_PASSWORD });
  await page.waitForTimeout(3000);
  let loggedIn = false;
  for (let i = 0; i < 30; i++) {
    loggedIn = await page.evaluate(() => {
      const s = document.getElementById('account-state-logged-in');
      return s && window.getComputedStyle(s).display !== 'none';
    });
    if (loggedIn) break;
    await page.waitForTimeout(500);
  }
  check('Login successful', loggedIn);

  // Verify normal online rendering
  const normalState = await page.evaluate(() => ({
    heroName: document.getElementById('account-hero-name')?.textContent || '',
    syncBtnDisabled: document.getElementById('account-sync-btn')?.disabled
  }));
  check('Normal: hero name = email', normalState.heroName === TEST_EMAIL);
  check('Normal: sync button enabled', normalState.syncBtnDisabled === false);

  // 2. Clear SDK token, keep backup, block Supabase API, reload
  console.log('\n=== STEP 2: Clear SDK token, block API, reload ===');
  await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    showScreen('screen-home');
  });

  const hasBackup = await page.evaluate(() => !!localStorage.getItem('yihai_session_backup'));
  check('Backup preserved', hasBackup);

  // Block Supabase API calls (allow CDN for SDK loading)
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.route('**/rest/v1/**', route => route.abort());
  await page.route('**/auth/v1/**', route => route.abort());

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('  Waiting for restoreSession to timeout (7s)...');
  await page.waitForTimeout(10000); // Wait for 7s timeout + buffer

  // 3. Navigate to account screen
  console.log('\n=== STEP 3: Check account screen ===');
  await page.evaluate(() => {
    if (typeof showAccount === 'function') showAccount();
    else { renderAccount(); showScreen('screen-account'); }
  });
  await page.waitForTimeout(1000);

  const acctState = await page.evaluate(() => ({
    loggedOutVisible: (() => {
      const s = document.getElementById('account-state-logged-out');
      return s && window.getComputedStyle(s).display !== 'none';
    })(),
    loggedInVisible: (() => {
      const s = document.getElementById('account-state-logged-in');
      return s && window.getComputedStyle(s).display !== 'none';
    })(),
    restoringVisible: (() => {
      const s = document.getElementById('account-state-restoring');
      return s && window.getComputedStyle(s).display !== 'none';
    })(),
    heroName: document.getElementById('account-hero-name')?.textContent || 'N/A',
    syncBtnDisabled: document.getElementById('account-sync-btn')?.disabled,
    hasBackup: !!localStorage.getItem('yihai_session_backup')
  }));
  console.log('  Account: ' + JSON.stringify(acctState, null, 2));

  check('Account shows logged-in section', acctState.loggedInVisible);
  check('Account does NOT show logged-out', !acctState.loggedOutVisible);
  check('Account does NOT show restoring', !acctState.restoringVisible);
  check('Hero shows 📵 offline indicator', acctState.heroName.includes('📵'));
  check('Hero contains email', acctState.heroName.includes(TEST_EMAIL));
  check('Sync button DISABLED', acctState.syncBtnDisabled === true);

  // 4. Check mine screen
  console.log('\n=== STEP 4: Check mine profile ===');
  await page.evaluate(() => { showScreen('screen-mine'); });
  await page.waitForTimeout(500);
  const mineState = await page.evaluate(() => ({
    profileName: document.getElementById('mine-profile-name')?.textContent || 'N/A',
    profileSub: document.getElementById('mine-profile-sub')?.textContent || 'N/A',
    profileAvatar: document.getElementById('mine-avatar')?.textContent || 'N/A'
  }));
  console.log('  Mine: ' + JSON.stringify(mineState));

  check('Mine name shows 📵', mineState.profileName.includes('📵'));
  check('Mine avatar shows initial', mineState.profileAvatar !== '?' && mineState.profileAvatar !== 'N/A');

  console.log('\n' + '='.repeat(60));
  console.log('  RESULT: ' + passed + ' passed  ' + failed + ' failed');
  console.log('='.repeat(60));

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
