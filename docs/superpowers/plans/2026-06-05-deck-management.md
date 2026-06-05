# 牌组管理页 Implementation Plan

> **⚠️ 暂停中（2026-06-05）**：本计划等待 `docs/superpowers/specs/2026-06-05-personal-deck-sync-design.md` 同步重设计实现后再执行。届时本计划需小幅修订：`renderDeckMgmtList` 接入 `computeDeckSyncState(key)` 显示同步状态徽章。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增牌组顶层 Tab 页（含本地/云端/精选三段），将统计改为顶层 Tab，两者均保留底部 Tab Bar。

**Architecture:** 单文件 `index.html` 内联修改：新增 CSS 样式 + `screen-deck-mgmt` HTML + 更新三处 Tab Bar HTML（首页/我的/统计）+ 新增 JS 函数（showDeckMgmt / switchDeckTab / renderDeckMgmtList / renderDeckMgmtCloud / doCloudDeckActionMgmt / toggleDownloadPauseMgmt）。

**Tech Stack:** 原生 HTML/CSS/JS，IndexedDB，Supabase SDK，无依赖。

**约束（请严格遵守）：**
- 只改本计划涉及的行，不"顺手"改邻近代码
- 不确定时停下来确认，不盲目修改
- 保留 `renderDeckList()`/`showCloudDecks()`/`doCloudDeckAction()`/`toggleDownloadPause()` 原函数不动（首页依赖它们）
- 统计页改为顶层 Tab 后，`closeStats()` 函数保留不删（其他地方可能仍引用）

---

## 文件变更总览

| 文件 | 变更类型 | 行范围 |
|------|---------|-------|
| `index.html` | 新增 CSS | ~343 之后 |
| `index.html` | 改 screen-home Tab Bar | 1632–1648 |
| `index.html` | 改 screen-stats 顶栏 + 新增 Tab Bar | 1757–1828 |
| `index.html` | 改 screen-mine Tab Bar | 1899–1915 |
| `index.html` | 新增 screen-deck-mgmt HTML | ~1917（feedback sheet 之前） |
| `index.html` | 新增 JS 函数 | ~10492（renderDeckList 之前） |

---

## Task 1：新增 CSS 样式

**Files:**
- Modify: `index.html:343`（`.tab-item.action:active` 之后插入）

- [ ] **Step 1：定位插入点**

  在 `index.html` 中找到第 343 行：
  ```
  .tab-item.action:active .tab-fab { transform: scale(.93); box-shadow: none; }
  ```
  在这行的**正下方**（空一行后）插入以下 CSS。

- [ ] **Step 2：插入 CSS**

  ```css
  /* ═══ 牌组管理页 ═══ */
  .dmt-topbar {
    flex-shrink: 0; width: 100%; max-width: var(--mw);
    display: flex; align-items: center; justify-content: space-between;
    padding: calc(var(--safe-top) + 10px) 16px 8px;
  }
  .dmt-topbar-title { font-size: 17px; font-weight: 800; color: var(--ocean); }
  .dmt-topbar-btn { background: none; border: none; color: var(--red); font-size: 26px; line-height: 1; padding: 0 2px; }
  .dmt-seg {
    flex-shrink: 0; display: flex; background: var(--bg2);
    border: 1px solid var(--bd); border-radius: 8px;
    padding: 2px; margin: 0 16px 10px;
  }
  .dmt-seg-btn {
    flex: 1; padding: 6px 4px; border: none; background: none;
    border-radius: 6px; font-size: 13px; font-weight: 500;
    color: var(--text3); transition: background .2s, color .2s; cursor: pointer;
  }
  .dmt-seg-btn.active {
    background: var(--surf); color: var(--text); font-weight: 600;
    box-shadow: 0 1px 4px rgba(0,0,0,.08);
  }
  .dmt-panel { display: none; flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 16px; }
  .dmt-panel.active { display: block; }
  .dmt-hint { font-size: 12px; color: var(--text3); text-align: center; padding: 14px 0 4px; }
  .dmt-cloud-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 0; border-bottom: 1px solid var(--border);
  }
  .dmt-cloud-name { font-weight: 600; color: var(--text); }
  .dmt-cloud-sub { font-size: 12px; color: var(--text-sub); margin-top: 2px; }
  .dmt-prog-wrap { height: 4px; border-radius: 2px; background: var(--bd); margin-top: 6px; overflow: hidden; }
  .dmt-prog-fill { height: 100%; border-radius: 2px; background: var(--blue,#3b82f6); transition: width .3s; }
  ```

