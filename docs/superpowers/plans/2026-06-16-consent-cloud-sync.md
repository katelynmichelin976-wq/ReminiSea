# 同意状态云同步 + 版本升级（P2 #1+#2+#3）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sync_config 加 consent 段实现跨设备同意状态同步；新增 CONSENT_PROTOCOL_VERSION 常量驱动协议版本升级弹窗；用户拒绝按已登录/未登录分流处理。

**Architecture:** 复用现有 `sync_config.config_json jsonb` 加顶层 `consent` key，零 DB migration；纯函数 `_mergeConsent` + `_compareConsentVersion` 处理合并；登录/注册后立即 cloudPushConfig；runSync 拉取后调 checkConsentUpgrade；showConfirmDialog 扩展可选自定义按钮文案。

**Tech Stack:** vanilla JS + Supabase JS SDK + Playwright（E2E 需登录测试账号）+ Node.js 单测。

**Reference Spec:** `docs/superpowers/specs/2026-06-16-consent-cloud-sync-design.md`

---

## File Structure

| 文件 | 改动 |
|---|---|
| `index.html` | 加常量 / 纯函数 / cloudPushConfig+cloudPullConfig 扩展 / checkConsentUpgrade + showConsentUpgradeDialog / showConfirmDialog 扩展签名 / doAccountLogin+doRegister 集成 / 启动序列加未登录检查 / i18n 4 key × 5 语种 |
| `tests/yihai_v5.13.13_consent_test.js` | 新建，~22 cases 单测 |
| `tests/run_all.js` | 注册新单测套件 |
| `tests/_pw_consent_sync.js` | 新建 Playwright E2E，~14 断言 |
| `CLAUDE.md` | 测试登记 2 行 |

---

## Task 1: 常量 + mergeConsent + compareConsentVersion 纯函数

**Files:**
- Modify: `C:\code\index.html`

### - [ ] Step 1.1: 加常量 CONSENT_PROTOCOL_VERSION

在 `C:\code\index.html` 找到这一行（约 line 3374）：

```javascript
const APP_VERSION = '5.13.13';
```

在它之后插入：

```javascript
const CONSENT_PROTOCOL_VERSION = 'v1';
```

### - [ ] Step 1.2: 加纯函数 `_compareConsentVersion` + `_mergeConsent`

在 `C:\code\index.html` 找到这一行（约 line 3753）：

```javascript
async function cloudPushConfig() {
```

在它之前插入：

```javascript
function _compareConsentVersion(a, b) {
  const na = (a && /^v\d+/.test(a)) ? parseInt(a.slice(1), 10) : 0;
  const nb = (b && /^v\d+/.test(b)) ? parseInt(b.slice(1), 10) : 0;
  return na - nb;
}

function _mergeConsent(local, cloud) {
  if (!local && !cloud) return null;
  if (!local) return cloud;
  if (!cloud) return local;
  const vcmp = _compareConsentVersion(local.version, cloud.version);
  if (vcmp > 0) return local;
  if (vcmp < 0) return cloud;
  const tl = Date.parse(local.at) || 0;
  const tc = Date.parse(cloud.at) || 0;
  return tl >= tc ? local : cloud;
}

```

### - [ ] Step 1.3: 验证 index.html 加载无 JS 异常

启动 HTTP server（如未启动）：

```powershell
$test = $null
try { $test = Invoke-WebRequest -Uri "http://localhost:8080/index.html" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop } catch {}
if (-not $test) { Start-Process -FilePath "python" -ArgumentList "-m","http.server","8080","--directory","C:\code" -WindowStyle Hidden; Start-Sleep -Seconds 2 }
```

跑 smoke 验证语法：

```powershell
node tests/_pw_ui_smoke.js
```

Expected：68/0 全过（仅加常量 + 纯函数，无 UI 影响）。

---

## Task 2: 纯函数单测

**Files:**
- Create: `C:\code\tests\yihai_v5.13.13_consent_test.js`
- Modify: `C:\code\tests\run_all.js`

### - [ ] Step 2.1: 创建测试文件

Create `C:\code\tests\yihai_v5.13.13_consent_test.js`:

