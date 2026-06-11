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
  PHRASE_CORRECT:        'phraseCorrect',
  PHRASE_WRONG:          'phraseWrong',
  PHRASE_STREAK_CORRECT: 'phraseStreakCorrect',
  PHRASE_SESSION_FINISH: 'phraseSessionFinish',
  PHRASE_IDLE_BROWSE:    'phraseIdleBrowse',
  PHRASE_OPT_HINT:       'phraseOptHint',
  PHRASE_QUIZ_PROMPT:           'phraseQuizPrompt',
  PHRASE_QUIZ_PROMPT_RECOGNIZE: 'phraseQuizPromptRecognize',
  TTS_RATE:            'ttsRate',
  TTS_PITCH:           'ttsPitch',
  TTS_VOICE_NAME:      'ttsVoiceName',
  VOICE_MUTED:         'voiceMuted',
  VOICE_ASSIST_ENABLED:'voiceAssistEnabled',
  ANS_READ_DELAY:      'ansReadDelay',
  OPT_READ_DELAY:      'optReadDelay',
  BROWSE_ANS_DELAY:    'browseAnsDelay',
  OPT_COUNT:           'optCount',
  OPT_TOUCH_DELAY:     'optTouchDelay',
  NDUR:                'ndur',
  BDUR:                'bdur',
  EASY_RETRY_ON_WRONG: 'easyRetryOnWrong',
  EASY_SESSION_SIZE:   'easySessionSize',
};

const LS_DECK = (deckKey, field) => {
  const prefix = {
    cards:          'yihai_deck_',
    syncAt:         'yihaiSyncAt:',
    pushedAt:       'yihaiPushedAt:',
    pulledAt:       'yihaiPulledAt:',
    pushedMediaAt:  'yihaiPushedMediaAt:',
    deletedCards:   'yihaiDeletedCards:',
  }[field];
  if (!prefix) throw new Error('LS_DECK: unknown field ' + field);
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
  check('LS_DECK pushedAt', LS_DECK('abc', 'pushedAt') === 'yihaiPushedAt:abc');
  check('LS_DECK pulledAt', LS_DECK('abc', 'pulledAt') === 'yihaiPulledAt:abc');
  check('LS_DECK pushedMediaAt', LS_DECK('abc', 'pushedMediaAt') === 'yihaiPushedMediaAt:abc');
  check('LS_DECK deletedCards', LS_DECK('abc', 'deletedCards') === 'yihaiDeletedCards:abc');
  let threw = false;
  try { LS_DECK('abc', 'unknown'); } catch { threw = true; }
  check('LS_DECK throws on unknown field', threw);
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
    'PHRASE_CORRECT','TTS_RATE','VOICE_MUTED','OPT_COUNT','NDUR','BDUR',
    'EASY_RETRY_ON_WRONG','EASY_SESSION_SIZE',
  ];
  const missing = expectedKeys.filter(k => !(k in LS_KEYS));
  check('LS_KEYS covers all expected slots', missing.length === 0);
}

console.log(`\n结果：${passed} 通过  ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
