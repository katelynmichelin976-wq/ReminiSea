// ═══════════════════════════════════════════════
// 阶段 0 i18n 地基纯函数单测
// 从 yihai_v4.11.html 抽取纯函数逻辑
// ═══════════════════════════════════════════════

const SUPPORTED_LOCALES = ['en', 'zh-CN', 'zh-Hant', 'es', 'ja'];
const FALLBACK_LOCALE = 'en';

function detectLocale(navLang, supported, fallback) {
  if (!navLang) return fallback;
  const lower = navLang.toLowerCase();
  for (const s of supported) if (s.toLowerCase() === lower) return s;
  // 繁體變體顯式映射（在前綴匹配之前，避免 zh-TW 被誤匹配到 zh-CN）
  const traditionalVariants = ['zh-tw', 'zh-hk', 'zh-mo', 'zh-hant'];
  if (traditionalVariants.includes(lower) && supported.includes('zh-Hant')) return 'zh-Hant';
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
// 繁體變體應映射至 zh-Hant
check('zh-TW→zh-Hant', detectLocale('zh-TW', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'zh-Hant');
check('zh-HK→zh-Hant', detectLocale('zh-HK', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'zh-Hant');
check('zh-Hant→zh-Hant', detectLocale('zh-Hant', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'zh-Hant');
check('zh-CN 前綴匹配回歸', detectLocale('zh-CN', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'zh-CN');

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

section('SUITE 6 — ja locale 検出・辞書完整性');
check('detectLocale ja→ja', detectLocale('ja', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'ja');
check('detectLocale ja-JP→ja', detectLocale('ja-JP', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'ja');
check('detectLocale zh-CN 回帰不変', detectLocale('zh-CN', SUPPORTED_LOCALES, FALLBACK_LOCALE), 'zh-CN');

// I18N['ja'] 辞書完整性チェック（HTML ファイルから読み込み）
const _fs = require('fs');
const _path = require('path');
const _html = _fs.readFileSync(_path.join(__dirname, '../yihai_v5.4.html'), 'utf8');
function _extractI18NKeys(html, locale) {
  const startMarker = `'${locale}': {`;
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return [];
  let depth = 1, i = startIdx + startMarker.length;
  while (i < html.length && depth > 0) {
    if (html[i] === '{') depth++;
    if (html[i] === '}') depth--;
    i++;
  }
  const block = html.slice(startIdx + startMarker.length, i - 1);
  const allMatches = [];
  // Match keys at line-start or after comma — avoids false positives inside string values
  const keyRe = /(?:^|[,])\s*([a-zA-Z_]\w*)\s*:/mg;
  let m2;
  while ((m2 = keyRe.exec(block)) !== null) {
    allMatches.push(m2[1]);
  }
  return allMatches;
}
const _enKeys = _extractI18NKeys(_html, 'en');
const _jaKeys = _extractI18NKeys(_html, 'ja');
const _missing = _enKeys.filter(k => !_jaKeys.includes(k));
if (_missing.length > 0) {
  console.log('  不足キー:', _missing.join(', '));
}
check('ja 辞書: en の全キーが存在する', _missing.length, 0);
check('ja 辞書: キー数が en と一致する', _jaKeys.length, _enKeys.length);

console.log(`\n通过 ${passed} / 失败 ${failed}`);
if (failed > 0) process.exit(1);
