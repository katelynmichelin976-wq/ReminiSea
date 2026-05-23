# 阶段 0：i18n 地基（0b 界面 i18n + 0c 卡片字段语言）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `yihai_v4.11.html` 加入 i18n 地基——界面文案按 UI 语言切换、引导语音按 UI 语言、卡片字段携带语言标签且 TTS 按字段语言选音——为后续 Wave 1 UI 重构和制卡功能铺路。

**Architecture:** 单文件 HTML app 内新增一组**纯函数**（locale 检测、`t()` 取词、书写系统识别、字段语言推断）+ 改造现有 TTS 函数接受 `lang` 参数。纯函数走 Node 单测（TDD），浏览器行为（TTS 语言、语言切换持久化、.yhspack 导入迁移）走 Playwright。卡片字段在 `.yhspack` 持久化为 `{text, lang}` 逻辑模型，但**内存中保留 `card.name` 字符串 + 新增并列字段 `card.nameLang`**，以最小化对 ~20 处 `card.name` 读取点的改动。

**Tech Stack:** 原生 JS（无框架）、Web Speech API、Node.js 测试脚本、Playwright。

**版本：** 阶段 0 是开发期，`APP_VERSION` 保持 `v4.11.18` 不变（Workflow Rule 6：版本号仅发布时 bump）。commit 用 `feat:` 不绑版本号。

---

## 设计依据（来自 spec 第三节）

- 两类语言独立：**界面 chrome + 引导语音**跟 UI 语言；**卡片字段内容 + 字段 TTS** 跟字段自己的语言标签
- 字段语言**自动按书写系统识别**：CJK→zh、假名→ja、谚文→ko、西里尔→ru、拉丁→回退到牌组主语言（同脚本内细分不可靠，不引入语言检测库）
- 卡片字段逻辑模型 `{text, lang}`；存量单字符串迁移为 `{text, lang: deckLang||'zh-CN'}`

## 现状落点（已核对 yihai_v4.11.html）

| 现状 | 行号 | 计划改动 |
|------|------|---------|
| `speak(text, delay, onend)` 硬编码 `utt.lang='zh-CN'` | 4000–4019 | 增加 `lang` 参数 |
| `speakDirect(text, onend)` 硬编码 `utt.lang='zh-CN'` | 4035–4043 | 增加 `lang` 参数 |
| `pickVoice()` 只找 zh 语音 | 3987–3998 | 增加 `lang` 参数，按目标语言找音 |
| `playAnswer(q, onend)` 用 `speakDirect(q.name)` | 4022–4032 | 传 `q.nameLang` |
| `.yhspack` 导入构造 `card = {id, name: c.name, ...}` | 3617–3623 | 解析 `{text,lang}` 或旧字符串，写 `card.name` + `card.nameLang`；读 `deck.language` |
| 卡片 `.name` 读取 ~20 处（quiz/render/sync） | 多处 | **不动**（保持字符串读取） |

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `yihai_v4.11.html` | 主 app：新增纯函数 + 改造 TTS + 导入迁移 | Modify |
| `tests/yihai_v5.0_i18n_test.js` | 阶段 0 纯函数单测（detectLocale/t/detectScript/scriptToLang/resolveFieldLang/normalizeField） | Create |
| `tests/_playwright_stage0_test.js` | 阶段 0 浏览器行为（TTS 语言、语言切换持久化、.yhspack 导入字段语言） | Create |

纯函数集中放在 `yihai_v4.11.html` 现有 Speech 区块之前（约 line 3946 前），便于与 TTS 改造相邻。

---

# Part A — 0b 界面 i18n 基础

## Task 1：detectLocale() 设备语言检测

**Files:**
- Modify: `yihai_v4.11.html`（新增纯函数，约 line 3946 前）
- Test: `tests/yihai_v5.0_i18n_test.js`

- [ ] **Step 1：建测试文件骨架 + 写 detectLocale 失败测试**

创建 `tests/yihai_v5.0_i18n_test.js`：

