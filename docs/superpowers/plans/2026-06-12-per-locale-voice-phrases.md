# Per-Locale Voice Phrases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每种 UI 语言独立存储 8 个语音提示词脚本，切换语言后自动加载对应语言的自定义内容，互不干扰。

**Architecture:** `yh:v1:config:voice` JSON 内新增 `phrases` 子对象，按 locale 分组（`phrases['zh-CN']`、`phrases['en']` 等）。`getVoiceField`/`setVoiceField` 对 `PHRASE_VOICE_FIELDS` 内的字段自动路由至当前 locale 的子对象；非 phrase 字段（ttsRate 等）继续走扁平路径。`setLocale` 不再清空字段，改为切换后从新 locale 重读内存变量。`cloudPushConfig` 展开当前 locale 的 phrase 字段为扁平格式，保持云端 schema 不变。

**Tech Stack:** 纯 JS（单文件 `index.html`），`lsGetJSON`/`lsSetJSON` localStorage helper，Node.js 单元测试。

---

## File Map

| 文件 | 动作 | 说明 |
|------|------|------|
| `tests/yihai_v5.16_lang_phrases_test.js` | 新建 | 单元测试（纯函数，无 DOM） |
| `tests/run_all.js` | 修改 | 注册新测试套件 |
| `index.html` | 修改 | 常量 + helper + migrate + setLocale + loadSettings + cloudPushConfig |

---

### Task 1: 写失败测试

**Files:**
- Create: `tests/yihai_v5.16_lang_phrases_test.js`

- [ ] **Step 1: 创建测试文件**

