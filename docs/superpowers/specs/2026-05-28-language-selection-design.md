# 语言选择功能设计文档

**日期**：2026-05-28  
**范围**：Part A — 新增 `screen-lang` 语言选择页 + 设置抽屉入口  
**不含**：设置重构（Tab→分组列表）、Mine 头部重设计（留待后续 Part B）

---

## 背景

App 已有完整 i18n 后端（`setLocale()`、`getLocale()`、`SUPPORTED_LOCALES=['en','zh-CN','es']`、`applyI18n()`），但界面上没有任何让用户切换语言的入口。目前语言由 `navigator.language` 自动检测，用户无法手动覆盖。

---

## 设计决策记录

| 问题 | 决策 | 理由 |
|---|---|---|
| 控件类型 | 独立全屏选择页 | 用户习惯 iOS 层层进入模式；分段按钮/下拉框在语言切换这种全局操作上体验不够郑重 |
| 顶栏布局 | ‹ 返回 \| 界面语言 \| 确定 | 与 app 现有页面风格一致（箭头返回），右上角蓝色文字确认 |
| 生效时机 | 点击确定后生效 | 避免误触切换语言；← 取消不保存 |
| 设置入口位置 | 通用 Tab → 显示 section，紧随深色模式之后 | 最小改动，不破坏现有设置结构；Part B 再整体重构 |
| 导航返回落地页 | 关闭设置抽屉 → screen-mine | 语言切换后整个 UI 重渲染，回 Mine 最自然 |

---

## 功能范围

### 新增：`screen-lang` 全屏页

**结构**：
```
┌─────────────────────────────┐
│  ‹        界面语言      确定  │  ← 顶栏
├─────────────────────────────┤
│  🇨🇳  中文（简体）          ✓  │  ← 当前选中，高亮行
│       Chinese Simplified      │
├─────────────────────────────┤
│  🇺🇸  English                 │
│       英语                    │
├─────────────────────────────┤
│  🇪🇸  Español                 │
│       西班牙语                │
└─────────────────────────────┘
```

**交互**：
- 进入页面时，高亮显示当前语言（`getLocale()`）
- 点击语言行 → 该行选中（单选，视觉高亮），**不立即调用 `setLocale()`**
- 点击**确定** → 若选中项与当前语言不同，调用 `setLocale(newLoc)` → 关闭页面回到 `screen-mine`
- 点击**‹**（返回）→ 丢弃选择，回到 `screen-mine`
- 若未做任何选择直接确定 → 不调用 `setLocale()`，直接返回

**状态**：临时变量 `_pendingLocale`，仅在页面内有效，离开即丢弃（若未确认）

---

### 修改：设置抽屉入口

**位置**：`settings-overlay` → Tab 0（通用）→ `显示` section → 深色模式行之后插入：

```html
<!-- 新增行 -->
<div class="sheet-row" onclick="openLangPicker()" style="cursor:pointer">
  <span class="sheet-row-lbl" data-i18n="settings_lang">界面语言</span>
  <span id="settings-lang-val" style="color:var(--text3);font-size:13px">中文</span>
  <span style="color:var(--text3);margin-left:4px">›</span>
</div>
```

**`openLangPicker()` 逻辑**：
1. `closeSettings()` — 关闭设置抽屉
2. `navigateTo('screen-lang')` — 推入语言选择页（或等价的 screen 切换）
3. 初始化页面：读取 `getLocale()`，高亮对应行，重置 `_pendingLocale`

---

## 需要新增的内容

### HTML

- `screen-lang` 全屏 div，结构参考 `screen-theme`（同款顶栏 CSS）
- 设置抽屉 显示 section 新增一行

### CSS

- `.lang-row`：语言列表行，含旗帜、主名、英文副名、选中勾
- `.lang-row.selected`：选中高亮（`background: var(--acc-light)` 或类似）
- 复用现有顶栏 CSS（`.theme-topbar`、`.back-btn`）

### JS

| 函数 | 作用 |
|---|---|
| `openLangPicker()` | 关闭设置 → 进入语言页，初始化选中状态 |
| `selectLang(loc)` | 点击语言行时设置 `_pendingLocale`，更新 UI 高亮 |
| `confirmLang()` | 确定按钮：若有变更则 `setLocale(_pendingLocale)`，返回 Mine |
| `cancelLang()` | 返回按钮：丢弃 `_pendingLocale`，返回 Mine |
| 更新 `settings-lang-val` | `setLocale()` 调用后同步更新设置行显示的当前语言名 |

### i18n 新增 key

| Key | zh-CN | en | es |
|---|---|---|---|
| `settings_lang` | 界面语言 | Language | Idioma |
| `lang_zh_CN` | 中文（简体） | Chinese (Simplified) | Chino (Simplificado) |
| `lang_en` | 英语 | English | Inglés |
| `lang_es` | 西班牙语 | Spanish | Español |
| `lang_screen_title` | 界面语言 | Language | Idioma |
| `lang_confirm` | 确定 | Done | Listo |

---

## 导航流程

```
screen-mine
  └─ 点击「设置」→ 打开 settings-overlay
       └─ 点击「界面语言 ›」→ closeSettings() → screen-lang
            ├─ 点击「‹」→ screen-mine（丢弃）
            └─ 点击「确定」→ setLocale() → screen-mine（已生效）
```

---

## 不在本次范围内

- 设置抽屉重构为全屏页（Part B）
- 主题从 Mine 菜单移入设置（Part B）
- Mine 头部区域重设计（Part B）
- 增加新语言支持（当前仅 en / zh-CN / es）

---

## 测试要点

| 场景 | 预期 |
|---|---|
| 进入语言页，当前语言高亮 | `getLocale()` 对应行显示 ✓ |
| 选择不同语言后点确定 | `setLocale()` 被调用，UI 全局重渲染，设置行显示新语言 |
| 选择后点 ← 取消 | 语言不变，设置行不变 |
| 选择与当前相同后点确定 | `setLocale()` 不被调用，直接返回 |
| 语言切换后设置行文字同步 | 显示新语言名（已翻译） |
| localStorage 持久化 | 刷新后语言保持 |
| Playwright `_pw_ui_smoke.js` | 新增语言切换冒烟断言 |