```javascript
// ═══════════════════════════════════════════════
// 阶段 0 i18n 地基纯函数单测
// 从 yihai_v4.11.html 抽取纯函数逻辑
// ═══════════════════════════════════════════════

const SUPPORTED_LOCALES = ['en', 'zh-CN', 'es'];
const FALLBACK_LOCALE = 'en';

function detectLocale(navLang, supported, fallback) {
  if (!navLang) return fallback;
  const lower = navLang.toLowerCase();
  for (const s of supported) if (s.toLowerCase() === lower) return s;
  const prefix = lower.split('-')[0];
  for (const s of supported) if (s.toLowerCase().split('-')[0] === prefix) return s;
  return fallback;
}

// ── 测试框架 ──
let passed = 0, failed = 0;
const errors = [];
function check(label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++; console.log(`  ✓ ${label}: ${JSON.stringify(actual)}`);
  } else {
    failed++;
    const msg = `  ✗ ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
    console.log(msg); errors.push(msg);
  }
}
function section(title) {
  console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`);
}

section('SUITE 1 — detectLocale 设备语言检测');
check('精确匹配 zh-CN', detectLocale('zh-CN', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'zh-CN');
check('大小写不敏感 ZH-cn', detectLocale('ZH-cn', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'zh-CN');
check('前缀匹配 es-MX→es', detectLocale('es-MX', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'es');
check('前缀匹配 en-US→en', detectLocale('en-US', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'en');
check('不支持的 fr→回退 en', detectLocale('fr-FR', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'en');
check('空值→回退 en', detectLocale('', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'en');

// 结果汇总（文件末尾统一输出，见 Task 末）
console.log(`\n通过 ${passed} / 失败 ${failed}`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2：运行测试，确认通过（纯函数已内联在测试文件中）**

Run: `node tests/yihai_v5.0_i18n_test.js`
Expected: PASS，输出 `通过 6 / 失败 0`

> 说明：本测试套件遵循项目现有模式（纯函数复制进测试文件验证逻辑）。下一步把同一函数植入 app。

- [ ] **Step 3：把 detectLocale + 常量植入 yihai_v4.11.html**

在 line 3946（`// ── Speech ──` 注释）之前插入：

```javascript
// ── i18n 地基（阶段 0）──────────────────────────────────────────
const SUPPORTED_LOCALES = ['en', 'zh-CN', 'es'];
const FALLBACK_LOCALE = 'en';

function detectLocale(navLang, supported, fallback) {
  if (!navLang) return fallback;
  const lower = navLang.toLowerCase();
  for (const s of supported) if (s.toLowerCase() === lower) return s;
  const prefix = lower.split('-')[0];
  for (const s of supported) if (s.toLowerCase().split('-')[0] === prefix) return s;
  return fallback;
}
```

- [ ] **Step 4：commit**

```bash
git add tests/yihai_v5.0_i18n_test.js yihai_v4.11.html
git commit -m "feat: detectLocale 设备语言检测（阶段 0 i18n 地基）"
```

## Task 2：I18N 字符串表 + t() 取词

**Files:**
- Modify: `yihai_v4.11.html`（紧接 detectLocale 之后）
- Test: `tests/yihai_v5.0_i18n_test.js`

- [ ] **Step 1：在测试文件追加 t() 函数与失败测试**

在 `console.log(\`\n通过...\`)` 汇总行**之前**插入：

```javascript
const I18N = {
  'en':    { home_start: 'Start', home_browse: 'Browse', nav_home: 'Home', nav_mine: 'Mine' },
  'zh-CN': { home_start: '开始',   home_browse: '浏览',   nav_home: '首页', nav_mine: '我的' },
  'es':    { home_start: 'Empezar', home_browse: 'Explorar', nav_home: 'Inicio', nav_mine: 'Perfil' },
};

function t(key, locale, table, fallback) {
  const L = table[locale] || {};
  if (key in L) return L[key];
  const F = table[fallback] || {};
  if (key in F) return F[key];
  return key;
}

section('SUITE 2 — t() 取词');
check('zh-CN home_start', t('home_start', 'zh-CN', I18N, FALLBACK_LOCALE), '开始');
check('es home_browse', t('home_browse', 'es', I18N, FALLBACK_LOCALE), 'Explorar');
check('缺词回退 en', t('home_start', 'fr', I18N, FALLBACK_LOCALE), 'Start');
check('完全缺失返回 key 本身', t('not_exist', 'en', I18N, FALLBACK_LOCALE), 'not_exist');
```

> 注意：把汇总输出行（`console.log(\`\n通过...\`)` 和 `process.exit`）始终保持在文件**最末尾**，每个 Task 的新断言插在它之前。

- [ ] **Step 2：运行测试确认通过**

Run: `node tests/yihai_v5.0_i18n_test.js`
Expected: PASS，`通过 10 / 失败 0`

- [ ] **Step 3：把 I18N + t() 植入 app**

紧接 app 内 detectLocale 之后插入（I18N 表先放最小集，Wave 1 各 dev 版重建界面时逐屏补词）：

```javascript
const I18N = {
  'en':    { home_start: 'Start', home_browse: 'Browse', nav_home: 'Home', nav_mine: 'Mine' },
  'zh-CN': { home_start: '开始',   home_browse: '浏览',   nav_home: '首页', nav_mine: '我的' },
  'es':    { home_start: 'Empezar', home_browse: 'Explorar', nav_home: 'Inicio', nav_mine: 'Perfil' },
};

function t(key) {
  const loc = getLocale();
  const L = I18N[loc] || {};
  if (key in L) return L[key];
  const F = I18N[FALLBACK_LOCALE] || {};
  if (key in F) return F[key];
  return key;
}
```

> `getLocale()` 在 Task 3 定义；本步骤先写好 `t()` 引用它，Task 3 补齐后即可用。

- [ ] **Step 4：commit**

```bash
git add tests/yihai_v5.0_i18n_test.js yihai_v4.11.html
git commit -m "feat: I18N 字符串表 + t() 取词（阶段 0 i18n 地基）"
```

## Task 3：locale 状态（getLocale/setLocale + 持久化）

**Files:**
- Modify: `yihai_v4.11.html`（紧接 t() 之后）
- Test: `tests/_playwright_stage0_test.js`

- [ ] **Step 1：实现 locale 状态**

紧接 app 内 `t()` 之后插入：

```javascript
const LOCALE_KEY = 'yihai_ui_locale';
let _uiLocale = null;

function getLocale() {
  if (_uiLocale) return _uiLocale;
  const saved = localStorage.getItem(LOCALE_KEY);
  if (saved && SUPPORTED_LOCALES.includes(saved)) { _uiLocale = saved; return saved; }
  _uiLocale = detectLocale(navigator.language, SUPPORTED_LOCALES, FALLBACK_LOCALE);
  return _uiLocale;
}

function setLocale(loc) {
  if (!SUPPORTED_LOCALES.includes(loc)) return;
  _uiLocale = loc;
  localStorage.setItem(LOCALE_KEY, loc);
}
```

- [ ] **Step 2：写 Playwright 失败测试（持久化 + 检测）**

创建 `tests/_playwright_stage0_test.js`（参考 `tests/_playwright_test.js` 的启动方式，需先 `python -m http.server 8080 --directory C:\code`）：

```javascript
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let pass = 0, fail = 0;
  const A = (label, cond) => { if (cond) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗', label); } };

  await page.goto('http://localhost:8080/yihai_v4.11.html');
  await page.waitForFunction(() => typeof getLocale === 'function');

  // 默认检测（无 localStorage）
  const def = await page.evaluate(() => { localStorage.removeItem('yihai_ui_locale'); _uiLocale = null; return getLocale(); });
  A('getLocale 返回受支持的 locale', ['en','zh-CN','es'].includes(def));

  // setLocale 持久化
  await page.evaluate(() => setLocale('es'));
  const after = await page.evaluate(() => localStorage.getItem('yihai_ui_locale'));
  A('setLocale 写入 localStorage = es', after === 'es');

  // 非法值被拒绝
  await page.evaluate(() => setLocale('zz'));
  const still = await page.evaluate(() => localStorage.getItem('yihai_ui_locale'));
  A('setLocale 拒绝非法值', still === 'es');

  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
```

- [ ] **Step 3：运行测试确认通过**

先在另一终端：`python -m http.server 8080 --directory C:\code`
Run: `node tests/_playwright_stage0_test.js`
Expected: PASS，`通过 3 / 失败 0`

- [ ] **Step 4：commit**

```bash
git add tests/_playwright_stage0_test.js yihai_v4.11.html
git commit -m "feat: UI locale 状态与持久化 getLocale/setLocale（阶段 0）"
```

## Task 4：引导语音按 UI 语言（speak/pickVoice 增 lang 参数）

**Files:**
- Modify: `yihai_v4.11.html:3987-4019`（pickVoice + speak）、`4035-4043`（speakDirect）
- Test: `tests/_playwright_stage0_test.js`

- [ ] **Step 1：改造 pickVoice 接受目标语言**

替换 `yihai_v4.11.html:3987-3998` 的 `pickVoice`：

```javascript
function pickVoice(lang) {
  if (!voices.length) loadVoices();
  if (TTS_VOICE_NAME && (!lang || lang === 'zh-CN')) {
    const named = voices.find(v => v.name === TTS_VOICE_NAME);
    if (named) return named;
  }
  const want = lang || 'zh-CN';
  const prefix = want.split('-')[0];
  return voices.find(v => v.lang === want)
      || voices.find(v => v.lang && v.lang.split('-')[0] === prefix)
      || voices.find(v => v.lang === 'zh-CN')
      || (voices.length ? voices[0] : null);
}
```

- [ ] **Step 2：speak / speakDirect 增加 lang 参数**

替换 `speak`（4000-4019）签名与内部：

```javascript
function speak(text, delay = 0, onend = null, lang = null) {
  speechSynthesis.cancel();
  const go = () => {
    if (!voices.length) loadVoices();
    const utt = new SpeechSynthesisUtterance(text);
    const useLang = lang || getLocale();
    utt.lang = useLang;
    utt.rate = TTS_RATE;
    utt.pitch = TTS_PITCH;
    utt.volume = 1;
    const v = pickVoice(useLang);
    if (v) utt.voice = v;
    if (onend) utt.onend = onend;
    speechSynthesis.speak(utt);
    setTimeout(() => { if (speechSynthesis.paused) speechSynthesis.resume(); }, 250);
  };
  if (delay > 0) setTimeout(go, delay); else go();
}
```

替换 `speakDirect`（4035-4043）：

```javascript
function speakDirect(text, onend, lang = null) {
  if (!voices.length) loadVoices();
  const utt = new SpeechSynthesisUtterance(text);
  const useLang = lang || 'zh-CN';
  utt.lang = useLang; utt.rate = TTS_RATE; utt.pitch = TTS_PITCH; utt.volume = 1;
  const v = pickVoice(useLang); if (v) utt.voice = v;
  if (onend) utt.onend = onend;
  speechSynthesis.speak(utt);
  setTimeout(() => { if (speechSynthesis.paused) speechSynthesis.resume(); }, 250);
}
```

> 说明：`speak` 默认 `lang=getLocale()`（引导语音跟 UI 语言）；`speakDirect` 默认 `'zh-CN'`（卡片内容，Task 8 改为传字段语言）。卡片内容播报走 `speakDirect`/`playAnswer`，UI 引导走 `speak`，两者默认值正确区分了两类语言。

- [ ] **Step 3：写 Playwright 验证 speak 用 UI 语言**

在 `tests/_playwright_stage0_test.js` 的 `console.log(\`\n通过...\`)` 之前追加：

```javascript
  // speak() 应使用当前 UI locale 作为 utt.lang
  await page.evaluate(() => setLocale('es'));
  const speakLang = await page.evaluate(() => new Promise(res => {
    const orig = window.SpeechSynthesisUtterance;
    let captured = null;
    window.SpeechSynthesisUtterance = function(t){ const u = new orig(t); setTimeout(()=>{ if(!captured){ captured=u.lang; res(captured);} },0); return u; };
    try { speak('hola'); } catch(e) { res('err'); }
    setTimeout(()=>res(captured||'none'), 500);
  }));
  A('speak() 使用 UI locale es', speakLang === 'es');
```

- [ ] **Step 4：运行 Playwright + SRS 单测（Dev Rule 18：TTS 改动需 Playwright）**

Run: `node tests/_playwright_stage0_test.js`（HTTP 服务需运行）
Expected: PASS，`通过 4 / 失败 0`
Run: `node tests/srs_test.js`
Expected: PASS（逻辑未动，应全绿）

- [ ] **Step 5：commit**

```bash
git add tests/_playwright_stage0_test.js yihai_v4.11.html
git commit -m "feat: speak/speakDirect/pickVoice 增 lang 参数，引导语音按 UI 语言（阶段 0）"
```

---

# Part B — 0c 卡片字段语言模型

## Task 5：detectScript() 书写系统识别

**Files:**
- Modify: `yihai_v4.11.html`（i18n 区块内）
- Test: `tests/yihai_v5.0_i18n_test.js`

- [ ] **Step 1：在测试文件追加 detectScript 与失败测试**

在汇总输出行之前插入：

```javascript
function detectScript(text) {
  if (!text) return 'other';
  if (/[぀-ヿ]/.test(text)) return 'kana';      // 平/片假名（先于汉字）
  if (/[가-힯]/.test(text)) return 'hangul';
  if (/[Ѐ-ӿ]/.test(text)) return 'cyrillic';
  if (/[一-鿿㐀-䶿]/.test(text)) return 'han';
  if (/[a-zA-Z]/.test(text)) return 'latin';
  return 'other';
}

section('SUITE 3 — detectScript 书写系统识别');
check('苹果→han', detectScript('苹果'), 'han');
check('manzana→latin', detectScript('manzana'), 'latin');
check('яблоко→cyrillic', detectScript('яблоко'), 'cyrillic');
check('りんご→kana', detectScript('りんご'), 'kana');
check('사과→hangul', detectScript('사과'), 'hangul');
check('空→other', detectScript(''), 'other');
check('日文汉字混假名→kana', detectScript('林檎です'), 'kana');
```

- [ ] **Step 2：运行测试确认通过**

Run: `node tests/yihai_v5.0_i18n_test.js`
Expected: PASS，`通过 17 / 失败 0`

- [ ] **Step 3：植入 app（i18n 区块内）**

```javascript
function detectScript(text) {
  if (!text) return 'other';
  if (/[぀-ヿ]/.test(text)) return 'kana';
  if (/[가-힯]/.test(text)) return 'hangul';
  if (/[Ѐ-ӿ]/.test(text)) return 'cyrillic';
  if (/[一-鿿㐀-䶿]/.test(text)) return 'han';
  if (/[a-zA-Z]/.test(text)) return 'latin';
  return 'other';
}
```

- [ ] **Step 4：commit**

```bash
git add tests/yihai_v5.0_i18n_test.js yihai_v4.11.html
git commit -m "feat: detectScript 书写系统识别（阶段 0 字段语言）"
```

## Task 6：scriptToLang() + resolveFieldLang() 字段语言推断

**Files:**
- Modify: `yihai_v4.11.html`（i18n 区块内）
- Test: `tests/yihai_v5.0_i18n_test.js`

- [ ] **Step 1：追加两个函数与失败测试**

在汇总输出行之前插入：

```javascript
function scriptToLang(script, fallbackLang) {
  switch (script) {
    case 'han': return 'zh-CN';
    case 'kana': return 'ja';
    case 'hangul': return 'ko';
    case 'cyrillic': return 'ru';
    case 'latin': return fallbackLang;
    default: return fallbackLang;
  }
}

function resolveFieldLang(text, deckLang) {
  return scriptToLang(detectScript(text), deckLang || 'zh-CN');
}

section('SUITE 4 — resolveFieldLang 字段语言推断');
check('中文名在西班牙语牌组→zh-CN', resolveFieldLang('苹果', 'es'), 'zh-CN');
check('西语词在西班牙语牌组→es', resolveFieldLang('manzana', 'es'), 'es');
check('英文词在中文牌组→zh-CN(同脚本回退主语言)', resolveFieldLang('apple', 'zh-CN'), 'zh-CN');
check('西语词在中文牌组拉丁→回退主语言 zh-CN', resolveFieldLang('hola', 'zh-CN'), 'zh-CN');
check('俄语词→ru', resolveFieldLang('яблоко', 'es'), 'ru');
check('空文本→回退主语言', resolveFieldLang('', 'es'), 'es');
```

> 注意第 3、4 条体现 spec 的限制：拉丁系内部（en/es）无法靠脚本细分，回退到牌组主语言；这是已知且接受的行为。

- [ ] **Step 2：运行测试确认通过**

Run: `node tests/yihai_v5.0_i18n_test.js`
Expected: PASS，`通过 23 / 失败 0`

- [ ] **Step 3：植入 app**

```javascript
function scriptToLang(script, fallbackLang) {
  switch (script) {
    case 'han': return 'zh-CN';
    case 'kana': return 'ja';
    case 'hangul': return 'ko';
    case 'cyrillic': return 'ru';
    default: return fallbackLang;
  }
}
function resolveFieldLang(text, deckLang) {
  return scriptToLang(detectScript(text), deckLang || 'zh-CN');
}
```

- [ ] **Step 4：commit**

```bash
git add tests/yihai_v5.0_i18n_test.js yihai_v4.11.html
git commit -m "feat: scriptToLang/resolveFieldLang 字段语言推断（阶段 0）"
```

## Task 7：normalizeField() + .yhspack 导入字段语言迁移

**Files:**
- Modify: `yihai_v4.11.html:3617-3623`（.yhspack 导入构造）
- Test: `tests/yihai_v5.0_i18n_test.js`（normalizeField 纯逻辑）、`tests/_playwright_stage0_test.js`（导入端到端）

- [ ] **Step 1：normalizeField 纯函数 + 单测**

在测试文件汇总行之前插入：

```javascript
// 把 .yhspack 字段（旧字符串 或 新 {text,lang}）规整为 {text, lang}
function normalizeField(raw, deckLang) {
  if (raw && typeof raw === 'object' && 'text' in raw) {
    return { text: raw.text, lang: raw.lang || resolveFieldLang(raw.text, deckLang) };
  }
  const text = (raw == null) ? '' : String(raw);
  return { text, lang: resolveFieldLang(text, deckLang) };
}

section('SUITE 5 — normalizeField .yhspack 字段规整');
check('旧字符串中文，牌组zh→{苹果,zh-CN}', normalizeField('苹果', 'zh-CN'), { text: '苹果', lang: 'zh-CN' });
check('旧字符串中文名在es牌组→lang自动zh-CN', normalizeField('苹果', 'es'), { text: '苹果', lang: 'zh-CN' });
check('新格式带lang原样保留', normalizeField({ text: 'manzana', lang: 'es' }, 'zh-CN'), { text: 'manzana', lang: 'es' });
check('新格式缺lang→自动推断', normalizeField({ text: 'apple' }, 'es'), { text: 'apple', lang: 'es' });
```

- [ ] **Step 2：运行测试确认通过**

Run: `node tests/yihai_v5.0_i18n_test.js`
Expected: PASS，`通过 27 / 失败 0`

- [ ] **Step 3：植入 normalizeField 并改造 .yhspack 导入**

在 app i18n 区块内加入 `normalizeField`（同 Step 1，去掉 section/check）。

改造 `yihai_v4.11.html:3617-3623`。原代码：

```javascript
    const name = deck.name || file.name.replace('.yhspack','');
    ...
      if (!c.name) continue;
      const card = { id: c.id || String(i), name: c.name, img: '', audioUrl: '', details: [] };
```

改为（读 `deck.language`，对每张卡用 normalizeField 写入 `name` + `nameLang`）：

```javascript
    const name = deck.name || file.name.replace('.yhspack','');
    const deckLang = deck.language || 'zh-CN';
    ...
      if (!c.name) continue;
      const nf = normalizeField(c.name, deckLang);
      const card = { id: c.id || String(i), name: nf.text, nameLang: nf.lang, img: '', audioUrl: '', details: [] };
```

> 注：`deckLang` 变量需放在循环外。其余 ~20 处 `card.name` 读取保持不变（仍是字符串）；新增 `card.nameLang` 仅供 TTS 用。牌组 meta 持久化时一并存 `language: deckLang`（沿用现有 DECKS_META 写入路径，在创建 meta 处加 `language` 字段）。

- [ ] **Step 4：写 Playwright 导入测试**

准备：`tests/test_data/` 已有 `.yhspack`（如蔬菜水果本地版）。在 `tests/_playwright_stage0_test.js` 汇总行前追加：

```javascript
  // 导入一个中文 .yhspack 后，卡片应带 nameLang=zh-CN
  const fileInput = await page.$('input[type="file"][accept=".yhspack"]');
  if (fileInput) {
    await fileInput.setInputFiles('tests/test_data/蔬菜水果本地版.yhspack');
    await page.waitForTimeout(2000);
    const langOk = await page.evaluate(() => {
      const decks = window.DECKS || {};
      for (const id in decks) {
        const cards = decks[id];
        if (Array.isArray(cards) && cards.length && cards[0].nameLang) return cards[0].nameLang;
      }
      return null;
    });
    A('导入中文牌组卡片 nameLang=zh-CN', langOk === 'zh-CN');
  } else {
    A('找到 .yhspack 导入入口', false);
  }
```

> 若 `window.DECKS` 结构与此不同，按实际内存结构调整断言取值路径（执行时核对）。

- [ ] **Step 5：运行 Playwright + v4.4 单测（导入/数据格式相关）**

Run: `node tests/_playwright_stage0_test.js`（HTTP 服务运行中）
Expected: PASS
Run: `node tests/yihai_v4.4_test.js`
Expected: PASS（数据格式逻辑未破坏）

- [ ] **Step 6：commit**

```bash
git add tests/yihai_v5.0_i18n_test.js tests/_playwright_stage0_test.js yihai_v4.11.html
git commit -m "feat: .yhspack 导入字段语言迁移 normalizeField + deck.language（阶段 0）"
```

## Task 8：卡片内容 TTS 按字段语言播报

**Files:**
- Modify: `yihai_v4.11.html:4022-4032`（playAnswer）及卡片内容播报调用点
- Test: `tests/_playwright_stage0_test.js`

- [ ] **Step 1：playAnswer 传字段语言**

替换 `playAnswer`（4022-4032）：

```javascript
function playAnswer(q, onend) {
  const lang = q.nameLang || 'zh-CN';
  if (q.audioUrl) {
    const audio = new Audio(q.audioUrl);
    currentAudio = audio;
    if (onend) audio.onended = () => { currentAudio = null; onend(); };
    audio.onerror = () => { currentAudio = null; speakDirect(q.name, onend, lang); };
    audio.play().catch(() => { currentAudio = null; speakDirect(q.name, onend, lang); });
  } else {
    speakDirect(q.name, onend, lang);
  }
}
```

> `q` 来自题目对象。需确认 `q` 携带 `nameLang`：在构造题目（约 line 3399 `options=[{name:card.name,cardId:card.id}]` 与 line 3421 slim 映射）处，把 `nameLang: card.nameLang` 一并带上。具体：
> - line 3399 附近：`const options = [{ name: card.name, nameLang: card.nameLang, cardId: card.id }, ...distractors];`
> - line 3421 slim：`{ id: c.id, name: c.name, nameLang: c.nameLang, imgUrl: ..., audUrl: ... }`
> - 题目对象 `q` 设置 `q.nameLang = card.nameLang`（在 q.name 被赋值的同一处）。

- [ ] **Step 2：Playwright 验证中文卡用 zh-CN 语音**

在 `tests/_playwright_stage0_test.js` 汇总行前追加（捕获 speakDirect 的 utt.lang）：

```javascript
  const fieldLang = await page.evaluate(() => new Promise(res => {
    const orig = window.SpeechSynthesisUtterance;
    let cap = null;
    window.SpeechSynthesisUtterance = function(t){ const u = new orig(t); setTimeout(()=>{ if(cap===null) { cap=u.lang; res(cap);} },0); return u; };
    try { speakDirect('苹果', null, 'zh-CN'); } catch(e){ res('err'); }
    setTimeout(()=>res(cap||'none'), 500);
  }));
  A('卡片内容 speakDirect 用字段语言 zh-CN', fieldLang === 'zh-CN');
```

- [ ] **Step 3：运行 Playwright + SRS + 最小回归（Dev Rule 18）**

Run: `node tests/_playwright_stage0_test.js`
Expected: PASS
Run: `node tests/srs_test.js`
Expected: PASS
Run: `node tests/_playwright_test.js`（单机版最小回归，断言 trials≥20，确认答题/TTS 路径未崩）
Expected: PASS

- [ ] **Step 4：commit**

```bash
git add tests/_playwright_stage0_test.js yihai_v4.11.html
git commit -m "feat: 卡片内容 TTS 按字段语言播报 q.nameLang（阶段 0）"
```

---

## 阶段 0 收尾：全套单测验证

- [ ] **运行全部单元测试，确认无回归**

```bash
node tests/srs_test.js
node tests/yihai_v4.4_test.js
node tests/yihai_v4.8_test.js
node tests/yihai_v4.9_test.js
node tests/yihai_v5.0_i18n_test.js
```

Expected: 全部 PASS。SRS/v4.4/v4.8/v4.9 计数不变（逻辑未动）；v5.0_i18n 全绿。

- [ ] **更新 CLAUDE.md 测试计数与文件清单**（文档先行，Workflow Rule 3）

在「测试」表格新增 `tests/yihai_v5.0_i18n_test.js`、`tests/_playwright_stage0_test.js`；更新 `Current counts` 行。commit：

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 同步阶段 0 i18n 测试清单与计数"
```

---

## Wave 1 计划序列（即时编写，不在本计划内）

Wave 1 的 dev.1–dev.5 各自在前一版**重构后的代码**上继续，精确行号/代码依赖前一版落地后的真实结构。因此每个 dev 版本在进场时单独编写计划（`docs/superpowers/plans/2026-XX-XX-v5-wave1-devN-*.md`），顺序：

1. **dev.1 导航骨架**（三 Tab + FAB，重接 `goHome`/`startSession`/`openStats`/设置浮层）
2. **dev.2 首页+浏览屏**（消费 0c：浏览屏按 `nameLang` 播报；牌组行显示语言徽标）
3. **dev.3 练习屏**（确认→答案面板→倒计时环；三色计数器；Dev Rule 18 跑 Playwright）
4. **dev.4 统计屏**（四 Tab 补全）
5. **dev.5 我的页整合**（设置+云端+语言切换 UI，消费 0b 的 `setLocale`，全界面字符串走 `t()`）

每个 dev 版 i18n 字符串补词随该屏重建一并完成（spec 第三节：Wave 1 重建时字符串一次性外部化）。

---

## 自检（writing-plans Self-Review）

- **Spec 覆盖**：0b（界面 i18n + 引导语音按 UI 语言）= Task 1–4；0c（字段语言标签 + 自动识别 + .yhspack 迁移 + 字段 TTS）= Task 5–8。✓
- **占位扫描**：无 TBD；所有 code step 含完整代码；测试含真实断言。Task 7 Step 4 / Task 8 Step 1 有「执行时核对实际内存结构」标注——这是真实的运行时验证要求，非占位（单文件 app 内存结构需运行确认）。
- **类型一致**：`detectLocale/t/detectScript/scriptToLang/resolveFieldLang/normalizeField` 签名在 Node 测试与 app 植入间一致；`speak(text,delay,onend,lang)`、`speakDirect(text,onend,lang)`、`pickVoice(lang)` 签名贯穿 Task 4/8 一致；`card.name`(string) + `card.nameLang`(string) 表示法贯穿 Task 7/8 一致。