```js
// tests/yihai_v5.16_lang_phrases_test.js
// Per-locale voice phrases 单测

let passed = 0, failed = 0;
function check(desc, ok) {
  if (ok) passed++;
  else { failed++; console.log(`  ✗ ${desc}`); }
}

// ── localStorage stub ─────────────────────────────────────────────
const _store = new Map();
const localStorage = {
  getItem: k => _store.has(k) ? _store.get(k) : null,
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
};
const lsGetJSON = (k, def = null) => {
  try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); }
  catch { return def; }
};
const lsSetJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ── locale stub ───────────────────────────────────────────────────
let _uiLocale = 'zh-CN';
function getLocale() { return _uiLocale; }

// ── 被测代码（从 index.html 复制实现后填入）─────────────────────────
const PHRASE_VOICE_FIELDS = [
  'phraseWrong', 'phraseCorrect', 'phraseStreakCorrect', 'phraseSessionFinish',
  'phraseIdleBrowse', 'phraseOptHint', 'phraseQuizPrompt', 'phraseQuizPromptRecognize'
];

function getVoiceConfig() { return lsGetJSON('yh:v1:config:voice', {}); }

function getVoiceField(name, def = null) {
  const cfg = getVoiceConfig();
  if (PHRASE_VOICE_FIELDS.includes(name)) {
    const v = (cfg.phrases?.[getLocale()] || {})[name];
    return v == null ? def : v;
  }
  const v = cfg[name];
  return v == null ? def : v;
}

function setVoiceField(name, value) {
  const cfg = getVoiceConfig();
  if (PHRASE_VOICE_FIELDS.includes(name)) {
    if (!cfg.phrases) cfg.phrases = {};
    if (!cfg.phrases[getLocale()]) cfg.phrases[getLocale()] = {};
    if (value == null) delete cfg.phrases[getLocale()][name];
    else cfg.phrases[getLocale()][name] = String(value);
  } else {
    if (value == null) delete cfg[name];
    else cfg[name] = String(value);
  }
  lsSetJSON('yh:v1:config:voice', cfg);
}

function migrateLangPhrases() {
  const cfg = getVoiceConfig();
  if (cfg.phrases) return;
  const localeData = {};
  for (const k of PHRASE_VOICE_FIELDS) {
    if (cfg[k] != null) { localeData[k] = cfg[k]; delete cfg[k]; }
  }
  cfg.phrases = Object.keys(localeData).length
    ? { [getLocale()]: localeData }
    : {};
  lsSetJSON('yh:v1:config:voice', cfg);
}

// ── Tests ─────────────────────────────────────────────────────────

// GROUP 1: phrase 字段按 locale 存储
{
  _store.clear(); _uiLocale = 'zh-CN';
  setVoiceField('phraseWrong', '没关系！');
  const raw = JSON.parse(_store.get('yh:v1:config:voice'));
  check('setVoiceField phrase → 存入 phrases[zh-CN]',
    raw.phrases?.['zh-CN']?.phraseWrong === '没关系！');
  check('setVoiceField phrase → 不写根级别',
    raw.phraseWrong == null);
}
{
  _store.clear(); _uiLocale = 'zh-CN';
  setVoiceField('phraseWrong', '没关系！');
  check('getVoiceField 读当前 locale 值',
    getVoiceField('phraseWrong') === '没关系！');
}
{
  _store.clear(); _uiLocale = 'zh-CN';
  check('getVoiceField 未设置返回 null（def 默认）',
    getVoiceField('phraseWrong') === null);
  check('getVoiceField 未设置返回自定义 def',
    getVoiceField('phraseWrong', 'fallback') === 'fallback');
}
{
  _store.clear(); _uiLocale = 'zh-CN';
  setVoiceField('phraseWrong', '没关系！');
  _uiLocale = 'en';
  check('切换 locale 后读取返回 null（新 locale 无数据）',
    getVoiceField('phraseWrong') === null);
}
{
  _store.clear(); _uiLocale = 'zh-CN';
  setVoiceField('phraseWrong', '没关系！');
  _uiLocale = 'en';
  setVoiceField('phraseWrong', 'Try again!');
  check('en 写入不污染 zh-CN',
    (() => { _uiLocale = 'zh-CN'; return getVoiceField('phraseWrong'); })() === '没关系！');
  check('zh-CN 不污染 en',
    (() => { _uiLocale = 'en'; return getVoiceField('phraseWrong'); })() === 'Try again!');
}
{
  _store.clear(); _uiLocale = 'zh-CN';
  setVoiceField('phraseWrong', '没关系！');
  setVoiceField('phraseWrong', null);
  check('setVoiceField null 删除当前 locale 字段',
    getVoiceField('phraseWrong') === null);
}
{
  _store.clear(); _uiLocale = 'zh-CN';
  setVoiceField('phraseWrong', '没关系！');
  _uiLocale = 'en';
  setVoiceField('phraseWrong', 'Try again!');
  _uiLocale = 'zh-CN';
  setVoiceField('phraseWrong', null);
  check('null 只删当前 locale，不删其他 locale',
    (() => { _uiLocale = 'en'; return getVoiceField('phraseWrong'); })() === 'Try again!');
}

// GROUP 2: 非 phrase 字段走扁平路径
{
  _store.clear(); _uiLocale = 'zh-CN';
  setVoiceField('ttsRate', '1.2');
  const raw = JSON.parse(_store.get('yh:v1:config:voice'));
  check('非 phrase 字段写根级别', raw.ttsRate === '1.2');
  check('非 phrase 字段不进 phrases', raw.phrases == null);
  check('非 phrase 字段 getVoiceField 读取', getVoiceField('ttsRate') === '1.2');
}
{
  _store.clear(); _uiLocale = 'zh-CN';
  setVoiceField('ttsRate', '1.2');
  setVoiceField('phraseWrong', '没关系！');
  const raw = JSON.parse(_store.get('yh:v1:config:voice'));
  check('phrase 与非 phrase 共存，互不干扰（phrase 进 phrases）',
    raw.ttsRate === '1.2' && raw.phrases?.['zh-CN']?.phraseWrong === '没关系！');
}

// GROUP 3: migrateLangPhrases
{
  _store.clear(); _uiLocale = 'zh-CN';
  // 模拟旧版 voiceConfig：phrase 字段在根级别
  lsSetJSON('yh:v1:config:voice', {
    phraseWrong: '没关系！',
    phraseCorrect: '太棒了！',
    ttsRate: '0.85',
  });
  migrateLangPhrases();
  const cfg = getVoiceConfig();
  check('migrate: 旧 phrase 字段移入 phrases[zh-CN]',
    cfg.phrases?.['zh-CN']?.phraseWrong === '没关系！' &&
    cfg.phrases?.['zh-CN']?.phraseCorrect === '太棒了！');
  check('migrate: 非 phrase 字段留在根级别',
    cfg.ttsRate === '0.85');
  check('migrate: 根级别旧 phrase 字段已删除',
    cfg.phraseWrong == null && cfg.phraseCorrect == null);
}
{
  _store.clear(); _uiLocale = 'zh-CN';
  lsSetJSON('yh:v1:config:voice', { ttsRate: '0.85' });
  migrateLangPhrases();
  const cfg = getVoiceConfig();
  check('migrate: 无旧 phrase 字段时创建空 phrases {}',
    cfg.phrases != null && Object.keys(cfg.phrases).length === 0);
}
{
  _store.clear(); _uiLocale = 'zh-CN';
  // 模拟已迁移状态（phrases 已存在）
  lsSetJSON('yh:v1:config:voice', {
    phrases: { 'zh-CN': { phraseWrong: '没关系！' } },
    ttsRate: '0.85',
  });
  migrateLangPhrases();
  const cfg = getVoiceConfig();
  check('migrate 幂等：phrases 已存在时不重复迁移',
    cfg.phrases?.['zh-CN']?.phraseWrong === '没关系！' && cfg.ttsRate === '0.85');
}
{
  _store.clear(); _uiLocale = 'en';
  lsSetJSON('yh:v1:config:voice', { phraseWrong: 'Try again!' });
  migrateLangPhrases();
  const cfg = getVoiceConfig();
  check('migrate: 迁移到当前 locale（en）',
    cfg.phrases?.['en']?.phraseWrong === 'Try again!');
}

// GROUP 4: PHRASE_VOICE_FIELDS 覆盖全部 8 个字段
{
  _store.clear(); _uiLocale = 'zh-CN';
  const allPhraseFields = [
    'phraseWrong', 'phraseCorrect', 'phraseStreakCorrect', 'phraseSessionFinish',
    'phraseIdleBrowse', 'phraseOptHint', 'phraseQuizPrompt', 'phraseQuizPromptRecognize'
  ];
  allPhraseFields.forEach(k => setVoiceField(k, 'test-' + k));
  const cfg = getVoiceConfig();
  check('所有 8 个 phrase 字段都存入 phrases[zh-CN]',
    allPhraseFields.every(k => cfg.phrases?.['zh-CN']?.[k] === 'test-' + k));
  check('8 个字段都不写根级别',
    allPhraseFields.every(k => cfg[k] == null));
}

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: 运行确认测试文件可执行（现阶段测试本体即实现，直接应通过）**

```powershell
node tests/yihai_v5.16_lang_phrases_test.js
```

期望：所有断言通过（测试文件自包含实现代码，不依赖 index.html）。

---

### Task 2: 在 index.html 添加 PHRASE_VOICE_FIELDS 常量

**Files:**
- Modify: `index.html:2970` （`VOICE_FIELDS` 常量结尾处之后）

- [ ] **Step 1: 在 `VOICE_FIELDS` 定义之后（约第 2970 行）插入 `PHRASE_VOICE_FIELDS`**

找到这段代码：
```js
const VOICE_FIELDS = [
  'phraseCorrect','phraseWrong','phraseStreakCorrect','phraseSessionFinish',
  'phraseIdleBrowse','phraseOptHint','phraseQuizPrompt','phraseQuizPromptRecognize',
  'ttsRate','ttsPitch','ttsVoiceName','voiceMuted','voiceAssistEnabled',
  'ansReadDelay','optReadDelay','browseAnsDelay','optCount','optTouchDelay','ndur','bdur',
];
```

在其后插入：
```js
const PHRASE_VOICE_FIELDS = [
  'phraseWrong', 'phraseCorrect', 'phraseStreakCorrect', 'phraseSessionFinish',
  'phraseIdleBrowse', 'phraseOptHint', 'phraseQuizPrompt', 'phraseQuizPromptRecognize'
];
```

---

### Task 3: 更新 getVoiceField 和 setVoiceField

**Files:**
- Modify: `index.html:2972-2981`

- [ ] **Step 1: 替换 `getVoiceField`（当前第 2972–2975 行）**

旧代码：
```js
function getVoiceField(name, def = null) {
  const v = getVoiceConfig()[name];
  return v == null ? def : v;
}
```

新代码：
```js
function getVoiceField(name, def = null) {
  const cfg = getVoiceConfig();
  if (PHRASE_VOICE_FIELDS.includes(name)) {
    const v = (cfg.phrases?.[getLocale()] || {})[name];
    return v == null ? def : v;
  }
  const v = cfg[name];
  return v == null ? def : v;
}
```

- [ ] **Step 2: 替换 `setVoiceField`（当前第 2976–2981 行）**

旧代码：
```js
function setVoiceField(name, value) {
  const cfg = getVoiceConfig();
  if (value == null) delete cfg[name];
  else cfg[name] = String(value);
  lsSetJSON('yh:v1:config:voice', cfg);
}
```

新代码：
```js
function setVoiceField(name, value) {
  const cfg = getVoiceConfig();
  if (PHRASE_VOICE_FIELDS.includes(name)) {
    if (!cfg.phrases) cfg.phrases = {};
    if (!cfg.phrases[getLocale()]) cfg.phrases[getLocale()] = {};
    if (value == null) delete cfg.phrases[getLocale()][name];
    else cfg.phrases[getLocale()][name] = String(value);
  } else {
    if (value == null) delete cfg[name];
    else cfg[name] = String(value);
  }
  lsSetJSON('yh:v1:config:voice', cfg);
}
```

- [ ] **Step 3: 运行单元测试确认无回归**

```powershell
node tests/run_all.js
```

期望：所有原有套件仍全部通过（此时 v5.16 尚未注册到 run_all.js，不影响）。

- [ ] **Step 4: Commit**

```powershell
git add index.html
git commit -m "feat: PHRASE_VOICE_FIELDS + per-locale getVoiceField/setVoiceField routing"
```

---

### Task 4: 添加 migrateLangPhrases 及启动调用

**Files:**
- Modify: `index.html:3110–3117`（migrate 函数定义区 + 启动序列）

- [ ] **Step 1: 在 `migrateVoiceConfig` 函数之后（约第 2993 行结尾处后）插入 `migrateLangPhrases`**

找到：
```js
function migrateVoiceConfig() {
  if (lsGet('yh:v1:config:voice') != null) return;
  ...
}
```

在该函数结束的 `}` 之后插入：
```js
function migrateLangPhrases() {
  const cfg = getVoiceConfig();
  if (cfg.phrases) return;
  const localeData = {};
  for (const k of PHRASE_VOICE_FIELDS) {
    if (cfg[k] != null) { localeData[k] = cfg[k]; delete cfg[k]; }
  }
  cfg.phrases = Object.keys(localeData).length
    ? { [getLocale()]: localeData }
    : {};
  lsSetJSON('yh:v1:config:voice', cfg);
}
```

- [ ] **Step 2: 在启动期 migrate 序列（约第 3114 行）中加入调用**

找到：
```js
try { migrateVoiceConfig(); } catch (e) { console.warn('[migrate] voiceConfig failed', e); }
try { migrateUiConfig(); } catch (e) { console.warn('[migrate] uiConfig failed', e); }
try { migrateTypographyConfig(); } catch (e) { console.warn('[migrate] typographyConfig failed', e); }
try { migrateKeyRenames(); } catch (e) { console.warn('[migrate] keyRenames failed', e); }
```

改为（在 `migrateVoiceConfig` 调用之后紧接插入）：
```js
try { migrateVoiceConfig(); } catch (e) { console.warn('[migrate] voiceConfig failed', e); }
try { migrateLangPhrases(); } catch (e) { console.warn('[migrate] langPhrases failed', e); }
try { migrateUiConfig(); } catch (e) { console.warn('[migrate] uiConfig failed', e); }
try { migrateTypographyConfig(); } catch (e) { console.warn('[migrate] typographyConfig failed', e); }
try { migrateKeyRenames(); } catch (e) { console.warn('[migrate] keyRenames failed', e); }
```

- [ ] **Step 3: Commit**

```powershell
git add index.html
git commit -m "feat: migrateLangPhrases — move flat phrase fields into phrases[locale]"
```

---

### Task 5: 修复 setLocale + 删除 loadPhraseOrDefault

**Files:**
- Modify: `index.html:8760–8779`（setLocale）
- Modify: `index.html:10393–10404`（loadPhraseOrDefault + loadSettings）

- [ ] **Step 1: 修改 `setLocale`（约第 8760 行）**

找到：
```js
  // reset voice prompts to current locale defaults on language switch
  ['phraseQuizPrompt', 'phraseOptHint', 'phraseWrong',
   'phraseCorrect', 'phraseStreakCorrect',
   'phraseSessionFinish', 'phraseIdleBrowse'].forEach(k => setVoiceField(k, null));
  PHRASE_SELECT   = t('quiz_select_hint');
  PHRASE_OPT_HINT = t('default_opt_hint');
