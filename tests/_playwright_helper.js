/**
 * 忆海拾光 Playwright 回归测试公共工具
 *
 * 用法：
 *   const { pass, check, section, wait, run, cloudLogin, cloudLogout, ... } = require('./_playwright_helper');
 */

// ── 计数器 ──
let passed = 0, failed = 0, errors = [];
function resetCounters() { passed = 0; failed = 0; errors = []; }
function pass(label, ok) { if (ok) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); } else { failed++; errors.push(`✗ ${label}`); console.log(`  \x1b[31m✗\x1b[0m ${label}`); } }
function check(label, actual, expected) { pass(label, actual === expected); }
function section(title) { console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`); }
function wait(page, ms) { return page.waitForTimeout(ms); }
function run(page, fn, arg) { return page.evaluate(fn, arg); }
function getCounts() { return { passed, failed, errors }; }

// ── 设置面板 ──
async function openSettingsTab(page, tabName) {
  await run(page, (sel) => { const b = document.querySelector(sel); if (b) b.click(); }, '[aria-label="设置"]');
  await wait(page, 500);
  if (tabName) {
    await run(page, (name) => {
      const tabs = document.querySelectorAll('.sheet-tab');
      for (const t of tabs) { if (t.textContent.includes(name)) { t.click(); return; } }
    }, tabName);
    await wait(page, 300);
  }
}

async function closeSettings(page) {
  await run(page, () => {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.remove('open');
  });
  await wait(page, 300);
}

// ── 云端登录 ──
async function cloudLogin(page, email, password) {
  await openSettingsTab(page, '云端');

  const emailEl = await page.$('#cloud-email');
  if (emailEl) { await emailEl.fill(''); await emailEl.fill(email); }
  await page.fill('#cloud-password', password);
  await wait(page, 200);

  await run(page, () => { const b = document.getElementById('cloud-login-btn'); if (b) b.click(); });
  await wait(page, 3000);

  for (let i = 0; i < 30; i++) {
    const connected = await run(page, () => {
      const sec = document.getElementById('cloud-connected-section');
      return sec && window.getComputedStyle(sec).display !== 'none';
    });
    if (connected) return true;
    await wait(page, 500);
  }
  return false;
}

// ── 等待同步模态消失 ──
async function waitSyncModal(page, timeout) {
  for (let i = 0; i < (timeout || 60); i++) {
    const done = await run(page, () => {
      const m = document.getElementById('sync-modal');
      return m && m.style.display === 'none';
    });
    if (done) return true;
    await wait(page, 500);
  }
  return false;
}

// ── 云端退出 ──
async function cloudLogout(page) {
  await openSettingsTab(page, '云端');

  await run(page, () => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) { if (b.getAttribute('onclick') === 'doCloudLogout()') { b.click(); return; } }
  });

  let loggedOut = false, syncDisabled = false;
  for (let i = 0; i < 30; i++) {
    loggedOut = await run(page, () => {
      const sec = document.getElementById('cloud-login-section');
      return sec && window.getComputedStyle(sec).display !== 'none';
    });
    syncDisabled = await run(page, () => !_syncEnabled);
    if (loggedOut && syncDisabled) break;
    await wait(page, 200);
  }
  return { loggedOut, syncDisabled };
}

// ── 获取牌组 Tab 统计页概览数据（用于验证）──
async function getDeckOverviewStats(page /*, deckKey */) {
  return run(page, () => {
    const el = document.getElementById('st-deck-overview');
    if (!el) return null;
    const nums = el.querySelectorAll('.deck-ov-num');
    const lbls = el.querySelectorAll('.deck-ov-lbl');
    const out = {};
    for (let i = 0; i < nums.length; i++) out[lbls[i].textContent] = parseInt(nums[i].textContent);
    return out;
  });
}

module.exports = {
  resetCounters, pass, check, section, wait, run, getCounts,
  openSettingsTab, closeSettings,
  cloudLogin, cloudLogout, waitSyncModal,
  getDeckOverviewStats,
};
