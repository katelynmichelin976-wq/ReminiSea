# 精选牌组 Tab + 同步按钮去耦合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现牌组管理的「精选」段（列出云端 `deck_type=preset` 牌组，支持下载 / 同步 / 进度反馈），同时把「同步」按钮和登录后自动 sync 的 `decks: true` 改成 `decks: false`，不再悄悄拉取 preset 牌组。

**Architecture:** 仿 `showCloudDecks`（`index.html:6750-6816`）写 `showFeaturedDecks`，渲染到 `#decks-panel-featured` 内新增的 `<div id="featured-decks-list">`。复用现有 `downloadDeckFromCloud` / `syncDeckFromCloud` / `_downloading` 进度机制。`switchDecksTab('featured')` 触发渲染。`doAccountLogin` / `doAccountSync` 两处 `runSync` 调用改 `decks: false`。`runSync` 内部 `if (options.decks)` 分支保留代码不动（后续 release 再清理）。

**Tech Stack:** vanilla JS、IndexedDB（现有 helper）、Supabase JS、Playwright 测试。

**Reference Spec:** `docs/superpowers/specs/2026-06-14-featured-decks-tab-design.md`

---

## File Structure

| 文件 | 改动 |
|---|---|
| `index.html` | HTML：替换 `#decks-panel-featured` 占位为列表容器（1 行替换）。i18n：5 语种各加 4 个 key（约 25 行）。JS：新增 `showFeaturedDecks` / `renderFeaturedDecksTab`（约 75 行）+ `switchDecksTab` 增 `featured` 分支（1 行）+ `doAccountLogin` / `doAccountSync` 改 `decks: false`（2 行替换）|
| `tests/_pw_featured_tab.js` | 新建 Playwright 测试（约 130 行，~12 断言）|
| `CLAUDE.md` | 新测试登记（1 行）|

---

## Task 1: HTML 占位替换 + i18n 5 语种 key

**Files:**
- Modify: `index.html`（DOM L2553 + i18n 5 处）

### - [ ] Step 1.1: 替换 `#decks-panel-featured` 占位

In `C:\code\index.html`, find around line 2551-2554:

```html
    <!-- 精选面板 -->
    <div class="decks-panel" id="decks-panel-featured">
      <div class="decks-featured-placeholder" data-i18n="decks_featured_coming">精选牌组即将上线</div>
    </div>
```

Replace with:

```html
    <!-- 精选面板 -->
    <div class="decks-panel" id="decks-panel-featured">
      <div id="featured-decks-list" style="padding:0 16px"></div>
    </div>
```

### - [ ] Step 1.2: i18n — en（已含 decks_featured_coming，新增 4 key）

Find around line 7615:

```javascript
    decks_tab_featured: 'Featured',
```

Insert these lines IMMEDIATELY AFTER it:

```javascript
    featured_loading: 'Loading…',
    featured_empty: 'No featured decks available',
    featured_load_fail: 'Load failed: {msg}',
    featured_login_required: 'Please log in to view featured decks',
```

(Keep `decks_featured_coming` line if it exists — leave as legacy unused string. Do not delete.)

### - [ ] Step 1.3: i18n — zh-CN

Find around line 7940:

```javascript
    decks_tab_featured: '精选',
```

Insert these lines IMMEDIATELY AFTER it:

```javascript
    featured_loading: '加载中…',
    featured_empty: '云端暂无精选牌组',
    featured_load_fail: '加载失败：{msg}',
    featured_login_required: '请先登录后查看精选牌组',
```

### - [ ] Step 1.4: i18n — zh-Hant

Search `tests/_pw_idb_helpers.js` style approach: grep for `'zh-Hant'` locale block. The block is around line 7850-something. Find inside that block the line containing `decks_tab_featured` (look for surrounding context similar to zh-CN). If `decks_tab_featured` exists, insert the 4 new lines after it. If `decks_tab_featured` doesn't exist in zh-Hant block, find any `app_title` or `common_back` line in the zh-Hant block and insert after that.

Use this exact insertion block (same content as zh-CN but traditional characters):

```javascript
    featured_loading: '載入中…',
    featured_empty: '雲端暫無精選牌組',
    featured_load_fail: '載入失敗：{msg}',
    featured_login_required: '請先登入後查看精選牌組',
```

### - [ ] Step 1.5: i18n — es

Locate `'es':` locale block (around line 8190+). Find any anchor line (e.g., `app_title:` or `common_back:`) inside that block and insert these 4 lines:

