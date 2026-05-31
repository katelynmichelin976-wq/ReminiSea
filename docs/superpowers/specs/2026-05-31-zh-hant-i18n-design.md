# 繁體中文（zh-Hant）支援設計規格

**日期：** 2026-05-31  
**版本目標：** 下一個 minor 版本  
**狀態：** 已批准

---

## 背景

忆海拾光目前支援三個介面語言：`en`、`zh-CN`、`es`。部分使用者的系統語言設定為繁體中文（`zh-TW`、`zh-HK`、`zh-Hant`），目前 `detectLocale` 的前綴匹配會將這些語言映射到 `zh-CN`（簡體中文），顯示效果不符合使用者預期。本次新增通用繁體中文 locale `zh-Hant`，以符合台灣、香港及海外繁體中文使用者的閱讀習慣。

---

## 範圍

- 介面語言新增 `zh-Hant`（通用繁體中文，不綁定特定地區）
- 語言選擇頁新增選項
- TTS 語音自動選擇邏輯補充
- 相關單元測試與 Playwright smoke 測試更新

**不在本次範圍內：**
- 卡片內容語言的繁體支援（卡片 `lang` 欄位保持不變）
- 其他語言（en/es）的 TTS 自動選取邏輯
- 字形動態轉換機制

---

## 架構設計

### 1. 常量與資料

**`SUPPORTED_LOCALES`** 改為：
```js
const SUPPORTED_LOCALES = ['en', 'zh-CN', 'zh-Hant', 'es'];
```

**`FALLBACK_LOCALE`** 保持 `'en'` 不變。

**`I18N` 字典** 新增 `'zh-Hant'` 區塊（約 287 個 key），放在 `'zh-CN'` 之後、`'es'` 之前。翻譯由 Claude 生成，採通用繁體中文詞彙（不偏向台灣或香港特定用語）。

**`detectLocale` 映射更新：**
- `zh-TW` → `zh-Hant`
- `zh-HK` → `zh-Hant`  
- `zh-Hant` → `zh-Hant`
- 原有 `zh-CN` 前綴匹配 → `zh-CN`（不受影響）

目前的前綴匹配邏輯（取 `-` 前部分比對）會將 `zh-TW` 的前綴 `zh` 與 `zh-CN` 的前綴 `zh` 視為相同，導致 `zh-TW` 被誤匹配到 `zh-CN`。**修復方式：在精確匹配之後、前綴匹配之前，插入繁體變體的顯式映射**：

```js
// 繁體變體顯式映射（在前綴匹配之前執行）
const traditionalVariants = ['zh-tw', 'zh-hk', 'zh-mo', 'zh-hant'];
if (traditionalVariants.includes(lower) && supported.includes('zh-Hant')) return 'zh-Hant';
```

此後前綴匹配邏輯不需改動，`zh-CN` 仍透過前綴 `zh` 正常匹配。

**`const names` 更新：**
```js
const names = { 'zh-CN': '中文', 'zh-Hant': '繁體中文', 'en': 'English', 'es': 'Español' };
```

### 2. 語言選擇頁 UI

移除所有行的國旗 emoji（包含現有 zh-CN、en、es 三行）。

新增 `zh-Hant` 行，插入 zh-CN 之後：

```html
<div class="lang-row" data-lang="zh-Hant" onclick="selectLang('zh-Hant')">
  <div class="lang-info">
    <div class="lang-name">中文（繁體）</div>
    <div class="lang-name-sub">Chinese Traditional</div>
  </div>
  <span class="lang-check">✓</span>
</div>
```

現有三行同步移除 `<span class="lang-flag">...</span>`。

### 3. TTS 語音選擇

`speak()` 函數在自動模式（未設定 `TTS_VOICE_NAME`）且卡片語言為 `zh-CN` 時，voice 查找順序：

1. 使用者手動設定的 `TTS_VOICE_NAME`（最高優先，邏輯不變）
2. 自動模式下，若 `_uiLocale === 'zh-Hant'`：
   - 優先找 `lang === 'zh-TW'` 的 voice
   - 找不到則找 `lang === 'zh-CN'` 的 voice（現有行為）
3. 其他 UI locale：維持現有行為不變

### 4. 錯誤處理

- `zh-Hant` 字典缺少某個 key 時，`t()` 函數自動 fallback 到 `'en'`（現有機制，無需修改）
- TTS 找不到 zh-TW voice 時自動降級 zh-CN（無靜默失敗風險）

---

## 測試計畫

### 單元測試（`tests/yihai_v5.0_i18n_test.js`）

新增 case：
- `detectLocale('zh-TW', SUPPORTED_LOCALES, FALLBACK_LOCALE)` → `'zh-Hant'`
- `detectLocale('zh-HK', SUPPORTED_LOCALES, FALLBACK_LOCALE)` → `'zh-Hant'`
- `detectLocale('zh-Hant', SUPPORTED_LOCALES, FALLBACK_LOCALE)` → `'zh-Hant'`
- `detectLocale('zh-CN', SUPPORTED_LOCALES, FALLBACK_LOCALE)` → `'zh-CN'`（迴歸）
- `zh-Hant` 字典完整性：確認所有 `en` 區塊中的 key 在 `zh-Hant` 中均存在

### Playwright UI Smoke（`tests/_pw_ui_smoke.js`）

新增 case：
- 語言選擇頁存在 `[data-lang="zh-Hant"]` 元素
- 選擇繁體中文後，首頁標題文字包含「忆海拾光」（app 名稱不變，但可驗證其他 UI key）
- 確認語言選擇頁不再顯示國旗 emoji

---

## 實作步驟概要

1. 更新 `SUPPORTED_LOCALES`（加 `zh-Hant`）
2. 修正 `detectLocale` 邏輯，確保 `zh-TW`/`zh-HK` 精確映射 `zh-Hant`
3. 新增 `I18N['zh-Hant']` 完整翻譯區塊
4. 移除語言選擇頁所有行的國旗 emoji
5. 新增 `zh-Hant` 語言選擇行
6. 更新 `const names` 加入 `zh-Hant`
7. 更新 `speak()` TTS fallback 邏輯
8. 更新單元測試
9. 更新 Playwright smoke 測試
10. 跑 `node tests/run_all.js` 全量通過
11. 跑 `node tests/_pw_ui_smoke.js` 通過
