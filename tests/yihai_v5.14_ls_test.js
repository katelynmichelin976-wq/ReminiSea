// tests/yihai_v5.14_ls_test.js
// LS helper + 注册表纯函数单测（与 index.html 保持同步）

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
  clear: () => _store.clear(),
  key: i => Array.from(_store.keys())[i],
  get length() { return _store.size; },
};

// ── 被测代码：从 index.html 复制 LS_KEYS + 工厂 + helpers ──────────
const LS_KEYS = {
  LAST_CLOUD_EMAIL:    'yihaiLastCloudEmail',
  LAST_CLOUD_USER_ID:  'yihaiLastCloudUserId',
  DEVICE_ID:           'yihaiDeviceId',
  HAS_EVER_LOGGED_IN:  'yihai_has_ever_logged_in',
  SESSION_BACKUP:      'yihaiSessionBackup',
  SESSION_BACKUP_OLD:  'yihai_session_backup',
  GLOBAL_SYNC_TS:      'yihaiGlobalSyncTs',
  EASY_PULLED_AT:      'yihaiEasyPulledAt',
  REALTIME_UPLOAD:     'yihaiRealtimeUpload',
  PENDING_FEEDBACK:    'yihaiPendingFeedback',
  V5_MIGRATION:        'yihaiV5MigrationPending',
  PRACTICE_DAYS:       'yihaiPracticeDays',
  LOG_LEVEL:           'yihaiLogLevel',
  APP_MODE:            'yihaiAppMode',
  THEME:               'theme',
  LOCALE:              'yihai_ui_locale',
  CONFETTI_ON:         'confettiOn',
  DECK_INDEX:          'yihaiDecksIndex',
  DAILY_PROGRESS:      'yihaiDailyProgress',
  EASY_RETRY_ON_WRONG: 'easyRetryOnWrong',
  EASY_SESSION_SIZE:   'easySessionSize',
};

const LS_DECK = (deckKey, field) => {
  const prefix = {
    cards:  'yihai_deck_',
    syncAt: 'yihaiSyncAt:',
  }[field];
  if (!prefix) throw new Error('LS_DECK: unknown field ' + field + ' (sync state aggregated to deckSync helper)');
  return prefix + deckKey;
};

const LS_SRS = configKey => 'srs_' + configKey;
const LS_TYPO = (kind, slot) => `${kind}-${slot}`;

const lsGet = k => localStorage.getItem(k);
const lsSet = (k, v) => localStorage.setItem(k, String(v));
const lsRemove = k => localStorage.removeItem(k);
const lsGetJSON = (k, def = null) => {
  try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); }
  catch { return def; }
};
const lsSetJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ── tests ─────────────────────────────────────────────────────────

// lsGet/lsSet 基本
{
  _store.clear();
  lsSet(LS_KEYS.THEME, 'dark');
  check('lsSet/lsGet round-trip string', lsGet(LS_KEYS.THEME) === 'dark');
  check('lsSet writes raw value to underlying key', _store.get('theme') === 'dark');
}
{
  _store.clear();
  lsSet(LS_KEYS.DEVICE_ID, 12345);
  check('lsSet coerces number to string', lsGet(LS_KEYS.DEVICE_ID) === '12345');
  lsSet(LS_KEYS.DEVICE_ID, true);
  check('lsSet coerces boolean to string', lsGet(LS_KEYS.DEVICE_ID) === 'true');
}
{
  _store.clear();
  check('lsGet returns null for missing key', lsGet('missing') === null);
}

// lsGetJSON / lsSetJSON
{
  _store.clear();
  check('lsGetJSON returns default on missing', lsGetJSON('missing', { x: 1 }).x === 1);
  check('lsGetJSON returns null default by default', lsGetJSON('missing') === null);
}
{
  _store.clear();
  lsSetJSON('blob', { a: 1, b: [2, 3] });
  const v = lsGetJSON('blob');
  check('lsSetJSON/lsGetJSON round-trip object', v.a === 1 && v.b[1] === 3);
}
{
  _store.clear();
  _store.set('bad', '{not json');
  check('lsGetJSON returns default on parse error', lsGetJSON('bad', 'fallback') === 'fallback');
  check('lsGetJSON returns null on parse error if no default', lsGetJSON('bad') === null);
}