```javascript
const fs = require('fs');
const path = require('path');

// extract pure functions from index.html
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m1 = html.match(/function _compareConsentVersion\(a, b\) \{[\s\S]+?\n\}/);
const m2 = html.match(/function _mergeConsent\(local, cloud\) \{[\s\S]+?\n\}/);
if (!m1 || !m2) throw new Error('consent functions not found in index.html');
eval(m1[0]);
eval(m2[0]);

let passed = 0, failed = 0;
const errors = [];
function assert(name, cond) {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; errors.push(`✗ ${name}`); console.log(`  \x1b[31m✗\x1b[0m ${name}`); }
}

console.log('\n─── _compareConsentVersion ───');
assert('v1 < v2', _compareConsentVersion('v1', 'v2') < 0);
assert('v2 > v1', _compareConsentVersion('v2', 'v1') > 0);
assert('v1 == v1', _compareConsentVersion('v1', 'v1') === 0);
assert('v10 > v2', _compareConsentVersion('v10', 'v2') > 0);
assert('null vs v1 → cloud wins (na=0)', _compareConsentVersion(null, 'v1') < 0);
assert('v1 vs null → local wins', _compareConsentVersion('v1', null) > 0);
assert('garbage vs v1 → cloud wins', _compareConsentVersion('garbage', 'v1') < 0);
assert('undefined vs undefined → 0', _compareConsentVersion(undefined, undefined) === 0);

console.log('\n─── _mergeConsent ───');
const AT_OLD = '2026-06-10T00:00:00.000Z';
const AT_NEW = '2026-06-15T00:00:00.000Z';

assert('null null → null', _mergeConsent(null, null) === null);
assert('local only → local', _mergeConsent({ version: 'v1', at: AT_OLD }, null).at === AT_OLD);
assert('cloud only → cloud', _mergeConsent(null, { version: 'v1', at: AT_NEW }).at === AT_NEW);

const r1 = _mergeConsent({ version: 'v1', at: AT_OLD }, { version: 'v1', at: AT_NEW });
assert('same version → max(at) (cloud newer)', r1.at === AT_NEW);

const r2 = _mergeConsent({ version: 'v1', at: AT_NEW }, { version: 'v1', at: AT_OLD });
assert('same version → max(at) (local newer)', r2.at === AT_NEW);

const r3 = _mergeConsent({ version: 'v2', at: AT_OLD }, { version: 'v1', at: AT_NEW });
assert('cross-version local v2 > cloud v1 → local', r3.version === 'v2' && r3.at === AT_OLD);

const r4 = _mergeConsent({ version: 'v1', at: AT_NEW }, { version: 'v2', at: AT_OLD });
assert('cross-version cloud v2 > local v1 → cloud', r4.version === 'v2' && r4.at === AT_OLD);

const r5 = _mergeConsent({ version: 'v1', at: AT_NEW }, { version: 'v1', at: AT_NEW });
assert('identical → either (here local)', r5.at === AT_NEW);

const sameLocal = { version: 'v1', at: AT_OLD };
const sameCloud = { version: 'v1', at: AT_NEW };
const ab = _mergeConsent(sameLocal, sameCloud);
const ba = _mergeConsent(sameCloud, sameLocal);
assert('symmetry (newer wins both directions)', ab.at === AT_NEW && ba.at === AT_NEW);

assert('invalid at string tolerated', _mergeConsent({ version: 'v1', at: 'garbage' }, { version: 'v1', at: AT_NEW }).at === AT_NEW);
assert('both invalid at → cloud first arg (na=nb=0, returns cloud due to >=)', _mergeConsent({ version: 'v1', at: 'x' }, { version: 'v1', at: 'y' }).at === 'x');

const r9 = _mergeConsent({ version: 'v2', at: AT_NEW }, { version: 'v2', at: AT_OLD });
assert('same v2 → max(at)', r9.at === AT_NEW);

const r10 = _mergeConsent({ version: null, at: AT_NEW }, { version: 'v1', at: AT_OLD });
assert('local null version vs cloud v1 → cloud wins', r10.version === 'v1');

const r11 = _mergeConsent({ version: 'v1', at: AT_OLD }, { version: null, at: AT_NEW });
assert('local v1 vs cloud null version → local wins', r11.version === 'v1');

assert('large version v100 > v9', _compareConsentVersion('v100', 'v9') > 0);
assert('missing prefix tolerated → 0', _compareConsentVersion('1', 'v1') < 0);

console.log(`\n  合计 ${passed + failed} 断言，${passed} 通过，${failed} 失败`);
if (failed) { errors.forEach(e => console.log('  ' + e)); process.exit(1); }
```

### - [ ] Step 2.2: 注册到 run_all.js

In `C:\code\tests\run_all.js`, find the suite list (search for `yihai_v5.13.10_idb_p1_test.js`) and add a row after it：

```javascript
  { name: 'yihai_v5.13.13_consent_test.js', path: './yihai_v5.13.13_consent_test.js' },
```

（如果格式不同则按现有套件登记格式照搬。）

### - [ ] Step 2.3: 跑单测

```powershell
node tests/run_all.js
```

Expected：14 套件之外多一个 yihai_v5.13.13_consent_test，~22 断言全过；总断言数变 ~689。

---

## Task 3: cloudPushConfig + cloudPullConfig 加 consent 段

**Files:**
- Modify: `C:\code\index.html`

### - [ ] Step 3.1: cloudPushConfig 加 consent 写入

In `C:\code\index.html`, find this exact block (约 line 3797):

```javascript
    const { error } = await _sb.from('sync_config').upsert({
      user_id: _cloudUserId,
      config_json: { srs: mergedSrs, ui: mergedUi },
      updated_at: Date.now(),
    }, { onConflict: 'user_id' });
```

Replace with:

```javascript
    // collect local consent from LS
    const lsConsentAt = lsGet('yh:v1:user:consentAt');
    const lsConsentVer = lsGet('yh:v1:user:consentVersion');
    const localConsent = (lsConsentAt && lsConsentVer) ? { version: lsConsentVer, at: lsConsentAt } : null;
    const mergedConsent = _mergeConsent(localConsent, cloudCfg?.consent || null);

    const newConfig = { srs: mergedSrs, ui: mergedUi };
    if (mergedConsent) newConfig.consent = mergedConsent;

    const { error } = await _sb.from('sync_config').upsert({
      user_id: _cloudUserId,
      config_json: newConfig,
      updated_at: Date.now(),
    }, { onConflict: 'user_id' });
```

### - [ ] Step 3.2: cloudPullConfig 加 consent merge + apply

In `C:\code\index.html`, find this exact block in `cloudPullConfig`（约 line 3858-3870）:

```javascript
    // trigger UI refresh
    syncSrsSettingsUI();
    loadSettings();

    // apply theme (compat with old light/dark and new default/jade/amber/dark)
    var th = getUiField('theme');
    if (th) {
      if (th === 'dark') { document.documentElement.setAttribute('data-theme','dark'); }
      else if (th !== 'light' && th !== 'default') { document.documentElement.setAttribute('data-theme', th); }
      var tog = document.getElementById('dark-toggle');
      if (tog) tog.checked = th === 'dark';
    }
    return applied;
```

Replace with:

```javascript
    // merge + apply consent
    if (cfg.consent || lsGet('yh:v1:user:consentAt')) {
      const lsAt = lsGet('yh:v1:user:consentAt');
      const lsVer = lsGet('yh:v1:user:consentVersion');
      const local = (lsAt && lsVer) ? { version: lsVer, at: lsAt } : null;
      const merged = _mergeConsent(local, cfg.consent || null);
      if (merged) {
        if (merged.at !== lsAt) lsSet('yh:v1:user:consentAt', merged.at);
        if (merged.version !== lsVer) lsSet('yh:v1:user:consentVersion', merged.version);
      }
    }

    // trigger UI refresh
    syncSrsSettingsUI();
    loadSettings();

    // apply theme (compat with old light/dark and new default/jade/amber/dark)
    var th = getUiField('theme');
    if (th) {
      if (th === 'dark') { document.documentElement.setAttribute('data-theme','dark'); }
      else if (th !== 'light' && th !== 'default') { document.documentElement.setAttribute('data-theme', th); }
      var tog = document.getElementById('dark-toggle');
      if (tog) tog.checked = th === 'dark';
    }

    // check consent upgrade after merge (asynchronous; doesn't block return)
    setTimeout(checkConsentUpgrade, 0);

    return applied;
```

注：`checkConsentUpgrade` 函数在 Task 4 实现，此时引用会前向 hoisting（function declaration），不会破坏。

### - [ ] Step 3.3: 验证 smoke 不破

```powershell
node tests/_pw_ui_smoke.js
```

Expected：68/0 全过。

注：此时启动 `checkConsentUpgrade` 是 undefined 会报错，需要在 Task 4 实施后再跑。本步骤验证仅看初始页面渲染不爆。

如果 smoke 因 `checkConsentUpgrade is not defined` 失败，可临时改 `setTimeout(checkConsentUpgrade, 0);` → `setTimeout(function(){ if (typeof checkConsentUpgrade === 'function') checkConsentUpgrade(); }, 0);`。或先做 Task 4 再回头跑 smoke。**推荐：先做 Task 4。**

---

## Task 4: i18n + showConfirmDialog 扩展 + checkConsentUpgrade + showConsentUpgradeDialog

**Files:**
- Modify: `C:\code\index.html`

### - [ ] Step 4.1: i18n — 5 语种新增 4 key

每个语种 block 中，在 P1 的 `consent_required_hint` 之后追加 4 key。

**en**：找 `consent_required_hint: 'Please check the box to agree before continuing',`，之后插入：

```javascript
    consent_upgrade_title: 'Policy Updated',
    consent_upgrade_msg: 'Our Privacy Policy and Terms of Service have been updated. Please review and agree to continue using the app.',
    consent_upgrade_accept: 'I Agree',
    consent_upgrade_decline: 'Decline',
```

**zh-CN**：找 `consent_required_hint: '请先勾选同意才能继续',`，之后插入：

```javascript
    consent_upgrade_title: '协议已更新',
    consent_upgrade_msg: '《隐私政策》和《用户协议》已更新，请重新阅读并同意后继续使用本应用。',
    consent_upgrade_accept: '我已阅读并同意',
    consent_upgrade_decline: '拒绝',
```

**zh-Hant**：找 `consent_required_hint: '請先勾選同意才能繼續',`，之后插入：

```javascript
    consent_upgrade_title: '協議已更新',
    consent_upgrade_msg: '《隱私政策》和《用戶協議》已更新，請重新閱讀並同意後繼續使用本應用。',
    consent_upgrade_accept: '我已閱讀並同意',
    consent_upgrade_decline: '拒絕',
```

**es**：找 `consent_required_hint: 'Por favor marca la casilla para continuar',`，之后插入：

```javascript
    consent_upgrade_title: 'Política Actualizada',
    consent_upgrade_msg: 'Nuestra Política de Privacidad y Términos de Servicio se han actualizado. Por favor revísalos y acepta para continuar.',
    consent_upgrade_accept: 'Acepto',
    consent_upgrade_decline: 'Rechazar',
```

**ja**：找 `consent_required_hint: '続行するにはチェックを入れてください',`，之后插入：

```javascript
    consent_upgrade_title: 'ポリシーが更新されました',
    consent_upgrade_msg: 'プライバシーポリシーと利用規約が更新されました。続行するには、再度ご確認のうえ同意してください。',
    consent_upgrade_accept: '同意します',
    consent_upgrade_decline: '拒否',
```

### - [ ] Step 4.2: 扩展 showConfirmDialog 支持可选 opts

In `C:\code\index.html`, find the existing `showConfirmDialog` function (约 line 12789):

```javascript
function showConfirmDialog(msg) {
  return new Promise(resolve => {
    const mask = document.createElement('div');
    mask.className = 'yh-dialog-mask';
    mask.innerHTML = `
      <div class="yh-dialog">
        <div class="yh-dialog-msg">${esc(msg)}</div>
        <div class="yh-dialog-btns">
          <button class="yh-dialog-btn cancel" id="yh-dlg-no">${t('common_cancel')}</button>
          <button class="yh-dialog-btn confirm" id="yh-dlg-yes">${t('common_confirm')}</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    const close = ok => { mask.remove(); resolve(ok); };
    mask.querySelector('#yh-dlg-yes').onclick = () => close(true);
    mask.querySelector('#yh-dlg-no').onclick  = () => close(false);
    mask.onclick = e => { if (e.target === mask) close(false); };
  });
}
```

Replace with:

```javascript
function showConfirmDialog(msg, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const mask = document.createElement('div');
    mask.className = 'yh-dialog-mask';
    const confirmText = opts.confirmText || t('common_confirm');
    const cancelText  = opts.cancelText  || t('common_cancel');
    const bodyHtml    = opts.html ? msg : esc(msg);
    const dismissable = opts.dismissable !== false;
    mask.innerHTML = `
      <div class="yh-dialog">
        <div class="yh-dialog-msg">${bodyHtml}</div>
        <div class="yh-dialog-btns">
          <button class="yh-dialog-btn cancel" id="yh-dlg-no">${esc(cancelText)}</button>
          <button class="yh-dialog-btn confirm" id="yh-dlg-yes">${esc(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    const close = ok => { mask.remove(); resolve(ok); };
    mask.querySelector('#yh-dlg-yes').onclick = () => close(true);
    mask.querySelector('#yh-dlg-no').onclick  = () => close(false);
    if (dismissable) {
      mask.onclick = e => { if (e.target === mask) close(false); };
    }
  });
}
```

### - [ ] Step 4.3: 加 checkConsentUpgrade + showConsentUpgradeDialog

In `C:\code\index.html`, find this (约 line 6310-6315 area, after `_writeConsentLs` function from P1):

```javascript
function _writeConsentLs() {
  try {
    lsSet('yh:v1:user:consentAt', new Date().toISOString());
    lsSet('yh:v1:user:consentVersion', 'v1');
  } catch (e) { console.warn('[consent] LS write fail', e && e.message); }
}
```

替换为（同时把硬编码 `'v1'` 改为常量）：

```javascript
function _writeConsentLs() {
  try {
    lsSet('yh:v1:user:consentAt', new Date().toISOString());
    lsSet('yh:v1:user:consentVersion', CONSENT_PROTOCOL_VERSION);
  } catch (e) { console.warn('[consent] LS write fail', e && e.message); }
}

let _consentUpgradeInFlight = false;
async function checkConsentUpgrade() {
  if (_consentUpgradeInFlight) return;
  const lsVer = lsGet('yh:v1:user:consentVersion');
  if (lsVer === CONSENT_PROTOCOL_VERSION) return;
  _consentUpgradeInFlight = true;
  try {
    await showConsentUpgradeDialog();
  } finally {
    _consentUpgradeInFlight = false;
  }
}

async function showConsentUpgradeDialog() {
  const baseUrl = 'https://katelynmichelin976-wq.github.io/ReminiSea/';
  const privacyLink = `<a href="${baseUrl}privacy.html" target="_blank" rel="noopener" style="color:#0ea5e9;text-decoration:none">${esc(t('consent_privacy'))}</a>`;
  const termsLink   = `<a href="${baseUrl}terms.html" target="_blank" rel="noopener" style="color:#0ea5e9;text-decoration:none">${esc(t('consent_terms'))}</a>`;
  const body = `
    <div style="font-weight:600;font-size:16px;margin-bottom:8px;color:#0e6585">${esc(t('consent_upgrade_title'))}</div>
    <div style="margin-bottom:8px">${esc(t('consent_upgrade_msg'))}</div>
    <div>${privacyLink} ${esc(t('consent_and'))} ${termsLink}</div>
  `;
  const ok = await showConfirmDialog(body, {
    html: true,
    confirmText: t('consent_upgrade_accept'),
    cancelText: t('consent_upgrade_decline'),
    dismissable: false,
  });
  if (ok) {
    _writeConsentLs();
    if (_syncEnabled) cloudPushConfig();
  } else {
    if (_syncEnabled) {
      await doAccountLogout();
      showScreen('screen-account');
    } else {
      showToastMsg(t('consent_required_hint'));
    }
  }
}
```

### - [ ] Step 4.4: 跑 smoke 验证

```powershell
node tests/_pw_ui_smoke.js
```

Expected：68/0 全过（无登录测试不会触发 cloudPullConfig 中的 setTimeout(checkConsentUpgrade, 0)，但函数定义不应破坏初始加载）。

---

## Task 5: 集成 — doAccountLogin / doRegister 追加 cloudPushConfig + 启动加未登录检查

**Files:**
- Modify: `C:\code\index.html`

### - [ ] Step 5.1: doAccountLogin 成功后追加 cloudPushConfig

In `C:\code\index.html`, find this exact block (P1 已修改的位置，约 line 6339-6342):

```javascript
    logAppEvent('login', { email: email });
    _writeConsentLs();
    upsertDeviceRegistry();
    runSync({ modal: true, decks: false, events: true, title: t('sync_syncing_data'), deckKey: currentDeck })
```

In between `_writeConsentLs()` and `upsertDeviceRegistry()` insert one line:

```javascript
    logAppEvent('login', { email: email });
    _writeConsentLs();
    cloudPushConfig();
    upsertDeviceRegistry();
    runSync({ modal: true, decks: false, events: true, title: t('sync_syncing_data'), deckKey: currentDeck })
```

注：`cloudPushConfig()` 是 async，不 await — fire-and-forget，dev rule #10。

### - [ ] Step 5.2: doRegister 成功后追加 cloudPushConfig

In `C:\code\index.html`, find this exact block in `doRegister`（约 line 6430，P1 加的 `_writeConsentLs()`）:

```javascript
    _writeConsentLs();
    document.getElementById('reg-title').style.display = 'none';
```

替换为：

```javascript
    _writeConsentLs();
    cloudPushConfig();
    document.getElementById('reg-title').style.display = 'none';
```

### - [ ] Step 5.3: 启动加未登录用户的升级检查

In `C:\code\index.html`, find this block (约 line 11949-11955):

```javascript
  setTimeout(function() {
    var loginBtn = document.getElementById('account-login-btn');
    var regBtn = document.getElementById('reg-submit-btn');
    if (loginBtn) loginBtn.disabled = true;
    if (regBtn) regBtn.disabled = true;
  }, 0);
  setTimeout(_tryInitCloud, 100);
```

替换为：

```javascript
  setTimeout(function() {
    var loginBtn = document.getElementById('account-login-btn');
    var regBtn = document.getElementById('reg-submit-btn');
    if (loginBtn) loginBtn.disabled = true;
    if (regBtn) regBtn.disabled = true;
  }, 0);
  // unauthenticated consent upgrade check — only when LS already has a version (P1 user)
  setTimeout(function() {
    if (lsGet('yh:v1:user:consentVersion')) {
      checkConsentUpgrade();
    }
  }, 500);
  setTimeout(_tryInitCloud, 100);
```

注：condition `lsGet('yh:v1:user:consentVersion')` 保护「全新用户从未勾过同意」的场景 — 那种情况下不弹升级框（他们会被 P1 的注册 form checkbox 拦住）。

### - [ ] Step 5.4: 跑回归

```powershell
node tests/_pw_ui_smoke.js
node tests/_pw_consent_checkbox.js
node tests/_pw_config_sync.js
```

期望：
- `_pw_ui_smoke`：68/0 全过
- `_pw_consent_checkbox`（P1 套件）：14/0 全过（不破坏）
- `_pw_config_sync`：~23 全过（cloudPushConfig 加 consent 字段后云端 schema 仍兼容）

如果 `_pw_config_sync` 失败，先排查 cloudPushConfig 中的 `cloudCfg?.consent` 引用是否在 cloudCfg 为 null 时正确处理（`null?.consent === undefined`）。

---

## Task 6: Playwright E2E + CLAUDE.md + 单 commit

**Files:**
- Create: `C:\code\tests\_pw_consent_sync.js`
- Modify: `C:\code\CLAUDE.md`
- Single commit

### - [ ] Step 6.1: 创建 Playwright 测试

Create `C:\code\tests\_pw_consent_sync.js`:

```javascript
/**
 * Consent 云同步 + 版本升级测试 — v5.13.13 P2 #1+#2+#3
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：$env:TEST_PASSWORD="xxx"; node tests/_pw_consent_sync.js
 *
 * 覆盖：A 设备 push consent → B 设备 pull 验证传播；
 *       LS 注入旧 version → 启动 / pull 后弹升级框；
 *       接受/拒绝分流（已登录 → signOut + 切屏；未登录 → toast）。
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin, cloudLogout } = require('./_playwright_helper');

if (!process.env.TEST_PASSWORD) {
  console.error('[consent_sync] 需要 TEST_PASSWORD 环境变量');
  process.exit(2);
}
const PWD = process.env.TEST_PASSWORD;
const TEST_EMAIL = 'zyhaff@gmail.com';
const URL = getBaseUrl() + '?v=' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });

  try {
    // ════ PHASE 1：未登录 + 已有 P1 同版本 LS → 启动检查 noop ════
    section('PHASE 1: 未登录 同版本 → 无弹窗');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await run(page, () => {
        localStorage.setItem('yh:v1:user:consentVersion', 'v1');
        localStorage.setItem('yh:v1:user:consentAt', new Date().toISOString());
      });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(page, 1500);
      const maskCount = await run(page, () => document.querySelectorAll('.yh-dialog-mask').length);
      pass('未登录同版本：无升级弹窗', maskCount === 0);
      await page.close();
    }

    // ════ PHASE 2：未登录 + LS 注入旧版本 → 弹升级框 → 拒绝 → toast，不切屏 ════
    section('PHASE 2: 未登录 旧版本 → 拒绝 toast 不切屏');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await run(page, () => {
        localStorage.setItem('yh:v1:user:consentVersion', 'v0');
        localStorage.setItem('yh:v1:user:consentAt', '2026-01-01T00:00:00.000Z');
      });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(page, 1500);
      const hasDialog = await run(page, () => !!document.querySelector('.yh-dialog-mask'));
      pass('未登录旧版本：升级框弹出', hasDialog === true);

      await run(page, () => document.querySelector('#yh-dlg-no').click());
      await wait(page, 500);
      const screenAfter = await run(page, () => document.querySelector('.screen.active')?.id);
      pass('未登录拒绝：仍在 screen-home', screenAfter === 'screen-home');
      const lsVerAfter = await run(page, () => localStorage.getItem('yh:v1:user:consentVersion'));
      pass('未登录拒绝：LS 未升级', lsVerAfter === 'v0');
      await page.close();
    }

    // ════ PHASE 3：登录 A → 勾 consent push 云 → 查 LS+云一致 ════
    section('PHASE 3: 登录 push consent 到云');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await run(page, () => {
        localStorage.removeItem('yh:v1:user:consentVersion');
        localStorage.removeItem('yh:v1:user:consentAt');
      });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(page, 1000);
      await cloudLogin(page, TEST_EMAIL, PWD);
      await wait(page, 4000);

      const consentVer = await run(page, () => localStorage.getItem('yh:v1:user:consentVersion'));
      const consentAt = await run(page, () => localStorage.getItem('yh:v1:user:consentAt'));
      pass('登录后 LS consentVersion=v1', consentVer === 'v1');
      pass('登录后 LS consentAt 已写', !!consentAt && /^\d{4}-\d{2}-\d{2}T/.test(consentAt));

      await cloudLogout(page);
      await page.close();
    }

    // ════ PHASE 4：清 LS → 登录同账号 → pull 后 LS 恢复 ════
    section('PHASE 4: 跨设备 pull consent');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await run(page, () => {
        localStorage.clear();
      });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(page, 1000);
      await cloudLogin(page, TEST_EMAIL, PWD);
      await wait(page, 5000);

      const pulledVer = await run(page, () => localStorage.getItem('yh:v1:user:consentVersion'));
      const pulledAt = await run(page, () => localStorage.getItem('yh:v1:user:consentAt'));
      pass('云 → LS consentVersion 恢复', pulledVer === 'v1');
      pass('云 → LS consentAt 恢复', !!pulledAt);

      await cloudLogout(page);
      await page.close();
    }

    // ════ PHASE 5：登录后注入 LS v0 → runSync → 弹升级框 → 接受 → LS+云更新 ════
    section('PHASE 5: 已登录 旧版本 → 接受 → LS 升级');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await cloudLogin(page, TEST_EMAIL, PWD);
      await wait(page, 4000);

      await run(page, () => {
        localStorage.setItem('yh:v1:user:consentVersion', 'v0');
      });
      await run(page, () => runSync({ modal: false, decks: false, events: false }));
      await wait(page, 3500);

      const hasDialog = await run(page, () => !!document.querySelector('.yh-dialog-mask'));
      pass('已登录旧版本：升级框弹出', hasDialog === true);

      await run(page, () => document.querySelector('#yh-dlg-yes').click());
      await wait(page, 1500);
      const verAfter = await run(page, () => localStorage.getItem('yh:v1:user:consentVersion'));
      pass('已登录接受：LS 升级到 v1', verAfter === 'v1');

      await cloudLogout(page);
      await page.close();
    }

    // ════ PHASE 6：已登录 旧版本 → 拒绝 → signOut + 切 screen-account ════
    section('PHASE 6: 已登录 旧版本 → 拒绝 → signOut');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      await cloudLogin(page, TEST_EMAIL, PWD);
      await wait(page, 4000);

      await run(page, () => {
        localStorage.setItem('yh:v1:user:consentVersion', 'v0');
      });
      await run(page, () => runSync({ modal: false, decks: false, events: false }));
      await wait(page, 3500);

      const hasDialog = await run(page, () => !!document.querySelector('.yh-dialog-mask'));
      pass('已登录旧版本：升级框弹出', hasDialog === true);

      await run(page, () => document.querySelector('#yh-dlg-no').click());
      await wait(page, 2500);
      const syncEnabledAfter = await run(page, () => _syncEnabled);
      pass('已登录拒绝：signOut 后 _syncEnabled=false', syncEnabledAfter === false);
      const screenAfter = await run(page, () => document.querySelector('.screen.active')?.id);
      pass('已登录拒绝：切到 screen-account', screenAfter === 'screen-account');

      await page.close();
    }

  } finally {
    await browser.close();
  }

  const { passed, failed, errors } = getCounts();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  结果: ${passed} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));
  if (failed) { errors.forEach(e => console.log(e)); process.exit(1); }
})();
```

### - [ ] Step 6.2: 跑 Playwright

```powershell
$env:TEST_PASSWORD="667788"; node tests/_pw_consent_sync.js
```

Expected：~14 断言全过。

如果失败：
- Phase 3 LS 没写 → 检查 P1 `_writeConsentLs` 是否在 `doAccountLogin` 路径调用
- Phase 4 pull 没写回 → 检查 Task 3 Step 3.2 的 merge + lsSet 逻辑
- Phase 5/6 弹窗未弹 → 检查 Task 3 Step 3.2 末尾 `setTimeout(checkConsentUpgrade, 0)` 是否到达；或 `checkConsentUpgrade` 中 `_consentUpgradeInFlight` 残留
- Phase 6 signOut 后状态 → 检查 `showConsentUpgradeDialog` 中 `doAccountLogout()` 是否 await

### - [ ] Step 6.3: 全回归

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
node tests/_pw_consent_checkbox.js
$env:TEST_PASSWORD="667788"; node tests/_pw_config_sync.js
$env:TEST_PASSWORD="667788"; node tests/_pw_consent_sync.js
```

Expected：
- run_all：15 套件，~689 断言全过
- _pw_ui_smoke：68/0
- _pw_srs_e2e：21/0
- _pw_consent_checkbox：14/0
- _pw_config_sync：23/0
- _pw_consent_sync：~14/0

### - [ ] Step 6.4: CLAUDE.md 测试登记

In `C:\code\CLAUDE.md`, find the unit test list (search `yihai_v5.13.10_idb_p1_test.js`) and add a row after it:

```
| `tests/yihai_v5.13.13_consent_test.js` | consent 合并 / 版本比较纯函数单测（~22 cases） |
```

Find the Playwright test list (after `_pw_consent_checkbox.js`) and add:

```
| `tests/_pw_consent_sync.js` | 同意状态云同步 + 协议版本升级弹窗（push/pull/接受/拒绝 6 phase，~14 断言，需登录） |
```

Update `run_all.js` 数字（如有写在 CLAUDE.md 中）：14 → 15 套件，667 → 689 断言。

### - [ ] Step 6.5: 单 commit

```powershell
git add index.html tests/yihai_v5.13.13_consent_test.js tests/run_all.js tests/_pw_consent_sync.js CLAUDE.md
git commit -m "feat: 同意状态云同步 + 版本升级弹窗 (P2 #1+#2+#3)"
```

---

## Self-Review

**Spec 覆盖（对照 `docs/superpowers/specs/2026-06-16-consent-cloud-sync-design.md`）**:
- ✅ §2.1 sync_config.config_json.consent 存储 → Task 3
- ✅ §2.2 CONSENT_PROTOCOL_VERSION 常量 → Task 1.1
- ✅ §3.1 登录/注册后 cloudPushConfig → Task 5.1/5.2
- ✅ §3.2 cloudPullConfig 后 checkConsentUpgrade → Task 3.2
- ✅ §3.3 mergeConsent 纯函数 → Task 1.2
- ✅ §3.4 checkConsentUpgrade → Task 4.3
- ✅ §3.5 已登录 / 未登录 分流 → Task 4.3 showConsentUpgradeDialog（onCancel 分流）
- ✅ §3.6 i18n 4 key × 5 → Task 4.1
- ✅ §5.1 纯函数单测 → Task 2
- ✅ §5.2 Playwright E2E → Task 6.1（6 phase）
- ✅ §5.3 回归范围 → Task 6.3

**Placeholder 扫描**：无 TBD / TODO。

**Type 一致性**：
- `CONSENT_PROTOCOL_VERSION` 常量全文一致使用
- `_mergeConsent` / `_compareConsentVersion` 函数名全文一致
- `checkConsentUpgrade` / `showConsentUpgradeDialog` 函数名一致
- LS key `yh:v1:user:consentAt` / `yh:v1:user:consentVersion` 一致
- i18n key `consent_upgrade_title` / `consent_upgrade_msg` / `consent_upgrade_accept` / `consent_upgrade_decline` 一致
- `_consentUpgradeInFlight` 闭包变量一致

**已知 risk**（spec §6 已列）：
- showConfirmDialog 扩展签名向后兼容（不传 opts 等同旧行为）
- `cloudCfg?.consent` 用 `?.` 兼容 cloud 为 null 的情况
- Task 3.2 中 `setTimeout(checkConsentUpgrade, 0)` 异步触发，避免阻塞 cloudPullConfig 返回值

---

## 不在本 P2 内的事

- 老用户回溯（无老用户，N/A）
- consent_records append-only 历史表（P3 法律举证强度升级时实施）
- 英文 / 其他语种 PP/ToS HTML（P2 #4 独立 PR）
- App Store 隐私标签 JSON（P2 #5，App Store Connect 后台操作）
- 律师 review 后正文修订（P2 #6，外部依赖）

---

## 已知风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| signOut 后异步任务 fire-and-forget 失败 | 低 | dev rule #10，日志捕获 |
| showConfirmDialog 老 iOS PWA sheet 高度受限 | 中 | Playwright Phase 5/6 验证；文案精简 |
| 未登录用户每次启动跑升级检查 | 低 | 纯 LS 读，微秒级 |
| 跨版本协议升级时 v0/v1 用户共存 → merge 取高版本 | 低 | Task 2 cross-version 测试覆盖 |
| `_consentUpgradeInFlight` 在 dialog 异常时未重置 → 之后无法再弹 | 低 | finally 块兜底 |
| cloudPushConfig 在 logAppEvent 之后立刻调，可能与 runSync 内部 push 冲突 | 低 | upsert by user_id 幂等；两次都会 merge 同样数据 |
