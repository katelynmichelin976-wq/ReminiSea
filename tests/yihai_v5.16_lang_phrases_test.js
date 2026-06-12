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