```

替换为（删除清空循环，改为从新 locale 读取）：
```js
  PHRASE_SELECT   = getVoiceField('phraseQuizPrompt') || t('quiz_select_hint');
  PHRASE_OPT_HINT = getVoiceField('phraseOptHint')    || t('default_opt_hint');
```

注意：`_uiLocale` 在此之前已被赋值为新 locale（`_uiLocale = loc` 在 setLocale 顶部），所以 `getVoiceField` 此时已读新 locale。

- [ ] **Step 2: 删除 `loadPhraseOrDefault`，更新 `loadSettings`（约第 10393 行）**

找到并删除整个 `loadPhraseOrDefault` 函数：
```js
// resets to locale default if stored value matches any locale's default (prevents cross-device pollution)
function loadPhraseOrDefault(voiceField, i18nKey) {
  const stored = getVoiceField(voiceField);
  if (!stored) return t(i18nKey);
  const allDefaults = SUPPORTED_LOCALES.map(loc => (I18N[loc] || {})[i18nKey]).filter(Boolean);
  if (allDefaults.includes(stored)) { setVoiceField(voiceField, null); return t(i18nKey); }
  return stored;
}
```

找到 `loadSettings` 的前两行（约第 10403–10404 行）：
```js
  PHRASE_SELECT   = loadPhraseOrDefault('phraseQuizPrompt', 'quiz_select_hint');
  PHRASE_OPT_HINT = loadPhraseOrDefault('phraseOptHint',    'default_opt_hint');