- [ ] **Step 3：运行测试确保无样式语法错误**

  ```powershell
  node tests/run_all.js
  ```
  预期：全部通过（CSS 语法错误会导致页面白屏，JS 测试会 import 失败）。

---

## Task 2：更新 screen-home Tab Bar（3 → 5 项）

**Files:**
- Modify: `index.html:1632–1648`

当前内容（3 个按钮：首页/练习FAB/我的）需改成 5 个按钮：首页/牌组/练习FAB/统计/我的，首页 active。

- [ ] **Step 1：替换 screen-home Tab Bar**

  找到 `index.html` 第 1632 行的注释 `<!-- Tab Bar (home active) -->` 到第 1648 行 `</div>`（共 17 行），用以下内容完整替换：

  ```html
    <!-- Tab Bar (home active) -->
    <div class="home-tabbar">
      <button class="tab-item active" onclick="showScreen('screen-home')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5z"/><path d="M9 21V13h6v8"/></svg>
        <span data-i18n="nav_home">首 页</span>
      </button>
      <button class="tab-item" onclick="showDeckMgmt()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="20" height="13" rx="2"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><line x1="2" y1="13" x2="22" y2="13"/></svg>
        <span>牌 组</span>
      </button>
      <button class="tab-item action" onclick="onFabTap()">
        <div class="tab-fab">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        </div>
        <span data-i18n="nav_start_practice">开始练习</span>
      </button>
      <button class="tab-item" onclick="openStats()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>
        <span>统 计</span>
      </button>
      <button class="tab-item" onclick="showScreen('screen-mine'); updateMineProfile()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.8 3.6-6.5 8-6.5s8 2.7 8 6.5"/></svg>
        <span data-i18n="nav_mine">我 的</span>
      </button>
    </div>
  ```

- [ ] **Step 2：运行单元测试**

  ```powershell
  node tests/run_all.js
  ```
  预期：全部通过。

---

## Task 3：更新 screen-mine Tab Bar（3 → 5 项）

**Files:**
- Modify: `index.html:1899–1915`

当前内容（3 个按钮：首页/练习FAB/我的）需改成 5 个按钮，我的 active。

- [ ] **Step 1：替换 screen-mine Tab Bar**

  找到 `index.html` 第 1899 行的注释 `<!-- Tab Bar (mine active) -->` 到第 1915 行 `</div>`（共 17 行），用以下内容完整替换：

  ```html
    <!-- Tab Bar (mine active) -->
    <div class="home-tabbar">
      <button class="tab-item" onclick="showScreen('screen-home')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5z"/><path d="M9 21V13h6v8"/></svg>
        <span data-i18n="nav_home">首 页</span>
      </button>
      <button class="tab-item" onclick="showDeckMgmt()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="20" height="13" rx="2"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><line x1="2" y1="13" x2="22" y2="13"/></svg>
        <span>牌 组</span>
      </button>
      <button class="tab-item action" onclick="onFabTap()">
        <div class="tab-fab">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        </div>
        <span data-i18n="nav_start_practice">开始练习</span>
      </button>
      <button class="tab-item" onclick="openStats()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>
        <span>统 计</span>
      </button>
      <button class="tab-item active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.8 3.6-6.5 8-6.5s8 2.7 8 6.5"/></svg>
        <span data-i18n="nav_mine">我 的</span>
      </button>
    </div>
  ```

- [ ] **Step 2：运行单元测试**

  ```powershell
  node tests/run_all.js
  ```
  预期：全部通过。

---

## Task 4：改造 screen-stats 为顶层 Tab（移除返回按钮，新增 Tab Bar）

**Files:**
- Modify: `index.html:1759–1828`（stats screen 内部）