// lsRemove
{
  _store.clear();
  lsSet(LS_KEYS.LAST_CLOUD_EMAIL, 'a@b.com');
  lsRemove(LS_KEYS.LAST_CLOUD_EMAIL);
  check('lsRemove clears key', lsGet(LS_KEYS.LAST_CLOUD_EMAIL) === null);
}

// LS_DECK 工厂
{
  check('LS_DECK cards', LS_DECK('abc', 'cards') === 'yihai_deck_abc');
  check('LS_DECK syncAt (preset deck sync watermark)', LS_DECK('abc', 'syncAt') === 'yihaiSyncAt:abc');
  let threw = false;
  try { LS_DECK('abc', 'unknown'); } catch { threw = true; }
  check('LS_DECK throws on unknown field', threw);
  let threwAgg = false;
  try { LS_DECK('abc', 'pushedAt'); } catch { threwAgg = true; }
  check('LS_DECK throws on aggregated field (use deckSync)', threwAgg);
}

// LS_SRS 工厂
{
  check('LS_SRS prefix', LS_SRS('session_mode') === 'srs_session_mode');
  check('LS_SRS supports nested key', LS_SRS('learning_steps') === 'srs_learning_steps');
}

// LS_TYPO 工厂
{
  check('LS_TYPO fs-opt', LS_TYPO('fs', 'opt') === 'fs-opt');
  check('LS_TYPO ls-ans', LS_TYPO('ls', 'ans') === 'ls-ans');
}

// 注册表覆盖率 sanity
{
  const expectedKeys = [
    'LAST_CLOUD_EMAIL','DEVICE_ID','SESSION_BACKUP','GLOBAL_SYNC_TS',
    'THEME','LOCALE','APP_MODE','DECK_INDEX','DAILY_PROGRESS',
    'EASY_RETRY_ON_WRONG','EASY_SESSION_SIZE',
  ];
  const missing = expectedKeys.filter(k => !(k in LS_KEYS));
  check('LS_KEYS covers all expected slots', missing.length === 0);
}

// ── Phase 2.1: deckSync 聚合 + 迁移 ───────────────────────────────

const DECK_SYNC_DEFAULT = { pushedAt: 0, pulledAt: 0, pushedMediaAt: 0, deletedCards: [] };
function getDeckSync(deckKey) {
  return { ...DECK_SYNC_DEFAULT, ...lsGetJSON('deckSync:' + deckKey, {}) };
}
function setDeckSync(deckKey, patch) {
  const cur = getDeckSync(deckKey);
  lsSetJSON('deckSync:' + deckKey, { ...cur, ...patch });
}
function removeDeckSync(deckKey) {
  lsRemove('deckSync:' + deckKey);
}
function migrateDeckSync() {
  const oldPrefixes = ['yihaiPushedAt:', 'yihaiPulledAt:', 'yihaiPushedMediaAt:', 'yihaiDeletedCards:'];
  const fieldOf = {
    'yihaiPushedAt:': 'pushedAt',
    'yihaiPulledAt:': 'pulledAt',
    'yihaiPushedMediaAt:': 'pushedMediaAt',
    'yihaiDeletedCards:': 'deletedCards',
  };
  const seenDecks = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    for (const p of oldPrefixes) if (k.startsWith(p)) seenDecks.add(k.slice(p.length));
  }
  for (const deckKey of seenDecks) {
    const newK = 'deckSync:' + deckKey;
    if (lsGet(newK) != null) continue;
    const patch = {};
    for (const p of oldPrefixes) {
      const oldK = p + deckKey;
      const v = lsGet(oldK);
      if (v == null) continue;
      if (fieldOf[p] === 'deletedCards') {
        patch.deletedCards = lsGetJSON(oldK, []);
      } else {
        patch[fieldOf[p]] = /^\d+$/.test(v) ? parseInt(v) : (Date.parse(v) || 0);
      }
    }
    if (Object.keys(patch).length === 0) continue;
    lsSetJSON(newK, { ...DECK_SYNC_DEFAULT, ...patch });
    for (const p of oldPrefixes) lsRemove(p + deckKey);
  }
}

