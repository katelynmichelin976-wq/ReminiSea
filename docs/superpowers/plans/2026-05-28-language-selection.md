# Language Selection (Part A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置抽屉里新增「界面语言」入口行，并实现 `screen-lang` 全屏语言选择页，用户点击后可选择语言、确定后生效，取消则丢弃。

**Architecture:** 单文件应用（`yihai_v5.1.html`）。i18n 后端（`setLocale()`/`getLocale()`）已完备，本次只加 UI 层：CSS + HTML screen + JS 四个函数 + 设置行入口。TDD：先写 Playwright 失败测试，再实现，再验证通过。

**Tech Stack:** 原生 HTML/CSS/JS，Playwright (Node.js) 用于 UI 测试。

---

## 文件改动清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `yihai_v5.1.html` | Modify | 全部改动：CSS、HTML、JS、i18n |
| `tests/_pw_ui_smoke.js` | Modify | 新增 Phase 8 语言选择器冒烟测试 |

---

## Task 1: 写 Playwright 失败测试

**Files:**
- Modify: `tests/_pw_ui_smoke.js`

- [ ] **Step 1.1: 在 `_pw_ui_smoke.js` 末尾 `finally` 块之前插入 Phase 8**

在 `// ════ PHASE 7: 核心函数存在性 ════` 段落结束后、`} finally {` 之前，插入：

```javascript
    // ════ PHASE 8: 语言选择器 ════
    section('PHASE 8: 语言选择器');

    // 函数与元素存在性
    pass('screen-lang 元素存在', await run(page, () => !!document.getElementById('screen-lang')));
    pass('openLangPicker 函数存在', await run(page, () => typeof openLangPicker === 'function'));
    pass('selectLang 函数存在', await run(page, () => typeof selectLang === 'function'));
    pass('confirmLang 函数存在', await run(page, () => typeof confirmLang === 'function'));
    pass('cancelLang 函数存在', await run(page, () => typeof cancelLang === 'function'));

    // 打开语言页
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 200);
    await run(page, () => showScreen('screen-mine'));
    await wait(page, 300);
    await run(page, () => openLangPicker());
    await wait(page, 400);
    pass('openLangPicker → screen-lang active', await run(page, () =>
      document.getElementById('screen-lang')?.classList.contains('active')
    ));
    pass('当前语言行有 selected 样式', await run(page, () =>
      document.querySelector('.lang-row.selected') !== null
    ));
    pass('zh-CN 行初始选中', await run(page, () =>
      document.querySelector('.lang-row.selected')?.dataset.lang === 'zh-CN'
    ));

    // 选择 English，确定
    await run(page, () => selectLang('en'));
    await wait(page, 200);
    pass('selectLang(en) → en 行高亮', await run(page, () =>
      document.querySelector('.lang-row.selected')?.dataset.lang === 'en'
    ));
    await run(page, () => confirmLang());
    await wait(page, 400);
    pass('confirmLang → screen-mine active', await run(page, () =>
      document.getElementById('screen-mine')?.classList.contains('active')
    ));
    pass('confirmLang → setLocale(en) 生效', await run(page, () => getLocale() === 'en'));

    // 取消不保存
    await run(page, () => setLocale('zh-CN'));
    await wait(page, 200);
    await run(page, () => openLangPicker());
    await wait(page, 300);
    await run(page, () => selectLang('es'));
    await wait(page, 100);
    await run(page, () => cancelLang());
    await wait(page, 300);
    pass('cancelLang → screen-mine active', await run(page, () =>
      document.getElementById('screen-mine')?.classList.contains('active')
    ));
    pass('cancelLang → locale 未变（仍 zh-CN）', await run(page, () => getLocale() === 'zh-CN'));

    // 设置行显示当前语言
    await run(page, () => openSettingsWithSrs());
    await wait(page, 300);
    pass('settings-lang-val 显示「中文」', await run(page, () => {
      const el = document.getElementById('settings-lang-val');
      return el && el.textContent.trim() === '中文';
    }));
    pass('settings 中有「界面语言」入口行', await run(page, () =>
      !!document.getElementById('settings-lang-val')
    ));
    await run(page, () => document.getElementById('settings-overlay').classList.remove('open'));
    await wait(page, 200);
```