**两处改动：**
1. 移除返回按钮（lines 1760–1762），把 `.stats-topbar` 改为居中标题（无返回/无占位 div）
2. 在 `</div>` 闭合 `screen-stats` 之前（line 1828 之前，card-detail-overlay 之后）插入 5-Tab Bar（统计 active）

- [ ] **Step 1：改造 stats-topbar（移除返回按钮）**

  找到以下原始内容（lines 1759–1765）：
  ```html
    <div class="stats-topbar">
      <button class="back-btn" onclick="closeStats()" aria-label="返回" data-i18n-aria="common_back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="stats-title" data-i18n="stats_title">统计</span>
      <div style="width:30px"></div>
    </div>
  ```

  替换为：
  ```html
    <div class="stats-topbar" style="justify-content:center">
      <span class="stats-title" data-i18n="stats_title">统计</span>
    </div>
  ```

- [ ] **Step 2：在 screen-stats 关闭 div 之前插入 5-Tab Bar**

  找到以下内容（lines 1827–1828，card-detail-overlay 之后，screen-stats 结束 div 之前）：
  ```html
    </div>
  </div>
  
  <!-- ══════════════ MINE SCREEN ══════════════ -->
  ```
  
  其中第一个 `</div>` 是 `card-detail-overlay`，第二个 `</div>` 是 `screen-stats`。
  
  在 `screen-stats` 的关闭 `</div>` **之前**（即 `card-detail-overlay` 关闭标签之后）插入 5-Tab Bar（统计 active）：

  ```html
    <!-- Tab Bar (stats active) -->
    <div class="home-tabbar">
      <button class="tab-item" onclick="showScreen('screen-home')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5z"/><path d="M9 21V13h6v8"/></svg>
        <span data-i18n="nav_home">首 页</span>
      </button>
      <button class="tab-item" onclick="showDeckMgmt()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="20" height="13" rx="2"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><line x1="2" y1="13" x2="22" y2="13"/></svg>
        <span>牌 组</span>
      </button>
      <button class="tab-item action" onclick="onFabTap()">
        <div class="tab-fab">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        </div>
        <span data-i18n="nav_start_practice">开始练习</span>
      </button>
      <button class="tab-item active" onclick="openStats()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>
        <span>统 计</span>
      </button>
      <button class="tab-item" onclick="showScreen('screen-mine'); updateMineProfile()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.8 3.6-6.5 8-6.5s8 2.7 8 6.5"/></svg>
        <span data-i18n="nav_mine">我 的</span>
      </button>
    </div>
  ```

- [ ] **Step 3：运行单元测试**

  ```powershell
  node tests/run_all.js
  ```
  预期：全部通过。

---

## Task 5：新增 screen-deck-mgmt HTML

**Files:**
- Modify: `index.html:1917`（`<!-- ══════════════ FEEDBACK SHEET ══════════════ -->` 之前插入）

- [ ] **Step 1：找到插入点**

  找到 `index.html` 中的注释行：
  ```html
  <!-- ══════════════ FEEDBACK SHEET ══════════════ -->
  ```
  在这行**之前**（空一行）插入整个 `screen-deck-mgmt` 块。

