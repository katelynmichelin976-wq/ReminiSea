# 多语种隐私政策 / 用户协议（P2 #4）设计

**日期**：2026-06-16
**关联**：P1 spec `2026-06-14-privacy-policy-and-terms-design.md`、P1 plan `2026-06-15-privacy-policy-and-terms-p1.md`
**目标版本**：v5.13.16

---

## 1. 目标

P1 只提供中文 PP/ToS。本版本：

1. 新增**英文版** PP/ToS（`privacy_en.html` / `terms_en.html`）
2. 新增**繁体版** PP/ToS（`privacy_zh-Hant.html` / `terms_zh-Hant.html`）
3. 主 app 中 PP/ToS 链接根据 `getLocale()` 自动路由：
   - `en` → `_en.html`
   - `zh-Hant` → `_zh-Hant.html`
   - `zh-CN` → `*.html`（中文默认，P1 不动）
   - `es` / `ja` → fallback 到 `_en.html`
4. 每个 PP/ToS HTML 顶部加语言切换 nav（zh-CN / en / zh-Hant）

不在范围：
- es / ja 全文 PP/ToS（人工翻译质量风险，fallback 到英文足够 P0）
- App Store 隐私标签 JSON（P2 #5）
- 律师 review 后正文修订（P2 #6）

---

## 2. 文件结构

```
privacy.html               # 中文（不动，P1 已有）
privacy_en.html            # 英文（新建）
privacy_zh-Hant.html       # 繁体（新建）
terms.html                 # 中文（不动）
terms_en.html              # 英文（新建）
terms_zh-Hant.html         # 繁体（新建）
```

文件名约定：`{name}.html`（zh-CN 默认）+ `{name}_{locale}.html`。

---

## 3. 数据流（主 app 链接路由）

### 3.1 新增辅助函数

```javascript
function _localizedUrl(filename) {
  const base = 'https://katelynmichelin976-wq.github.io/ReminiSea/';
  const locale = getLocale();
  if (locale === 'en' || locale === 'es' || locale === 'ja') {
    return base + filename.replace('.html', '_en.html');
  }
  if (locale === 'zh-Hant') {
    return base + filename.replace('.html', '_zh-Hant.html');
  }
  return base + filename;  // zh-CN
}
function getPrivacyUrl() { return _localizedUrl('privacy.html'); }
function getTermsUrl()   { return _localizedUrl('terms.html'); }
```

### 3.2 链接绑定点

主 app 中 4 处硬编码 PP/ToS URL：
- 登录 form `account-consent-row` 2 处 `<a href>`（privacy + terms）
- 注册 sheet `account-consent-row` 2 处 `<a href>`（privacy + terms）
- `showConsentUpgradeDialog` body 内 2 处 `<a href>`（privacy + terms）

绑定策略：
- 登录/注册 form 的 `<a>` 加 id：`consent-login-privacy-a` / `consent-login-terms-a` / `consent-register-privacy-a` / `consent-register-terms-a`
- `applyI18n()`（i18n 切换 hook）末尾调用 `_refreshConsentLinks()`，刷新 4 个 `<a>` 的 `href`
- `showConsentUpgradeDialog` body 模板直接用 `getPrivacyUrl()` / `getTermsUrl()` 拼接（动态生成时执行）

### 3.3 静态 HTML 中的语言切换 nav

每个 PP/ToS HTML 顶部加：

```html
<nav class="lang-nav">
  <a href="privacy.html">简体中文</a> ·
  <a href="privacy_en.html">English</a> ·
  <a href="privacy_zh-Hant.html">繁體中文</a>
</nav>
```

CSS：水平排列、当前语言加粗高亮（每个文件中 hardcode）。

---

## 4. 翻译策略

### 4.1 英文

- 全文用专业法律英语风格人工/AI 翻译
- 关键术语：Privacy Policy / Terms of Service / Personal Data / CCPA / COPPA / Apple Developer Agreement
- 服务定位段（terms §9）措辞保守：「The Service is targeted at the overseas Chinese-speaking community」