- [ ] **Step 1.2: 更新文件顶部注释中的断言计数**

找到文件顶部注释 `26 断言`，改为 `40 断言`（新增 14 个断言）。

- [ ] **Step 1.3: 确认 HTTP 服务已启动，运行测试，验证 Phase 8 失败**

```powershell
node tests/_pw_ui_smoke.js
```

预期：Phase 1-7 通过，Phase 8 所有断言失败（`screen-lang 元素存在: FAIL` 等）。

- [ ] **Step 1.4: 提交失败测试**

```powershell
git add tests/_pw_ui_smoke.js
git commit -m "test: 新增语言选择器 Playwright 冒烟测试（预期失败）"
```

---

## Task 2: 新增 i18n key

**Files:**
- Modify: `yihai_v5.1.html`（I18N 对象，三处）

i18n 后端只需新增一个 key：`settings_lang`（设置行标签 + 语言页顶栏标题复用同一个 key）。语言列表的名称硬编码（各自的原生名称，不随 UI 语言切换）。

- [ ] **Step 2.1: 在 en 语言包中添加 key**

搜索 `settings_dark_mode: 'Dark Mode'`，在其**后面**插入：

```javascript
    settings_lang: 'Language',
```

- [ ] **Step 2.2: 在 zh-CN 语言包中添加 key**

搜索 `settings_dark_mode: '深色模式'`，在其**后面**插入：

```javascript
    settings_lang: '界面语言',
```

- [ ] **Step 2.3: 在 es 语言包中添加 key**

搜索 `settings_dark_mode: 'Modo oscuro'`，在其**后面**插入：

```javascript
    settings_lang: 'Idioma',
```

- [ ] **Step 2.4: 提交**

```powershell
git add yihai_v5.1.html
git commit -m "feat: 新增 settings_lang i18n key（三语言）"
```

---

## Task 3: 新增 CSS

**Files:**
- Modify: `yihai_v5.1.html`（CSS 块）

- [ ] **Step 3.1: 在 `.theme-card` 相关 CSS 附近插入语言选择器 CSS**

搜索 `.theme-scroll {`，在其**前面**插入：

```css
/* ── Language Picker ── */
.lang-scroll { flex: 1; overflow-y: auto; padding: 12px 0; }
.lang-list { background: var(--surf); border-radius: 12px; margin: 0 16px; overflow: hidden; }
.lang-row {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px;
  border-top: 1px solid var(--bd);
  cursor: pointer;
  transition: background .15s;
}
.lang-row:first-child { border-top: none; }
.lang-flag { font-size: 24px; line-height: 1; flex-shrink: 0; }
.lang-info { flex: 1; }
.lang-name { font-size: 15px; color: var(--text); font-weight: 500; }
.lang-name-sub { font-size: 12px; color: var(--text2); margin-top: 2px; }
.lang-check { color: var(--ocean); font-size: 18px; font-weight: 700; display: none; }
.lang-row.selected { background: var(--ocean-lt); }
.lang-row.selected .lang-check { display: block; }
.lang-confirm-btn {
  background: none; border: none; color: var(--ocean);
  font-size: 15px; font-weight: 600; cursor: pointer;
  padding: 4px 8px; font-family: inherit; line-height: 1;
}
```

- [ ] **Step 3.2: 提交**

```powershell
git add yihai_v5.1.html
git commit -m "feat: 新增语言选择器 CSS"
```

---

## Task 4: 新增 screen-lang HTML + 设置抽屉入口

**Files:**
- Modify: `yihai_v5.1.html`（HTML 结构，两处）

- [ ] **Step 4.1: 在 screen-about 结束后插入 screen-lang**