- [ ] **Step 2：插入 screen-deck-mgmt HTML**

  ```html
  <!-- ══════════════ DECK MGMT SCREEN ══════════════ -->
  <div class="screen" id="screen-deck-mgmt">
    <!-- 顶部标题栏 -->
    <div class="dmt-topbar">
      <div style="width:32px"></div>
      <span class="dmt-topbar-title">牌 组</span>
      <button class="dmt-topbar-btn advanced-only" onclick="openActionSheet()" aria-label="新建">＋</button>
    </div>

    <!-- 分段控制器：本地 / 云端 / 精选 -->
    <div class="dmt-seg">
      <button class="dmt-seg-btn active" id="dmt-seg-local" onclick="switchDeckTab('local')">本地</button>
      <button class="dmt-seg-btn" id="dmt-seg-cloud" onclick="switchDeckTab('cloud')">云端</button>
      <button class="dmt-seg-btn" id="dmt-seg-featured" onclick="switchDeckTab('featured')">精选</button>
    </div>

    <!-- 本地 Tab -->
    <div class="dmt-panel active" id="dmt-panel-local">
      <div id="dmt-local-list"></div>
      <div class="dmt-hint">左滑牌组可重命名、导出或删除</div>
    </div>

    <!-- 云端 Tab -->
    <div class="dmt-panel" id="dmt-panel-cloud">
      <div id="dmt-cloud-list">
        <div style="color:var(--text3);padding:32px 0;text-align:center">加载中…</div>
      </div>
    </div>

    <!-- 精选 Tab -->
    <div class="dmt-panel" id="dmt-panel-featured">
      <div style="color:var(--text3);padding:48px 0;text-align:center;font-size:14px">精选内容即将推出</div>
    </div>

    <!-- Tab Bar (牌组 active) -->
    <div class="home-tabbar">
      <button class="tab-item" onclick="showScreen('screen-home')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5z"/><path d="M9 21V13h6v8"/></svg>
        <span data-i18n="nav_home">首 页</span>
      </button>
      <button class="tab-item active" onclick="showDeckMgmt()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="20" height="13" rx="2"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><line x1="2" y1="13" x2="22" y2="13"/></svg>
        <span>牌 组</span>
      </button>
      <button class="tab-item action" onclick="onFabTap()">
        <div class="tab-fab">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>
        </div>
        <span data-i18n="nav_start_practice">开始练习</span>
      </button>
      <button class="tab-item" onclick="openStats()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>
        <span>统 计</span>
      </button>
      <button class="tab-item" onclick="showScreen('screen-mine'); updateMineProfile()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.8 3.6-6.5 8-6.5s8 2.7 8 6.5"/></svg>
        <span data-i18n="nav_mine">我 的</span>
      </button>
    </div>
  </div>

  ```

- [ ] **Step 3：运行单元测试**

  ```powershell
  node tests/run_all.js
  ```
  预期：全部通过。

---

## Task 6：新增 JS 函数（导航 + 本地列表渲染）

**Files:**
- Modify: `index.html`（在 `// ── home 3rd column (today done) ─────────────────────────────────` 注释行之前插入，约 10492 行）

- [ ] **Step 1：找到插入点**

  找到 `index.html` 中的注释：
  ```javascript
  // ── home 3rd column (today done) ─────────────────────────────────
  function renderDeckList() {
  ```
  在这行**之前**插入以下函数。

- [ ] **Step 2：插入 showDeckMgmt / switchDeckTab / renderDeckMgmtList**

  ```javascript
  // ── deck management screen ────────────────────────────────────────
  function showDeckMgmt() {
    showScreen('screen-deck-mgmt');
    switchDeckTab('local');
  }

  function switchDeckTab(tab) {
    ['local', 'cloud', 'featured'].forEach(function(t) {
      document.getElementById('dmt-panel-' + t).classList.toggle('active', t === tab);
      document.getElementById('dmt-seg-' + t).classList.toggle('active', t === tab);
    });
    if (tab === 'local') renderDeckMgmtList();
    else if (tab === 'cloud') renderDeckMgmtCloud();
  }

  function renderDeckMgmtList() {
    var listEl = document.getElementById('dmt-local-list');
    if (!listEl) return;
    if (!DECKS_META.length) {
      listEl.innerHTML = '<div style="color:var(--text3);padding:32px 0;text-align:center">暂无牌组，点右上角 ＋ 新建</div>';
      return;
    }
    var swipeActionsWidth = 192;
    listEl.innerHTML = DECKS_META.map(function(m) {
      var swipeExport = '<button class="swipe-action-btn swipe-export" onclick="event.stopPropagation();exportDeck(\'' + m.key + '\')">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        '<span>' + t('common_export') + '</span></button>';
      var swipeRename = '<button class="swipe-action-btn swipe-rename" onclick="event.stopPropagation();renameDeck(\'' + m.key + '\').then(function(){renderDeckMgmtList()})">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '<span>' + t('common_rename') + '</span></button>';
      var swipeDel = m.builtin ? '' :
        '<button class="swipe-action-btn swipe-del" onclick="event.stopPropagation();deleteDeck(event,\'' + m.key + '\').then(function(){renderDeckMgmtList()})">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>' +
        '<span>' + t('common_delete') + '</span></button>';
      return '<div class="deck-card" data-deck="' + m.key + '" data-swipeable>' +
        '<div class="deck-card-actions">' + swipeExport + swipeRename + swipeDel + '</div>' +
        '<div class="deck-card-inner" data-deck="' + m.key + '">' +
          '<div class="deck-info"><div class="deck-name">' + esc(m.name) + '</div></div>' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text3);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>' +
      '</div>';
    }).join('');
    if (!listEl._swipeInit) { initDeckSwipe(listEl); listEl._swipeInit = true; }
  }

  ```