```

替换为：
```js
  PHRASE_SELECT   = getVoiceField('phraseQuizPrompt') || t('quiz_select_hint');
  PHRASE_OPT_HINT = getVoiceField('phraseOptHint')    || t('default_opt_hint');
```

- [ ] **Step 3: 运行单元测试确认无回归**

```powershell
node tests/run_all.js
```

期望：全部通过。

- [ ] **Step 4: Commit**

```powershell
git add index.html
git commit -m "feat: setLocale reads per-locale phrases; remove loadPhraseOrDefault"
```

---

### Task 6: 修复 cloudPushConfig

**Files:**
- Modify: `index.html:3675–3676`（cloudPushConfig 中 localUi 构建部分）

- [ ] **Step 1: 修改 `cloudPushConfig` 中的 `localUi` 构建（约第 3675 行）**

找到：
```js
    const localUi = {
      ...getVoiceConfig(),
      confettiOn: getUiField('confettiOn'),
      theme:      getUiField('theme'),
    };
```

替换为：
```js
    const { phrases: _phrasesByLocale, ...vcFlat } = getVoiceConfig();
    const localUi = {
      ...vcFlat,
      ...(_phrasesByLocale?.[getLocale()] || {}),
      confettiOn: getUiField('confettiOn'),
      theme:      getUiField('theme'),
    };
