/**
 * 忆海拾光 Playwright 回归测试公共工具
 *
 * 用法：
 *   const { pass, check, section, wait, run, cloudLogin, cloudLogout, getBaseUrl } = require('./_playwright_helper');
 */
const fs = require('fs'), path = require('path');

// ── 测试 URL ──
// 优先读 TEST_URL 环境变量；否则自动扫描根目录找最新 yihai_v*.html（按版本号排序）
function getBaseUrl() {
  if (process.env.TEST_URL) return process.env.TEST_URL;
  const root = path.join(__dirname, '..');
  const files = fs.readdirSync(root)
    .filter(f => /^yihai_v[\d.]+\.html$/.test(f))
    .sort((a, b) => {
      const va = a.match(/v([\d.]+)/)[1].split('.').map(Number);
      const vb = b.match(/v([\d.]+)/)[1].split('.').map(Number);
      for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const d = (va[i] || 0) - (vb[i] || 0);
        if (d) return d;
      }
      return 0;
    });
  if (!files.length) throw new Error('No yihai_v*.html found in ' + root);
  const latest = files[files.length - 1];
  console.log(`  [helper] 测试目标: ${latest}`);
  return `http://localhost:8080/${latest}`;
}

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
  await run(page, () => { if (typeof openSettingsWithSrs === 'function') openSettingsWithSrs(); else openSettings(); });
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
  // Use evaluate to bypass Playwright visibility checks for inactive tab panels
  await run(page, ({ em, pw }) => {
    const e = document.getElementById('cloud-email');
    const p = document.getElementById('cloud-password');
    if (e) e.value = em;
    if (p) p.value = pw;
    const b = document.getElementById('cloud-login-btn');
    if (b) b.click();
  }, { em: email, pw: password });
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
  getBaseUrl,
  openSettingsTab, closeSettings,
  cloudLogin, cloudLogout, waitSyncModal,
  getDeckOverviewStats,
};
