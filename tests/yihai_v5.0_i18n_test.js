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

console.log(`\n通过 ${passed} / 失败 ${failed}`);
if (failed > 0) process.exit(1);
