/**
 * Convert medical/AD/caregiver terminology to neutral terms in yihai_v5.1.html
 * Usage: node _convert_terms.js
 */
const fs = require('fs');
const path = require('path');

const files = ['yihai_v5.1.html', 'index.html'];
for (const fname of files) {
  const filePath = path.join(__dirname, fname);
  let content = fs.readFileSync(filePath, 'utf8');

const replacements = [
  // ── data-mode attribute ──
  [/data-mode="patient"/g, 'data-mode="standard"'],
  [/\[data-mode="patient"\]/g, '[data-mode="standard"]'],

  // ── CSS class names ──
  [/\.caregiver-only/g, '.advanced-only'],
  [/caregiver-only/g, 'advanced-only'],

  // ── CSS section headers (comments) ──
  [/caregiver \+ button/g, 'advanced + button'],
  [/caregiver \+ 按钮/g, 'advanced + 按钮'],
  [/(?<=Action Sheet \()caregiver(?= \+)/g, 'advanced'],

  // ── JS variable: localStorage key name stays, mode values change ──
  [/'patient' \/\/ 'patient' \| 'caregiver'/g, "'standard' // 'standard' | 'advanced'"],
  [/let _appMode     = localStorage\.getItem\('yihai_app_mode'\) \|\| 'patient'/g,
    "// Migrate old mode names\n  let _stored = localStorage.getItem('yihai_app_mode');\n" +
    "  if (_stored === 'patient') _stored = 'standard';\n" +
    "  else if (_stored === 'caregiver') _stored = 'advanced';\n" +
    "  let _appMode = _stored || 'standard';"],

  // JS mode checks
  [/_appMode === 'patient'/g, "_appMode === 'standard'"],
  [/_appMode === 'caregiver'/g, "_appMode === 'advanced'"],
  [/'patient' \| 'caregiver'/g, "'standard' | 'advanced'"],

  // Mode toggle in JS
  [/\? 'caregiver' : 'patient'/g, "? 'advanced' : 'standard'"],
  [/\? 'caregiver'/g, "? 'advanced'"],

  // Function name
  [/onCaregiverFabTap/g, 'onAdvancedFabTap'],

  // ── JS section header ──
  [/\/\/ ── caregiver mode ──/g, '// ── advanced mode ──'],

  // ── i18n en strings ──
  [/'Caregiver Mode'/g, "'Advanced Mode'"],

  // ── i18n zh-CN strings ──
  [/'照护者模式'/g, "'高级模式'"],

  // ── HTML comments ──
  [/照护者\s*\+\s*(?:按钮|button)/g, 'advanced + button'],
  [/(?<=<!-- ══════════════ )ACTION SHEET（照护者＋按钮）/g, 'ACTION SHEET (advanced + button)'],

  // ── about_desc1 zh-CN ──
  [/'忆海拾光是一款帮助记忆练习的工具，通过看图识物的方式，帮助用户每天进行轻松的记忆训练。'/g,
    "'忆海拾光是一款轻松有趣的学习工具，通过看图识物的方式，让用户每天愉快地复习。'"],

  // ── about_desc2 zh-CN ──
  [/'基于 SM-2 间隔重复算法，智能安排复习节奏。支持多语言卡片、语音朗读、云端同步，让训练更有效。'/g,
    "'基于 SM-2 间隔重复算法，智能安排复习节奏。支持多语言卡片、语音朗读、云端同步，让学习更高效。'"],

  // ── about_desc1 en ──
  [/'Memory Glimmers is a memory practice tool\. Through picture recognition, it helps users do relaxed daily memory exercises\.'/g,
    "'Memory Glimmers is a fun and easy learning tool. Through picture-word matching, users can review daily with ease.'"],

  // ── about_desc2 en ──
  [/'Based on the SM-2 spaced repetition algorithm, it intelligently schedules review rhythms\. Supports multilingual cards, speech, and cloud sync for more effective practice\.'/g,
    "'Based on the SM-2 spaced repetition algorithm, it intelligently schedules review rhythms. Supports multilingual cards, speech, and cloud sync for effective learning.'"],

  // ── about_desc1 es ──
  [/'Memory Glimmers es una herramienta de practica de memoria\. Mediante reconocimiento visual, ayuda a realizar ejercicios diarios relajados\.'/g,
    "'Memory Glimmers es una herramienta de aprendizaje divertida y sencilla. Mediante reconocimiento visual, los usuarios pueden repasar diariamente con facilidad.'"],

  // ── about_desc2 es ──
  [/'Basado en el algoritmo de repeticion espaciada SM-2, programa ritmos de repaso inteligentemente\. Soporta tarjetas multilingues, voz y sincronizacion en la nube\.'/g,
    "'Basado en el algoritmo de repeticion espaciada SM-2, programa ritmos de repaso inteligentes. Soporta tarjetas multilingues, voz y sincronizacion en la nube para un aprendizaje efectivo.'"],

  // ── meta_description zh-CN ──
  [/'记忆练习 — 看图识物'/g, "'看图识物 — 快乐学习'"],

  // ── meta_description en ──
  [/'Memory practice — picture recognition'/g, "'Picture-word matching — learn with fun'"],

  // ── meta_description es ──
  [/'Práctica de memoria — reconocimiento visual'/g, "'Reconocimiento visual — aprende con diversion'"],

  // ── account_desc zh-CN ──
  [/'登录后可同步服务器牌组，训练记录自动上传。未登录仅支持手工导入，数据完全离线。'/g,
    "'登录后可同步服务器牌组，学习记录自动上传。未登录仅支持手工导入，数据完全离线。'"],

  // ── account_desc en ──
  [/'Login to sync server decks\. Training records auto-upload\.'/g,
    "'Login to sync server decks. Progress syncs automatically.'"],

  // ── settings_cloud_desc en ──
  [/'Login to sync server decks\. Training records auto-upload\. Offline mode supports manual import only\.'/g,
    "'Login to sync server decks. Progress syncs automatically. Offline mode supports manual import only.'"],

  // ── settings_cloud_desc zh-CN ──
  [/'登录后可同步服务器牌组，训练记录自动上传。未登录时仅支持手工导入，数据完全离线。'/g,
    "'登录后可同步服务器牌组，学习记录自动上传。未登录时仅支持手工导入，数据完全离线。'"],

  // ── account_desc es ──
  [/'Inicia sesion para sincronizar mazos del servidor\. Las practicas se suben automaticamente\.'/g,
    "'Inicia sesion para sincronizar mazos del servidor. El progreso se sincroniza automaticamente.'"],

  // ── HTML meta content fallback ──
  [/content="记忆练习 — 看图识物"/g, 'content="看图识物 — 快乐学习"'],

  // ── about_desc1 HTML fallback ──
  [/>忆海拾光是一款帮助记忆练习的工具，通过看图识物的方式，帮助用户每天进行轻松的记忆训练。</g,
    '>忆海拾光是一款轻松有趣的学习工具，通过看图识物的方式，让用户每天愉快地复习。<'],

  // ── about_desc2 HTML fallback ──
  [/>基于 SM-2 间隔重复算法，智能安排复习节奏。支持多语言卡片、语音朗读、云端同步，让训练更有效。</g,
    '>基于 SM-2 间隔重复算法，智能安排复习节奏。支持多语言卡片、语音朗读、云端同步，让学习更高效。<'],

  // ── account_desc HTML fallback ──
  [/>登录后可同步服务器牌组，训练记录自动上传。未登录仅支持手工导入，数据完全离线。</g,
    '>登录后可同步服务器牌组，学习记录自动上传。未登录仅支持手工导入，数据完全离线。<'],

  // ── settings_cloud_desc zh-CN ──
  [/'登录后可同步服务器牌组，训练记录自动上传。未登录时仅支持手工导入，数据完全离线。'/g,
    "'登录后可同步服务器牌组，学习记录自动上传。未登录时仅支持手工导入，数据完全离线。'"],

  // ── HTML 训练记录 → 学习记录 in settings panel ──
  [/训练记录自动上传/g, '学习记录自动上传'],

  // ── about_desc3/account_desc HTML fallback (no changes needed, but check) ──
  // Already fine: "数据完全离线可用，登录后可跨设备同步。"
  // ── mine_mode_title HTML fallback ──
  [/>照护者模式</g, '>高级模式<'],

  // ── isPatient variable → isStandard ──
  [/const isPatient/g, 'const isStandard'],
  [/if \(isPatient\)/g, 'if (isStandard)'],
];

for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated: ' + fname);
}