搜索 `<!-- ══════════════ about ══════════════ -->` 这行注释**之前**（即紧接在它前面），插入：

```html
<!-- ══════════════ language picker ══════════════ -->
<div class="screen screen-lang" id="screen-lang">
  <div class="theme-topbar">
    <button class="back-btn" onclick="cancelLang()" aria-label="返回" data-i18n-aria="common_back">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <span class="theme-topbar-title" data-i18n="settings_lang">界面语言</span>
    <button class="lang-confirm-btn" onclick="confirmLang()" data-i18n="common_confirm">确定</button>
  </div>
  <div class="lang-scroll">
    <div class="lang-list">
      <div class="lang-row" data-lang="zh-CN" onclick="selectLang('zh-CN')">
        <span class="lang-flag">🇨🇳</span>
        <div class="lang-info">
          <div class="lang-name">中文（简体）</div>
          <div class="lang-name-sub">Chinese Simplified</div>
        </div>
        <span class="lang-check">✓</span>
      </div>
      <div class="lang-row" data-lang="en" onclick="selectLang('en')">
        <span class="lang-flag">🇺🇸</span>
        <div class="lang-info">
          <div class="lang-name">English</div>
          <div class="lang-name-sub">英语</div>
        </div>
        <span class="lang-check">✓</span>
      </div>
      <div class="lang-row" data-lang="es" onclick="selectLang('es')">
        <span class="lang-flag">🇪🇸</span>
        <div class="lang-info">
          <div class="lang-name">Español</div>
          <div class="lang-name-sub">西班牙语</div>
        </div>
        <span class="lang-check">✓</span>
      </div>
    </div>
  </div>
</div>

```

- [ ] **Step 4.2: 在设置抽屉「深色模式」行之后插入「界面语言」行**

搜索：
```html
            <label class="stoggle">
              <input type="checkbox" id="dark-toggle" onchange="toggleTheme(this)">
              <div class="stoggle-track"></div>
              <div class="stoggle-thumb"></div>
            </label>
          </div>
```

在该 `</div>` 的**后面**（即深色模式 `.sheet-row` 的闭合 `</div>` 后）插入：

```html
          <div class="sheet-row" onclick="openLangPicker()" style="cursor:pointer">
            <span class="sheet-row-lbl" data-i18n="settings_lang">界面语言</span>
            <div style="display:flex;align-items:center;gap:4px">
              <span id="settings-lang-val" style="color:var(--text3);font-size:13px"></span>
              <span style="color:var(--text3);font-size:13px">›</span>
            </div>
          </div>
```

- [ ] **Step 4.3: 提交**

```powershell
git add yihai_v5.1.html
git commit -m "feat: 新增 screen-lang HTML 与设置抽屉入口"
```

---

## Task 5: 新增 JS 函数

**Files:**
- Modify: `yihai_v5.1.html`（JS 块，两处）

- [ ] **Step 5.1: 在 `setLocale()` 函数之后插入语言选择器 JS**

搜索 `function applyI18n() {`，在其**前面**插入：

```javascript
// ── Language Picker ──────────────────────────────────────────────
let _pendingLocale = null;

function _updateSettingsLangVal() {
  const el = document.getElementById('settings-lang-val');
  if (!el) return;
  const names = { 'zh-CN': '中文', 'en': 'English', 'es': 'Español' };
  el.textContent = names[getLocale()] || getLocale();
}

function openLangPicker() {
  closeSettings();
  _pendingLocale = getLocale();
  document.querySelectorAll('.lang-row').forEach(r => {
    r.classList.toggle('selected', r.dataset.lang === _pendingLocale);
  });
  showScreen('screen-lang');
}

function selectLang(loc) {
  _pendingLocale = loc;
  document.querySelectorAll('.lang-row').forEach(r => {
    r.classList.toggle('selected', r.dataset.lang === loc);
  });
}

function confirmLang() {
  if (_pendingLocale && _pendingLocale !== getLocale()) {
    setLocale(_pendingLocale);
  }
  _pendingLocale = null;
  showScreen('screen-mine');
}

function cancelLang() {
  _pendingLocale = null;
  showScreen('screen-mine');
}
```