```javascript
    featured_loading: 'Cargando…',
    featured_empty: 'No hay mazos destacados disponibles',
    featured_load_fail: 'Error al cargar: {msg}',
    featured_login_required: 'Inicia sesión para ver los mazos destacados',
```

### - [ ] Step 1.6: i18n — ja

Find around line 8897:

```javascript
    decks_tab_featured: 'おすすめ',
```

Insert these lines IMMEDIATELY AFTER it:

```javascript
    featured_loading: '読み込み中…',
    featured_empty: 'おすすめデッキはありません',
    featured_load_fail: '読み込み失敗：{msg}',
    featured_login_required: 'ログイン後におすすめデッキをご覧ください',
```

### - [ ] Step 1.7: 验证 HTML 渲染无破坏

Ensure HTTP server on port 8080:

```powershell
$test = $null
try { $test = Invoke-WebRequest -Uri "http://localhost:8080/index.html" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop } catch {}
if (-not $test) {
  Start-Process -FilePath "python" -ArgumentList "-m","http.server","8080","--directory","C:\code" -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
```

Run UI smoke to ensure nothing broke:
```powershell
node tests/_pw_ui_smoke.js
```
Expected: 68/0 全过。

---

## Task 2: 实现 `showFeaturedDecks` + `switchDecksTab` 路由

**Files:**
- Modify: `index.html`（新增函数 + 路由分支）

### - [ ] Step 2.1: 实现 `renderFeaturedDecksTab` / `showFeaturedDecks`

In `C:\code\index.html`, locate `showCloudDecks` function around line 6750. Insert the following block IMMEDIATELY BEFORE `async function showCloudDecks() {`:

```javascript
function renderFeaturedDecksTab() {
  showFeaturedDecks();
}

async function showFeaturedDecks() {
  const listEl = document.getElementById('featured-decks-list');
  if (!listEl) return;
  if (!_syncEnabled || !_sb || !_cloudUserId) {
    listEl.innerHTML = '<div style="color:#999;padding:32px 0;text-align:center">' + t('featured_login_required') + '</div>';
    return;
  }
  listEl.innerHTML = '<div style="color:#999;padding:32px 0;text-align:center">' + t('featured_loading') + '</div>';
  try {
    const { data: presetDecks, error } = await _sb.from('decks')
      .select('id,name,name_lang,card_count,updated_at')
      .eq('deck_type', 'preset')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    if (!presetDecks || !presetDecks.length) {
      listEl.innerHTML = '<div style="color:#999;padding:32px 0;text-align:center">' + t('featured_empty') + '</div>';
      return;
    }
    listEl.innerHTML = presetDecks.map(d => {
      const dl = _downloading.get(d.id);
      const job = getActiveSyncJob(d.id);
      const local = DECKS_META.find(m => m.name === d.name);
      const state = local ? computeDeckSyncState(local.key) : { status: 'remoteAhead' };
      const nameArg = `'${d.id}','${esc(d.name).replace(/'/g,'&#39;')}','${d.name_lang||'zh-CN'}'`;

      let badge = '';
      if (job) badge = `<span style="color:#888">同步中 ${job.progress.done}/${job.progress.total}</span>`;
      else if (state.status === 'clean') badge = `<span style="color:#888">已同步</span>`;
      else if (state.status === 'localDirty') badge = `<span style="color:#d97706">待上传 ${state.pushCount}</span>`;
      else if (state.status === 'remoteAhead') badge = `<span style="color:#2563eb">${state.mediaIncomplete ? '媒体缺失' : '待下载'}</span>`;
      else if (state.status === 'bothChanged') badge = `<span style="color:#7c3aed">双向 +${state.pushCount}</span>`;

      let btn;
      if (dl) {
        const txt = dl.total > 0 ? `${dl.done}/${dl.total}` : '…';
        const pauseLabel = dl.paused ? '继续' : '暂停';
        btn = `<div style="display:flex;gap:8px;align-items:center">
          <span id="dl-prog-${d.id}" style="font-size:13px;color:var(--text-sub);min-width:72px;text-align:right">${txt}</span>
          <button class="account-sync-btn" onclick="toggleDownloadPause('${d.id}')">${pauseLabel}</button>
        </div>`;
      } else if (job) {
        const pauseLabel = job._paused ? '继续' : '暂停';
        btn = `<button class="account-sync-btn" onclick="toggleSyncJobPause('${d.id}')">${pauseLabel}</button>`;
      } else if (local) {
        btn = `<button class="account-sync-btn" onclick="doSyncPresetDeckAction('${d.id}','${esc(d.name).replace(/'/g,'&#39;')}','${d.name_lang||'zh-CN'}',this)">同步</button>`;
      } else {
        btn = `<button class="account-btn account-btn-primary" style="padding:6px 16px;min-height:0;font-size:14px" onclick="doDownloadPresetDeckAction(${nameArg},this)">下载</button>`;
      }

      const sub = dl ? (dl.paused ? '已暂停' : '下载中…')
                : `${d.card_count || 0} 张卡片${local ? ' · ' : ''}${badge}`;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:600;color:var(--text)">${esc(d.name)}</div>
          <div style="font-size:12px;color:var(--text-sub);margin-top:2px">${sub}</div>
        </div>
        ${btn}
      </div>`;
    }).join('');
  } catch(e) {
    listEl.innerHTML = `<div style="color:#c00;padding:32px 0;text-align:center">` + t('featured_load_fail', { msg: esc(e.message) }) + `</div>`;
  }
}

async function doDownloadPresetDeckAction(deckId, deckName, nameLang, btnEl) {
  if (_downloading.has(deckId)) return;
  _downloading.set(deckId, { done: 0, total: 0, paused: false, pausePromise: null, pauseResolve: null });
  if (btnEl && btnEl.parentNode) {
    const subEl = btnEl.parentNode.querySelector('div > div:last-child');
    if (subEl) subEl.textContent = '下载中…';
    const progDiv = document.createElement('div');
    progDiv.style.cssText = 'display:flex;gap:8px;align-items:center';
    progDiv.innerHTML = `<span id="dl-prog-${deckId}" style="font-size:13px;color:var(--text-sub);min-width:72px;text-align:right">…</span>`
      + `<button class="account-sync-btn" onclick="toggleDownloadPause('${deckId}')">暂停</button>`;
    btnEl.parentNode.replaceChild(progDiv, btnEl);
  }
  try {
    await downloadDeckFromCloud(deckId, deckName, null, true, nameLang);
  } catch(e) { console.warn('[featured] download fail', e && e.message); }
  _downloading.delete(deckId);
  if (document.getElementById('screen-decks').classList.contains('active')) showFeaturedDecks();
}

async function doSyncPresetDeckAction(deckId, deckName, nameLang, btnEl) {
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '同步中…'; }
  try {
    await syncDeckFromCloud(deckId, deckName, btnEl, true, nameLang);
  } catch(e) { console.warn('[featured] sync fail', e && e.message); }
  if (document.getElementById('screen-decks').classList.contains('active')) showFeaturedDecks();
}
```