### 4.2 繁体

- 基于 zh-CN 简→繁转换：
  - 标点用繁体习惯（《》保留，「」可酌情用）
  - 词汇调整：「软件」→「軟體」「网络」→「網路」「视频」→「影片」「质量」→「品質」「实施」→「實施」等台湾习惯
- 不重译，只字符 + 词汇本地化

### 4.3 占位符

3 版本共用占位符 `[开发者姓名待填]` / `[Developer Name TBD]` / `[開發者姓名待填]`，部署前替换。

### 4.4 生效日期 + 版本号

- 所有 6 个文件 effective date 同步：`2026-06-15`（P1 上线日）
- version `v1.0` 同步

---

## 5. 改动单

| 文件 | 改动 |
|---|---|
| `privacy.html` | 顶部加 lang-nav（中文版当前高亮） |
| `terms.html` | 顶部加 lang-nav |
| `privacy_en.html` | 新建（英文全文 + lang-nav） |
| `terms_en.html` | 新建（英文全文 + lang-nav） |
| `privacy_zh-Hant.html` | 新建（繁体全文 + lang-nav） |
| `terms_zh-Hant.html` | 新建（繁体全文 + lang-nav） |
| `index.html` | 加 `_localizedUrl` / `getPrivacyUrl` / `getTermsUrl`；4 处登录/注册 form `<a>` 加 id；`applyI18n`（或 `setLocale`）后调用 `_refreshConsentLinks`；`showConsentUpgradeDialog` body 改用 `getPrivacyUrl/getTermsUrl` |
| `tests/_pw_consent_lang_url.js` | 新建：验证 setLocale 切换后链接 URL 正确（5 locale × 2 link = ~10 断言） |
| `CLAUDE.md` | 新测试登记 1 行 |

---

## 6. 测试策略

### 6.1 单元

无新单元测试（纯 URL 拼接，写到 Playwright 更易验证 DOM）。

### 6.2 Playwright

新增 `tests/_pw_consent_lang_url.js`：

| Phase | 内容 |
|---|---|
| 1 | zh-CN：登录 checkbox privacy 链接 = `privacy.html` |
| 2 | setLocale(en)：→ `privacy_en.html` + terms 同步切换 |
| 3 | setLocale(zh-Hant)：→ `privacy_zh-Hant.html` |
| 4 | setLocale(es)：→ fallback `privacy_en.html` |
| 5 | setLocale(ja)：→ fallback `privacy_en.html` |
| 6 | setLocale(zh-CN)：→ 还原 `privacy.html` |
| 7 | showConsentUpgradeDialog 弹出后链接随当前 locale |

约 14 断言（5 locale × 2 link + dialog 验证）。

### 6.3 回归

- `node tests/run_all.js`
- `node tests/_pw_ui_smoke.js`
- `node tests/_pw_consent_checkbox.js`（P1 不破）

---

## 7. 已知风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 英文翻译法律精度不足 | 中 | 顶部 disclaimer「translation, Chinese version controls」未来加；P2 #6 律师 review |
| 繁体词汇本地化遗漏 | 低 | 部署前对照检查；用户反馈迭代 |
| 部署前占位符未替换 | 中 | grep 6 文件中 `开发者姓名待填` / `Developer Name TBD` / `開發者姓名待填` 全部清零 |
| lang-nav 高亮策略硬编码不易维护 | 低 | 可接受，3 文件 × 2 type = 6 处一次性 |
| setLocale 后链接刷新依赖 `_refreshConsentLinks` 调用点 | 中 | applyI18n 末尾通用 hook，Playwright 验证 |

---

## 8. 实施顺序

1. **创建 6 个 HTML 文件**（最大工作量；3 语种 × 2 文件）+ lang-nav
2. **index.html 加路由函数 + 链接刷新**
3. **Playwright 测试**
4. **回归 + commit**

详见 plan 文档。