- [ ] **Step 5.2: 在 `openSettings()` 函数中追加 `_updateSettingsLangVal()` 调用**

找到：
```javascript
function openSettings(){
  document.getElementById('settings-overlay').classList.add('open');
  // refresh voice list on each open, ensure iOS voice packs show after loading
  populateVoiceList();
  loadDailyGoalUI();
}
```

替换为：
```javascript
function openSettings(){
  document.getElementById('settings-overlay').classList.add('open');
  // refresh voice list on each open, ensure iOS voice packs show after loading
  populateVoiceList();
  loadDailyGoalUI();
  _updateSettingsLangVal();
}
```

- [ ] **Step 5.3: 提交**

```powershell
git add yihai_v5.1.html
git commit -m "feat: 新增语言选择器 JS（openLangPicker/selectLang/confirmLang/cancelLang）"
```

---

## Task 6: 验证测试通过，跑回归，最终提交

**Files:**
- Run: `tests/_pw_ui_smoke.js`
- Run: `tests/run_all.js`

- [ ] **Step 6.1: 确认 HTTP 服务已启动**

```powershell
# 如未启动，在单独终端执行：
python -m http.server 8080 --directory C:\code
```

- [ ] **Step 6.2: 运行 Playwright 冒烟测试**

```powershell
node tests/_pw_ui_smoke.js
```

预期输出（Phase 8 全部通过）：
```
════ PHASE 8: 语言选择器 ════
  ✓ screen-lang 元素存在
  ✓ openLangPicker 函数存在
  ✓ selectLang 函数存在
  ✓ confirmLang 函数存在
  ✓ cancelLang 函数存在
  ✓ openLangPicker → screen-lang active
  ✓ 当前语言行有 selected 样式
  ✓ zh-CN 行初始选中
  ✓ selectLang(en) → en 行高亮
  ✓ confirmLang → screen-mine active
  ✓ confirmLang → setLocale(en) 生效
  ✓ cancelLang → screen-mine active
  ✓ cancelLang → locale 未变（仍 zh-CN）
  ✓ settings-lang-val 显示「中文」
  ✓ settings 中有「界面语言」入口行

通过: 40  失败: 0
```

若有失败 → 根据失败信息定位问题，修复后重跑，**不要继续下一步**。

- [ ] **Step 6.3: 运行单元测试回归**

```powershell
node tests/run_all.js
```

预期：`通过 304 / 失败 0`

- [ ] **Step 6.4: 更新 CLAUDE.md 中 Playwright 断言计数**

找到 `_pw_ui_smoke 26`，改为 `_pw_ui_smoke 40`。

- [ ] **Step 6.5: 最终提交**

```powershell
git add yihai_v5.1.html tests/_pw_ui_smoke.js CLAUDE.md
git commit -m "feat: 语言选择功能（screen-lang + 设置入口，Part A）"
```

---

## 自检记录

**Spec 覆盖：**
- ✅ `screen-lang` HTML → Task 4.1
- ✅ 顶栏 ‹ | 界面语言 | 确定 → Task 4.1
- ✅ 单选高亮，不立即生效 → Task 5.1 (`selectLang`)
- ✅ 确定调用 `setLocale()` → Task 5.1 (`confirmLang`)
- ✅ 取消丢弃 → Task 5.1 (`cancelLang`)
- ✅ 设置行入口（显示 section，深色模式后）→ Task 4.2
- ✅ `settings-lang-val` 同步显示当前语言 → Task 5.1 + 5.2
- ✅ Playwright 测试 → Task 1
- ✅ i18n key `settings_lang` 三语言 → Task 2
- ✅ localStorage 持久化：已由现有 `setLocale()` 处理，无需额外代码
