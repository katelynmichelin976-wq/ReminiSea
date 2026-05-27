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

  // 1. Login first to establish session
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
  console.log('  Login result: ' + loggedIn);
  check('Login successful', loggedIn);

  // 2. Go home, clear session backup, clear SDK token
  console.log('\n=== STEP 2: Clear session data, reload ===');
  await page.evaluate(() => {
    showScreen('screen-home');
    localStorage.removeItem('yihai_session_backup');
  });
  // Also clear the Supabase SDK token
  const sbKeys = await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    return keys;
  });
  console.log('  Cleared SDK keys: ' + sbKeys.join(', '));
  await page.waitForTimeout(500);

  // 3. Reload — session restore should fail
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 4. Check account screen UI state
  console.log('\n=== STEP 3: Check account screen ===');
  await page.evaluate(() => {
    if (typeof showAccount === 'function') showAccount();
    else { renderAccount(); showScreen('screen-account'); }
  });
  await page.waitForTimeout(800);

  const state = await page.evaluate(() => ({
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
    emailInField: document.getElementById('account-email')?.value || '',
    hasSessionBackup: !!localStorage.getItem('yihai_session_backup')
  }));
  console.log('  Account state: ' + JSON.stringify(state));

  check('Account shows logged-out state', state.loggedOutVisible);
  check('Account does NOT show logged-in', !state.loggedInVisible);
  check('Account does NOT show restoring', !state.restoringVisible);
  check('Email pre-filled', state.emailInField === TEST_EMAIL);
  check('No session backup in localStorage', !state.hasSessionBackup);

  // 5. Check home screen — mine tab should show login prompt
  console.log('\n=== STEP 4: Check mine profile ===');
  await page.evaluate(() => { showScreen('screen-mine'); });
  await page.waitForTimeout(500);

  const mineState = await page.evaluate(() => ({
    profileName: document.getElementById('mine-profile-name')?.textContent || 'N/A',
    profileSub: document.getElementById('mine-profile-sub')?.textContent || 'N/A',
    profileAvatar: document.getElementById('mine-avatar')?.textContent || 'N/A'
  }));
  console.log('  Mine state: ' + JSON.stringify(mineState));

  check('Mine avatar shows "?" (not logged in)', mineState.profileAvatar === '?');
  check('Mine profile shows login prompt', mineState.profileName !== 'N/A' && mineState.profileName.length > 0);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  RESULT: ' + passed + ' passed  ' + failed + ' failed');
  console.log('='.repeat(60));

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