### - [ ] Step 2.2: 在 `switchDecksTab` 加 featured 路由

In `C:\code\index.html`, locate the `switchDecksTab` function (around line 6614-6628):

Find:
```javascript
  if (tab === 'local') renderLocalDecksTab();
  if (tab === 'cloud') renderCloudDecksTab();
}
```

Replace with:
```javascript
  if (tab === 'local') renderLocalDecksTab();
  if (tab === 'cloud') renderCloudDecksTab();
  if (tab === 'featured') renderFeaturedDecksTab();
}
```

### - [ ] Step 2.3: 验证 UI smoke 不破坏

```powershell
node tests/_pw_ui_smoke.js
```
Expected: 68/0 全过。

---

## Task 3: `doAccountLogin` + `doAccountSync` 去掉 `decks: true`

**Files:**
- Modify: `index.html`（2 处 `runSync` 调用）

### - [ ] Step 3.1: 改 `doAccountLogin`（约 line 6287）

In `C:\code\index.html`, find:

```javascript
    runSync({ modal: true, decks: true, events: true, title: t('sync_syncing_data'), deckKey: currentDeck })
      .then(() => syncAllDirtyDecks())
      .catch(e => console.warn('[sync] login sync error:', e.message));
```

Replace with:

```javascript
    runSync({ modal: true, decks: false, events: true, title: t('sync_syncing_data'), deckKey: currentDeck })
      .then(() => syncAllDirtyDecks())
      .catch(e => console.warn('[sync] login sync error:', e.message));
```

### - [ ] Step 3.2: 改 `doAccountSync`（约 line 6546）

In `C:\code\index.html`, find:

```javascript
  runSync({ modal: true, decks: true, events: true, showToast: true, deckKey: currentDeck })
```

Replace with:

```javascript
  runSync({ modal: true, decks: false, events: true, showToast: true, deckKey: currentDeck })
```

### - [ ] Step 3.3: 验证 cloud_sync 不破坏