{
  _store.clear();
  _store.set('yihaiPushedAt:abc', '1700000000000');
  _store.set('yihaiPulledAt:abc', '1700001000000');
  _store.set('yihaiPushedMediaAt:abc', '1700002000000');
  _store.set('yihaiDeletedCards:abc', '["c1","c2"]');
  migrateDeckSync();
  const s = getDeckSync('abc');
  check('migrate: pushedAt', s.pushedAt === 1700000000000);
  check('migrate: pulledAt', s.pulledAt === 1700001000000);
  check('migrate: pushedMediaAt', s.pushedMediaAt === 1700002000000);
  check('migrate: deletedCards', s.deletedCards.length === 2 && s.deletedCards[1] === 'c2');
  check('migrate: old yihaiPushedAt removed', _store.get('yihaiPushedAt:abc') == null);
  check('migrate: old yihaiPulledAt removed', _store.get('yihaiPulledAt:abc') == null);
  check('migrate: old yihaiPushedMediaAt removed', _store.get('yihaiPushedMediaAt:abc') == null);
  check('migrate: old yihaiDeletedCards removed', _store.get('yihaiDeletedCards:abc') == null);
}
{
  _store.clear();
  _store.set('yihaiPushedAt:partial', '1700000000000');
  migrateDeckSync();
  const s = getDeckSync('partial');
  check('migrate partial: pushedAt set', s.pushedAt === 1700000000000);
  check('migrate partial: pulledAt default 0', s.pulledAt === 0);
  check('migrate partial: pushedMediaAt default 0', s.pushedMediaAt === 0);
  check('migrate partial: deletedCards default []', Array.isArray(s.deletedCards) && s.deletedCards.length === 0);
}
{
  _store.clear();
  _store.set('deckSync:abc', JSON.stringify({ pushedAt: 999, pulledAt: 0, pushedMediaAt: 0, deletedCards: [] }));
  _store.set('yihaiPushedAt:abc', '1700000000000');
  migrateDeckSync();
  const s = getDeckSync('abc');
  check('idempotent: new key wins', s.pushedAt === 999);
  check('idempotent: old key untouched', _store.get('yihaiPushedAt:abc') === '1700000000000');
}
{
  _store.clear();
  _store.set('yihaiPushedAt:a', '100');
  _store.set('yihaiPushedAt:b', '200');
  _store.set('yihaiPulledAt:b', '300');
  migrateDeckSync();
  check('multi-deck: a pushedAt', getDeckSync('a').pushedAt === 100);
  check('multi-deck: b pushedAt', getDeckSync('b').pushedAt === 200);
  check('multi-deck: b pulledAt', getDeckSync('b').pulledAt === 300);
}
{
  _store.clear();
  _store.set('yihaiSyncAt:abc', '2026-06-12T00:00:00.000Z');
  migrateDeckSync();
  check('migrate: yihaiSyncAt 不聚合（preset deck 仍在用）', _store.get('yihaiSyncAt:abc') === '2026-06-12T00:00:00.000Z');
  check('migrate: 无 push/pull/media/deleted → 不生成 deckSync', _store.get('deckSync:abc') == null);
}
{
  _store.clear();
  _store.set('yihaiPushedAt:iso', '2026-06-12T00:00:00.000Z');
  _store.set('yihaiPulledAt:iso', '2026-06-12T01:00:00.000Z');
  migrateDeckSync();
  const s = getDeckSync('iso');
  check('migrate ISO string: pushedAt parsed as ms', s.pushedAt === Date.parse('2026-06-12T00:00:00.000Z'));
  check('migrate ISO string: pulledAt parsed as ms', s.pulledAt === Date.parse('2026-06-12T01:00:00.000Z'));
}
{
  _store.clear();
  setDeckSync('xx', { pushedAt: 100, pulledAt: 200 });
  setDeckSync('xx', { pushedMediaAt: 300 });
  const s = getDeckSync('xx');
  check('setDeckSync patch merges', s.pushedAt === 100 && s.pulledAt === 200 && s.pushedMediaAt === 300);
}
{
  _store.clear();
  setDeckSync('rm', { pushedAt: 100 });
  removeDeckSync('rm');
  check('removeDeckSync clears entry', _store.get('deckSync:rm') == null);
  const s = getDeckSync('rm');
  check('getDeckSync after remove returns defaults', s.pushedAt === 0 && Array.isArray(s.deletedCards));
}
{
  _store.clear();
  setDeckSync('tomb', { deletedCards: ['c1'] });
  const cur = getDeckSync('tomb');
  setDeckSync('tomb', { deletedCards: [...cur.deletedCards, 'c2'] });
  const s = getDeckSync('tomb');
  check('tombstone append via patch', s.deletedCards.length === 2 && s.deletedCards[1] === 'c2');
}

