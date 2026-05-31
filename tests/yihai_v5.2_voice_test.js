// tests/yihai_v5.2_voice_test.js
const assert = require('assert');

function makeStorage() {
  const store = {};
  return {
    getItem: k => store[k] !== undefined ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
}

function migrateVoiceSettings(ls) {
  if (ls.getItem('quizPromptOn') === '0') ls.removeItem('phraseSelect');
  if (ls.getItem('optHintOn')    === '0') ls.removeItem('phraseOptHint');
  if (ls.getItem('wrongHintOn')  === '0') ls.removeItem('phraseWrong');
  if (ls.getItem('correctHintOn')=== '0') ls.removeItem('phraseCorrect');
  const oldDelay = ls.getItem('delay');
  if (oldDelay && !ls.getItem('ansReadDelay')) ls.setItem('ansReadDelay', oldDelay);
  const oldOptDelay = ls.getItem('optHintDelay');
  if (oldOptDelay && !ls.getItem('optReadDelay')) ls.setItem('optReadDelay', oldOptDelay);
  ['quizPromptOn','optHintOn','wrongHintOn','readHint',
   'quizPromptDelay','optHintDelay','delay','browseDelay'].forEach(k => ls.removeItem(k));
}

let passed = 0, failed = 0;
function check(desc, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    passed++;
  } catch(e) {
    failed++;
    console.log(`  ✗ ${desc}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Test 1: 旧 toggle=0 清空文案
{
  const ls = makeStorage();
  ls.setItem('quizPromptOn', '0');
  ls.setItem('phraseSelect', '请选择');
  ls.setItem('wrongHintOn', '0');
  ls.setItem('phraseWrong', '再试试');
  migrateVoiceSettings(ls);
  check('quizPromptOn=0 应清空 phraseSelect', ls.getItem('phraseSelect'), null);
  check('wrongHintOn=0 应清空 phraseWrong', ls.getItem('phraseWrong'), null);
}

// Test 2: 旧 toggle=1 保留文案
{
  const ls = makeStorage();
  ls.setItem('quizPromptOn', '1');
  ls.setItem('phraseSelect', '请选择答案');
  migrateVoiceSettings(ls);
  check('quizPromptOn=1 应保留 phraseSelect', ls.getItem('phraseSelect'), '请选择答案');
}

// Test 3: 旧 delay 迁移
{
  const ls = makeStorage();
  ls.setItem('delay', '1.5');
  ls.setItem('optHintDelay', '6');
  migrateVoiceSettings(ls);
  check('delay 应迁移至 ansReadDelay', ls.getItem('ansReadDelay'), '1.5');
  check('optHintDelay 应迁移至 optReadDelay', ls.getItem('optReadDelay'), '6');
  check('旧 key delay 应被删除', ls.getItem('delay'), null);
}

// Test 4: 已有新 key 时不覆盖
{
  const ls = makeStorage();
  ls.setItem('ansReadDelay', '2.0');
  ls.setItem('delay', '1.5');
  migrateVoiceSettings(ls);
  check('已有 ansReadDelay 不应被覆盖', ls.getItem('ansReadDelay'), '2.0');
}

// Test 5: voice i18n keys exist in HTML file
{
  const fs = require('fs');
  const html = fs.readFileSync('yihai_v5.1.html', 'utf-8');
  const requiredKeys = [
    'voice_global_mute', 'voice_ans_read_delay', 'voice_assist_nav',
    'voice_assist_page_title', 'voice_group_fixed', 'voice_group_emotion',
    'voice_group_functional', 'voice_slot_session_start', 'voice_slot_wrong_hint',
    'voice_slot_quiz_prompt', 'voice_rec_tap_to_start', 'voice_rec_rerecord',
    'voice_count_recorded', 'voice_status_tts', 'voice_status_unrecorded',
    'voice_default_session_start', 'voice_default_wrong_hint',
    'voice_quiz_prompt_recognize',
  ];
  const missingKeys = requiredKeys.filter(key =>
    !html.includes("'" + key + "'") && !html.includes('"' + key + '"')
  );
  check('所有 voice i18n key 均存在于 HTML', missingKeys, []);
}

// ── v5.2 语音参数云同步完整性检查 ─────────────────────────────────────
{
  const fs = require('fs');
  const html = fs.readFileSync('yihai_v5.3.html', 'utf-8');

  // Test 6: cloudPushConfig 应包含 phraseQuizPrompt
  const pushStart = html.indexOf('async function cloudPushConfig()');
  const pushEnd   = html.indexOf('\nasync function cloudPullConfig()');
  const pushBody  = html.slice(pushStart, pushEnd);
  check('cloudPushConfig localUi 应包含 phraseQuizPrompt',
    pushBody.includes('phraseQuizPrompt'), true);

  // Test 7: cloudPushConfig 应包含 phraseQuizPromptRecognize
  check('cloudPushConfig localUi 应包含 phraseQuizPromptRecognize',
    pushBody.includes('phraseQuizPromptRecognize'), true);

  // Test 8: loadSettings 应从 phraseQuizPrompt 读取答题提示，不再依赖 phraseSelect
  const lsStart = html.indexOf('\nfunction loadSettings()');
  const lsEnd   = html.indexOf('\nloadSettings()');
  const lsBody  = html.slice(lsStart, lsEnd);
  check('loadSettings 应读取 phraseQuizPrompt 作为答题提示文案',
    lsBody.includes("'phraseQuizPrompt'"), true);
  check('loadSettings 不应再依赖 phraseSelect',
    lsBody.includes("'phraseSelect'"), false);

  // Test 9: onSlotRowTap 保存回调应调用 debouncePushConfig 触发云推送
  const tapStart = html.indexOf('\nfunction onSlotRowTap(slot)');
  const tapEnd   = html.indexOf('\nfunction toggleVaGroup(');
  const tapBody  = html.slice(tapStart, tapEnd);
  check('onSlotRowTap 保存回调应调用 debouncePushConfig',
    tapBody.includes('debouncePushConfig'), true);

  // Test 10: cloudPushConfig 应包含 phraseOptHint（统一 camelCase）
  check('cloudPushConfig localUi 应包含 phraseOptHint',
    pushBody.includes('phraseOptHint'), true);
  check('cloudPushConfig localUi 不应含 snake_case key phrase_opt_hint',
    pushBody.includes('phrase_opt_hint'), false);

  // Test 11: loadSettings 应从 phraseOptHint 读取选项提示，不含 snake_case
  check('loadSettings 应读取 phraseOptHint 作为选项提示',
    lsBody.includes("'phraseOptHint'"), true);
  check('loadSettings 不应含 snake_case key phrase_opt_hint',
    lsBody.includes("'phrase_opt_hint'"), false);
}

console.log(`\n通过 ${passed} / 失败 ${failed}`);
if (failed > 0) process.exit(1);