```powershell
$env:TEST_PASSWORD = "667788"
node tests/_pw_cloud_sync.js
```
Expected: 32/0 全过（同步流程不变 + 不再触发 preset 下载）。

---

## Task 4: Playwright 测试新建

**Files:**
- Create: `tests/_pw_featured_tab.js`

### - [ ] Step 4.1: 创建测试文件

Create `C:\code\tests\_pw_featured_tab.js` with this exact code:

```javascript
/**
 * 精选 tab + 同步按钮去耦合 测试 — v5.13.12
 *
 * 依赖：python -m http.server 8080 --directory C:\code
 * 运行：node tests/_pw_featured_tab.js
 *
 * 覆盖：精选 tab 列表渲染、登录占位、未登录占位、同步按钮不再下载 preset
 */
const { chromium } = require('playwright');
const { pass, section, wait, run, getCounts, getBaseUrl, cloudLogin } = require('./_playwright_helper');

const URL = getBaseUrl() + '?v=' + Date.now();
const TEST_EMAIL = 'zyhaff@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD;

(async () => {
  if (!TEST_PASSWORD) {
    console.log('SKIP: TEST_PASSWORD not set');
    return;
  }
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(page, 1000);

    // ════ PHASE 1: 未登录时精选 tab 显示登录占位 ════
    section('PHASE 1: 未登录占位');
    await run(page, () => showScreen('screen-decks'));
    await wait(page, 400);
    await run(page, () => switchDecksTab('featured'));
    await wait(page, 500);
    let listText = await run(page, () => document.getElementById('featured-decks-list').textContent);
    pass('未登录显示"请先登录"占位', listText.includes('请先登录') || /log in|sign in|ログイン/i.test(listText));

    // ════ PHASE 2: 登录 ════
    section('PHASE 2: 登录 zyhaff');
    pass('登录成功', await cloudLogin(page, TEST_EMAIL, TEST_PASSWORD));

    // ════ PHASE 3: 进牌组管理 → 切到精选 tab ════
    section('PHASE 3: 切到精选 tab');
    await run(page, () => showScreen('screen-decks'));
    await wait(page, 500);
    await run(page, () => switchDecksTab('featured'));
    await wait(page, 1500);

    const presetCount = await run(page, () =>
      document.querySelectorAll('#featured-decks-list > div[style*="border-bottom"]').length
    );
    pass(`精选 tab 列表渲染 (${presetCount} 个 preset 牌组)`, presetCount > 0);

    // ════ PHASE 4: 列表条目结构 ════
    section('PHASE 4: 列表条目结构');
    const firstRowHasButton = await run(page, () =>
      !!document.querySelector('#featured-decks-list > div[style*="border-bottom"] button')
    );
    pass('每条目含按钮（下载或同步）', firstRowHasButton);

    // ════ PHASE 5: 切回云端 tab 不破坏 ════
    section('PHASE 5: tab 路由');
    await run(page, () => switchDecksTab('cloud'));
    await wait(page, 500);
    const cloudTabActive = await run(page, () =>
      document.getElementById('decks-panel-cloud').classList.contains('active')
    );
    pass('切回云端 tab active', cloudTabActive);

    await run(page, () => switchDecksTab('featured'));
    await wait(page, 800);
    const featuredTabActive = await run(page, () =>
      document.getElementById('decks-panel-featured').classList.contains('active')
    );
    pass('再切回精选 tab active', featuredTabActive);

    // ════ PHASE 6: doAccountSync runSync 不再传 decks: true ════
    section('PHASE 6: 同步按钮去耦合');
    // 通过 hijack runSync 验证调用参数
    await run(page, () => {
      window._lastSyncOpts = null;
      const orig = window.runSync;
      window.runSync = function(opts) {
        window._lastSyncOpts = opts;
        return orig.call(this, opts);
      };
    });
    // 走 doAccountSync 路径
    await run(page, () => doAccountSync());
    await wait(page, 1500);
    const lastOpts = await run(page, () => window._lastSyncOpts);
    pass('doAccountSync 调用 runSync', !!lastOpts);
    pass('runSync(decks: false)', lastOpts && lastOpts.decks === false);
    pass('runSync(events: true)', lastOpts && lastOpts.events === true);
    pass('runSync(modal: true)', lastOpts && lastOpts.modal === true);

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

### - [ ] Step 4.2: 跑测试

```powershell
$env:TEST_PASSWORD = "667788"
node tests/_pw_featured_tab.js
```
Expected: ~10-12 断言全过。

---

## Task 5: 全回归 + CLAUDE.md 登记 + commit

**Files:**
- Modify: `CLAUDE.md`
- Final commit

### - [ ] Step 5.1: 全回归

```powershell
node tests/run_all.js
node tests/_pw_ui_smoke.js
node tests/_pw_srs_e2e.js
node tests/_pw_deck_mgmt.js
node tests/_pw_idb_helpers.js
node tests/_pw_idb_resilience.js
node tests/_pw_js_error_report.js
```

Expected pass counts:
- `run_all`: 14 套件 / 667 断言
- `_pw_ui_smoke`: 68 断言
- `_pw_srs_e2e`: 21 断言
- `_pw_deck_mgmt`: 15 断言
- `_pw_idb_helpers`: 27 断言
- `_pw_idb_resilience`: 8 断言
- `_pw_js_error_report`: 10 断言

If `TEST_PASSWORD` set, also:
```powershell
node tests/_pw_cloud_sync.js
node tests/_pw_cross_device.js
node tests/_pw_featured_tab.js
```
Expected: 32 / 39 / ~10-12 断言全过。

### - [ ] Step 5.2: CLAUDE.md 登记新测试

In `C:\code\CLAUDE.md`, find the Playwright test table area. Add a row near other deck/cloud tests:

```
| `tests/_pw_featured_tab.js` | 精选 tab 列表 + 同步按钮去耦合（doAccountSync runSync 不再传 decks:true，~10 断言，需登录） |
```

### - [ ] Step 5.3: Commit

```powershell
git add index.html tests/_pw_featured_tab.js CLAUDE.md
git commit -m "feat: 精选牌组 tab 实现 + 同步按钮去耦合"
```

---

## Self-Review

**Spec 覆盖**（对照 `docs/superpowers/specs/2026-06-14-featured-decks-tab-design.md`）:
- ✅ §3.1 「精选」段实现 → Task 2 Step 2.1
- ✅ §3.2 switchDecksTab 路由 → Task 2 Step 2.2
- ✅ §3.3 同步按钮 + 登录去耦合 → Task 3 Step 3.1-3.2
- ✅ §3.5 i18n 5 语种 → Task 1 Step 1.2-1.6
- ✅ §3.6 错误处理（未登录 / 网络 / 空列表）→ Task 2 Step 2.1 三分支
- ✅ §5.1 Playwright 新增 → Task 4
- ✅ §5.2 回归覆盖 → Task 5 Step 5.1

**Placeholder 扫描**：无 TBD / TODO。每个 step 都有完整 code block 或精确 grep 锚点。

**Type consistency**：
- `showFeaturedDecks` / `renderFeaturedDecksTab` / `doDownloadPresetDeckAction` / `doSyncPresetDeckAction` 全文一致
- i18n key `featured_loading` / `featured_empty` / `featured_load_fail` / `featured_login_required` 在所有 5 处一致
- `decks: false` 在 Task 3 + Playwright PHASE 6 一致

**已知 risk**：
- Step 1.4 zh-Hant locale block 起点没固定 line 号（之前 grep 没显示 decks_tab_featured 在 zh-Hant 出现）。implementer 应先 grep zh-Hant block 起点（应在 line 7850 附近），找一个稳定锚点（如 `common_back: '返回'` zh-Hant 版本）插入。
- Step 1.5 es locale 同上 — block 起点在 line 8190。

---

## 不在 P 内的事

- ❌ 删除 `runSync` 内部 `if (options.decks)` 分支（保留，未来清理）
- ❌ 精选 tab 搜索 / 排序 / 标签
- ❌ 首登引导用户进精选 tab
- ❌ preset deck schema 加描述 / 封面图字段

---

## 已知风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| zh-Hant / es locale block 锚点不稳定 | 低 | Step 1.4/1.5 指引 implementer 先 grep block 起点；如不确定 stop & report |
| `_downloading` 全局 map 被 cloud tab + featured tab 同时使用 | 低 | `_downloading` 是 deckId-keyed，preset 和 personal deckId 不冲突 |
| `DECKS_META.find(m => m.name === d.name)` 用 name 匹配可能冲突 | 中 | preset 牌组 deckId 本身就是稳定标识；但本地 import 的 .yhspack 可能改名跟 preset 重名。保留 name 匹配（沿用现有 `runSync` 内同逻辑 L3976 `meta = DECKS_META.find(m => m.name === sd.name)`）|
| 同步按钮去掉 decks:true 后，已登录用户看不到新发布的 preset 牌组 | 设计如此 | 用户进精选 tab 主动看；未来可加首页 badge 提示新 preset |