```

说明：
- `vcFlat` = voiceConfig 去掉 `phrases` 子对象后的所有字段（ttsRate、voiceMuted 等）
- `_phrasesByLocale?.[getLocale()]` = 当前 locale 的 phrase 字段，展开为扁平格式（phraseWrong、phraseCorrect 等），与云端现有 schema 一致
- `phrases` 子对象本身不上传，保持云端 schema 不变

- [ ] **Step 2: Commit**

```powershell
git add index.html
git commit -m "feat: cloudPushConfig excludes phrases blob, pushes current-locale phrases flat"
```

---

### Task 7: 注册测试套件 + 全量回归

**Files:**
- Modify: `tests/run_all.js:26`
- Modify: `tests/yihai_v5.16_lang_phrases_test.js`（去掉自包含实现，改为依赖…实际仍自包含，无需改动）

- [ ] **Step 1: 将 v5.16 测试注册到 run_all.js**

找到：
```js
  'yihai_v5.15_log_test.js',
```

在其后添加：
```js
  'yihai_v5.16_lang_phrases_test.js',
```

- [ ] **Step 2: 运行全量单元测试**

```powershell
node tests/run_all.js
```

期望：13 套件全部通过，新增约 26 个断言（总断言数 ~634）。

- [ ] **Step 3: 运行 Playwright UI 冒烟（确认语言切换流程无回归）**

先确认 HTTP 服务器已在 8080 端口启动：
```powershell
python -m http.server 8080 --directory C:\code
```

另开终端：
```powershell
node tests/_pw_ui_smoke.js
```

期望：65 断言全部通过。

- [ ] **Step 4: Commit**

```powershell
git add tests/run_all.js
git commit -m "test: register yihai_v5.16_lang_phrases_test in run_all.js"
```

---

## Self-Review

**Spec coverage:**
- ✅ `PHRASE_VOICE_FIELDS` 常量 → Task 2
- ✅ `getVoiceField`/`setVoiceField` 路由 → Task 3
- ✅ `migrateLangPhrases` 幂等迁移 → Task 4
- ✅ 启动期调用顺序（migrateVoiceConfig 之后、loadSettings 之前）→ Task 4
- ✅ `setLocale` 删清空循环 → Task 5
- ✅ `loadPhraseOrDefault` 删除 + `loadSettings` 更新 → Task 5
- ✅ `cloudPushConfig` phrases 展开 → Task 6
- ✅ 单元测试全量 26 个断言 → Task 1 + 7
- ✅ `cloudPullConfig` 零改动（`setVoiceField` 已自动路由）→ 已在 spec 说明，无需额外 task

**Placeholder scan:** 无 TBD、无 TODO、无"similar to"。

**Type consistency:** 所有任务使用相同的函数签名：`getVoiceField(name, def?)`、`setVoiceField(name, value)`、`migrateLangPhrases()`。