- [ ] **Step 3：运行单元测试**

  ```powershell
  node tests/run_all.js
  ```
  预期：全部通过。

---

## Task 7：新增 JS 函数（云端 Tab 渲染）

**Files:**
- Modify: `index.html`（紧接 Task 6 插入的函数之后，即 `renderDeckMgmtList` 函数结束后）

- [ ] **Step 1：在 renderDeckMgmtList 结束后插入以下函数**

  ```javascript
  async function renderDeckMgmtCloud() {
    var listEl = document.getElementById('dmt-cloud-list');
    if (!listEl) return;
    if (!_syncEnabled || !_sb || !_cloudUserId) {
      listEl.innerHTML = '<div style="color:var(--text3);padding:32px 0;text-align:center">请先登录</div>';
      return;
    }
    listEl.innerHTML = '<div style="color:var(--text3);padding:32px 0;text-align:center">加载中…</div>';
    try {
      var result = await _sb.from('decks')
        .select('id,name,name_lang,card_count,updated_at')
        .eq('user_id', _cloudUserId)
        .eq('deck_type', 'personal')
        .order('updated_at', { ascending: false });
      if (result.error) throw new Error(result.error.message);
      var cloudDecks = result.data;
      if (!cloudDecks || !cloudDecks.length) {
        listEl.innerHTML = '<div style="color:var(--text3);padding:32px 0;text-align:center">云端没有个人牌组</div>';
        return;
      }
      listEl.innerHTML = cloudDecks.map(function(d) {
        var dl = _downloading.get(d.id);
        var local = DECKS_META.find(function(m) { return m.key === d.id; });
        var nameArg = '\'' + d.id + '\',\'' + esc(d.name).replace(/'/g, '&#39;') + '\',\'' + (d.name_lang || 'zh-CN') + '\'';
        var btn;
        if (dl) {
          var txt = dl.total > 0 ? (dl.done + '/' + dl.total) : '…';
          var pauseLabel = dl.paused ? '继续' : '暂停';
          btn = '<div style="display:flex;gap:8px;align-items:center">' +
            '<span id="dmt-dl-prog-' + d.id + '" style="font-size:13px;color:var(--text-sub);min-width:72px;text-align:right">' + txt + '</span>' +
            '<button class="account-sync-btn" onclick="toggleDownloadPauseMgmt(\'' + d.id + '\')">' + pauseLabel + '</button>' +
            '</div>';
        } else if (local) {
          btn = '<button class="account-sync-btn" onclick="doCloudDeckActionMgmt(' + nameArg + ',this)">同步</button>';
        } else {
          btn = '<button class="account-btn account-btn-primary" style="padding:6px 16px;min-height:0;font-size:14px" onclick="doCloudDeckActionMgmt(' + nameArg + ',this)">下载</button>';
        }
        var sub = dl ? (dl.paused ? '已暂停' : '下载中…') : ((d.card_count || 0) + ' 张卡片' + (local ? ' · 已下载' : ''));
        return '<div class="dmt-cloud-row">' +
          '<div>' +
            '<div class="dmt-cloud-name">' + esc(d.name) + '</div>' +
            '<div class="dmt-cloud-sub">' + sub + '</div>' +
          '</div>' +
          btn +
        '</div>';
      }).join('');
    } catch(e) {
      listEl.innerHTML = '<div style="color:#c00;padding:32px 0;text-align:center">加载失败：' + esc(e.message) + '</div>';
    }
  }

  async function doCloudDeckActionMgmt(deckId, deckName, nameLang, btnEl) {
    if (_downloading.has(deckId)) return;
    _downloading.set(deckId, { done: 0, total: 0, paused: false, pausePromise: null, pauseResolve: null });
    if (btnEl && btnEl.parentNode) {
      var subEl = btnEl.parentNode.querySelector('div > div:last-child');
      if (subEl) subEl.textContent = '下载中…';
      var progDiv = document.createElement('div');
      progDiv.style.cssText = 'display:flex;gap:8px;align-items:center';
      progDiv.innerHTML = '<span id="dmt-dl-prog-' + deckId + '" style="font-size:13px;color:var(--text-sub);min-width:72px;text-align:right">…</span>' +
        '<button class="account-sync-btn" onclick="toggleDownloadPauseMgmt(\'' + deckId + '\')">暂停</button>';
      btnEl.parentNode.replaceChild(progDiv, btnEl);
    }
    await downloadPersonalDeckFromCloud(deckId, deckName, nameLang, function(done, total) {
      var s = _downloading.get(deckId);
      if (s) { s.done = done; s.total = total; }
      var liveEl = document.getElementById('dmt-dl-prog-' + deckId);
      if (liveEl) liveEl.textContent = done + '/' + total;
    });
    _downloading.delete(deckId);
    await renderDeckMgmtCloud();
  }

  function toggleDownloadPauseMgmt(deckId) {
    var s = _downloading.get(deckId);
    if (!s) return;
    if (!s.paused) {
      s.paused = true;
      s.pausePromise = new Promise(function(resolve) { s.pauseResolve = resolve; });
    } else {
      s.paused = false;
      if (s.pauseResolve) s.pauseResolve();
      s.pausePromise = null; s.pauseResolve = null;
    }
    renderDeckMgmtCloud();
  }

  ```