// ── Phase 2.2: voiceConfig 聚合 + 迁移 ─────────────────────────────

const VOICE_FIELDS = [
  'phraseCorrect','phraseWrong','phraseStreakCorrect','phraseSessionFinish',
  'phraseIdleBrowse','phraseOptHint','phraseQuizPrompt','phraseQuizPromptRecognize',
  'ttsRate','ttsPitch','ttsVoiceName','voiceMuted','voiceAssistEnabled',
  'ansReadDelay','optReadDelay','browseAnsDelay','optCount','optTouchDelay','ndur','bdur',
];
function getVoiceConfig() { return lsGetJSON('voiceConfig', {}); }
function getVoiceField(name, def = null) {
  const v = getVoiceConfig()[name];
  return v == null ? def : v;
}
function setVoiceField(name, value) {
  const cfg = getVoiceConfig();
  if (value == null) delete cfg[name];
  else cfg[name] = String(value);
  lsSetJSON('voiceConfig', cfg);
}
function migrateVoiceConfig() {
  if (lsGet('voiceConfig') != null) return;
  const cfg = {};
  for (const k of VOICE_FIELDS) {
    const v = lsGet(k);
    if (v != null) cfg[k] = v;
  }
  if (Object.keys(cfg).length === 0) return;
  lsSetJSON('voiceConfig', cfg);
  for (const k of VOICE_FIELDS) lsRemove(k);
}

{
  _store.clear();
  _store.set('phraseCorrect', '太棒了');
  _store.set('phraseWrong', '');  // explicit empty allowed
  _store.set('ttsRate', '1.2');
  _store.set('voiceMuted', '1');
  _store.set('optCount', '4');
  migrateVoiceConfig();
  const cfg = getVoiceConfig();
  check('voice migrate phraseCorrect', cfg.phraseCorrect === '太棒了');
  check('voice migrate ttsRate', cfg.ttsRate === '1.2');
  check('voice migrate voiceMuted', cfg.voiceMuted === '1');
  check('voice migrate optCount', cfg.optCount === '4');
  check('voice migrate empty string preserved', cfg.phraseWrong === '');
  check('voice old key phraseCorrect removed', _store.get('phraseCorrect') == null);
  check('voice old key ttsRate removed', _store.get('ttsRate') == null);
}
{
  _store.clear();
  _store.set('voiceConfig', '{"phraseCorrect":"existing"}');
  _store.set('phraseWrong', '不对');
  migrateVoiceConfig();
  const cfg = getVoiceConfig();
  check('voice idempotent: existing voiceConfig kept', cfg.phraseCorrect === 'existing');
  check('voice idempotent: old phraseWrong key kept (no migration)', _store.get('phraseWrong') === '不对');
}
{
  _store.clear();
  migrateVoiceConfig();
  check('voice migrate no-op when nothing to migrate', _store.get('voiceConfig') == null);
}
{
  _store.clear();
  setVoiceField('ttsRate', '1.5');
  check('setVoiceField writes', getVoiceField('ttsRate') === '1.5');
  setVoiceField('ttsRate', '0.8');
  check('setVoiceField overwrites', getVoiceField('ttsRate') === '0.8');
  setVoiceField('ttsRate', null);
  check('setVoiceField null deletes', getVoiceField('ttsRate') === null);
  check('setVoiceField default fallback', getVoiceField('ttsRate', '1.0') === '1.0');
}
{
  _store.clear();
  setVoiceField('voiceMuted', true);
  check('setVoiceField coerces boolean to string', getVoiceField('voiceMuted') === 'true');
  setVoiceField('optCount', 5);
  check('setVoiceField coerces number to string', getVoiceField('optCount') === '5');
}

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
