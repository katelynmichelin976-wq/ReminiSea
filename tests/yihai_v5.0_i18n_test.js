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

console.log(`\n通过 ${passed} / 失败 ${failed}`);
if (failed > 0) process.exit(1);