- [ ] **Step 2：运行单元测试**

  ```powershell
  node tests/run_all.js
  ```
  预期：全部通过。

---

## Task 8：UI 冒烟测试

- [ ] **Step 1：启动本地服务器（PowerShell 独立窗口）**

  ```powershell
  python -m http.server 8080 --directory C:\code
  ```

- [ ] **Step 2：运行 UI 冒烟**

  新开 PowerShell：
  ```powershell
  node tests/_pw_ui_smoke.js
  ```
  预期：≥64 assertions passed，0 failed。

- [ ] **Step 3：手动验证关键路径（浏览器打开 http://localhost:8080）**

  - [ ] 首页底部 Tab Bar 显示 5 个入口（首页/牌组/练习/统计/我的）
  - [ ] 点「牌组」Tab → 进入牌组管理页，底部 Tab Bar 保留，「牌组」高亮
  - [ ] 牌组管理页「本地」Tab 显示牌组列表，左滑出现操作按钮
  - [ ] 点「云端」Tab → 显示云端列表或「请先登录」
  - [ ] 点「精选」Tab → 显示「即将推出」
  - [ ] 点「＋」按钮 → 弹出 action sheet（仅 advanced mode 可见）
  - [ ] 点统计 Tab → 进入统计页，顶部无返回按钮，底部有 5-Tab Bar，「统计」高亮
  - [ ] 在统计页点「首页」Tab → 回首页

- [ ] **Step 4：提交**

  ```powershell
  git add index.html
  git commit -m "feat: 新增牌组顶层 Tab 页，统计改为顶层 Tab，均保留底部 Tab Bar"
  ```

---

## 已知限制（可接受）

1. **点击牌组管理页的牌组卡片** → 进入 `showDeckDetail()`，从详情页返回时 `goHome()` 跳回首页而非牌组管理页。属预期行为，后续可优化。
2. **统计 `closeStats()` 函数** 保留但不再被 Tab Bar 调用（原返回按钮已移除）。函数留着无副作用。
3. **牌组管理页的 ＋ 按钮** 使用 `advanced-only` CSS 类，在非高级模式下不可见（与首页一致）。
